import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { CategoryInput } from "../lib/contracts";
import classificationRoutes from "./classification-routes";
import { ApiError, objectBody, positiveInteger } from "./errors";
import githubRoutes from "./github-routes";
import { assertIdle, getActiveJob } from "./jobs";
import { getStore } from "./store";

const api = new Hono().basePath("/api");

api.use("*", async (context, next) => {
  const url = new URL(context.req.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return context.json(
      { error: "This application only accepts local requests." },
      403,
    );
  }
  const origin = context.req.header("Origin");
  if (
    (origin && origin !== url.origin) ||
    context.req.header("Sec-Fetch-Site") === "cross-site"
  ) {
    return context.json(
      { error: "Cross-origin requests are not allowed." },
      403,
    );
  }
  if (
    !["GET", "HEAD"].includes(context.req.method) &&
    !context.req
      .header("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return context.json(
      { error: "Send request bodies as application/json." },
      400,
    );
  }
  context.header("Cache-Control", "no-store");
  await next();
});

api.use(
  "*",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (context) =>
      context.json({ error: "The request body exceeds 1 MB." }, 413),
  }),
);

api.onError((error, context) => {
  if (error instanceof ApiError)
    return context.json({ error: error.message }, error.status);
  if (error instanceof SyntaxError)
    return context.json({ error: "The request body is not valid JSON." }, 400);
  return context.json({ error: "The operation could not be completed." }, 500);
});

api.route("/github", githubRoutes);
api.route("/classification", classificationRoutes);

api.get("/health", (context) => context.json({ status: "ok" }));

api.get("/settings", (context) => context.json(getStore().getSettings()));

api.put("/settings", async (context) => {
  const body = objectBody(await context.req.json());
  assertIdle();
  const input: { githubToken?: string; jevToken?: string } = {};
  for (const key of ["githubToken", "jevToken"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string")
      throw new ApiError(400, "Tokens must be text.");
    const token = body[key].trim();
    if (!token) continue;
    if (token.length > 8192 || /\s/.test(token))
      throw new ApiError(
        400,
        "A token must not contain whitespace or exceed 8192 characters.",
      );
    input[key] = token;
  }
  if (!input.githubToken && !input.jevToken)
    throw new ApiError(400, "Enter at least one token to save.");
  getStore().saveSettings(input);
  return context.json(getStore().getSettings());
});

api.get("/categories", (context) =>
  context.json({ categories: getStore().getCategories() }),
);

api.put("/categories", async (context) => {
  const body = objectBody(await context.req.json());
  assertIdle();
  if (!Array.isArray(body.categories))
    throw new ApiError(400, "Categories must be a JSON array.");
  const names = new Set<string>();
  const categories: CategoryInput[] = body.categories.map((value: unknown) => {
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
  });
  return context.json({ categories: getStore().replaceCategories(categories) });
});

api.get("/workspace", (context) => {
  const limit = context.req.query("limit")
    ? positiveInteger(Number(context.req.query("limit")), "Page size", 100)
    : 50;
  const offset = Number(context.req.query("offset") ?? "0");
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new ApiError(400, "Offset must be a non-negative integer.");
  const store = getStore();
  return context.json({
    ...store.listRepositories({
      search: context.req.query("search"),
      offset,
      limit,
    }),
    categories: store.getCategories(),
    settings: store.getSettings(),
    profile: store.getProfile(),
    activeJob: getActiveJob(),
  });
});

api.get("/jobs/:id", (context) => {
  const job = getStore().getJob(context.req.param("id"));
  if (!job) throw new ApiError(404, "This job could not be found.");
  return context.json(job);
});

export default api;
