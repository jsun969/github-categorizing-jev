import {
  Alert,
  Button,
  Card,
  Chip,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppLink } from "../components/app-link";
import { errorMessage, request } from "../lib/api";
import type { SettingsStatus } from "../lib/contracts";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function tokenError(value: string): string | null {
  const token = value.trim();
  if (token.length > 8192) return "A token must be 8,192 characters or fewer.";
  if (/\s/.test(token)) return "A token must not contain whitespace.";
  return null;
}

function SettingsPage() {
  const [settings, setSettings] = useState<SettingsStatus | null>(null);
  const [jevToken, setJevToken] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const saveRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);

    async function loadSettings() {
      try {
        const response = await request<SettingsStatus>("/settings", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!controller.signal.aborted) setSettings(response);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadSettings();
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => () => saveRequest.current?.abort(), []);

  const jevError = tokenError(jevToken);
  const githubError = tokenError(githubToken);
  const hasReplacement = Boolean(jevToken.trim() || githubToken.trim());
  const canSave =
    settings !== null &&
    !isLoading &&
    !isSaving &&
    hasReplacement &&
    !jevError &&
    !githubError;
  const bothConfigured = settings?.githubConfigured && settings.jevConfigured;

  function statusLabel(configured: boolean | undefined) {
    if (isLoading) return "Checking…";
    if (configured === undefined) return "Unavailable";
    return configured ? "Configured" : "Not configured";
  }

  async function saveSettings() {
    if (!canSave || saveRequest.current) return;

    const replacement: { jevToken?: string; githubToken?: string } = {};
    if (jevToken.trim()) replacement.jevToken = jevToken.trim();
    if (githubToken.trim()) replacement.githubToken = githubToken.trim();

    const controller = new AbortController();
    saveRequest.current = controller;
    setIsSaving(true);
    setSaveError(null);
    setSaved(false);

    try {
      const response = await request<SettingsStatus>("/settings", {
        method: "PUT",
        body: JSON.stringify(replacement),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setSettings(response);
      setJevToken("");
      setGithubToken("");
      setSaved(true);
    } catch (error) {
      if (!controller.signal.aborted) setSaveError(errorMessage(error));
    } finally {
      saveRequest.current = null;
      if (!controller.signal.aborted) setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">
          Configure the services used to load and classify your GitHub stars.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Form
          className="min-w-0 lg:col-span-2"
          aria-labelledby="token-settings-heading"
          aria-busy={isLoading || isSaving}
          autoComplete="off"
          validationBehavior="aria"
          onSubmit={(event) => {
            event.preventDefault();
            void saveSettings();
          }}
        >
          <Card>
            <Card.Header>
              <Card.Title id="token-settings-heading" aria-level={2}>
                API tokens
              </Card.Title>
              <Card.Description id="token-storage-hint">
                Tokens are stored server-side for local use and are never
                returned to this page. Leave a field blank to keep its saved
                token unchanged.
              </Card.Description>
            </Card.Header>

            <Card.Content className="flex flex-col gap-6">
              {loadError ? (
                <Alert status="danger" role="alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Could not load saved token status</Alert.Title>
                    <Alert.Description>{loadError}</Alert.Description>
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3"
                      onPress={() => setLoadAttempt((attempt) => attempt + 1)}
                    >
                      Retry loading settings
                    </Button>
                  </Alert.Content>
                </Alert>
              ) : null}

              <TextField
                fullWidth
                name="jevToken"
                type="password"
                autoComplete="off"
                value={jevToken}
                isDisabled={isSaving}
                isInvalid={Boolean(jevError)}
                aria-describedby="jev-token-status token-storage-hint"
                onChange={(value) => {
                  setJevToken(value);
                  setSaved(false);
                  setSaveError(null);
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Jev API token</Label>
                  <Chip
                    id="jev-token-status"
                    size="sm"
                    color={settings?.jevConfigured ? "success" : "default"}
                    role="status"
                  >
                    {statusLabel(settings?.jevConfigured)}
                  </Chip>
                </div>
                <Input autoCapitalize="none" spellCheck={false} />
                <Description>
                  Used to classify repositories against your categories.
                </Description>
                {jevError ? <FieldError>{jevError}</FieldError> : null}
              </TextField>

              <TextField
                fullWidth
                name="githubToken"
                type="password"
                autoComplete="off"
                value={githubToken}
                isDisabled={isSaving}
                isInvalid={Boolean(githubError)}
                aria-describedby="github-token-status token-storage-hint"
                onChange={(value) => {
                  setGithubToken(value);
                  setSaved(false);
                  setSaveError(null);
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>GitHub token</Label>
                  <Chip
                    id="github-token-status"
                    size="sm"
                    color={settings?.githubConfigured ? "success" : "default"}
                    role="status"
                  >
                    {statusLabel(settings?.githubConfigured)}
                  </Chip>
                </div>
                <Input autoCapitalize="none" spellCheck={false} />
                <Description>
                  Used to read your starred repositories, metadata, and READMEs.
                  This app does not write to GitHub.
                </Description>
                {githubError ? <FieldError>{githubError}</FieldError> : null}
              </TextField>

              {saveError ? (
                <Alert status="danger" role="alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Settings were not saved</Alert.Title>
                    <Alert.Description>
                      {saveError} Your entered tokens have been kept so you can
                      edit them or try again.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              {saved ? (
                <Alert status="success" role="status">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Settings saved</Alert.Title>
                    <Alert.Description>
                      Entered tokens have been cleared from the form; any token
                      left blank was kept unchanged.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
            </Card.Content>

            <Card.Footer className="flex flex-wrap items-center gap-3">
              <Button type="submit" isPending={isSaving} isDisabled={!canSave}>
                {isSaving ? "Saving settings…" : "Save settings"}
              </Button>
              <span className="text-sm text-muted" role="status">
                {isLoading
                  ? "Loading saved token status…"
                  : !hasReplacement
                    ? "Enter at least one token to save."
                    : null}
              </span>
            </Card.Footer>
          </Card>
        </Form>

        <aside
          className="flex min-w-0 flex-col gap-6"
          aria-label="About your tokens"
        >
          <Card aria-labelledby="local-settings-heading">
            <Card.Header>
              <Card.Title id="local-settings-heading" aria-level={2}>
                Local credentials
              </Card.Title>
            </Card.Header>
            <Card.Content className="space-y-3 text-sm text-muted">
              <p>
                Configured means a token is saved, not that its API access has
                been validated. Credentials are checked when you load stars or
                run a classification.
              </p>
              <p>
                Save either token on its own or replace both at once. Tokens
                stay on the local server, not in browser storage.
              </p>
            </Card.Content>
          </Card>
          <Card aria-labelledby="next-step-heading">
            <Card.Header>
              <Card.Title id="next-step-heading" aria-level={2}>
                Continue in Workspace
              </Card.Title>
              <Card.Description>
                {bothConfigured
                  ? "Both tokens are configured. Load your stars, then select repositories to classify. Saving settings does not start either action."
                  : "Configure GitHub to load your stars and Jev to classify them. You can still browse previously saved repositories in Workspace."}
              </Card.Description>
            </Card.Header>
            <Card.Footer>
              <AppLink to="/">Open Workspace</AppLink>
            </Card.Footer>
          </Card>
        </aside>
      </div>
    </div>
  );
}
