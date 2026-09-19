import { createHash } from "node:crypto";
import type { GitHubProfile, Repository } from "../lib/contracts";
import { ApiError } from "./errors";

export interface RepositoryReference {
  owner: string;
  name: string;
  fullName: string;
}

export type RepositoryMetadata = Omit<
  Repository,
  "readme" | "starredAt" | "fetchedAt" | "contentHash"
>;

export interface StarredPage {
  edges: {
    cursor: string;
    starredAt: string;
    repository: RepositoryMetadata;
  }[];
  hasNextPage: boolean;
  isOverLimit: boolean;
}

const repositoryFields = `
  fragment RepositoryFields on Repository {
    id
    nameWithOwner
    url
    description
    primaryLanguage { name }
    repositoryTopics(first: 100) { nodes { topic { name } } }
    stargazerCount
    isArchived
    defaultBranchRef { name }
    viewerHasStarred
  }
`;

const overviewQuery = `
  query GitHubOverview {
    viewer { id login starredRepositories(first: 1) { totalCount } }
  }
`;

const starsQuery = `
  query GitHubStars($first: Int!, $after: String) {
    viewer {
      id
      starredRepositories(first: $first, after: $after, orderBy: { field: STARRED_AT, direction: DESC }) {
        edges { cursor starredAt node { ...RepositoryFields } }
        pageInfo { hasNextPage }
        isOverLimit
      }
    }
  }
  ${repositoryFields}
`;

const repositoryQuery = `
  query GitHubRepository($owner: String!, $name: String!) {
    viewer { id }
    repository(owner: $owner, name: $name, followRenames: true) { ...RepositoryFields }
  }
  ${repositoryFields}
`;

const repositoryByIdQuery = `
  query GitHubRepositoryById($id: ID!) {
    viewer { id }
    node(id: $id) { __typename ...RepositoryFields }
  }
  ${repositoryFields}
`;

export function parseRepositoryReference(value: unknown): RepositoryReference {
  if (typeof value !== "string" || value.length > 512) {
    throw new ApiError(
      400,
      "Enter a repository as owner/repo or an HTTPS github.com repository URL.",
    );
  }
  const input = value.trim();
  const urlMatch = /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/?$/i.exec(
    input,
  );
  const match = urlMatch ?? /^([^/]+)\/([^/]+)$/.exec(input);
  const owner = match?.[1];
  let name = match?.[2];
  if (urlMatch && name?.endsWith(".git")) name = name.slice(0, -4);
  if (
    !owner ||
    !name ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
    !/^[a-z\d_.-]{1,100}$/i.test(name) ||
    name === "." ||
    name === ".."
  ) {
    throw new ApiError(
      400,
      "Use owner/repo or a direct HTTPS github.com repository URL, without credentials, query strings, or subpaths.",
    );
  }
  return { owner, name, fullName: `${owner}/${name}` };
}

export function repositoryContentHash(
  repository: Pick<
    Repository,
    | "fullName"
    | "url"
    | "description"
    | "language"
    | "topics"
    | "readme"
    | "archived"
    | "defaultBranch"
  >,
): string {
  // Fetch times, star dates, and popularity are not classification inputs.
  return createHash("sha256")
    .update(
      JSON.stringify([
        repository.fullName,
        repository.url,
        repository.description,
        repository.language,
        [...new Set(repository.topics)].sort(),
        repository.readme,
        repository.archived,
        repository.defaultBranch,
      ]),
    )
    .digest("hex");
}

function invalidResponse(): ApiError {
  return new ApiError(
    502,
    "GitHub returned an incomplete or invalid response. No incomplete repository was cached.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw invalidResponse();
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw invalidResponse();
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null || typeof value === "string") return value;
  throw invalidResponse();
}

function nonnegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw invalidResponse();
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
}

function checkViewer(data: Record<string, unknown>, accountId: string): void {
  if (text(record(data.viewer).id) !== accountId) {
    throw new ApiError(
      409,
      "The GitHub account changed. Reload the workspace before continuing.",
    );
  }
}

function parseRepository(value: unknown): RepositoryMetadata {
  if (value === null)
    throw new ApiError(
      404,
      "The repository no longer exists or this GitHub token cannot access it.",
    );
  const node = record(value);
  if (!boolean(node.viewerHasStarred)) {
    throw new ApiError(
      422,
      "The repository is not starred by the current GitHub account.",
    );
  }
  const fullName = text(node.nameWithOwner);
  const url = text(node.url);
  try {
    const reference = parseRepositoryReference(fullName);
    const urlReference = parseRepositoryReference(url);
    if (
      !url.startsWith("https://github.com/") ||
      reference.fullName !== urlReference.fullName
    )
      throw invalidResponse();
  } catch {
    throw invalidResponse();
  }
  const topicNodes = record(node.repositoryTopics).nodes;
  if (!Array.isArray(topicNodes)) throw invalidResponse();
  return {
    id: text(node.id),
    fullName,
    url,
    description: nullableText(node.description),
    language:
      node.primaryLanguage === null
        ? null
        : text(record(node.primaryLanguage).name),
    topics: [
      ...new Set(
        topicNodes.map((topic) => text(record(record(topic).topic).name)),
      ),
    ].sort(),
    stars: nonnegativeInteger(node.stargazerCount),
    archived: boolean(node.isArchived),
    defaultBranch:
      node.defaultBranchRef === null
        ? ""
        : text(record(node.defaultBranchRef).name),
  };
}

function upstreamError(response: Response, body: unknown): ApiError {
  const errors =
    isRecord(body) && Array.isArray(body.errors)
      ? body.errors.filter(isRecord)
      : [];
  const messages = [
    isRecord(body) ? body.message : undefined,
    ...errors.map((error) => error.message),
  ].filter((message): message is string => typeof message === "string");
  const types = errors.map((error) => error.type);
  // Inspect upstream messages only to categorize them; never return their contents.
  if (
    response.status === 429 ||
    types.includes("RATE_LIMITED") ||
    response.headers.get("x-ratelimit-remaining") === "0" ||
    response.headers.has("retry-after") ||
    messages.some((message) => /rate limit|abuse detection/i.test(message))
  ) {
    return new ApiError(
      429,
      "GitHub's rate limit was reached. Wait for the limit to reset before trying again; completed repositories were saved.",
    );
  }
  if (
    response.status === 401 ||
    types.includes("UNAUTHORIZED") ||
    messages.some((message) =>
      /bad credentials|requires authentication/i.test(message),
    )
  ) {
    return new ApiError(
      401,
      "GitHub rejected the token. Save a valid GitHub token in Settings.",
    );
  }
  if (response.status === 403 || types.includes("FORBIDDEN")) {
    return new ApiError(
      403,
      "GitHub denied access. Check the token's repository permissions and organization SSO authorization.",
    );
  }
  if (response.status === 404 || types.includes("NOT_FOUND")) {
    return new ApiError(
      404,
      "The repository no longer exists or this GitHub token cannot access it.",
    );
  }
  if (response.status === 422) {
    return new ApiError(
      422,
      "GitHub could not process this repository request. Check that the repository is accessible.",
    );
  }
  return new ApiError(
    502,
    "GitHub could not complete the request. Previously saved data and the last successful Continue cursor were kept.",
  );
}

export class GitHubClient {
  readonly #token: string;

  constructor(token: string) {
    this.#token = token;
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    try {
      return await fetch(`https://api.github.com${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.#token}`,
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": "github-categorizing-jev",
          ...init.headers,
        },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ApiError(
        503,
        "GitHub could not be reached or the request timed out. Previously saved data was kept; try again later.",
      );
    }
  }

  private async graphql(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const response = await this.request("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (!response.ok) throw upstreamError(response, null);
      throw invalidResponse();
    }
    if (!response.ok) throw upstreamError(response, body);
    const envelope = record(body);
    if (envelope.errors !== undefined) {
      if (!Array.isArray(envelope.errors)) throw invalidResponse();
      if (envelope.errors.length > 0) throw upstreamError(response, envelope);
    }
    return record(envelope.data);
  }

  async getOverview(): Promise<GitHubProfile> {
    const data = await this.graphql(overviewQuery);
    const viewer = record(data.viewer);
    return {
      id: text(viewer.id),
      login: text(viewer.login),
      totalStars: nonnegativeInteger(
        record(viewer.starredRepositories).totalCount,
      ),
      fetchedAt: new Date().toISOString(),
    };
  }

  async getStarredPage(
    accountId: string,
    after: string | null,
    first: number,
  ): Promise<StarredPage> {
    const data = await this.graphql(starsQuery, { first, after });
    checkViewer(data, accountId);
    const connection = record(record(data.viewer).starredRepositories);
    if (!Array.isArray(connection.edges) || connection.edges.length > first)
      throw invalidResponse();
    const hasNextPage = boolean(record(connection.pageInfo).hasNextPage);
    if (connection.edges.length === 0 && hasNextPage) throw invalidResponse();
    const cursors = new Set([after]);
    const edges = connection.edges.map((value) => {
      const edge = record(value);
      const cursor = text(edge.cursor);
      const starredAt = text(edge.starredAt);
      if (cursors.has(cursor) || !Number.isFinite(Date.parse(starredAt)))
        throw invalidResponse();
      cursors.add(cursor);
      return { cursor, starredAt, repository: parseRepository(edge.node) };
    });
    return { edges, hasNextPage, isOverLimit: boolean(connection.isOverLimit) };
  }

  async getRepository(
    accountId: string,
    reference: RepositoryReference,
  ): Promise<RepositoryMetadata> {
    const data = await this.graphql(repositoryQuery, {
      owner: reference.owner,
      name: reference.name,
    });
    checkViewer(data, accountId);
    return parseRepository(data.repository);
  }

  async getRepositoryById(
    accountId: string,
    id: string,
  ): Promise<RepositoryMetadata> {
    const data = await this.graphql(repositoryByIdQuery, { id });
    checkViewer(data, accountId);
    if (data.node === null || record(data.node).__typename !== "Repository") {
      throw new ApiError(
        404,
        "The selected repository no longer exists or this GitHub token cannot access it.",
      );
    }
    const repository = parseRepository(data.node);
    if (repository.id !== id) throw invalidResponse();
    return repository;
  }

  async getReadme(fullName: string): Promise<string | null> {
    const { owner, name } = parseRepositoryReference(fullName);
    const response = await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme`,
      {
        headers: { Accept: "application/vnd.github.raw+json" },
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw upstreamError(response, body);
    }
    try {
      return await response.text();
    } catch {
      throw new ApiError(
        503,
        "GitHub's README response could not be downloaded completely. The existing repository cache was kept.",
      );
    }
  }

  async completeRepository(
    metadata: RepositoryMetadata,
    starredAt: string | null,
  ): Promise<Repository> {
    const repository = {
      ...metadata,
      starredAt,
      readme: await this.getReadme(metadata.fullName),
      fetchedAt: new Date().toISOString(),
    };
    return { ...repository, contentHash: repositoryContentHash(repository) };
  }
}
