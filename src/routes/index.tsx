import {
  Alert,
  Button,
  Description,
  FieldError,
  Form,
  Label,
  ListBox,
  NumberField,
  ProgressBar,
  SearchField,
  Select,
  TextArea,
  TextField,
} from "@heroui/react";
import type { Selection } from "@heroui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLink } from "../components/app-link";
import { ClassificationSidebar } from "../components/workspace/classification-sidebar";
import { RepositoryMatrix } from "../components/workspace/repository-matrix";
import { useWorkspace } from "../components/workspace/use-workspace";
import type {
  Category,
  ClassificationRequest,
  Job,
  LoadRequest,
  RepositoryRow,
} from "../lib/contracts";

export const Route = createFileRoute("/")({
  component: WorkspacePage,
});

const emptyRepositories: RepositoryRow[] = [];
const emptyCategories: Category[] = [];
const emptyFailures: Job["errors"] = [];
const loadModes = [
  {
    id: "continue",
    name: "Continue",
    description:
      "Continue from the last saved position. Successfully saved repositories advance the cursor.",
  },
  {
    id: "latest",
    name: "Latest",
    description:
      "Start with your newest stars without changing the Continue position.",
  },
  {
    id: "specific",
    name: "Specific repositories",
    description:
      "Load the repositories you name without changing the Continue position. They must be starred by your GitHub account.",
  },
] as const;

function WorkspacePage() {
  const {
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
  } = useWorkspace();
  const [mode, setMode] = useState<LoadRequest["mode"]>("continue");
  const [count, setCount] = useState(50);
  const [specificRepositories, setSpecificRepositories] = useState("");
  const [batchSize, setBatchSize] = useState(5);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      const search = searchText.trim();
      setQuery((current) =>
        current.search === search ? current : { ...current, search, offset: 0 },
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [searchText, setQuery]);

  const repositories = workspace?.repositories ?? emptyRepositories;
  const categories = workspace?.categories ?? emptyCategories;
  const profile = workspace?.profile;
  const ready = workspace !== null && !cacheError;
  const running = job?.status === "running";
  const busy = Boolean(pending) || running;
  const githubConfigured = workspace?.settings.githubConfigured ?? false;
  const specificEntries = useMemo(
    () =>
      Array.from(
        new Set(
          specificRepositories
            .trim()
            .split(/[\s,]+/)
            .filter(Boolean),
        ),
      ),
    [specificRepositories],
  );
  const loadCount = mode === "specific" ? specificEntries.length : count;
  const invalidCount =
    !Number.isInteger(loadCount) || loadCount < 1 || loadCount > 1000;
  const searchPending = searchText.trim() !== query.search;
  const tablePending = isLoading || searchPending;
  const canLoad = ready && githubConfigured && !busy && !invalidCount;
  const canRefresh =
    ready &&
    githubConfigured &&
    !busy &&
    selected.size > 0 &&
    selected.size <= 1000;
  const pageCount = workspace
    ? Math.max(1, Math.ceil(workspace.total / query.limit))
    : 1;
  const page = Math.floor(query.offset / query.limit) + 1;
  const loadPending = pending === "load" || (running && job.kind === "load");
  const refreshPending =
    pending === "refresh" || (running && job.kind === "refresh");

  const changeSelection = useCallback(
    (keys: Selection) => {
      setSelected((current) => {
        const next = new Set(current);
        for (const repository of repositories) {
          if (keys === "all" || keys.has(repository.id))
            next.add(repository.id);
          else next.delete(repository.id);
        }
        return next;
      });
    },
    [repositories, setSelected],
  );

  function loadRepositories() {
    if (!canLoad) return;
    const body: LoadRequest = { mode, count: loadCount };
    if (mode === "specific") body.repositories = specificEntries;
    void startOperation("load", "/github/load", body);
  }

  function classifyRepositories() {
    const body: ClassificationRequest = {
      repositoryIds: Array.from(selected),
      batchSize,
    };
    void startOperation("classification", "/classification/start", body);
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Workspace</h1>
        <div
          className="flex items-baseline gap-2"
          aria-live="polite"
          title={
            profile
              ? `GitHub account: ${profile.login}. Updated ${new Date(profile.fetchedAt).toLocaleString("en-US")}.`
              : undefined
          }
        >
          <span className="text-sm text-muted">
            {isOverviewLoading
              ? "Checking stars…"
              : overviewError
                ? "Stars (cached)"
                : "Total stars"}
          </span>
          <span className="text-xl font-semibold tabular-nums">
            {profile ? profile.totalStars.toLocaleString("en-US") : "--"}
          </span>
        </div>
      </header>

      {cacheError ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Could not read the local cache</Alert.Title>
            <Alert.Description>
              {cacheError} Any visible rows are from the last successful read.
            </Alert.Description>
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              isPending={isLoading}
              onPress={reloadCache}
            >
              Retry
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {workspace && !githubConfigured ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              <AppLink to="/settings">Add your GitHub token</AppLink> to start
              loading repositories.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {overviewError ? (
        <Alert status="warning" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Could not update your star total</Alert.Title>
            <Alert.Description>
              {overviewError} Your saved repositories are still available.
            </Alert.Description>
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              isPending={isOverviewLoading}
              onPress={reloadOverview}
            >
              Retry
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {actionError ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Could not start</Alert.Title>
            <Alert.Description>{actionError}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section
          aria-label="Saved repositories"
          className="flex min-w-0 flex-col gap-4"
        >
          <Form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              loadRepositories();
            }}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-start gap-3 sm:flex sm:flex-wrap">
              <Select
                name="loadMode"
                className={
                  mode === "specific"
                    ? "col-span-2 w-full sm:w-48"
                    : "w-full sm:w-48"
                }
                value={mode}
                isDisabled={!ready || busy}
                onChange={(key) => {
                  if (
                    key === "continue" ||
                    key === "latest" ||
                    key === "specific"
                  )
                    setMode(key);
                }}
              >
                <Label>Source</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {loadModes.map((option) => (
                      <ListBox.Item
                        id={option.id}
                        key={option.id}
                        textValue={option.name}
                      >
                        <Label>{option.name}</Label>
                        <Description>{option.description}</Description>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              {mode !== "specific" ? (
                <NumberField
                  name="loadCount"
                  className="w-full sm:w-36"
                  value={count}
                  onChange={setCount}
                  minValue={1}
                  maxValue={1000}
                  step={1}
                  isRequired
                  isInvalid={invalidCount}
                  isDisabled={!ready || busy}
                  validationBehavior="aria"
                >
                  <Label>Count</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton aria-label="Decrease load count" />
                    <NumberField.Input className="w-full min-w-0" />
                    <NumberField.IncrementButton aria-label="Increase load count" />
                  </NumberField.Group>
                  <FieldError>Enter 1 to 1,000.</FieldError>
                </NumberField>
              ) : null}
              <Button
                type="submit"
                className="col-span-2 w-full sm:mt-6 sm:w-auto"
                isDisabled={!canLoad}
                isPending={loadPending}
              >
                {pending === "load"
                  ? "Starting…"
                  : loadPending
                    ? "Loading…"
                    : "Load"}
              </Button>
            </div>
            {mode === "specific" ? (
              <TextField
                name="repositories"
                value={specificRepositories}
                onChange={setSpecificRepositories}
                isRequired
                isInvalid={specificEntries.length > 1000}
                isDisabled={busy}
              >
                <Label>Specific repositories</Label>
                <TextArea rows={3} className="w-full font-mono text-sm" />
                <Description>
                  One owner/repo or GitHub URL per line.{" "}
                  {specificEntries.length} entered; maximum 1,000.
                </Description>
                <FieldError>
                  Enter between 1 and 1,000 starred repositories.
                </FieldError>
              </TextField>
            ) : null}
          </Form>

          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              name="repositorySearch"
              aria-label="Search saved repositories"
              className="min-w-0 flex-1 basis-52"
              value={searchText}
              onChange={setSearchText}
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input
                  className="w-full min-w-0"
                  placeholder="Search saved repositories"
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={!canRefresh}
              isPending={refreshPending}
              onPress={() => {
                void startOperation("refresh", "/github/refresh", {
                  repositoryIds: Array.from(selected),
                });
              }}
            >
              {pending === "refresh"
                ? "Starting…"
                : refreshPending
                  ? "Refreshing…"
                  : "Refresh selected"}
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              isDisabled={selected.size === 0}
              onPress={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
          </div>

          {tablePending ? (
            <ProgressBar
              isIndeterminate
              aria-label="Reading local repositories"
              size="sm"
            >
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          ) : null}
          <RepositoryMatrix
            repositories={repositories}
            categories={categories}
            selected={selected}
            onSelectionChange={changeSelection}
            failures={
              job?.kind === "classification" ? job.errors : emptyFailures
            }
            isLoading={tablePending}
            isSearching={query.search.length > 0}
            hasError={Boolean(cacheError)}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted" role="status">
              {tablePending
                ? "Loading…"
                : workspace
                  ? `${workspace.total === 0 ? 0 : query.offset + 1}–${Math.min(query.offset + repositories.length, workspace.total)} of ${workspace.total.toLocaleString("en-US")} saved${query.search ? " matches" : ""}`
                  : "Cache unavailable"}
            </p>
            <nav
              aria-label="Repository pages"
              className="flex flex-wrap items-center gap-2"
            >
              <Select
                aria-label="Rows per page"
                className="w-20"
                value={String(query.limit)}
                isDisabled={tablePending}
                onChange={(key) => {
                  const limit = Number(key);
                  if (limit === 25 || limit === 50 || limit === 100)
                    setQuery((current) => ({ ...current, limit, offset: 0 }));
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {[25, 50, 100].map((size) => (
                      <ListBox.Item
                        key={size}
                        id={String(size)}
                        textValue={String(size)}
                      >
                        {size}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={tablePending || query.offset === 0 || !ready}
                onPress={() =>
                  setQuery((current) => ({
                    ...current,
                    offset: Math.max(0, current.offset - current.limit),
                  }))
                }
              >
                Previous
              </Button>
              <span className="text-xs tabular-nums">
                {page} / {pageCount}
              </span>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={tablePending || !ready || page >= pageCount}
                onPress={() =>
                  setQuery((current) => ({
                    ...current,
                    offset: current.offset + current.limit,
                  }))
                }
              >
                Next
              </Button>
            </nav>
          </div>
          <p className="text-xs text-muted">
            Each column is an independent probability.{" "}
            <span className="tabular-nums">--</span> means no current result.
          </p>
        </section>
        <ClassificationSidebar
          selectedCount={selected.size}
          categoryCount={workspace ? categories.length : null}
          jevConfigured={workspace?.settings.jevConfigured ?? false}
          profileKnown={Boolean(profile)}
          isReady={ready}
          batchSize={batchSize}
          onBatchSizeChange={setBatchSize}
          onStart={classifyRepositories}
          pending={pending}
          job={job}
          pollError={pollError}
        />
      </div>
    </div>
  );
}
