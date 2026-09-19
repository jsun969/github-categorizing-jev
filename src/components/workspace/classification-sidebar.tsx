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
  Separator,
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
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt>Selected repositories</dt>
              <dd className="tabular-nums" aria-live="polite">
                {selectedCount.toLocaleString("en-US")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>All categories</dt>
              <dd className="tabular-nums">
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
                Repositories per request, not concurrency. Large inputs may use
                smaller batches.
              </Description>
              <FieldError>Enter a whole number from 1 to 1,000.</FieldError>
            </NumberField>
            <Button
              type="submit"
              className="w-full"
              isDisabled={!canStart}
              isPending={starting || classifying}
            >
              {starting ? "Starting…" : classifying ? "Classifying…" : "Start"}
            </Button>
          </Form>
          {isReady && !jevConfigured ? (
            <p className="text-sm">
              <AppLink to="/settings">Configure a Jev token</AppLink> to
              classify.
            </p>
          ) : null}
          {categoryCount === 0 ? (
            <p className="text-sm">
              <AppLink to="/categories">Add categories</AppLink> before
              starting.
            </p>
          ) : null}
          {isReady && !profileKnown && jevConfigured ? (
            <p className="text-xs text-muted">
              Load your GitHub account first.
            </p>
          ) : null}
          {isReady &&
          profileKnown &&
          jevConfigured &&
          (categoryCount ?? 0) > 0 &&
          selectedCount === 0 ? (
            <p className="text-xs text-muted">
              Select repositories in the table.
            </p>
          ) : null}
          {selectedCount > 1000 ? (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  Select at most 1,000 repositories per run.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          {job ? (
            <section
              aria-labelledby="workspace-job-heading"
              className="flex flex-col gap-3"
            >
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="workspace-job-heading" className="text-sm font-medium">
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
                        ? "Partial"
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
              <p
                className="text-xs text-muted break-words"
                role="status"
                aria-live="polite"
              >
                {running || job.status === "failed"
                  ? job.message
                  : `${job.completed} completed${job.failed ? `, ${job.failed} failed` : ""}.`}
              </p>
              {pollError ? (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Updates interrupted</Alert.Title>
                    <Alert.Description>
                      {pollError} Retrying automatically.
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
                      className="mt-2 max-h-40 overflow-y-auto"
                    >
                      <ul className="space-y-2 text-xs">
                        {job.errors.map((failure, index) => (
                          <li
                            key={`${failure.repository}-${index}`}
                            className="break-words"
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
            </section>
          ) : null}
        </Card.Content>
      </Card>
    </aside>
  );
}
