import { Hono } from "hono";
import type { GitHubProfile, Repository } from "../lib/contracts";
import { ApiError, objectBody, positiveInteger, repositoryIds } from "./errors";
import {
  GitHubClient,
  parseRepositoryReference,
  type RepositoryReference,
} from "./github";
import { getActiveJob, startJob, type JobController } from "./jobs";
import { getStore, type Store } from "./store";

type LoadInput =
  | { mode: "continue" | "latest"; count: number }
  | { mode: "specific"; count: number; repositories: RepositoryReference[] };

function parseLoadInput(value: unknown): LoadInput {
  const body = objectBody(value);
  const count = positiveInteger(body.count, "Repository count");
  if (body.mode === "continue" || body.mode === "latest")
    return { mode: body.mode, count };
  if (body.mode !== "specific")
    throw new ApiError(400, "Load mode must be continue, latest, or specific.");
  if (
    !Array.isArray(body.repositories) ||
    body.repositories.length === 0 ||
    body.repositories.length > 1000
  ) {
    throw new ApiError(
      400,
      "Provide between 1 and 1000 specific repositories.",
    );
  }
  const references = new Map<string, RepositoryReference>();
  for (const value of body.repositories) {
    const reference = parseRepositoryReference(value);
    references.set(reference.fullName.toLowerCase(), reference);
  }
  if (references.size > count) {
    throw new ApiError(
      400,
      "Repository count must be at least the number of distinct specific repositories. No repositories were loaded.",
    );
  }
  return { mode: "specific", count, repositories: [...references.values()] };
}

function requireToken(store: Store): string {
  const token = store.getToken("github");
  if (!token)
    throw new ApiError(
      422,
      "Save a GitHub token in Settings before loading repositories.",
    );
  return token;
}

function rememberProfile(
  store: Store,
  token: string,
  profile: GitHubProfile,
  expectedAccountId?: string,
): void {
  // An overview may finish after a Settings request saved another account's token.
  if (store.getToken("github") !== token) {
    throw new ApiError(
      409,
      "The GitHub token changed during the request. Reload the workspace and try again.",
    );
  }
  const activeProfile = store.getProfile();
  if (
    (expectedAccountId && expectedAccountId !== profile.id) ||
    (getActiveJob() && activeProfile && activeProfile.id !== profile.id)
  ) {
    throw new ApiError(
      409,
      "The GitHub account changed. Reload the workspace and select repositories from the current account.",
    );
  }
  store.setProfile(profile);
}

function repositoryFailure(
  controller: JobController,
  repository: string,
  error: unknown,
  stop: boolean,
): void {
  const failure =
    error instanceof ApiError
      ? error
      : new ApiError(
          503,
          "The repository could not be cached. Previously saved data was kept.",
        );
  controller.advance(undefined, { repository, message: failure.message });
  // Do not hammer GitHub after an authentication, rate-limit, transport, or account failure.
  if (stop || [401, 409, 429, 502, 503].includes(failure.status)) throw failure;
}

async function loadPages(
  store: Store,
  client: GitHubClient,
  accountId: string,
  input: { mode: "continue" | "latest"; count: number },
  controller: JobController,
): Promise<void> {
  const continuing = input.mode === "continue";
  const saved = store.getCursor(accountId);
  if (continuing && saved.exhausted) {
    controller.setTotal(0);
    return;
  }
  let cursor = continuing ? saved.cursor : null;
  let completed = 0;
  const visitedCursors = new Set<string>();
  if (cursor) visitedCursors.add(cursor);
  while (completed < input.count) {
    controller.setMessage(
      continuing
        ? "Loading the next starred repositories…"
        : "Loading the newest starred repositories…",
    );
    const page = await client.getStarredPage(
      accountId,
      cursor,
      Math.min(100, input.count - completed),
    );
    for (const edge of page.edges) {
      if (visitedCursors.has(edge.cursor)) {
        throw new ApiError(
          502,
          "GitHub returned a repeated Stars cursor. The last successful Continue cursor was kept.",
        );
      }
      visitedCursors.add(edge.cursor);
      controller.setMessage(`Loading ${edge.repository.fullName}…`);
      let repository: Repository;
      try {
        repository = await client.completeRepository(
          edge.repository,
          edge.starredAt,
        );
        store.saveRepository(accountId, repository);
        // Saving before checkpointing makes interruption replay safe, never skip safe.
        if (continuing) store.setCursor(accountId, edge.cursor, false);
      } catch (error) {
        repositoryFailure(controller, edge.repository.fullName, error, true);
        return;
      }
      cursor = edge.cursor;
      completed += 1;
      controller.advance(repository.id);
    }
    if (!page.hasNextPage) {
      if (page.isOverLimit) {
        throw new ApiError(
          422,
          "GitHub truncated this account's Stars connection. The cursor was kept; use Specific repositories for stars beyond GitHub's listing limit.",
        );
      }
      if (continuing) store.setCursor(accountId, cursor, true);
      controller.setTotal(completed);
      return;
    }
  }
}

async function loadSpecific(
  store: Store,
  client: GitHubClient,
  accountId: string,
  references: RepositoryReference[],
  controller: JobController,
): Promise<void> {
  for (const reference of references) {
    controller.setMessage(`Loading ${reference.fullName}…`);
    let repository: Repository;
    try {
      const metadata = await client.getRepository(accountId, reference);
      const saved = store.getRepositories([metadata.id], accountId)[0];
      // A repository lookup has no star edge. Keep a known date rather than inventing one.
      repository = await client.completeRepository(
        metadata,
        saved?.starredAt ?? null,
      );
      store.saveRepository(accountId, repository);
    } catch (error) {
      repositoryFailure(controller, reference.fullName, error, false);
      continue;
    }
    controller.advance(repository.id);
  }
}

async function refreshSelected(
  store: Store,
  client: GitHubClient,
  accountId: string,
  repositories: Repository[],
  controller: JobController,
): Promise<void> {
  for (const saved of repositories) {
    controller.setMessage(`Refreshing ${saved.fullName}…`);
    let repository: Repository;
    try {
      // Resolve the saved ID, not a name that might now belong to a different repository.
      const metadata = await client.getRepositoryById(accountId, saved.id);
      repository = await client.completeRepository(metadata, saved.starredAt);
      store.saveRepository(accountId, repository);
    } catch (error) {
      repositoryFailure(controller, saved.fullName, error, false);
      continue;
    }
    controller.advance(repository.id);
  }
}

const githubRoutes = new Hono();

githubRoutes.get("/overview", async (context) => {
  const store = getStore();
  const token = requireToken(store);
  const profile = await new GitHubClient(token).getOverview();
  rememberProfile(store, token, profile);
  return context.json(profile);
});

githubRoutes.post("/load", async (context) => {
  const input = parseLoadInput(await context.req.json());
  const store = getStore();
  const token = requireToken(store);
  const client = new GitHubClient(token);
  const total =
    input.mode === "specific" ? input.repositories.length : input.count;
  const job = startJob("load", total, async (controller) => {
    controller.setMessage("Checking the GitHub account and star count…");
    const profile = await client.getOverview();
    rememberProfile(store, token, profile);
    if (input.mode === "specific") {
      await loadSpecific(
        store,
        client,
        profile.id,
        input.repositories,
        controller,
      );
    } else {
      await loadPages(store, client, profile.id, input, controller);
    }
  });
  return context.json(job, 202);
});

githubRoutes.post("/refresh", async (context) => {
  const body = objectBody(await context.req.json());
  const ids = repositoryIds(body.repositoryIds);
  const store = getStore();
  const token = requireToken(store);
  const profile = store.getProfile();
  if (!profile)
    throw new ApiError(
      422,
      "Load the GitHub overview before selecting repositories to refresh.",
    );
  const repositories = store.getRepositories(ids, profile.id);
  if (repositories.length !== ids.length) {
    throw new ApiError(
      400,
      "Every selected repository must be cached for the current GitHub account. Reload the workspace and select again.",
    );
  }
  const client = new GitHubClient(token);
  const job = startJob("refresh", repositories.length, async (controller) => {
    controller.setMessage("Checking the GitHub account…");
    const currentProfile = await client.getOverview();
    rememberProfile(store, token, currentProfile, profile.id);
    await refreshSelected(store, client, profile.id, repositories, controller);
  });
  return context.json(job, 202);
});

export default githubRoutes;
