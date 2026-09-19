import {
  Alert,
  AlertDialog,
  Button,
  Card,
  Checkbox,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  TextArea,
  TextField,
} from "@heroui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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

type CategoryEditor = CategoryInput & { category: Category | null };

function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState<"replace" | "save" | "delete" | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editor, setEditor] = useState<CategoryEditor | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const saveRequest = useRef<AbortController | null>(null);
  const busy = saving !== null;
  const parsed = useMemo(() => parseCategories(source), [source]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    request<{ categories: Category[] }>("/categories", {
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) {
          setCategories(response.categories);
          setConfirmed(false);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => () => saveRequest.current?.abort(), []);

  function acceptCategories(next: Category[], message: string) {
    setCategories(next);
    setConfirmed(false);
    setSaveError(null);
    setSuccess(message);
  }

  function openEditor(category: Category | null) {
    if (busy || loading || categories === null) return;
    setEditor({
      category,
      name: category?.name ?? "",
      description: category?.description ?? "",
    });
    setManualError(null);
  }

  function categoryNameError(value: string): string | null {
    const name = value.trim();
    if (!name) return "Enter a category name.";
    if (
      categories?.some(
        (category) =>
          category.id !== editor?.category?.id &&
          category.name.toLowerCase() === name.toLowerCase(),
      )
    )
      return "A category with this name already exists.";
    return null;
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !editor ||
      categories === null ||
      loading ||
      busy ||
      saveRequest.current ||
      categoryNameError(editor.name) ||
      !editor.description.trim()
    )
      return;

    const input: CategoryInput = {
      name: editor.name.trim(),
      description: editor.description.trim(),
    };
    const original = editor.category;
    const unchanged =
      original?.name === input.name &&
      original.description === input.description;
    const controller = new AbortController();
    saveRequest.current = controller;
    setSaving("save");
    setManualError(null);
    setSuccess(null);
    try {
      const response = await request<{ categories: Category[] }>(
        original
          ? `/categories/${encodeURIComponent(original.id)}`
          : "/categories",
        {
          method: original ? "PUT" : "POST",
          body: JSON.stringify(input),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      acceptCategories(
        response.categories,
        unchanged
          ? "Category saved without changes."
          : `Category ${original ? "updated" : "created"}. Old classification previews are no longer current.`,
      );
      setEditor(null);
    } catch (error) {
      if (!controller.signal.aborted) setManualError(errorMessage(error));
    } finally {
      saveRequest.current = null;
      if (!controller.signal.aborted) setSaving(null);
    }
  }

  async function deleteCategory() {
    if (!deleting || busy || saveRequest.current) return;

    const controller = new AbortController();
    saveRequest.current = controller;
    setSaving("delete");
    setManualError(null);
    setSuccess(null);
    try {
      const response = await request<{ categories: Category[] }>(
        `/categories/${encodeURIComponent(deleting.id)}`,
        {
          method: "DELETE",
          body: JSON.stringify({}),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      acceptCategories(
        response.categories,
        "Category deleted. Old classification previews are no longer current.",
      );
      setDeleting(null);
    } catch (error) {
      if (!controller.signal.aborted) setManualError(errorMessage(error));
    } finally {
      saveRequest.current = null;
      if (!controller.signal.aborted) setSaving(null);
    }
  }

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
      busy ||
      saveRequest.current
    )
      return;

    const controller = new AbortController();
    saveRequest.current = controller;
    setSaving("replace");
    setSaveError(null);
    setSuccess(null);
    try {
      const response = await request<{ categories: Category[] }>(
        "/categories",
        {
          method: "PUT",
          body: JSON.stringify({ categories: parsed.categories }),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
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
      acceptCategories(
        response.categories,
        response.categories.length === 0
          ? "All categories cleared. Old classification previews are no longer current."
          : `Saved ${response.categories.length} ${response.categories.length === 1 ? "category" : "categories"}. Old classification previews are no longer current.`,
      );
    } catch (error) {
      if (!controller.signal.aborted) setSaveError(errorMessage(error));
    } finally {
      saveRequest.current = null;
      if (!controller.signal.aborted) {
        setConfirmed(false);
        setSaving(null);
      }
    }
  }

  const replacementCount = parsed.categories?.length;
  const canReplace =
    categories !== null &&
    !loading &&
    !busy &&
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
          aria-busy={loading || busy}
        >
          <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
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
            </div>
            <Button
              size="sm"
              isDisabled={busy || loading || categories === null}
              onPress={() => openEditor(null)}
            >
              New category
            </Button>
          </Card.Header>
          <Card.Content className="flex flex-col gap-4">
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
                  Create a category or import JSON to start classifying
                  repositories.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-5">
                {categories?.map((category) => (
                  <li
                    key={category.id}
                    className="flex flex-wrap items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 basis-48 space-y-1 wrap-anywhere">
                      <h3 className="font-semibold">{category.name}</h3>
                      <p className="text-sm text-muted">
                        {category.description}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Edit ${category.name}`}
                        isDisabled={busy}
                        onPress={() => openEditor(category)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={`Delete ${category.name}`}
                        isDisabled={busy}
                        onPress={() => {
                          setDeleting(category);
                          setManualError(null);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
        </Card>

        <Form
          className="min-w-0"
          onSubmit={replaceCategories}
          aria-labelledby="replace-categories-heading"
          aria-busy={busy}
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
                isDisabled={busy}
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
                isDisabled={busy}
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
            </Card.Content>
            <Card.Footer className="flex-col items-start gap-3">
              {parsed.categories !== null && categories !== null ? (
                <Checkbox
                  isSelected={confirmed}
                  onChange={setConfirmed}
                  isDisabled={busy || loading}
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
                isPending={saving === "replace"}
                isDisabled={!canReplace}
              >
                {saving === "replace"
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
        </Form>
      </div>

      <Modal.Backdrop
        isOpen={editor !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !busy) setEditor(null);
        }}
        isDismissable={false}
        isKeyboardDismissDisabled={busy}
      >
        <Modal.Container size="sm">
          <Modal.Dialog>
            {editor ? (
              <Form
                className="flex flex-col gap-4"
                aria-labelledby="category-editor-heading"
                aria-busy={saving === "save"}
                onSubmit={saveCategory}
              >
                <Modal.Header>
                  <Modal.Heading id="category-editor-heading">
                    {editor.category ? "Edit category" : "New category"}
                  </Modal.Heading>
                </Modal.Header>
                <Modal.Body className="flex flex-col gap-4">
                  <TextField
                    name="name"
                    value={editor.name}
                    onChange={(name) => {
                      setEditor((current) =>
                        current ? { ...current, name } : null,
                      );
                      setManualError(null);
                    }}
                    validate={categoryNameError}
                    isRequired
                    isDisabled={busy}
                    fullWidth
                  >
                    <Label>Name</Label>
                    <Input autoFocus autoComplete="off" />
                    <FieldError />
                  </TextField>
                  <TextField
                    name="description"
                    value={editor.description}
                    onChange={(description) => {
                      setEditor((current) =>
                        current ? { ...current, description } : null,
                      );
                      setManualError(null);
                    }}
                    validate={(value) =>
                      value.trim() ? null : "Enter a category description."
                    }
                    isRequired
                    isDisabled={busy}
                    fullWidth
                  >
                    <Label>Description</Label>
                    <TextArea rows={3} fullWidth />
                    <FieldError />
                  </TextField>
                  {manualError ? (
                    <Alert status="danger" role="alert">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>Could not save category</Alert.Title>
                        <Alert.Description>{manualError}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  ) : null}
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    type="button"
                    slot="close"
                    variant="tertiary"
                    isDisabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isPending={saving === "save"}
                    isDisabled={busy}
                  >
                    {saving === "save"
                      ? "Saving…"
                      : editor.category
                        ? "Save changes"
                        : "Create category"}
                  </Button>
                </Modal.Footer>
              </Form>
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <AlertDialog.Backdrop
        isOpen={deleting !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !busy) setDeleting(null);
        }}
        isKeyboardDismissDisabled={busy}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog aria-busy={saving === "delete"}>
            <AlertDialog.Header>
              <AlertDialog.Heading>Delete category?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-4 wrap-anywhere">
              <p>
                Delete <strong>{deleting?.name}</strong>? This cannot be undone
                and will invalidate existing classification previews.
              </p>
              {manualError ? (
                <Alert status="danger" role="alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Could not delete category</Alert.Title>
                    <Alert.Description>{manualError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                autoFocus
                slot="close"
                variant="tertiary"
                isDisabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                isPending={saving === "delete"}
                isDisabled={busy}
                onPress={() => void deleteCategory()}
              >
                {saving === "delete" ? "Deleting…" : "Delete category"}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
