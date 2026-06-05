export type LegalSource = {
  id: string;
  title: string;
  short_title: string | null;
  document_type: string | null;
  number: string | null;
  date: string | null;
  status: string | null;
  description: string | null;
  source_url: string | null;
  local_file: string | null;
  used_for: string | null;
};

export type ProjectInfo = {
  name: string;
  version: string;
  purpose: string;
  warning: string;
  workflow: string[];
  aisMonitoringInstruction: string;
  legalSources: LegalSource[];
};

export type CheckRequest = {
  url: string;
};

export type CheckItemStatus = "found" | "partial" | "empty" | "missing" | "error";

export type CheckSectionStatus = "checked" | "error";

export type CheckSummary = {
  total: number;
  found: number;
  partial: number;
  missing: number;
  errors: number;
};

export type CheckResultItem = {
  key: string;
  title: string;
  itemprop?: string;
  ruleType?: "itemprop" | "itempropLink";
  status: CheckItemStatus;
  score: number;
  message: string;
  value?: string;
  legalSourceId?: string;
  legalSource?: CheckLegalReference;
  severity?: "error" | "warning" | "info";
};

export type CheckLegalReference = {
  id: string;
  title: string;
  shortTitle: string | null;
  point: string;
  localFile: string | null;
  localFileUrl: string | null;
  sourceUrl: string | null;
};

export type CheckReportSection = {
  id: string;
  title: string;
  url: string;
  status: CheckSectionStatus;
  score: number;
  summary: CheckSummary;
  items: CheckResultItem[];
  message?: string;
};

export type CheckReport = {
  siteUrl: string;
  checkedAt: string;
  overallScore: number;
  summary: CheckSummary;
  sections: CheckReportSection[];
};

export type RatingRunStatus = "idle" | "running" | "paused" | "completed" | "offline" | "error";

export type RatingSiteStatus = "pending" | "running" | "checked" | "error" | "no_internet";

export type RatingSettings = {
  concurrency: number;
  retries: number;
  pageTimeoutMs: number;
  resourceTimeoutMs: number;
  maxAddRefPages: number;
  checkResourceLinks: boolean;
};

export type SiteList = {
  id: string;
  title: string;
  sourceName: string;
  createdAt: string;
  total: number;
  isDefault: boolean;
};

export type SiteListCreateRequest = {
  title: string;
  content: string;
  sourceName?: string;
};

export type RatingAnalyticsItem = {
  key: string;
  title: string;
  count: number;
};

export type RatingAnalytics = {
  topMissingItems: RatingAnalyticsItem[];
  topErrorMessages: RatingAnalyticsItem[];
  scoreBuckets: Array<{
    label: string;
    count: number;
  }>;
};

export type RatingRun = {
  id: string;
  title: string;
  sourceName: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: RatingRunStatus;
  total: number;
  checked: number;
  failed: number;
  noInternet: number;
  pending: number;
  averageScore: number | null;
  etaSeconds: number | null;
  settings: RatingSettings;
  error: string | null;
  updatedAt: string;
};

export type RatingResult = {
  id: string;
  runId: string;
  position: number;
  siteUrl: string;
  normalizedUrl: string | null;
  status: RatingSiteStatus;
  score: number | null;
  checkedAt: string | null;
  durationMs: number | null;
  error: string | null;
  summary: CheckSummary | null;
};

export type RatingRunDetails = RatingRun & {
  results: RatingResult[];
  analytics: RatingAnalytics;
};

export type RatingStartRequest = {
  reset?: boolean;
  title?: string;
  siteListId?: string;
  settings?: Partial<RatingSettings>;
};

export type UpdateInfo = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  downloadUrl: string | null;
  checkedAt: string;
  error: string | null;
};
