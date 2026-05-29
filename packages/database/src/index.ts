import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { LegalSource } from "@sveden-checker/shared";

type LegalSourceInput = {
  id?: string;
  title?: string;
  shortTitle?: string;
  short_title?: string;
  type?: string;
  document_type?: string;
  number?: string;
  date?: string;
  status?: string;
  description?: string;
  archiveFile?: string;
  local_file?: string;
  officialUrl?: string;
  sourceUrl?: string;
  source_url?: string;
  usedFor?: string[];
  used_for?: string[] | string;
};

const requiredFallbackSources: LegalSource[] = [
  {
    id: "fz-273-art-29",
    title: "Федеральный закон от 29.12.2012 № 273-ФЗ «Об образовании в Российской Федерации», статья 29",
    short_title: "273-ФЗ, статья 29",
    document_type: "federal_law",
    number: "273-ФЗ",
    date: "29.12.2012",
    status: "active",
    description: "Обязанность образовательной организации размещать сведения в открытом доступе.",
    source_url: "https://publication.pravo.gov.ru/document/0001201212300007",
    local_file: "01_fz-273/README_fz-273_links.md",
    used_for: "official_site_obligation, information_disclosure"
  },
  {
    id: "pp-rf-1802",
    title: "Постановление Правительства РФ от 20.10.2021 № 1802",
    short_title: "ПП РФ № 1802",
    document_type: "government_decree",
    number: "1802",
    date: "20.10.2021",
    status: "active",
    description: "Правила размещения информации на официальном сайте образовательной организации.",
    source_url: "http://publication.pravo.gov.ru/Document/View/0001202110220045",
    local_file: "02_pp-rf-1802/pp-rf-1802_rules-official-site.pdf",
    used_for: "official_site_rules, information_content, update_rules"
  },
  {
    id: "rosobrnadzor-1493",
    title: "Приказ Рособрнадзора от 04.08.2023 № 1493",
    short_title: "Приказ № 1493",
    document_type: "order",
    number: "1493",
    date: "04.08.2023",
    status: "active",
    description: "Структура раздела «Сведения об образовательной организации» и требования к разметке.",
    source_url: "https://publication.pravo.gov.ru/document/0001202311290017",
    local_file: "03_rosobrnadzor-1493/prikaz-rosobrnadzor-1493_sveden-structure.pdf",
    used_for: "sveden_structure, subsections, html_markup, itemprop"
  },
  {
    id: "rosobrnadzor-1353",
    title: "Приказ Рособрнадзора от 03.07.2025 № 1353",
    short_title: "Приказ № 1353",
    document_type: "amending_order",
    number: "1353",
    date: "03.07.2025",
    status: "active",
    description: "Изменения к приказу Рособрнадзора № 1493.",
    source_url: "https://publication.pravo.gov.ru/document/0001202510140008",
    local_file: "04_rosobrnadzor-1353/prikaz-rosobrnadzor-1353_changes-to-1493.pdf",
    used_for: "changes_to_1493, rules_actual_from_2026_03_01"
  },
  {
    id: "rosobrnadzor-955-app-27",
    title: "Приказ Рособрнадзора от 02.05.2024 № 955, приложение № 27",
    short_title: "Проверочный лист, приказ № 955",
    document_type: "checklist",
    number: "955",
    date: "02.05.2024",
    status: "active",
    description: "Проверочные листы для контрольных вопросов и структуры отчета.",
    source_url: "https://rg.ru/documents/2024/08/05/rosobrnadzor-prikaz955-site-dok.html",
    local_file: "05_rosobrnadzor-955/prikaz-rosobrnadzor-955_checklists.pdf",
    used_for: "control_questions, report_structure"
  },
  {
    id: "methodical-recommendations-v9",
    title: "Методические рекомендации представления информации об образовательной организации в открытых источниках, версия 9.0.0",
    short_title: "Методические рекомендации v9.0.0",
    document_type: "methodical_recommendations",
    number: "9.0.0",
    date: "2025",
    status: "active",
    description: "Практические рекомендации по itemprop, HTML-примерам и представлению сведений.",
    source_url: "https://rosobrcontrol.ru/documents/metodicheskie-rekomendatsii/metodicheskie-rekomendatsii-2025/",
    local_file: "06_methodical-recommendations/metodicheskie-rekomendaczii-2025-v9.pdf",
    used_for: "itemprop_reference, html_examples, practical_rules"
  },
  {
    id: "pp-rf-102-accessibility",
    title: "Постановление Правительства РФ от 07.02.2026 № 102",
    short_title: "ПП РФ № 102",
    document_type: "government_decree",
    number: "102",
    date: "07.02.2026",
    status: "active",
    description: "Требования доступности сайта для пользователей с нарушениями зрения.",
    source_url: "https://publication.pravo.gov.ru/document/0001202602100010",
    local_file: "08_accessibility/pp-rf-102-accessibility.pdf",
    used_for: "accessibility_for_visually_impaired"
  }
];

let connection: Database.Database | null = null;

export function findWorkspaceRoot(startDirectory = process.cwd()): string {
  let current = resolve(startDirectory);

  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(startDirectory);
    }

    current = parent;
  }
}

export function getDatabasePath(workspaceRoot = findWorkspaceRoot()): string {
  return process.env.SVEDEN_CHECKER_DB ?? join(workspaceRoot, "packages", "database", "data", "sveden-checker.sqlite");
}

export function openDatabase(): Database.Database {
  if (connection) {
    return connection;
  }

  const dbPath = getDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });
  connection = new Database(dbPath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  createSchema(connection);
  importLegalSources(connection);

  return connection;
}

export function getLegalSources(db = openDatabase()): LegalSource[] {
  return db
    .prepare(
      `SELECT id, title, short_title, document_type, number, date, status, description, source_url, local_file, used_for
       FROM legal_sources
       ORDER BY title`
    )
    .all() as LegalSource[];
}

export function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS legal_sources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      short_title TEXT,
      document_type TEXT,
      number TEXT,
      date TEXT,
      status TEXT,
      description TEXT,
      source_url TEXT,
      local_file TEXT,
      used_for TEXT
    );

    CREATE TABLE IF NOT EXISTS project_pages (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS check_profiles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS check_runs (
      id TEXT PRIMARY KEY,
      site_url TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      score INTEGER,
      report_path TEXT
    );

    CREATE TABLE IF NOT EXISTS check_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      section TEXT,
      item_key TEXT,
      title TEXT,
      status TEXT,
      severity TEXT,
      message TEXT,
      legal_source_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_check_results_run_id ON check_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_check_results_legal_source_id ON check_results(legal_source_id);
  `);
}

export function importLegalSources(db: Database.Database): void {
  const workspaceRoot = findWorkspaceRoot();
  const legalSourcesPath = join(workspaceRoot, "legal-documents", "legal-sources.json");
  const archiveSources = existsSync(legalSourcesPath)
    ? (JSON.parse(readFileSync(legalSourcesPath, "utf8")) as LegalSourceInput[])
    : [];

  const byId = new Map<string, LegalSource>();

  for (const source of archiveSources) {
    const normalized = normalizeLegalSource(source);
    if (normalized) {
      byId.set(normalized.id, normalized);
    }
  }

  for (const fallback of requiredFallbackSources) {
    if (!byId.has(fallback.id)) {
      byId.set(fallback.id, fallback);
    }
  }

  const insert = db.prepare(`
    INSERT INTO legal_sources (
      id, title, short_title, document_type, number, date, status, description, source_url, local_file, used_for
    ) VALUES (
      @id, @title, @short_title, @document_type, @number, @date, @status, @description, @source_url, @local_file, @used_for
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      short_title = excluded.short_title,
      document_type = excluded.document_type,
      number = excluded.number,
      date = excluded.date,
      status = excluded.status,
      description = excluded.description,
      source_url = excluded.source_url,
      local_file = excluded.local_file,
      used_for = excluded.used_for
  `);

  const transaction = db.transaction((sources: LegalSource[]) => {
    for (const source of sources) {
      insert.run(source);
    }
  });

  transaction([...byId.values()]);
}

function normalizeLegalSource(source: LegalSourceInput): LegalSource | null {
  if (!source.id || !source.title) {
    return null;
  }

  const usedFor = Array.isArray(source.used_for)
    ? source.used_for.join(", ")
    : Array.isArray(source.usedFor)
      ? source.usedFor.join(", ")
      : source.used_for ?? null;

  return {
    id: source.id,
    title: source.title,
    short_title: source.short_title ?? source.shortTitle ?? inferShortTitle(source.title),
    document_type: source.document_type ?? source.type ?? inferDocumentType(source.title),
    number: source.number ?? inferNumber(source.title),
    date: source.date ?? inferDate(source.title),
    status: source.status ?? "active",
    description: source.description ?? inferDescription(source.title),
    source_url: source.source_url ?? source.officialUrl ?? source.sourceUrl ?? null,
    local_file: source.local_file ?? source.archiveFile ?? null,
    used_for: usedFor
  };
}

function inferNumber(title: string): string | null {
  return title.match(/№\s*([0-9А-Яа-яA-Za-z.-]+)/)?.[1] ?? title.match(/версия\s*([0-9.]+)/i)?.[1] ?? null;
}

function inferDate(title: string): string | null {
  return title.match(/от\s*(\d{2}\.\d{2}\.\d{4})/)?.[1] ?? null;
}

function inferShortTitle(title: string): string {
  const number = inferNumber(title);

  if (title.includes("Федеральный закон")) {
    return number ? `${number}, статья 29` : "Федеральный закон";
  }

  if (title.includes("Постановление Правительства")) {
    return number ? `ПП РФ № ${number}` : "Постановление Правительства РФ";
  }

  if (title.includes("Приказ Рособрнадзора")) {
    return number ? `Приказ № ${number}` : "Приказ Рособрнадзора";
  }

  return title;
}

function inferDocumentType(title: string): string | null {
  if (title.includes("Федеральный закон")) return "federal_law";
  if (title.includes("Постановление Правительства")) return "government_decree";
  if (title.includes("Приказ Рособрнадзора")) return "order";
  if (title.includes("Методические рекомендации")) return "methodical_recommendations";
  if (title.includes("ГОСТ")) return "national_standard";

  return null;
}

function inferDescription(title: string): string | null {
  if (title.includes("273-ФЗ")) {
    return "Правовая основа раскрытия информации образовательной организацией.";
  }

  if (title.includes("1802")) {
    return "Правила размещения информации на официальном сайте образовательной организации.";
  }

  if (title.includes("1493")) {
    return "Требования к структуре специального раздела, подразделам и HTML-разметке.";
  }

  if (title.includes("1353")) {
    return "Изменения к требованиям приказа Рособрнадзора № 1493.";
  }

  if (title.includes("955")) {
    return "Проверочные листы для контрольных мероприятий.";
  }

  if (title.includes("Методические рекомендации")) {
    return "Практическая база для itemprop, HTML-примеров и правил проверки.";
  }

  return null;
}
