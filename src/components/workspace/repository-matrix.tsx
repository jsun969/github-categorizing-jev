import {
  Checkbox,
  Chip,
  Link,
  ProgressBar,
  Table,
  Tooltip,
} from "@heroui/react";
import type { Selection } from "@heroui/react";
import { memo, useMemo } from "react";
import type { Category, Job, RepositoryRow } from "../../lib/contracts";

const probabilityFormat: Intl.NumberFormatOptions = {
  style: "percent",
  maximumFractionDigits: 1,
};
const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

interface RepositoryMatrixProps {
  repositories: RepositoryRow[];
  categories: Category[];
  selected: Set<string>;
  onSelectionChange: (selection: Selection) => void;
  failures: Job["errors"];
  isLoading: boolean;
  isSearching: boolean;
  hasError: boolean;
}

export const RepositoryMatrix = memo(function RepositoryMatrix({
  repositories,
  categories,
  selected,
  onSelectionChange,
  failures,
  isLoading,
  isSearching,
  hasError,
}: RepositoryMatrixProps) {
  const failureByRepository = useMemo(
    () =>
      new Map(
        failures.map((failure) => [
          failure.repository.toLowerCase(),
          failure.message,
        ]),
      ),
    [failures],
  );
  const pageSelection = useMemo(
    () =>
      new Set(
        repositories
          .filter((repository) => selected.has(repository.id))
          .map((repository) => repository.id),
      ),
    [repositories, selected],
  );

  return (
    <Table aria-busy={isLoading}>
      <Table.ScrollContainer className="max-h-[70vh] overflow-auto">
        <Table.Content
          aria-label="Saved repositories and category probabilities"
          className="min-w-full"
          selectionMode="multiple"
          selectedKeys={pageSelection}
          onSelectionChange={onSelectionChange}
          disabledKeys={
            isLoading ? repositories.map((repository) => repository.id) : []
          }
          disabledBehavior="selection"
        >
          <Table.Header className="sticky top-0 z-10">
            <Table.Column id="selection" className="w-12 pe-0">
              <Checkbox
                aria-label="Select all repositories on this page"
                slot="selection"
                isDisabled={isLoading || repositories.length === 0}
              >
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox.Content>
              </Checkbox>
            </Table.Column>
            <Table.Column id="repository" isRowHeader className="min-w-56">
              Repository
            </Table.Column>
            {categories.map((category) => (
              <Table.Column
                key={category.id}
                id={category.id}
                className="min-w-36"
              >
                <Tooltip>
                  <Tooltip.Trigger
                    tabIndex={0}
                    className="inline-block max-w-40 truncate"
                  >
                    {category.name}
                  </Tooltip.Trigger>
                  <Tooltip.Content className="max-w-xs">
                    {category.description}
                  </Tooltip.Content>
                </Tooltip>
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body
            renderEmptyState={() => (
              <div className="space-y-2 px-6 py-16 text-center" role="status">
                <p className="font-medium">
                  {isLoading
                    ? "Loading repositories…"
                    : hasError
                      ? "Could not load repositories"
                      : isSearching
                        ? "No matching repositories"
                        : "No repositories loaded"}
                </p>
                <p className="text-sm text-muted">
                  {isLoading
                    ? "Reading your local cache."
                    : hasError
                      ? "Retry the cache request above."
                      : isSearching
                        ? "Try another owner or repository name."
                        : "Choose a source and click Load to get started."}
                </p>
              </div>
            )}
          >
            {repositories.map((repository) => {
              const failure =
                failureByRepository.get(repository.id.toLowerCase()) ??
                failureByRepository.get(repository.fullName.toLowerCase());
              const unavailable = failure
                ? `Classification failed: ${failure}`
                : repository.classificationStatus === "stale"
                  ? "Outdated result. Classify again."
                  : "Not classified yet.";
              return (
                <Table.Row
                  key={repository.id}
                  id={repository.id}
                  textValue={repository.fullName}
                >
                  <Table.Cell className="w-12 pe-0">
                    <Checkbox
                      aria-label={`Select ${repository.fullName}`}
                      slot="selection"
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="min-w-48 max-w-80 space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={repository.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${repository.fullName} on GitHub (opens in a new tab)`}
                          className="min-w-0 truncate font-medium"
                        >
                          {repository.fullName}
                        </Link>
                        {failure ? (
                          <Chip size="sm" color="danger" title={failure}>
                            Error
                          </Chip>
                        ) : repository.classificationStatus === "stale" ? (
                          <Chip
                            size="sm"
                            color="warning"
                            title="Content or categories changed. Classify again."
                          >
                            Stale
                          </Chip>
                        ) : null}
                        {repository.archived ? (
                          <Chip size="sm">Archived</Chip>
                        ) : null}
                        {repository.inputTruncated &&
                        repository.classificationStatus === "current" ? (
                          <Chip
                            size="sm"
                            color="warning"
                            title="Jev used a README excerpt; the full README remains saved."
                          >
                            Excerpt
                          </Chip>
                        ) : null}
                      </div>
                      <Tooltip>
                        <Tooltip.Trigger
                          aria-label={`Details for ${repository.fullName}`}
                          className="max-w-full truncate text-xs text-muted"
                        >
                          {repository.description || "No description"}
                        </Tooltip.Trigger>
                        <Tooltip.Content className="max-w-sm space-y-1">
                          <p className="font-medium">{repository.fullName}</p>
                          {repository.description ? (
                            <p>{repository.description}</p>
                          ) : null}
                          {repository.language ? (
                            <p>{repository.language}</p>
                          ) : null}
                          {!repository.hasReadme ? (
                            <p>No README available.</p>
                          ) : null}
                          <p>
                            Updated{" "}
                            {dateFormat.format(new Date(repository.fetchedAt))}
                          </p>
                          {repository.classifiedAt ? (
                            <p>
                              Classified{" "}
                              {dateFormat.format(
                                new Date(repository.classifiedAt),
                              )}
                            </p>
                          ) : null}
                          {repository.inputTruncated ? (
                            <p>
                              The last classification used a README excerpt. The
                              full README is saved.
                            </p>
                          ) : null}
                        </Tooltip.Content>
                      </Tooltip>
                    </div>
                  </Table.Cell>
                  {categories.map((category) => {
                    const probability =
                      !failure && repository.classificationStatus === "current"
                        ? repository.probabilities?.[category.id]
                        : undefined;
                    const valid =
                      typeof probability === "number" &&
                      Number.isFinite(probability) &&
                      probability >= 0 &&
                      probability <= 1;
                    return (
                      <Table.Cell key={category.id}>
                        {valid ? (
                          <ProgressBar
                            aria-label={`${repository.fullName}: ${category.name} probability`}
                            minValue={0}
                            maxValue={1}
                            value={probability}
                            size="sm"
                            formatOptions={probabilityFormat}
                            className="flex min-w-28 flex-row items-center gap-3"
                          >
                            <ProgressBar.Track className="min-w-0 flex-1">
                              <ProgressBar.Fill />
                            </ProgressBar.Track>
                            <ProgressBar.Output className="w-12 shrink-0 text-right text-xs tabular-nums" />
                          </ProgressBar>
                        ) : (
                          <span
                            className="text-sm text-muted"
                            aria-label={`${category.name}: ${unavailable}`}
                            title={unavailable}
                          >
                            --
                          </span>
                        )}
                      </Table.Cell>
                    );
                  })}
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
});
