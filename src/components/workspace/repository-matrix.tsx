import {
  Checkbox,
  Chip,
  Link,
  ProgressBar,
  Surface,
  Table,
} from "@heroui/react";
import type { Selection } from "@heroui/react";
import { memo, useMemo } from "react";
import type { Category, Job, RepositoryRow } from "../../lib/contracts";

const probabilityFormat: Intl.NumberFormatOptions = {
  style: "percent",
  maximumSignificantDigits: 21,
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
      <Table.ScrollContainer className="max-h-[65vh] overflow-auto">
        <Table.Content
          aria-label="Saved repositories and category probabilities"
          className="w-max table-fixed"
          selectionMode="multiple"
          selectedKeys={pageSelection}
          onSelectionChange={onSelectionChange}
          disabledKeys={
            isLoading ? repositories.map((repository) => repository.id) : []
          }
          disabledBehavior="selection"
        >
          <Table.Header className="sticky top-0 z-30">
            <Table.Column
              id="selection"
              className="sticky left-0 z-20 w-10 min-w-10 max-w-10 px-2 sm:w-12 sm:min-w-12 sm:max-w-12"
            >
              <Surface
                aria-hidden="true"
                variant="secondary"
                className="absolute inset-0 -z-10"
              >
                {null}
              </Surface>
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
            <Table.Column
              id="repository"
              isRowHeader
              className="sticky left-10 z-20 w-28 min-w-28 max-w-28 px-2 sm:left-12 sm:w-72 sm:min-w-72 sm:max-w-72 sm:px-4"
            >
              <Surface
                aria-hidden="true"
                variant="secondary"
                className="absolute inset-0 -z-10"
              >
                {null}
              </Surface>
              Repository
            </Table.Column>
            {categories.map((category) => (
              <Table.Column
                key={category.id}
                id={category.id}
                className="w-32 min-w-32 max-w-32 sm:w-44 sm:min-w-44 sm:max-w-44"
              >
                <div className="space-y-1" title={category.description}>
                  <span className="block text-sm font-semibold break-words">
                    {category.name}
                  </span>
                  <span className="line-clamp-2 text-xs font-normal">
                    {category.description}
                  </span>
                </div>
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body
            renderEmptyState={() => (
              <div className="space-y-2 px-4 py-12 text-center" role="status">
                <p className="text-sm font-medium">
                  {isLoading
                    ? "Reading saved repositories…"
                    : hasError
                      ? "Saved repositories are unavailable."
                      : isSearching
                        ? "No saved repositories match your search."
                        : "No repositories saved yet."}
                </p>
                <p className="text-sm text-muted">
                  {isLoading
                    ? "Opening your local cache."
                    : hasError
                      ? "Retry the cache request to continue."
                      : isSearching
                        ? "Try another owner or repository name. Search only uses the local cache."
                        : "Use Load to save starred repositories and their READMEs. Classification starts only when you choose Start."}
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
                  ? "Stale result: repository content or categories changed. Classify again."
                  : "No current classification result.";

              return (
                <Table.Row
                  key={repository.id}
                  id={repository.id}
                  textValue={repository.fullName}
                >
                  <Table.Cell className="sticky left-0 z-10 w-10 min-w-10 max-w-10 px-2 sm:w-12 sm:min-w-12 sm:max-w-12">
                    <Surface
                      aria-hidden="true"
                      className="absolute inset-0 -z-10"
                    >
                      {null}
                    </Surface>
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
                  <Table.Cell className="sticky left-10 z-10 w-28 min-w-28 max-w-28 px-2 sm:left-12 sm:w-72 sm:min-w-72 sm:max-w-72 sm:px-4">
                    <Surface
                      aria-hidden="true"
                      className="absolute inset-0 -z-10"
                    >
                      {null}
                    </Surface>
                    <div className="space-y-2 whitespace-normal">
                      <Link
                        href={repository.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${repository.fullName} on GitHub (opens in a new tab)`}
                        className="max-w-full text-sm font-medium break-all"
                      >
                        {repository.fullName}
                      </Link>
                      {repository.description ? (
                        <p
                          className="line-clamp-2 text-xs text-muted"
                          title={repository.description}
                        >
                          {repository.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {repository.language ? (
                          <span className="text-xs text-muted">
                            {repository.language}
                          </span>
                        ) : null}
                        {repository.archived ? (
                          <Chip size="sm">Archived</Chip>
                        ) : null}
                        {!repository.hasReadme ? (
                          <Chip size="sm">No README</Chip>
                        ) : null}
                        {failure ? (
                          <Chip color="danger" size="sm" title={failure}>
                            Error
                          </Chip>
                        ) : null}
                        {!failure &&
                        repository.classificationStatus === "stale" ? (
                          <Chip color="warning" size="sm">
                            Stale
                          </Chip>
                        ) : null}
                        {!failure &&
                        repository.classificationStatus === "none" ? (
                          <Chip size="sm">Not classified</Chip>
                        ) : null}
                        {repository.inputTruncated ? (
                          <Chip
                            size="sm"
                            color="warning"
                            title="The classification used a README excerpt. The full README remains saved."
                          >
                            Input truncated
                          </Chip>
                        ) : null}
                      </div>
                      {repository.classificationStatus === "stale" ? (
                        <p className="text-xs text-muted">
                          Repository content or categories changed. Classify
                          again.
                        </p>
                      ) : null}
                      <p className="text-xs text-muted">
                        Saved{" "}
                        <time dateTime={repository.fetchedAt}>
                          {dateFormat.format(new Date(repository.fetchedAt))}
                        </time>
                      </p>
                      {repository.classifiedAt ? (
                        <p className="text-xs text-muted">
                          {repository.classificationStatus === "stale"
                            ? "Previous result"
                            : "Classified"}{" "}
                          <time dateTime={repository.classifiedAt}>
                            {dateFormat.format(
                              new Date(repository.classifiedAt),
                            )}
                          </time>
                        </p>
                      ) : null}
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
                      <Table.Cell
                        key={category.id}
                        className="w-32 min-w-32 max-w-32 sm:w-44 sm:min-w-44 sm:max-w-44"
                      >
                        {valid ? (
                          <ProgressBar
                            aria-label={`${repository.fullName}: ${category.name} probability`}
                            minValue={0}
                            maxValue={1}
                            value={probability}
                            size="sm"
                            formatOptions={probabilityFormat}
                          >
                            <ProgressBar.Output className="font-mono text-xs tabular-nums break-all" />
                            <ProgressBar.Track>
                              <ProgressBar.Fill />
                            </ProgressBar.Track>
                          </ProgressBar>
                        ) : (
                          <span
                            className="font-mono text-sm text-muted"
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
