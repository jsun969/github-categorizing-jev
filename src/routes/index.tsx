import {
  Alert,
  Button,
  Card,
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
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Workspace</h1>
          <p className="text-sm text-muted">
            Browse your saved stars. Load deliberately, then classify what you
            select.
          </p>
        </div>
        <div className="space-y-1 sm:text-right" aria-live="polite">
          <p className="text-sm text-muted">Total stars</p>
          <p className="font-mono text-3xl font-semibold tabular-nums">
            {profile ? profile.totalStars.toLocaleString("en-US") : "--"}
          </p>
          <p className="text-xs text-muted">
            {isOverviewLoading
              ? "Checking GitHub total…"
              : profile
                ? `${overviewError ? "Cached total · " : ""}@${profile.login}`
                : "Connect GitHub to read your total."}
          </p>
          {profile ? (
            <p className="text-xs text-muted">
              Checked{" "}
              <time dateTime={profile.fetchedAt}>
                {new Date(profile.fetchedAt).toLocaleString("en-US")}
              </time>
            </p>
          ) : null}
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
              className="mt-3"
              size="sm"
              variant="secondary"
              isPending={isLoading}
              onPress={reloadCache}
            >
              Retry cache
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {workspace && !githubConfigured ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Connect your GitHub account</Alert.Title>
            <Alert.Description>
              <AppLink to="/settings">Open Settings</AppLink> to save a GitHub
              token. Opening the workspace only reads your star total;
              repositories load when you ask.
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
              {overviewError} Saved repositories remain available. Check your
              token in <AppLink to="/settings">Settings</AppLink>.
            </Alert.Description>
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              isPending={isOverviewLoading}
              onPress={reloadOverview}
            >
              Retry total
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {actionError ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Could not start the operation</Alert.Title>
            <Alert.Description>{actionError}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <Card.Header>
              <Card.Title render={(props) => <h2 {...props} />}>
                Load repositories
              </Card.Title>
              <Card.Description>
                Fetch metadata and README together, then save them locally.
                Loading never starts classification.
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <Form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  loadRepositories();
                }}
              >
                <div
                  className={
                    mode === "specific"
                      ? "grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                      : "grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
                  }
                >
                  <Select
                    name="loadMode"
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
                    <Label>Load mode</Label>
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
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  {mode !== "specific" ? (
                    <NumberField
                      name="loadCount"
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
                      <FieldError>Enter 1 to 1,000 repositories.</FieldError>
                    </NumberField>
                  ) : null}
                  <Button
                    type="submit"
                    className="sm:mt-7"
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
                <p className="text-xs text-muted">
                  {loadModes.find((option) => option.id === mode)?.description}
                </p>
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
                      Enter owner/repository names or HTTPS github.com
                      repository URLs, separated by spaces, commas, or new
                      lines. {specificEntries.length.toLocaleString("en-US")}{" "}
                      entries; maximum 1,000.
                    </Description>
                    <FieldError>
                      Enter between 1 and 1,000 starred repositories.
                    </FieldError>
                  </TextField>
                ) : null}
              </Form>
            </Card.Content>
            <Card.Footer className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Successfully loaded repositories are selected automatically.
              </p>
              <AppLink to="/settings" className="text-xs">
                Manage credentials
              </AppLink>
            </Card.Footer>
          </Card>

          <section
            aria-labelledby="repositories-heading"
            className="flex min-w-0 flex-col gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 id="repositories-heading" className="text-lg font-semibold">
                  Saved repositories
                </h2>
                <p className="text-xs text-muted">
                  All categories appear as columns. Scroll horizontally to
                  compare probabilities.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <SearchField
                name="repositorySearch"
                className="min-w-0 flex-1 basis-52"
                value={searchText}
                onChange={setSearchText}
              >
                <Label>Search saved repositories</Label>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input
                    className="w-full min-w-0"
                    placeholder="Owner or repository name"
                  />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <Select
                aria-label="Rows per page"
                className="w-36"
                value={String(query.limit)}
                isDisabled={tablePending}
                onChange={(key) => {
                  const limit = Number(key);
                  if (limit === 25 || limit === 50 || limit === 100)
                    setQuery((current) => ({ ...current, limit, offset: 0 }));
                }}
              >
                <Label>Rows per page</Label>
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
            </div>
            <p className="text-xs text-muted">
              Search and pagination use only the local cache. Selection is kept
              across pages. Refresh updates only selected metadata and READMEs.
            </p>
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
                  ? "Reading local cache…"
                  : workspace
                    ? `${workspace.total === 0 ? 0 : query.offset + 1}–${Math.min(query.offset + repositories.length, workspace.total)} of ${workspace.total.toLocaleString("en-US")} saved repositories${query.search ? " matching your search" : ""}`
                    : "Local cache has not loaded."}
              </p>
              <nav
                aria-label="Repository pages"
                className="flex items-center gap-2"
              >
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
                  Page {page} of {pageCount}
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
              <span className="font-mono">--</span> means no current
              probability, including stale or failed results. Probabilities are
              independent and do not need to add up to 100%. “Input truncated”
              means Jev used a README excerpt; the full README remains saved.
            </p>
          </section>
        </div>

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
