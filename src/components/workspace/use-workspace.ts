import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, request } from "../../lib/api";
import type {
  GitHubProfile,
  Job,
  JobKind,
  WorkspaceData,
} from "../../lib/contracts";

interface WorkspaceQuery {
  search: string;
  offset: number;
  limit: number;
}

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [query, setQuery] = useState<WorkspaceQuery>({
    search: "",
    offset: 0,
    limit: 50,
  });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [pending, setPending] = useState<JobKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [overviewVersion, setOverviewVersion] = useState(0);
  const jobRef = useRef<Job | null>(null);
  const accountRef = useRef<string | null | undefined>(undefined);
  const actionController = useRef<AbortController | null>(null);

  const reloadCache = useCallback(
    () => setCacheVersion((value) => value + 1),
    [],
  );
  const reloadOverview = useCallback(
    () => setOverviewVersion((value) => value + 1),
    [],
  );

  const acceptJob = useCallback((next: Job) => {
    const previous = jobRef.current;
    const sameJob = previous?.id === next.id;
    if (
      previous &&
      (next.startedAt < previous.startedAt ||
        (sameJob &&
          (next.completed + next.failed <
            previous.completed + previous.failed ||
            (previous.status !== "running" && next.status === "running"))))
    )
      return;

    if (
      sameJob &&
      next.status === previous.status &&
      next.total === previous.total &&
      next.completed === previous.completed &&
      next.failed === previous.failed &&
      next.message === previous.message
    ) {
      setPollError(null);
      return;
    }

    jobRef.current = next;
    setJob(next);
    setPollError(null);

    if (next.kind === "load") {
      const newIds = next.repositoryIds.slice(
        sameJob ? previous.repositoryIds.length : 0,
      );
      if (newIds.length > 0) {
        setSelected((current) => {
          const updated = new Set(current);
          for (const id of newIds) updated.add(id);
          return updated;
        });
      }
    }

    if (
      next.completed !== (sameJob ? previous.completed : 0) ||
      next.failed !== (sameJob ? previous.failed : 0) ||
      (next.status !== "running" && (!sameJob || previous.status === "running"))
    )
      setCacheVersion((value) => value + 1);
  }, []);

  const acceptAccount = useCallback((id: string | null) => {
    if (accountRef.current !== undefined && accountRef.current !== id) {
      const activeLoad =
        jobRef.current?.status === "running" && jobRef.current.kind === "load"
          ? jobRef.current
          : null;
      setSelected(new Set(activeLoad?.repositoryIds));
      if (id === null && accountRef.current)
        setOverviewVersion((value) => value + 1);
      if (jobRef.current?.status !== "running") {
        jobRef.current = null;
        setJob(null);
        setPollError(null);
      }
    }
    accountRef.current = id;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      search: query.search,
      offset: String(query.offset),
      limit: String(query.limit),
    });
    setIsLoading(true);
    setCacheError(null);

    void request<WorkspaceData>(`/workspace?${parameters}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        acceptAccount(data.profile?.id ?? null);
        setWorkspace(data);
        if (data.activeJob) acceptJob(data.activeJob);
        if (query.offset > 0 && query.offset >= data.total) {
          setQuery((current) => ({
            ...current,
            offset:
              Math.max(0, Math.ceil(data.total / current.limit) - 1) *
              current.limit,
          }));
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setCacheError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [
    query.search,
    query.offset,
    query.limit,
    cacheVersion,
    acceptAccount,
    acceptJob,
  ]);

  const githubConfigured = workspace?.settings.githubConfigured;
  useEffect(() => {
    if (!githubConfigured) return;
    const controller = new AbortController();
    setIsOverviewLoading(true);
    setOverviewError(null);

    void request<GitHubProfile>("/github/overview", {
      signal: controller.signal,
    })
      .then((profile) => {
        if (controller.signal.aborted) return;
        acceptAccount(profile.id);
        setWorkspace((current) =>
          current ? { ...current, profile } : current,
        );
        reloadCache();
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setOverviewError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsOverviewLoading(false);
      });

    return () => controller.abort();
  }, [githubConfigured, overviewVersion, acceptAccount, reloadCache]);

  const runningJobId = job?.status === "running" ? job.id : null;
  useEffect(() => {
    if (!runningJobId) return;
    const path = `/jobs/${encodeURIComponent(runningJobId)}`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      let keepPolling = true;
      try {
        const next = await request<Job>(path, { signal: controller.signal });
        if (controller.signal.aborted) return;
        acceptJob(next);
        keepPolling = next.status === "running";
      } catch (error) {
        if (!controller.signal.aborted) setPollError(errorMessage(error));
      }
      if (!controller.signal.aborted && keepPolling)
        timer = setTimeout(poll, 1500);
    }

    timer = setTimeout(poll, 1000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [runningJobId, acceptJob]);

  useEffect(() => {
    window.addEventListener("focus", reloadCache);
    return () => {
      window.removeEventListener("focus", reloadCache);
      actionController.current?.abort();
    };
  }, [reloadCache]);

  const startOperation = useCallback(
    async (kind: JobKind, path: string, body: unknown) => {
      if (actionController.current || jobRef.current?.status === "running")
        return;
      const controller = new AbortController();
      actionController.current = controller;
      setPending(kind);
      setActionError(null);
      try {
        const next = await request<Job>(path, {
          method: "POST",
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) acceptJob(next);
      } catch (error) {
        if (!controller.signal.aborted) setActionError(errorMessage(error));
      } finally {
        if (actionController.current === controller)
          actionController.current = null;
        if (!controller.signal.aborted) {
          setPending(null);
          reloadCache();
        }
      }
    },
    [acceptJob, reloadCache],
  );

  return {
    workspace,
    query,
    setQuery,
    selected,
    setSelected,
    isLoading,
    cacheError,
    overviewError,
    isOverviewLoading,
    pending,
    actionError,
    job,
    pollError,
    reloadCache,
    reloadOverview,
    startOperation,
  };
}
