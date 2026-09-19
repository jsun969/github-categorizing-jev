export interface CategoryInput {
  name: string;
  description: string;
}

export interface Category extends CategoryInput {
  id: string;
}

export interface SettingsStatus {
  githubConfigured: boolean;
  jevConfigured: boolean;
}

export interface GitHubProfile {
  id: string;
  login: string;
  totalStars: number;
  fetchedAt: string;
}

export interface Repository {
  id: string;
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  starredAt: string | null;
  readme: string | null;
  archived: boolean;
  defaultBranch: string;
  fetchedAt: string;
  contentHash: string;
}

export interface RepositoryRow
  extends Omit<Repository, "readme" | "contentHash"> {
  hasReadme: boolean;
  probabilities: Record<string, number> | null;
  classificationStatus: "none" | "current" | "stale";
  classifiedAt: string | null;
  inputTruncated: boolean;
}

export interface RepositoryPage {
  repositories: RepositoryRow[];
  total: number;
}

export type JobKind = "load" | "refresh" | "classification";

export interface Job {
  id: string;
  kind: JobKind;
  status: "running" | "completed" | "failed";
  total: number;
  completed: number;
  failed: number;
  message: string;
  errors: { repository: string; message: string }[];
  repositoryIds: string[];
  startedAt: string;
  finishedAt: string | null;
}

export interface WorkspaceData extends RepositoryPage {
  categories: Category[];
  settings: SettingsStatus;
  profile: GitHubProfile | null;
  activeJob: Job | null;
}

export interface LoadRequest {
  mode: "continue" | "latest" | "specific";
  count: number;
  repositories?: string[];
}

export interface ClassificationRequest {
  repositoryIds: string[];
  batchSize: number;
}
