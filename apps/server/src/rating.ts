import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findWorkspaceRoot, openDatabase } from "@sveden-checker/database";
import type {
  CheckReport,
  CheckSummary,
  RatingAnalytics,
  RatingResult,
  RatingRun,
  RatingRunDetails,
  RatingSettings,
  RatingStartRequest,
  SiteList,
  SiteListCreateRequest
} from "@sveden-checker/shared";
import { checkSvedenSite } from "./checker.js";

type RatingRunRow = {
  id: string;
  title: string;
  source_name: string;
  site_list_id: string | null;
  settings_json: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  status: RatingRun["status"];
  error: string | null;
  updated_at: string;
};

type RatingResultRow = {
  id: string;
  run_id: string;
  position: number;
  site_url: string;
  normalized_url: string | null;
  status: RatingResult["status"];
  score: number | null;
  checked_at: string | null;
  duration_ms: number | null;
  error: string | null;
  summary_json: string | null;
  report_json: string | null;
};

type SiteListRow = {
  id: string;
  title: string;
  source_name: string;
  created_at: string;
  total: number;
  is_default: number;
};

type RatingStatsRow = {
  total: number;
  checked: number;
  failed: number;
  no_internet: number;
  pending: number;
  average_score: number | null;
  average_duration_ms: number | null;
};

const siteListName = "obr-sites.txt";
const defaultRatingSettings: RatingSettings = {
  concurrency: 3,
  retries: 1,
  pageTimeoutMs: 7000,
  resourceTimeoutMs: 4000,
  maxAddRefPages: 3,
  checkResourceLinks: false
};

let activeRunId: string | null = null;
let shouldPause = false;
let activeControllers: AbortController[] = [];

export function initializeRatingManager(): void {
  const db = openDatabase();
  const now = new Date().toISOString();

  db.prepare("UPDATE rating_results SET status = 'pending' WHERE status = 'running'").run();
  db.prepare("UPDATE rating_runs SET status = 'paused', updated_at = ? WHERE status = 'running'").run(now);
  ensureDefaultSiteList();
}

export function getSiteLists(): SiteList[] {
  return (openDatabase()
    .prepare("SELECT * FROM site_lists ORDER BY is_default DESC, created_at DESC")
    .all() as SiteListRow[]).map(mapSiteList);
}

export function createSiteList(request: SiteListCreateRequest): SiteList {
  const urls = normalizeSiteListContent(request.content);

  if (urls.length === 0) {
    throw new Error("В списке нет сайтов");
  }

  return insertSiteList({
    title: request.title?.trim() || "Пользовательский список сайтов",
    sourceName: request.sourceName?.trim() || "manual-import.txt",
    urls,
    isDefault: false
  });
}

export function getLatestRatingRun(): RatingRunDetails | null {
  const row = openDatabase().prepare("SELECT * FROM rating_runs ORDER BY created_at DESC LIMIT 1").get() as RatingRunRow | undefined;
  return row ? getRatingRunDetails(row.id) : null;
}

export function getRatingRunDetails(runId: string): RatingRunDetails | null {
  const row = openDatabase().prepare("SELECT * FROM rating_runs WHERE id = ?").get(runId) as RatingRunRow | undefined;

  if (!row) {
    return null;
  }

  return {
    ...mapRun(row),
    results: getRatingResults(runId),
    analytics: getRatingAnalytics(runId)
  };
}

export function getRatingResultReport(resultId: string): CheckReport | null {
  const row = openDatabase()
    .prepare("SELECT report_json FROM rating_results WHERE id = ?")
    .get(resultId) as { report_json: string | null } | undefined;

  return row?.report_json ? (JSON.parse(row.report_json) as CheckReport) : null;
}

export function getRatingResults(runId: string): RatingResult[] {
  const rows = openDatabase()
    .prepare(
      `SELECT *
       FROM rating_results
       WHERE run_id = ?
       ORDER BY
         CASE WHEN score IS NULL THEN 1 ELSE 0 END,
         score DESC,
         status ASC,
         position ASC`
    )
    .all(runId) as RatingResultRow[];

  return rows.map(mapResult);
}

export function startRatingRun(request: RatingStartRequest = {}): RatingRunDetails {
  const runId = request.reset ? createRatingRun(request).id : (getLatestRatingRun()?.id ?? createRatingRun(request).id);
  const details = getRatingRunDetails(runId);

  if (!details) {
    throw new Error("Не удалось создать или найти рейтинг");
  }

  if (details.status === "completed") {
    return details;
  }

  shouldPause = false;

  if (!activeRunId) {
    activeRunId = runId;
    void processRatingRun(runId).finally(() => {
      activeRunId = null;
      activeControllers = [];
    });
  }

  return getRatingRunDetails(runId) ?? details;
}

export function pauseRatingRun(): RatingRunDetails | null {
  shouldPause = true;
  for (const controller of activeControllers) {
    controller.abort();
  }

  const latest = getLatestRatingRun();

  if (latest && latest.status === "running") {
    markRunPaused(latest.id);
  }

  return latest ? getRatingRunDetails(latest.id) : null;
}

function createRatingRun(request: RatingStartRequest): RatingRun {
  const db = openDatabase();
  const siteList = resolveSiteList(request.siteListId);
  const urls = getSiteListUrls(siteList.id);
  const now = new Date().toISOString();
  const id = randomUUID();
  const settings = normalizeRatingSettings(request.settings);
  const runTitle = request.title?.trim() || `Рейтинг сайтов от ${new Date(now).toLocaleString("ru-RU")}`;

  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO rating_runs (
         id, title, source_name, site_list_id, settings_json, created_at, started_at, finished_at, status, error, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'idle', NULL, ?)`
    ).run(id, runTitle, siteList.sourceName, siteList.id, JSON.stringify(settings), now, now);

    const insertResult = db.prepare(
      `INSERT INTO rating_results (
         id, run_id, position, site_url, normalized_url, status, score, checked_at, duration_ms, error, summary_json, report_json
       ) VALUES (?, ?, ?, ?, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, NULL)`
    );

    urls.forEach((url, index) => {
      insertResult.run(randomUUID(), id, index + 1, url);
    });
  });

  transaction();
  return mapRun(db.prepare("SELECT * FROM rating_runs WHERE id = ?").get(id) as RatingRunRow);
}

async function processRatingRun(runId: string): Promise<void> {
  const db = openDatabase();
  const row = db.prepare("SELECT * FROM rating_runs WHERE id = ?").get(runId) as RatingRunRow;
  const settings = parseSettings(row.settings_json);
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE rating_runs
     SET status = 'running',
         started_at = COALESCE(started_at, ?),
         finished_at = NULL,
         error = NULL,
         updated_at = ?
     WHERE id = ?`
  ).run(now, now, runId);

  if (!(await hasInternetConnection())) {
    markFirstPendingNoInternet(runId, "Нет подключения к интернету. Сайт не засчитан как проверенный.");
    markRunOffline(runId, "Нет подключения к интернету. Проверка не начата, сайты не засчитаны как проверенные.");
    return;
  }

  const workers = Array.from({ length: settings.concurrency }, () => workerLoop(runId, settings));
  await Promise.all(workers);

  if (shouldPause) {
    markRunPaused(runId);
    return;
  }

  const pending = getRatingStats(runId).pending;
  if (pending === 0) {
    markRunCompleted(runId);
  }
}

async function workerLoop(runId: string, settings: RatingSettings): Promise<void> {
  const db = openDatabase();

  for (;;) {
    if (shouldPause) {
      return;
    }

    const next = claimNextResult(runId);
    if (!next) {
      return;
    }

    const siteStartedAt = Date.now();
    const controller = new AbortController();
    activeControllers.push(controller);

    try {
      const report = await runSiteWithRetries(next.site_url, settings, controller.signal);

      if (reportLooksLikeNoInternet(report) && !(await hasInternetConnection())) {
        saveNoInternetResult(next.id, "Нет подключения к интернету. Сайт не засчитан как проверенный.", Date.now() - siteStartedAt);
        shouldPause = true;
        for (const item of activeControllers) {
          item.abort();
        }
        markRunOffline(runId, "Проверка остановлена: нет подключения к интернету.");
        return;
      }

      saveSuccessfulResult(next.id, report, Date.now() - siteStartedAt);
    } catch (error) {
      if (shouldPause || controller.signal.aborted) {
        resetResultToPending(next.id);
        return;
      }

      if (!(await hasInternetConnection())) {
        saveNoInternetResult(next.id, "Нет подключения к интернету. Сайт не засчитан как проверенный.", Date.now() - siteStartedAt);
        shouldPause = true;
        markRunOffline(runId, "Проверка остановлена: нет подключения к интернету.");
        return;
      }

      saveFailedResult(next.id, error, Date.now() - siteStartedAt);
    } finally {
      activeControllers = activeControllers.filter((item) => item !== controller);
      db.prepare("UPDATE rating_runs SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), runId);
    }
  }
}

function claimNextResult(runId: string): RatingResultRow | null {
  const db = openDatabase();
  const transaction = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT *
         FROM rating_results
         WHERE run_id = ? AND status IN ('pending', 'no_internet')
         ORDER BY position ASC
         LIMIT 1`
      )
      .get(runId) as RatingResultRow | undefined;

    if (!row) {
      return null;
    }

    db.prepare("UPDATE rating_results SET status = 'running', error = NULL WHERE id = ?").run(row.id);
    return row;
  });

  return transaction();
}

async function runSiteWithRetries(url: string, settings: RatingSettings, signal: AbortSignal): Promise<CheckReport> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= settings.retries; attempt++) {
    try {
      return await checkSvedenSite(url, {
        pageTimeoutMs: settings.pageTimeoutMs,
        resourceTimeoutMs: settings.resourceTimeoutMs,
        maxAddRefPages: settings.maxAddRefPages,
        checkResourceLinks: settings.checkResourceLinks,
        signal
      });
    } catch (error) {
      lastError = error;

      if (signal.aborted) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Не удалось проверить сайт");
}

function saveSuccessfulResult(resultId: string, report: CheckReport, durationMs: number): void {
  openDatabase()
    .prepare(
      `UPDATE rating_results
       SET status = 'checked',
           normalized_url = ?,
           score = ?,
           checked_at = ?,
           duration_ms = ?,
           error = NULL,
           summary_json = ?,
           report_json = ?
       WHERE id = ?`
    )
    .run(
      report.siteUrl,
      report.overallScore,
      report.checkedAt,
      durationMs,
      JSON.stringify(report.summary),
      JSON.stringify(report),
      resultId
    );
}

function saveFailedResult(resultId: string, error: unknown, durationMs: number): void {
  openDatabase()
    .prepare(
      `UPDATE rating_results
       SET status = 'error',
           checked_at = ?,
           duration_ms = ?,
           error = ?
       WHERE id = ?`
    )
    .run(new Date().toISOString(), durationMs, error instanceof Error ? error.message : "Не удалось проверить сайт", resultId);
}

function saveNoInternetResult(resultId: string, message: string, durationMs: number): void {
  openDatabase()
    .prepare(
      `UPDATE rating_results
       SET status = 'no_internet',
           checked_at = ?,
           duration_ms = ?,
           score = NULL,
           error = ?
       WHERE id = ?`
    )
    .run(new Date().toISOString(), durationMs, message, resultId);
}

function markFirstPendingNoInternet(runId: string, message: string): void {
  const db = openDatabase();
  const row = db
    .prepare(
      `SELECT id
       FROM rating_results
       WHERE run_id = ? AND status IN ('pending', 'no_internet')
       ORDER BY position ASC
       LIMIT 1`
    )
    .get(runId) as { id: string } | undefined;

  if (row) {
    saveNoInternetResult(row.id, message, 0);
  }
}

function resetResultToPending(resultId: string): void {
  openDatabase().prepare("UPDATE rating_results SET status = 'pending' WHERE id = ?").run(resultId);
}

function markRunPaused(runId: string): void {
  const now = new Date().toISOString();
  const db = openDatabase();
  db.prepare("UPDATE rating_results SET status = 'pending' WHERE run_id = ? AND status = 'running'").run(runId);
  db.prepare("UPDATE rating_runs SET status = 'paused', updated_at = ? WHERE id = ?").run(now, runId);
}

function markRunOffline(runId: string, message: string): void {
  const now = new Date().toISOString();
  const db = openDatabase();
  db.prepare("UPDATE rating_results SET status = 'pending' WHERE run_id = ? AND status = 'running'").run(runId);
  db.prepare("UPDATE rating_runs SET status = 'offline', error = ?, updated_at = ? WHERE id = ?").run(message, now, runId);
}

function markRunCompleted(runId: string): void {
  const now = new Date().toISOString();
  openDatabase()
    .prepare("UPDATE rating_runs SET status = 'completed', finished_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, runId);
}

function mapRun(row: RatingRunRow): RatingRun {
  const stats = getRatingStats(row.id);
  const settings = parseSettings(row.settings_json);

  return {
    id: row.id,
    title: row.title,
    sourceName: row.source_name,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: activeRunId === row.id ? "running" : row.status,
    total: stats.total,
    checked: stats.checked,
    failed: stats.failed,
    noInternet: stats.no_internet,
    pending: stats.pending,
    averageScore: stats.average_score === null ? null : Math.round(stats.average_score),
    etaSeconds: calculateEtaSeconds(stats, settings),
    settings,
    error: row.error,
    updatedAt: row.updated_at
  };
}

function mapResult(row: RatingResultRow): RatingResult {
  return {
    id: row.id,
    runId: row.run_id,
    position: row.position,
    siteUrl: row.site_url,
    normalizedUrl: row.normalized_url,
    status: row.status,
    score: row.score,
    checkedAt: row.checked_at,
    durationMs: row.duration_ms,
    error: row.error,
    summary: row.summary_json ? (JSON.parse(row.summary_json) as CheckSummary) : null
  };
}

function mapSiteList(row: SiteListRow): SiteList {
  return {
    id: row.id,
    title: row.title,
    sourceName: row.source_name,
    createdAt: row.created_at,
    total: row.total,
    isDefault: row.is_default === 1
  };
}

function getRatingStats(runId: string): RatingStatsRow {
  return openDatabase()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'checked' THEN 1 ELSE 0 END) AS checked,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'no_internet' THEN 1 ELSE 0 END) AS no_internet,
         SUM(CASE WHEN status IN ('pending', 'running', 'no_internet') THEN 1 ELSE 0 END) AS pending,
         AVG(CASE WHEN status = 'checked' THEN score ELSE NULL END) AS average_score,
         AVG(CASE WHEN status IN ('checked', 'error') THEN duration_ms ELSE NULL END) AS average_duration_ms
       FROM rating_results
       WHERE run_id = ?`
    )
    .get(runId) as RatingStatsRow;
}

function getRatingAnalytics(runId: string): RatingAnalytics {
  const rows = openDatabase()
    .prepare("SELECT score, error, report_json FROM rating_results WHERE run_id = ? AND status IN ('checked', 'error', 'no_internet')")
    .all(runId) as Array<{ score: number | null; error: string | null; report_json: string | null }>;
  const missing = new Map<string, { title: string; count: number }>();
  const errors = new Map<string, number>();
  const buckets = [
    { label: "90-100", count: 0 },
    { label: "70-89", count: 0 },
    { label: "50-69", count: 0 },
    { label: "0-49", count: 0 },
    { label: "без оценки", count: 0 }
  ];

  for (const row of rows) {
    addScoreBucket(buckets, row.score);

    if (row.error) {
      errors.set(row.error, (errors.get(row.error) ?? 0) + 1);
    }

    if (!row.report_json) {
      continue;
    }

    const report = JSON.parse(row.report_json) as CheckReport;
    for (const item of report.sections.flatMap((section) => section.items)) {
      if (item.status === "missing" || item.status === "empty" || item.status === "error") {
        const key = item.itemprop ?? item.key;
        const current = missing.get(key) ?? { title: item.title, count: 0 };
        current.count += 1;
        missing.set(key, current);
      }
    }
  }

  return {
    topMissingItems: [...missing.entries()]
      .map(([key, item]) => ({ key, title: item.title, count: item.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    topErrorMessages: [...errors.entries()]
      .map(([key, count]) => ({ key, title: key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    scoreBuckets: buckets
  };
}

function addScoreBucket(buckets: RatingAnalytics["scoreBuckets"], score: number | null): void {
  if (score === null) buckets[4].count += 1;
  else if (score >= 90) buckets[0].count += 1;
  else if (score >= 70) buckets[1].count += 1;
  else if (score >= 50) buckets[2].count += 1;
  else buckets[3].count += 1;
}

function calculateEtaSeconds(stats: RatingStatsRow, settings: RatingSettings): number | null {
  if (!stats.average_duration_ms || stats.pending <= 0) {
    return null;
  }

  return Math.round((stats.pending * stats.average_duration_ms) / Math.max(1, settings.concurrency) / 1000);
}

function parseSettings(value: string | null): RatingSettings {
  if (!value) {
    return defaultRatingSettings;
  }

  try {
    return normalizeRatingSettings(JSON.parse(value) as Partial<RatingSettings>);
  } catch {
    return defaultRatingSettings;
  }
}

function normalizeRatingSettings(settings: Partial<RatingSettings> = {}): RatingSettings {
  return {
    concurrency: clampNumber(settings.concurrency, 1, 8, defaultRatingSettings.concurrency),
    retries: clampNumber(settings.retries, 0, 3, defaultRatingSettings.retries),
    pageTimeoutMs: clampNumber(settings.pageTimeoutMs, 3000, 20000, defaultRatingSettings.pageTimeoutMs),
    resourceTimeoutMs: clampNumber(settings.resourceTimeoutMs, 2000, 15000, defaultRatingSettings.resourceTimeoutMs),
    maxAddRefPages: clampNumber(settings.maxAddRefPages, 0, 10, defaultRatingSettings.maxAddRefPages),
    checkResourceLinks: settings.checkResourceLinks ?? defaultRatingSettings.checkResourceLinks
  };
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Number(value) : fallback));
}

function ensureDefaultSiteList(): SiteList {
  const existing = openDatabase().prepare("SELECT * FROM site_lists WHERE is_default = 1 LIMIT 1").get() as SiteListRow | undefined;
  if (existing) {
    return mapSiteList(existing);
  }

  return insertSiteList({
    title: "Список образовательных сайтов",
    sourceName: siteListName,
    urls: readDefaultSiteList(),
    isDefault: true
  });
}

function resolveSiteList(siteListId: string | undefined): SiteList {
  if (siteListId) {
    const row = openDatabase().prepare("SELECT * FROM site_lists WHERE id = ?").get(siteListId) as SiteListRow | undefined;
    if (row) {
      return mapSiteList(row);
    }
  }

  return getSiteLists()[0] ?? ensureDefaultSiteList();
}

function insertSiteList(input: { title: string; sourceName: string; urls: string[]; isDefault: boolean }): SiteList {
  const db = openDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const urls = [...new Set(input.urls)];

  const transaction = db.transaction(() => {
    db.prepare(
      "INSERT INTO site_lists (id, title, source_name, created_at, total, is_default) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, input.title, input.sourceName, now, urls.length, input.isDefault ? 1 : 0);

    const insertItem = db.prepare("INSERT INTO site_list_items (id, list_id, position, site_url) VALUES (?, ?, ?, ?)");
    urls.forEach((url, index) => insertItem.run(randomUUID(), id, index + 1, url));
  });

  transaction();
  return mapSiteList(db.prepare("SELECT * FROM site_lists WHERE id = ?").get(id) as SiteListRow);
}

function getSiteListUrls(siteListId: string): string[] {
  return (openDatabase()
    .prepare("SELECT site_url FROM site_list_items WHERE list_id = ? ORDER BY position ASC")
    .all(siteListId) as Array<{ site_url: string }>).map((row) => row.site_url);
}

function readDefaultSiteList(): string[] {
  const configuredPath = process.env.SVEDEN_CHECKER_SITE_LIST;
  const defaultPath = join(findWorkspaceRoot(), "site-lists", siteListName);
  const filePath = configuredPath || defaultPath;

  if (!existsSync(filePath)) {
    throw new Error(`Список сайтов не найден: ${filePath}`);
  }

  return normalizeSiteListContent(readFileSync(filePath, "utf8"));
}

function normalizeSiteListContent(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function hasInternetConnection(): Promise<boolean> {
  if (process.env.SVEDEN_CHECKER_FORCE_OFFLINE === "1") {
    return false;
  }

  const checks = ["https://www.google.com/generate_204", "https://www.cloudflare.com/cdn-cgi/trace"];
  const results = await Promise.allSettled(checks.map((url) => probeUrl(url)));
  return results.some((result) => result.status === "fulfilled" && result.value);
}

async function probeUrl(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "SvedenChecker/0.1 (+local self-check tool)"
      }
    });
    await response.body?.cancel();
    return response.ok || response.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function reportLooksLikeNoInternet(report: CheckReport): boolean {
  const sectionsWithErrors = report.sections.filter((section) => section.status === "error").length;
  const errorText = report.sections.map((section) => section.message ?? "").join(" ").toLowerCase();
  return sectionsWithErrors === report.sections.length && /fetch failed|enotfound|econnrefused|network|таймаут/.test(errorText);
}
