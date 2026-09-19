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
          Define what each category means. Every classification uses all saved
          categories.
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
                : `${categories.length} saved`}
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
              <div className="space-y-3 py-6">
                <h3 className="font-semibold">No categories yet</h3>
                <p className="text-sm text-muted">
                  Paste your category definitions into the JSON editor, then
                  confirm the replacement to save them.
                </p>
                <p className="text-sm text-muted">
                  Add at least one category before starting a classification in
                  Workspace.
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
          <Card.Footer>
            <p className="text-sm text-muted">
              Categories are saved locally. There is no individual category
              selection: all categories apply to every classification.
            </p>
          </Card.Footer>
        </Card>

        <form
          className="min-w-0"
          onSubmit={replaceCategories}
          aria-labelledby="replace-categories-heading"
          aria-busy={saving}
        >
          <Card>
            <Card.Header>
              <Card.Title
                id="replace-categories-heading"
                render={(props) => <h2 {...props} />}
              >
                Replace from JSON
              </Card.Title>
              <Card.Description>
                This replaces the entire collection; it never merges categories.
                Replacement invalidates old classification previews and does not
                write to GitHub Star Lists.
              </Card.Description>
            </Card.Header>
            <Card.Content className="flex flex-col gap-6">
              <TextField
                name="categories-json"
                value={source}
                onChange={changeSource}
                isDisabled={saving}
                isInvalid={parsed.error !== null}
                validationBehavior="aria"
                fullWidth
              >
                <Label>Category definitions</Label>
                <TextArea
                  className="font-mono"
                  rows={12}
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

              <div className="space-y-2" aria-live="polite">
                <div className="flex flex-wrap items-center gap-4 text-sm">
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
                {!source.trim() ? (
                  <p className="text-sm text-muted">
                    Paste a JSON array to validate the replacement before
                    saving.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col items-start gap-3">
                <h3 className="text-sm font-semibold">JSON example</h3>
                <pre className="max-w-full whitespace-pre-wrap wrap-anywhere font-mono text-sm">
                  <code>{categoryExample}</code>
                </pre>
                <Button
                  type="button"
                  variant="secondary"
                  isDisabled={saving}
                  onPress={() => changeSource(categoryExample)}
                >
                  Paste example into editor
                </Button>
                <p className="text-sm text-muted">
                  Example only. Nothing is saved automatically.
                </p>
              </div>

              {parsed.categories !== null && categories !== null ? (
                <div className="flex flex-col gap-4">
                  <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>
                        {replacementCount === 0
                          ? "Clear all categories?"
                          : "Replace all categories?"}
                      </Alert.Title>
                      <Alert.Description>
                        {replacementCount === 0
                          ? `This removes all ${categories.length} saved categories. Classification cannot start until you add categories again.`
                          : `This replaces all ${categories.length} saved categories with ${replacementCount} from this JSON.`}{" "}
                        Old classification previews will no longer be current.
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                  <Checkbox
                    isSelected={confirmed}
                    onChange={setConfirmed}
                    isDisabled={saving || loading}
                  >
                    <Checkbox.Content>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Label>
                        {replacementCount === 0
                          ? "I confirm that I want to clear all saved categories."
                          : "I confirm that I want to replace the entire saved collection."}
                      </Label>
                    </Checkbox.Content>
                  </Checkbox>
                </div>
              ) : null}

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
            <Card.Footer className="flex-wrap gap-3">
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
              <p className="text-sm text-muted">
                {categories === null
                  ? "Load saved categories before replacing them."
                  : "Confirmation is required for every replacement."}
              </p>
            </Card.Footer>
          </Card>
        </form>
      </div>
    </div>
  );
}
