import { Hono } from "hono";
import {
  classifyRepositories,
  type ClassificationSnapshot,
} from "./classification";
import { ApiError, objectBody, positiveInteger, repositoryIds } from "./errors";
import { assertIdle, startJob } from "./jobs";
import { getStore } from "./store";

const classificationRoutes = new Hono();

classificationRoutes.post("/start", async (context) => {
  const body = objectBody(await context.req.json());
  assertIdle();
  const ids = repositoryIds(body.repositoryIds);
  const batchSize = positiveInteger(body.batchSize, "Batch size");
  const store = getStore();
  const apiKey = store.getToken("jev");
  if (!apiKey)
    throw new ApiError(
      400,
      "Save a Jev API token in Settings before starting classification.",
    );
  const profile = store.getProfile();
  if (!profile)
    throw new ApiError(
      409,
      "Connect your GitHub account and load repositories before starting classification.",
    );
  const categories = store.getCategories();
  if (!categories.length)
    throw new ApiError(
      400,
      "Add at least one category before starting classification. All categories will be evaluated.",
    );
  const repositories = store.getRepositories(ids, profile.id);
  if (repositories.length !== ids.length) {
    throw new ApiError(
      404,
      "Some selected repositories are not cached for the active GitHub account. Reload the workspace and load those repositories before classifying them.",
    );
  }

  // Capture inputs and credentials synchronously before the job starts; no model call occurs while loading GitHub data.
  const snapshot: ClassificationSnapshot = {
    apiKey,
    accountId: profile.id,
    categoryRevision: store.getCategoryRevision(),
    categories,
    repositories,
    batchSize,
  };
  const job = startJob("classification", repositories.length, (controller) =>
    classifyRepositories(store, controller, snapshot),
  );
  return context.json(job, 202);
});

export default classificationRoutes;
