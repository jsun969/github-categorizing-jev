import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Category,
  CategoryInput,
  GitHubProfile,
  Job,
  Repository,
  RepositoryPage,
  SettingsStatus,
} from "../lib/contracts";
import { ApiError, objectBody } from "./errors";

export class Store {
  private readonly database: DatabaseSync;
  private readonly secretKey: Buffer;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const keyPath = resolve(directory, "token.key");
    try {
      writeFileSync(keyPath, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    chmodSync(keyPath, 0o600);
    this.secretKey = readFileSync(keyPath);
    if (this.secretKey.length !== 32)
      throw new Error("The local token encryption key is invalid.");
    const databasePath = resolve(directory, "stars.sqlite");
    this.database = new DatabaseSync(databasePath, { timeout: 5000 });
    chmodSync(databasePath, 0o600);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO metadata VALUES ('category_revision', '0');
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, profile TEXT NOT NULL, cursor TEXT, exhausted INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, position INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS repositories (
        account_id TEXT NOT NULL REFERENCES accounts(id), id TEXT NOT NULL,
        full_name TEXT NOT NULL, metadata TEXT NOT NULL, readme TEXT,
        content_hash TEXT NOT NULL, fetched_at TEXT NOT NULL,
        PRIMARY KEY (account_id, id)
      );
      CREATE TABLE IF NOT EXISTS classifications (
        account_id TEXT NOT NULL, repository_id TEXT NOT NULL,
        category_revision INTEGER NOT NULL, content_hash TEXT NOT NULL,
        probabilities TEXT NOT NULL, model TEXT NOT NULL, input_truncated INTEGER NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY (account_id, repository_id),
        FOREIGN KEY (account_id, repository_id) REFERENCES repositories(account_id, id)
      );
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    `);
    for (const row of this.database
      .prepare("SELECT id, data FROM jobs")
      .all()) {
      const job = JSON.parse(String(row.data)) as Job;
      if (job.status === "running") {
        job.status = "failed";
        job.message =
          "The server stopped before this job finished. Completed results were saved.";
        job.finishedAt = new Date().toISOString();
        this.saveJob(job);
      }
    }
  }

  getSettings(): SettingsStatus {
    const keys = this.database.prepare("SELECT key FROM settings").all();
    return {
      githubConfigured: keys.some((row) => row.key === "github"),
      jevConfigured: keys.some((row) => row.key === "jev"),
    };
  }

  getToken(kind: "github" | "jev"): string | null {
    const row = this.database
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(kind);
    if (!row) return null;
    try {
      const [iv, tag, ciphertext] = String(row.value).split(".");
      if (!iv || !tag || !ciphertext)
        throw new Error("Invalid encrypted token.");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.secretKey,
        Buffer.from(iv, "base64"),
      );
      decipher.setAAD(Buffer.from(kind));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new ApiError(
        503,
        "A saved token cannot be decrypted. Restore the matching token.key or replace the token in Settings.",
      );
    }
  }

  saveSettings(input: { githubToken?: string; jevToken?: string }): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const [kind, value] of [
        ["github", input.githubToken],
        ["jev", input.jevToken],
      ] as const) {
        if (value === undefined) continue;
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.secretKey, iv);
        cipher.setAAD(Buffer.from(kind));
        const encrypted = Buffer.concat([
          cipher.update(value, "utf8"),
          cipher.final(),
        ]);
        const sealed = [iv, cipher.getAuthTag(), encrypted]
          .map((part) => part.toString("base64"))
          .join(".");
        this.database
          .prepare(
            "INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          )
          .run(kind, sealed);
        if (kind === "github")
          this.database
            .prepare("DELETE FROM metadata WHERE key = 'active_account'")
            .run();
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getProfile(): GitHubProfile | null {
    const row = this.database
      .prepare(
        "SELECT profile FROM accounts WHERE id = (SELECT value FROM metadata WHERE key = 'active_account')",
      )
      .get();
    return row ? (JSON.parse(String(row.profile)) as GitHubProfile) : null;
  }

  setProfile(profile: GitHubProfile): void {
    this.database
      .prepare(
        "INSERT INTO accounts (id, profile) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET profile = excluded.profile",
      )
      .run(profile.id, JSON.stringify(profile));
    this.database
      .prepare(
        "INSERT INTO metadata VALUES ('active_account', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(profile.id);
  }

  getCursor(accountId: string): { cursor: string | null; exhausted: boolean } {
    const row = this.database
      .prepare("SELECT cursor, exhausted FROM accounts WHERE id = ?")
      .get(accountId);
    return {
      cursor: row?.cursor ? String(row.cursor) : null,
      exhausted: Boolean(row?.exhausted),
    };
  }

  setCursor(
    accountId: string,
    cursor: string | null,
    exhausted: boolean,
  ): void {
    this.database
      .prepare("UPDATE accounts SET cursor = ?, exhausted = ? WHERE id = ?")
      .run(cursor, exhausted ? 1 : 0, accountId);
  }

  getCategories(): Category[] {
    return this.database
      .prepare("SELECT id, name, description FROM categories ORDER BY position")
      .all() as unknown as Category[];
  }

  getCategoryRevision(): number {
    return Number(
      this.database
        .prepare("SELECT value FROM metadata WHERE key = 'category_revision'")
        .get()?.value ?? 0,
    );
  }

  replaceCategories(inputs: CategoryInput[]): Category[] {
    const names = new Set<string>();
    const categories = inputs.map((input) => categoryInput(input, names));
    return this.mutateCategories(() => {
      this.database.prepare("DELETE FROM categories").run();
      const insert = this.database.prepare(
        "INSERT INTO categories VALUES (?, ?, ?, ?)",
      );
      categories.forEach((category, position) =>
        insert.run(randomUUID(), category.name, category.description, position),
      );
      return true;
    });
  }

  createCategory(input: unknown): Category[] {
    return this.mutateCategories(() => {
      const category = categoryInput(input, this.categoryNames());
      this.database
        .prepare(
          `INSERT INTO categories (id, name, description, position)
           VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories))`,
        )
        .run(randomUUID(), category.name, category.description);
      return true;
    });
  }

  updateCategory(id: string, input: unknown): Category[] {
    return this.mutateCategories(() => {
      const current = this.database
        .prepare("SELECT name, description FROM categories WHERE id = ?")
        .get(id);
      if (!current) throw new ApiError(404, "The category was not found.");
      const category = categoryInput(input, this.categoryNames(id));
      if (
        current.name === category.name &&
        current.description === category.description
      )
        return false;
      this.database
        .prepare("UPDATE categories SET name = ?, description = ? WHERE id = ?")
        .run(category.name, category.description, id);
      return true;
    });
  }

  deleteCategory(id: string): Category[] {
    return this.mutateCategories(() => {
      const result = this.database
        .prepare("DELETE FROM categories WHERE id = ?")
        .run(id);
      if (result.changes === 0)
        throw new ApiError(404, "The category was not found.");
      return true;
    });
  }

  private categoryNames(excludedId?: string): Set<string> {
    const names = new Set<string>();
    for (const row of this.database
      .prepare("SELECT id, name FROM categories")
      .iterate()) {
      if (row.id !== excludedId) names.add(String(row.name).toLowerCase());
    }
    return names;
  }

  private mutateCategories(change: () => boolean): Category[] {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (change()) {
        this.database
          .prepare(
            "UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'category_revision'",
          )
          .run();
      }
      const categories = this.getCategories();
      this.database.exec("COMMIT");
      return categories;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  saveRepository(accountId: string, repository: Repository): void {
    const { readme, ...metadata } = repository;
    this.database
      .prepare(
        `INSERT INTO repositories VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, id) DO UPDATE SET full_name = excluded.full_name,
      metadata = excluded.metadata, readme = excluded.readme,
      content_hash = excluded.content_hash, fetched_at = excluded.fetched_at`,
      )
      .run(
        accountId,
        repository.id,
        repository.fullName,
        JSON.stringify(metadata),
        readme,
        repository.contentHash,
        repository.fetchedAt,
      );
  }

  getRepositories(
    ids: string[],
    accountId = this.getProfile()?.id,
  ): Repository[] {
    if (!accountId) return [];
    const query = this.database.prepare(
      "SELECT metadata, readme FROM repositories WHERE account_id = ? AND id = ?",
    );
    const repositories: Repository[] = [];
    for (const id of ids) {
      const row = query.get(accountId, id);
      if (row)
        repositories.push({
          ...JSON.parse(String(row.metadata)),
          readme: row.readme === null ? null : String(row.readme),
        } as Repository);
    }
    return repositories;
  }

  listRepositories(
    options: { search?: string; offset?: number; limit?: number } = {},
  ): RepositoryPage {
    const accountId = this.getProfile()?.id;
    if (!accountId) return { repositories: [], total: 0 };
    const search = `%${(options.search ?? "").replace(/[\\%_]/g, "\\$&")}%`;
    const total = Number(
      this.database
        .prepare(
          "SELECT count(*) AS count FROM repositories WHERE account_id = ? AND full_name LIKE ? ESCAPE '\\'",
        )
        .get(accountId, search)?.count ?? 0,
    );
    const revision = this.getCategoryRevision();
    const rows = this.database
      .prepare(
        `SELECT r.metadata, r.readme IS NOT NULL AS has_readme, r.content_hash,
      c.category_revision, c.content_hash AS classified_hash, c.probabilities, c.created_at, c.input_truncated
      FROM repositories r LEFT JOIN classifications c ON c.account_id = r.account_id AND c.repository_id = r.id
      WHERE r.account_id = ? AND r.full_name LIKE ? ESCAPE '\\'
      ORDER BY r.fetched_at DESC, r.id LIMIT ? OFFSET ?`,
      )
      .all(accountId, search, options.limit ?? 50, options.offset ?? 0);
    return {
      total,
      repositories: rows.map((row) => {
        const { contentHash: _hash, ...metadata } = JSON.parse(
          String(row.metadata),
        ) as Omit<Repository, "readme">;
        const current =
          row.category_revision === revision &&
          row.classified_hash === row.content_hash;
        return {
          ...metadata,
          hasReadme: Boolean(row.has_readme),
          probabilities: current
            ? (JSON.parse(String(row.probabilities)) as Record<string, number>)
            : null,
          classificationStatus: row.created_at
            ? current
              ? "current"
              : "stale"
            : "none",
          classifiedAt: row.created_at ? String(row.created_at) : null,
          inputTruncated: Boolean(row.input_truncated),
        };
      }),
    };
  }

  saveClassification(
    accountId: string,
    repositoryId: string,
    result: {
      categoryRevision: number;
      contentHash: string;
      probabilities: Record<string, number>;
      model: string;
      inputTruncated: boolean;
    },
  ): boolean {
    const row = this.database
      .prepare(
        "SELECT content_hash FROM repositories WHERE account_id = ? AND id = ?",
      )
      .get(accountId, repositoryId);
    if (
      !row ||
      row.content_hash !== result.contentHash ||
      this.getCategoryRevision() !== result.categoryRevision
    )
      return false;
    this.database
      .prepare(
        `INSERT INTO classifications VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, repository_id) DO UPDATE SET category_revision = excluded.category_revision,
      content_hash = excluded.content_hash, probabilities = excluded.probabilities,
      model = excluded.model, input_truncated = excluded.input_truncated, created_at = excluded.created_at`,
      )
      .run(
        accountId,
        repositoryId,
        result.categoryRevision,
        result.contentHash,
        JSON.stringify(result.probabilities),
        result.model,
        result.inputTruncated ? 1 : 0,
        new Date().toISOString(),
      );
    return true;
  }

  saveJob(job: Job): void {
    this.database
      .prepare(
        "INSERT INTO jobs VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      )
      .run(job.id, JSON.stringify(job));
  }

  getJob(id: string): Job | null {
    const row = this.database
      .prepare("SELECT data FROM jobs WHERE id = ?")
      .get(id);
    return row ? (JSON.parse(String(row.data)) as Job) : null;
  }

  close(): void {
    this.database.close();
  }
}

function categoryInput(value: unknown, names: Set<string>): CategoryInput {
  const category = objectBody(value);
  if (
    typeof category.name !== "string" ||
    typeof category.description !== "string"
  ) {
    throw new ApiError(400, "Each category needs a name and a description.");
  }
  const name = category.name.trim();
  const description = category.description.trim();
  if (!name || !description)
    throw new ApiError(
      400,
      "Category names and descriptions must not be empty.",
    );
  const key = name.toLowerCase();
  if (names.has(key))
    throw new ApiError(400, `Category names must be unique: ${name}.`);
  names.add(key);
  return { name, description };
}

const stores = globalThis as typeof globalThis & { starOrganizerStore?: Store };

export function getStore(): Store {
  return (stores.starOrganizerStore ??= new Store(
    resolve(process.env.APP_DATA_DIR ?? ".data"),
  ));
}
