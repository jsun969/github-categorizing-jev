import {
  Alert,
  Button,
  Card,
  Chip,
  Description,
  FieldError,
  Form,
  Label,
  NumberField,
  ProgressBar,
} from "@heroui/react";
import type { Job, JobKind } from "../../lib/contracts";
import { AppLink } from "../app-link";

const jobLabels: Record<JobKind, string> = {
  load: "Load repositories",
  refresh: "Refresh selected",
  classification: "Classification",
};

interface ClassificationSidebarProps {
  selectedCount: number;
  categoryCount: number | null;
  jevConfigured: boolean;
  profileKnown: boolean;
  isReady: boolean;
  batchSize: number;
  onBatchSizeChange: (value: number) => void;
  onStart: () => void;
  pending: JobKind | null;
  job: Job | null;
  pollError: string | null;
}

export function ClassificationSidebar({
  selectedCount,
  categoryCount,
  jevConfigured,
  profileKnown,
  isReady,
  batchSize,
  onBatchSizeChange,
  onStart,
  pending,
  job,
  pollError,
}: ClassificationSidebarProps) {
  const running = job?.status === "running";
  const invalidBatch =
    !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000;
  const canStart =
    isReady &&
    jevConfigured &&
    profileKnown &&
    (categoryCount ?? 0) > 0 &&
    selectedCount > 0 &&
    selectedCount <= 1000 &&
    !invalidBatch &&
    !pending &&
    !running;
  const starting = pending === "classification";
  const classifying = running && job.kind === "classification";
  const processed = job ? job.completed + job.failed : 0;

  return (
    <aside
      aria-labelledby="classification-heading"
      className="min-w-0 self-start lg:sticky lg:top-6"
    >
      <Card className="lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
        <Card.Header>
          <Card.Title
            id="classification-heading"
            render={(props) => <h2 {...props} />}
          >
            Classification
          </Card.Title>
          <Card.Description>
            Evaluate selected repositories against every category.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-5">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt>Selected repositories</dt>
              <dd className="font-mono tabular-nums" aria-live="polite">
                {selectedCount.toLocaleString("en-US")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>All categories</dt>
              <dd className="font-mono tabular-nums">
                {categoryCount === null
                  ? "--"
                  : categoryCount.toLocaleString("en-US")}
              </dd>
            </div>
          </dl>

          <Form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (canStart) onStart();
            }}
          >
            <NumberField
              name="batchSize"
              value={batchSize}
              onChange={onBatchSizeChange}
              minValue={1}
              maxValue={1000}
              step={1}
              isRequired
              isInvalid={invalidBatch}
              isDisabled={Boolean(pending) || running}
              validationBehavior="aria"
            >
              <Label>Batch size</Label>
              <NumberField.Group>
                <NumberField.DecrementButton aria-label="Decrease batch size" />
                <NumberField.Input className="w-full min-w-0" />
                <NumberField.IncrementButton aria-label="Increase batch size" />
              </NumberField.Group>
              <Description>
                Maximum repositories per request, not concurrency. Requests run
                sequentially; large inputs may use smaller batches.
              </Description>
              <FieldError>Enter a whole number from 1 to 1,000.</FieldError>
            </NumberField>
            <Button
              type="submit"
              isDisabled={!canStart}
              isPending={starting || classifying}
            >
              {starting ? "Starting…" : classifying ? "Classifying…" : "Start"}
            </Button>
          </Form>

          {isReady && !jevConfigured ? (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Jev token required</Alert.Title>
                <Alert.Description>
                  <AppLink to="/settings">Open Settings</AppLink> to save your
                  Jev token before classification.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          {categoryCount === 0 ? (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>No categories yet</Alert.Title>
                <Alert.Description>
                  <AppLink to="/categories">Open Categories</AppLink> to define
                  the categories used by every classification request.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          {isReady && !profileKnown ? (
            <p className="text-sm text-muted">
              Load your GitHub account before classification. Check the
              connection in <AppLink to="/settings">Settings</AppLink>.
            </p>
          ) : null}
          {selectedCount === 0 ? (
            <p className="text-sm text-muted">
              Select saved repositories in the table, or load repositories to
              select them automatically.
            </p>
          ) : null}
          {selectedCount > 1000 ? (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  Select at most 1,000 repositories per job.
                </Alert.Title>
              </Alert.Content>
            </Alert>
          ) : null}
          {running ? (
            <p className="text-xs text-muted">
              Another operation cannot start until this job finishes. Selection
              changes apply to the next run.
            </p>
          ) : null}

          {job ? (
            <section
              aria-labelledby="workspace-job-heading"
              className="flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3
                  id="workspace-job-heading"
                  className="text-sm font-semibold"
                >
                  {jobLabels[job.kind]}
                </h3>
                <Chip
                  size="sm"
                  color={
                    job.status === "failed"
                      ? "danger"
                      : running
                        ? "accent"
                        : job.failed > 0
                          ? "warning"
                          : "success"
                  }
                >
                  {running
                    ? "Running"
                    : job.status === "failed"
                      ? "Failed"
                      : job.failed > 0
                        ? "Finished with errors"
                        : "Completed"}
                </Chip>
              </div>
              <ProgressBar
                aria-label={`${jobLabels[job.kind]} progress`}
                minValue={0}
                maxValue={Math.max(1, job.total, processed)}
                value={processed}
                isIndeterminate={running && job.total === 0}
                size="sm"
              >
                <Label>
                  {processed.toLocaleString("en-US")} /{" "}
                  {job.total.toLocaleString("en-US")} processed
                </Label>
                <ProgressBar.Track>
                  <ProgressBar.Fill />
                </ProgressBar.Track>
              </ProgressBar>
              <p className="text-xs text-muted">
                {job.completed.toLocaleString("en-US")} succeeded ·{" "}
                {job.failed.toLocaleString("en-US")} failed
              </p>
              <p
                className="text-sm break-words"
                role="status"
                aria-live="polite"
              >
                {job.message}
              </p>
              {pollError ? (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Job updates interrupted</Alert.Title>
                    <Alert.Description>
                      {pollError} Polling will retry automatically. The last
                      known progress is shown.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              {job.errors.length > 0 ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Repository errors</Alert.Title>
                    <div
                      role="region"
                      aria-label="Repository error details"
                      tabIndex={0}
                      className="mt-2 max-h-52 overflow-y-auto"
                    >
                      <ul className="space-y-3 text-xs">
                        {job.errors.map((failure, index) => (
                          <li
                            key={`${failure.repository}-${index}`}
                            className="space-y-1 break-words"
                          >
                            <p className="font-medium">{failure.repository}</p>
                            <p>{failure.message}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Alert.Content>
                </Alert>
              ) : null}
              {job.completed > 0 ? (
                <p className="text-xs text-muted">
                  Successful repositories are saved locally, even if another
                  repository fails.
                </p>
              ) : null}
            </section>
          ) : null}
        </Card.Content>
        <Card.Footer>
          <p className="text-xs text-muted">
            Preview only. Classification never writes to GitHub Star Lists.
          </p>
        </Card.Footer>
      </Card>
    </aside>
  );
}
