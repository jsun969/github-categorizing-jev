import { Hono } from "hono";

const api = new Hono().basePath("/api");

api.get("/health", (context) => context.json({ status: "ok" }));

export default api;
