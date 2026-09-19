import { Button } from "@heroui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [isChecking, setIsChecking] = useState(false);
  const [status, setStatus] = useState("API not checked yet.");

  async function checkApi() {
    setIsChecking(true);
    setStatus("Checking API...");

    try {
      const response = await fetch("/api/health");

      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}.`);
      }

      setStatus("API is online.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "API request failed.");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm text-muted">Development workspace</p>
        <h1 className="break-words font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
          github-categorizing-jev
        </h1>
        <p className="text-muted">React · TanStack Start · Hono · HeroUI</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button isPending={isChecking} onPress={checkApi}>
          Check API
        </Button>
        <p className="text-sm text-muted" role="status">
          {status}
        </p>
      </div>
    </main>
  );
}
