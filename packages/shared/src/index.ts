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
