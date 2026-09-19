import {
  Alert,
  Button,
  Card,
  Checkbox,
  Description,
  FieldError,
  Label,
  TextArea,
  TextField,
} from "@heroui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { errorMessage, request } from "../lib/api";
import type { Category, CategoryInput } from "../lib/contracts";

export const Route = createFileRoute("/categories")({
  component: CategoriesPage,
});

const categoryExample = `[
  {
    "name": "Developer tools",
    "description": "Tools for building, testing, and debugging software."
  },
  {
    "name": "Data systems",
    "description": "Databases, storage engines, and data processing systems."
  }
]`;

type ParsedCategories =
  | { categories: CategoryInput[]; error: null }
  | { categories: null; error: string | null };

function parseCategories(source: string): ParsedCategories {
  if (!source.trim()) return { categories: null, error: null };

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return {
      categories: null,
      error: "Enter valid JSON. Use double quotes and remove trailing commas.",
    };
  }

  if (!Array.isArray(value)) {
    return {
      categories: null,
      error: "The JSON must be an array of category objects.",
    };
  }

  const categories: CategoryInput[] = [];
  const names = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item: unknown = value[index];
    const position = index + 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return {
        categories: null,
        error: `Category ${position} must be an object with a name and description.`,
      };
    }
    if (
      !("name" in item) ||
      typeof item.name !== "string" ||
      !item.name.trim()
    ) {
      return {
        categories: null,
        error: `Category ${position} needs a nonempty name string.`,
      };
    }
    if (
      !("description" in item) ||
      typeof item.description !== "string" ||
      !item.description.trim()
    ) {
      return {
        categories: null,
        error: `Category ${position} needs a nonempty description string.`,
      };
    }

    const name = item.name.trim();
    const key = name.toLowerCase();
    if (names.has(key)) {
      return {
        categories: null,
        error: `Category ${position} has a duplicate name. Names must be unique, ignoring letter case and surrounding spaces.`,
      };
    }
    names.add(key);
    categories.push({ name, description: item.description.trim() });
  }

  return { categories, error: null };
}

function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const parsed = useMemo(() => parseCategories(source), [source]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    request<{ categories: Category[] }>("/categories", {
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) setCategories(response.categories);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [loadAttempt]);

  function changeSource(value: string) {
    setSource(value);
    setConfirmed(false);
    setSaveError(null);
    setSuccess(null);
  }

  async function replaceCategories(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !confirmed ||
      !parsed.categories ||
      categories === null ||
      loading ||
      saving
    )
      return;

    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      const response = await request<{ categories: Category[] }>(
        "/categories",
        {
          method: "PUT",
          body: JSON.stringify({ categories: parsed.categories }),
        },
      );
      setCategories(response.categories);
      setSource(
        JSON.stringify(
          response.categories.map(({ name, description }) => ({
            name,
            description,
          })),
          null,
          2,
        ),
      );
      setSuccess(
        response.categories.length === 0
          ? "All categories cleared. Old classification previews are no longer current."
          : `Saved ${response.categories.length} ${response.categories.length === 1 ? "category" : "categories"}. Old classification previews are no longer current.`,
      );
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setConfirmed(false);
      setSaving(false);
    }
  }

  const replacementCount = parsed.categories?.length;
  const canReplace =
    categories !== null &&
    !loading &&
    !saving &&
    parsed.categories !== null &&
    confirmed;

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm text-muted">
          All saved categories apply to every classification.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card
          className="min-w-0"
          role="region"
          aria-labelledby="saved-categories-heading"
          aria-busy={loading}
        >
          <Card.Header>
            <Card.Title
              id="saved-categories-heading"
              render={(props) => <h2 {...props} />}
            >
              Saved categories
            </Card.Title>
            <Card.Description>
              {categories === null
                ? "Not loaded"
                : `${categories.length} saved locally`}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            {loading ? (
              <p className="text-sm text-muted" role="status">
                Loading saved categories…
              </p>
            ) : loadError ? (
              <div className="flex flex-col items-start gap-4">
                <Alert status="danger" role="alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Could not load categories</Alert.Title>
                    <Alert.Description>{loadError}</Alert.Description>
                  </Alert.Content>
                </Alert>
                <Button
                  variant="secondary"
                  onPress={() => setLoadAttempt((attempt) => attempt + 1)}
                >
                  Retry loading
                </Button>
              </div>
            ) : categories?.length === 0 ? (
              <div className="space-y-2">
                <h3 className="font-semibold">No categories yet</h3>
                <p className="text-sm text-muted">
                  Add categories with the JSON editor to start classifying
                  repositories.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-5">
                {categories?.map((category) => (
                  <li key={category.id} className="space-y-1 wrap-anywhere">
                    <h3 className="font-semibold">{category.name}</h3>
                    <p className="text-sm text-muted">{category.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card.Content>
        </Card>

        <form
          className="min-w-0"
          onSubmit={replaceCategories}
          aria-labelledby="replace-categories-heading"
          aria-busy={saving}
        >
          <Card>
            <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <Card.Title
                  id="replace-categories-heading"
                  render={(props) => <h2 {...props} />}
                >
                  Replace from JSON
                </Card.Title>
                <Card.Description>
                  Replaces all categories and invalidates existing previews.
                </Card.Description>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isDisabled={saving}
                onPress={() => changeSource(categoryExample)}
              >
                Insert example
              </Button>
            </Card.Header>
            <Card.Content className="flex flex-col gap-4">
              <TextField
                name="categories-json"
                value={source}
                onChange={changeSource}
                isDisabled={saving}
                isInvalid={parsed.error !== null}
                validationBehavior="aria"
                fullWidth
              >
                <Label>Category definitions (JSON)</Label>
                <TextArea
                  className="font-mono"
                  rows={10}
                  fullWidth
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="Paste a JSON array here"
                />
                <Description>
                  Each object needs a nonempty <code>name</code> and{" "}
                  <code>description</code>. Names must be unique regardless of
                  letter case. Use <code>[]</code> to clear all categories.
                </Description>
                <FieldError>{parsed.error}</FieldError>
              </TextField>

              <div
                className="flex flex-wrap items-center gap-4 text-sm"
                aria-live="polite"
              >
                <span>
                  Existing:{" "}
                  <strong>
                    {categories === null ? "Not loaded" : categories.length}
                  </strong>
                </span>
                <span>
                  Parsed: <strong>{replacementCount ?? "—"}</strong>
                </span>
                {parsed.categories !== null ? <span>Valid JSON</span> : null}
              </div>

              {saveError ? (
                <Alert status="danger" role="alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Replacement failed</Alert.Title>
                    <Alert.Description>
                      {saveError} Your saved category list has not been updated
                      on this page.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              {success ? (
                <Alert status="success" role="status">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Categories saved</Alert.Title>
                    <Alert.Description>{success}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
            </Card.Content>
            <Card.Footer className="flex-col items-start gap-3">
              {parsed.categories !== null && categories !== null ? (
                <Checkbox
                  isSelected={confirmed}
                  onChange={setConfirmed}
                  isDisabled={saving || loading}
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    {replacementCount === 0
                      ? `I confirm clearing all ${categories.length} saved categories.`
                      : `I confirm replacing all ${categories.length} saved categories with ${replacementCount} from this JSON.`}
                  </Checkbox.Content>
                  {replacementCount === 0 ? (
                    <Description>
                      Classification cannot start until you add categories
                      again.
                    </Description>
                  ) : null}
                </Checkbox>
              ) : null}
              <Button
                type="submit"
                variant="danger"
                isPending={saving}
                isDisabled={!canReplace}
              >
                {saving
                  ? "Replacing categories…"
                  : replacementCount === 0
                    ? "Clear all categories"
                    : "Replace all categories"}
              </Button>
              {categories === null ? (
                <p className="text-sm text-muted">
                  Load saved categories before replacing them.
                </p>
              ) : null}
            </Card.Footer>
          </Card>
        </form>
      </div>
    </div>
  );
}
