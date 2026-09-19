import { randomUUID } from "node:crypto";
import type { Job, JobKind } from "../lib/contracts";
import { ApiError } from "./errors";
import { getStore } from "./store";

export interface JobController {
  setTotal(total: number): void;
  setMessage(message: string): void;
  advance(
    repositoryId?: string,
    failure?: { repository: string; message: string },
  ): void;
}

const state = globalThis as typeof globalThis & {
  starOrganizerJob?: Job | null;
};

export function getActiveJob(): Job | null {
  return state.starOrganizerJob?.status === "running"
    ? state.starOrganizerJob
    : null;
}

export function assertIdle(): void {
  if (getActiveJob())
    throw new ApiError(
      409,
      "Wait for the current job to finish before starting another operation.",
    );
}

export function startJob(
  kind: JobKind,
  total: number,
  run: (controller: JobController) => Promise<void>,
): Job {
  assertIdle();
  const store = getStore();
  const job: Job = {
    id: randomUUID(),
    kind,
    status: "running",
    total,
    completed: 0,
    failed: 0,
    message: "Starting…",
    errors: [],
    repositoryIds: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  state.starOrganizerJob = job;
  store.saveJob(job);
  const controller: JobController = {
    setTotal(value) {
      job.total = Math.max(job.completed + job.failed, value);
      store.saveJob(job);
    },
    setMessage(message) {
      job.message = message;
      store.saveJob(job);
    },
    advance(repositoryId, failure) {
      if (failure) {
        job.failed += 1;
        job.errors.push(failure);
      } else {
        job.completed += 1;
        if (repositoryId) job.repositoryIds.push(repositoryId);
      }
      store.saveJob(job);
    },
  };
  queueMicrotask(() => {
    void run(controller)
      .then(() => {
        job.status =
          job.failed > 0 && job.completed === 0 ? "failed" : "completed";
        job.message = `Finished: ${job.completed} completed${job.failed ? `, ${job.failed} failed` : ""}.`;
      })
      .catch((error: unknown) => {
        job.status = "failed";
        job.message =
          error instanceof ApiError
            ? error.message
            : "The job could not finish. Completed results were saved.";
      })
      .finally(() => {
        job.finishedAt = new Date().toISOString();
        store.saveJob(job);
      });
  });
  return job;
}
