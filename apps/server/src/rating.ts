import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { findWorkspaceRoot, openDatabase } from "@sveden-checker/database";
import type { CheckReport, CheckSummary, RatingResult, RatingRun, RatingRunDetails, RatingStartRequest } from "@sveden-checker/shared";
import { checkSvedenSite } from "./checker.js";

type RatingRunRow = {
  id: string;
  title: string;
  source_name: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  status: RatingRun["status"];
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

type RatingStatsRow = {
  total: number;
  checked: number;
  failed: number;
  pending: number;
  average_score: number | null;
};

const siteListName = "obr-sites.txt";
let activeRunId: string | null = null;
let shouldPause = false;

export function initializeRatingManager(): void {
  const db = openDatabase();
  const now = new Date().toISOString();

  db.prepare("UPDATE rating_results SET status = 'pending' WHERE status = 'running'").run();
  db.prepare("UPDATE rating_runs SET status = 'paused', updated_at = ? WHERE status = 'running'").run(now);
}

export function getLatestRatingRun(): RatingRunDetails | null {
  const db = openDatabase();
  const row = db.prepare("SELECT * FROM rating_runs ORDER BY created_at DESC LIMIT 1").get() as RatingRunRow | undefined;
  return row ? getRatingRunDetails(row.id) : null;
}

export function getRatingRunDetails(runId: string): RatingRunDetails | null {
  const db = openDatabase();
  const row = db.prepare("SELECT * FROM rating_runs WHERE id = ?").get(runId) as RatingRunRow | undefined;

  if (!row) {
    return null;
  }

  const run = mapRun(row);
  const results = getRatingResults(runId);
  return { ...run, results };
}

export function getRatingResults(runId: string): RatingResult[] {
  const db = openDatabase();
  const rows = db
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
  const runId = request.reset ? createRatingRun(request.title).id : (getLatestRatingRun()?.id ?? createRatingRun(request.title).id);
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
    });
  }

  return getRatingRunDetails(runId) ?? details;
}

export function pauseRatingRun(): RatingRunDetails | null {
  shouldPause = true;
  const latest = getLatestRatingRun();

  if (latest && latest.status === "running") {
    const now = new Date().toISOString();
    openDatabase()
      .prepare("UPDATE rating_runs SET status = 'paused', updated_at = ? WHERE id = ?")
      .run(now, latest.id);
  }

  return latest ? getRatingRunDetails(latest.id) : null;
}

function createRatingRun(title?: string): RatingRun {
  const db = openDatabase();
  const urls = readDefaultSiteList();
  const now = new Date().toISOString();
  const id = randomUUID();
  const runTitle = title?.trim() || `Рейтинг сайтов от ${new Date(now).toLocaleString("ru-RU")}`;

  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO rating_runs (id, title, source_name, created_at, started_at, finished_at, status, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, 'idle', ?)`
    ).run(id, runTitle, siteListName, now, now);

    const insertResult = db.prepare(
      `INSERT INTO rating_results (id, run_id, position, site_url, normalized_url, status, score, checked_at, duration_ms, error, summary_json, report_json)
       VALUES (?, ?, ?, ?, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, NULL)`
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
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE rating_runs
     SET status = 'running',
         started_at = COALESCE(started_at, ?),
         finished_at = NULL,
         updated_at = ?
     WHERE id = ?`
  ).run(now, now, runId);

  for (;;) {
    if (shouldPause) {
      markRunPaused(runId);
      return;
    }

    const next = db
      .prepare(
        `SELECT *
         FROM rating_results
         WHERE run_id = ? AND status = 'pending'
         ORDER BY position ASC
         LIMIT 1`
      )
      .get(runId) as RatingResultRow | undefined;

    if (!next) {
      markRunCompleted(runId);
      return;
    }

    const siteStartedAt = Date.now();
    db.prepare("UPDATE rating_results SET status = 'running' WHERE id = ?").run(next.id);
    db.prepare("UPDATE rating_runs SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), runId);

    try {
      const report = await checkSvedenSite(next.site_url, {
        pageTimeoutMs: 7000,
        resourceTimeoutMs: 4000,
        maxAddRefPages: 3,
        checkResourceLinks: false
      });
      saveSuccessfulResult(next.id, report, Date.now() - siteStartedAt);
    } catch (error) {
      saveFailedResult(next.id, error, Date.now() - siteStartedAt);
    }

    db.prepare("UPDATE rating_runs SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), runId);
  }
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

function markRunPaused(runId: string): void {
  const now = new Date().toISOString();
  const db = openDatabase();
  db.prepare("UPDATE rating_results SET status = 'pending' WHERE run_id = ? AND status = 'running'").run(runId);
  db.prepare("UPDATE rating_runs SET status = 'paused', updated_at = ? WHERE id = ?").run(now, runId);
}

function markRunCompleted(runId: string): void {
  const now = new Date().toISOString();
  openDatabase()
    .prepare("UPDATE rating_runs SET status = 'completed', finished_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, runId);
}

function mapRun(row: RatingRunRow): RatingRun {
  const stats = getRatingStats(row.id);

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
    pending: stats.pending,
    averageScore: stats.average_score === null ? null : Math.round(stats.average_score),
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

function getRatingStats(runId: string): RatingStatsRow {
  return openDatabase()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'checked' THEN 1 ELSE 0 END) AS checked,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status IN ('pending', 'running') THEN 1 ELSE 0 END) AS pending,
         AVG(CASE WHEN status = 'checked' THEN score ELSE NULL END) AS average_score
       FROM rating_results
       WHERE run_id = ?`
    )
    .get(runId) as RatingStatsRow;
}

function readDefaultSiteList(): string[] {
  const configuredPath = process.env.SVEDEN_CHECKER_SITE_LIST;
  const defaultPath = join(findWorkspaceRoot(), "site-lists", siteListName);
  const filePath = configuredPath || defaultPath;

  if (!existsSync(filePath)) {
    throw new Error(`Список сайтов не найден: ${filePath}`);
  }

  const urls = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  return [...new Set(urls)];
}
