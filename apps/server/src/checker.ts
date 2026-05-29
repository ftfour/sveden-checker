import * as cheerio from "cheerio";
import { getLegalSources } from "@sveden-checker/database";
import { getSvedenItempropRuleset, type SvedenRuleSection } from "@sveden-checker/rulesets";
import type { CheckLegalReference, CheckReport, CheckReportSection, CheckResultItem, CheckSummary, LegalSource } from "@sveden-checker/shared";

type PageCheckSection = {
  id: string;
  title: string;
  path: string;
  fallbackPaths?: string[];
};

type FetchResult =
  | {
      ok: true;
      html: string;
      statusCode: number;
    }
  | {
      ok: false;
      statusCode?: number;
      error: string;
    };

const mainSvedenSections: PageCheckSection[] = [
  { id: "common", title: "Основные сведения", path: "/sveden/common/" },
  { id: "struct", title: "Структура и органы управления", path: "/sveden/struct/" },
  { id: "document", title: "Документы", path: "/sveden/document/" },
  { id: "education", title: "Образование", path: "/sveden/education/" },
  { id: "eduStandarts", title: "Образовательные стандарты и требования", path: "/sveden/eduStandarts/" },
  { id: "managers", title: "Руководство", path: "/sveden/managers/", fallbackPaths: ["/sveden/employees/"] },
  { id: "employees", title: "Педагогический состав", path: "/sveden/employees/" },
  { id: "objects", title: "Материально-техническое обеспечение", path: "/sveden/objects/" },
  { id: "grants", title: "Стипендии", path: "/sveden/grants/" },
  { id: "paid_edu", title: "Платные образовательные услуги", path: "/sveden/paid_edu/" },
  { id: "budget", title: "Финансово-хозяйственная деятельность", path: "/sveden/budget/" },
  { id: "vacant", title: "Вакантные места", path: "/sveden/vacant/" },
  { id: "inter", title: "Международное сотрудничество", path: "/sveden/inter/" },
  { id: "catering", title: "Организация питания", path: "/sveden/catering/" }
];

export async function checkSvedenSite(rawUrl: string): Promise<CheckReport> {
  const siteUrl = normalizeSiteUrl(rawUrl);
  const ruleset = getSvedenItempropRuleset();
  const rulesBySection = new Map(ruleset.sections.map((section) => [section.section, section]));
  const legalSourcesById = new Map(getLegalSources().map((source) => [source.id, source]));

  await fetchHtml(buildSectionUrl(siteUrl, "/sveden/"));

  const sections = await Promise.all(
    mainSvedenSections.map((section) => checkSection(siteUrl, section, rulesBySection.get(section.id)))
  );
  const sectionsWithLegalReferences = sections.map((section) => attachLegalReferences(section, legalSourcesById));

  return {
    siteUrl,
    checkedAt: new Date().toISOString(),
    overallScore: calculateOverallScore(sectionsWithLegalReferences),
    summary: mergeSummaries(sectionsWithLegalReferences.map((section) => section.summary)),
    sections: sectionsWithLegalReferences
  };
}

export function normalizeSiteUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    throw new Error("URL сайта не указан");
  }

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Поддерживаются только HTTP и HTTPS адреса");
  }

  return parsed.origin;
}

async function checkSection(
  siteUrl: string,
  pageSection: PageCheckSection,
  ruleSection: SvedenRuleSection | undefined
): Promise<CheckReportSection> {
  const pageResult = await fetchSectionPage(siteUrl, pageSection);
  const url = pageResult.url;
  const fetchResult = pageResult.fetchResult;
  const rules = ruleSection?.items ?? [];

  if (!fetchResult.ok) {
    const isOptionalOnlySection = rules.length > 0 && rules.every((rule) => !rule.required);
    const items = rules.map<CheckResultItem>((rule) => ({
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: isOptionalOnlySection ? "partial" : "error",
      score: isOptionalOnlySection ? 0.5 : 0,
      message: isOptionalOnlySection
        ? `Условный раздел не открылся: ${fetchResult.error}`
        : `Страница раздела не открылась: ${fetchResult.error}`,
      legalSourceId: rule.legalSourceId,
      severity: rule.severity
    }));

    return {
      id: pageSection.id,
      title: ruleSection?.title ?? pageSection.title,
      url,
      status: "error",
      score: 0,
      summary: buildSummary(items, rules.length === 0 || !isOptionalOnlySection ? 1 : 0),
      items,
      message: `Страница раздела не открылась: ${fetchResult.error}`
    };
  }

  const additionalHtml = await fetchAdditionalPages(url, fetchResult.html);
  const $ = cheerio.load([fetchResult.html, ...additionalHtml].join("\n"));
  const items = await Promise.all(rules.map((rule) => checkRule($, rule, url)));

  return {
    id: pageSection.id,
    title: ruleSection?.title ?? pageSection.title,
    url,
    status: "checked",
    score: calculateSectionScore(items),
    summary: buildSummary(items),
    items,
    message:
      rules.length === 0
        ? "Страница открылась. Itemprop-правила для этого раздела будут добавлены позже."
        : additionalHtml.length > 0
          ? `Дополнительно проверено страниц addRef: ${additionalHtml.length}.`
          : undefined
  };
}

async function fetchSectionPage(siteUrl: string, pageSection: PageCheckSection): Promise<{ url: string; fetchResult: FetchResult }> {
  const paths = [pageSection.path, ...(pageSection.fallbackPaths ?? [])];
  let lastResult: { url: string; fetchResult: FetchResult } | null = null;

  for (const path of paths) {
    const url = buildSectionUrl(siteUrl, path);
    const fetchResult = await fetchHtml(url);
    lastResult = { url, fetchResult };

    if (fetchResult.ok) {
      return lastResult;
    }
  }

  return lastResult ?? { url: buildSectionUrl(siteUrl, pageSection.path), fetchResult: { ok: false, error: "страница не найдена" } };
}

async function fetchHtml(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "SvedenChecker/0.1 (+local self-check tool)"
      }
    });

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        error: `HTTP ${response.status}`
      };
    }

    return {
      ok: true,
      html: await response.text(),
      statusCode: response.status
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.name === "AbortError" ? "таймаут запроса" : getErrorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkRule(
  $: cheerio.CheerioAPI,
  rule: SvedenRuleSection["items"][number],
  pageUrl: string
): Promise<CheckResultItem> {
  const elements = findRuleElements($, rule);

  if (elements.length === 0) {
    if (!rule.required) {
      return {
        key: rule.key,
        title: rule.title,
        itemprop: rule.itemprop,
        ruleType: rule.type,
        status: "partial",
        score: 0.5,
        message: `Условный itemprop ${rule.itemprop} не найден. Проверьте вручную, применим ли пункт к организации.`,
        legalSourceId: rule.legalSourceId,
        severity: rule.severity
      };
    }

    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "missing",
      score: 0,
      message: `itemprop ${rule.itemprop} не найден`,
      legalSourceId: rule.legalSourceId,
      severity: rule.severity
    };
  }

  const values = elements.map((element) => extractElementValue($, element));
  const filledValues = values.filter((value) => value.length > 0);

  if (filledValues.length === 0) {
    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "empty",
      score: 0.5,
      message: `itemprop ${rule.itemprop} найден, но значение не заполнено`,
      legalSourceId: rule.legalSourceId,
      severity: rule.severity
    };
  }

  const joinedValue = filledValues.join("; ");

  if (rule.type === "itempropLink") {
    return await checkItempropLink($, elements, rule, pageUrl, joinedValue);
  }

  if (filledValues.length < values.length) {
    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "partial",
      score: 0.5,
      message: `itemprop ${rule.itemprop} найден, но часть значений пустая`,
      value: truncateValue(joinedValue),
      legalSourceId: rule.legalSourceId,
      severity: rule.severity
    };
  }

  return {
    key: rule.key,
    title: rule.title,
    itemprop: rule.itemprop,
    ruleType: rule.type,
    status: "found",
    score: 1,
    message: "Пункт найден и заполнен",
    value: truncateValue(joinedValue),
    legalSourceId: rule.legalSourceId,
    severity: rule.severity
  };
}

async function checkItempropLink(
  $: cheerio.CheerioAPI,
  elements: CheerioElement[],
  rule: SvedenRuleSection["items"][number],
  pageUrl: string,
  joinedValue: string
): Promise<CheckResultItem> {
  const links = elements
    .map((element) => extractElementUrl($, element, pageUrl))
    .filter((value): value is string => Boolean(value));

  if (links.length === 0) {
    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "partial",
      score: 0.5,
      message: `itemprop ${rule.itemprop} найден, но ссылка на документ или ресурс не найдена`,
      value: truncateValue(joinedValue),
      legalSourceId: rule.legalSourceId,
      severity: rule.severity
    };
  }

  const checks = await Promise.all(links.slice(0, 3).map((link) => checkResource(link)));
  const available = checks.filter((check) => check.ok);

  if (available.length === 0) {
    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "partial",
      score: 0.5,
      message: `Ссылка найдена, но не открылась: ${checks[0]?.message ?? "ресурс недоступен"}`,
      value: truncateValue(links.join("; ")),
      legalSourceId: rule.legalSourceId,
      severity: rule.severity
    };
  }

  return {
    key: rule.key,
    title: rule.title,
    itemprop: rule.itemprop,
    ruleType: rule.type,
    status: available.length === checks.length ? "found" : "partial",
    score: available.length === checks.length ? 1 : 0.5,
    message:
      available.length === checks.length
        ? "Пункт найден, ссылка открывается"
        : "Пункт найден, но часть ссылок не открылась",
    value: truncateValue(links.join("; ")),
    legalSourceId: rule.legalSourceId,
    severity: rule.severity
  };
}

type CheerioElement = Parameters<cheerio.CheerioAPI>[0];

function findRuleElements($: cheerio.CheerioAPI, rule: SvedenRuleSection["items"][number]): CheerioElement[] {
  const selector = `[itemprop~="${escapeCssAttribute(rule.itemprop)}"]`;

  if (!rule.parentItemprop) {
    return $(selector).toArray();
  }

  return $(`[itemprop~="${escapeCssAttribute(rule.parentItemprop)}"]`)
    .toArray()
    .flatMap((parent) => $(parent).find(selector).toArray());
}

function extractElementValue($: cheerio.CheerioAPI, element: CheerioElement): string {
  const node = $(element);
  const rawValue =
    node.attr("content") ??
    node.attr("href") ??
    node.attr("src") ??
    node.attr("value") ??
    node.attr("title") ??
    node.attr("aria-label") ??
    node.attr("alt") ??
    node.text();

  return normalizeText(rawValue);
}

function extractElementUrl($: cheerio.CheerioAPI, element: CheerioElement, pageUrl: string): string | null {
  const node = $(element);
  const rawUrl = node.attr("href") ?? node.attr("src") ?? node.find("a[href], [src]").first().attr("href") ?? node.find("[src]").first().attr("src");

  if (!rawUrl) {
    return null;
  }

  try {
    return new URL(rawUrl, pageUrl).toString();
  } catch {
    return null;
  }
}

async function fetchAdditionalPages(pageUrl: string, html: string): Promise<string[]> {
  const $ = cheerio.load(html);
  const addRefUrls = $('a[itemprop~="addRef"][href], [itemprop~="addRef"] a[href]')
    .toArray()
    .map((element) => extractElementUrl($, element, pageUrl))
    .filter((value): value is string => Boolean(value))
    .slice(0, 10);

  const uniqueUrls = [...new Set(addRefUrls)];
  const results = await Promise.all(uniqueUrls.map((url) => fetchHtml(url)));

  return results.flatMap((result) => (result.ok ? [result.html] : []));
}

async function checkResource(url: string): Promise<{ ok: boolean; message: string }> {
  const headResult = await fetchResource(url, "HEAD");

  if (headResult.ok || headResult.statusCode === 405 || headResult.statusCode === 403) {
    return headResult.ok ? headResult : await fetchResource(url, "GET");
  }

  return headResult;
}

async function fetchResource(url: string, method: "HEAD" | "GET"): Promise<{ ok: boolean; statusCode?: number; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "SvedenChecker/0.1 (+local self-check tool)"
      }
    });

    await response.body?.cancel();

    return {
      ok: response.ok,
      statusCode: response.status,
      message: response.ok ? `HTTP ${response.status}` : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.name === "AbortError" ? "таймаут запроса" : getErrorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function calculateSectionScore(items: CheckResultItem[]): number {
  if (items.length === 0) {
    return 100;
  }

  return Math.round((items.reduce((sum, item) => sum + item.score, 0) / items.length) * 100);
}

function calculateOverallScore(sections: CheckReportSection[]): number {
  const items = sections.flatMap((section) => section.items);

  if (items.length === 0) {
    return 0;
  }

  return Math.round((items.reduce((sum, item) => sum + item.score, 0) / items.length) * 100);
}

function buildSummary(items: CheckResultItem[], pageErrors = 0): CheckSummary {
  return {
    total: items.length,
    found: items.filter((item) => item.status === "found").length,
    partial: items.filter((item) => item.status === "partial" || item.status === "empty").length,
    missing: items.filter((item) => item.status === "missing").length,
    errors: items.filter((item) => item.status === "error").length + pageErrors
  };
}

function mergeSummaries(summaries: CheckSummary[]): CheckSummary {
  return summaries.reduce<CheckSummary>(
    (result, summary) => ({
      total: result.total + summary.total,
      found: result.found + summary.found,
      partial: result.partial + summary.partial,
      missing: result.missing + summary.missing,
      errors: result.errors + summary.errors
    }),
    { total: 0, found: 0, partial: 0, missing: 0, errors: 0 }
  );
}

function attachLegalReferences(
  section: CheckReportSection,
  legalSourcesById: Map<string, LegalSource>
): CheckReportSection {
  return {
    ...section,
    items: section.items.map((item) => {
      if (!item.legalSourceId) {
        return item;
      }

      const source = legalSourcesById.get(item.legalSourceId);
      if (!source) {
        return item;
      }

      return {
        ...item,
        legalSource: buildLegalReference(item, section, source)
      };
    })
  };
}

function buildLegalReference(item: CheckResultItem, section: CheckReportSection, source: LegalSource): CheckLegalReference {
  return {
    id: source.id,
    title: source.title,
    shortTitle: source.short_title,
    point: buildLegalPoint(item, section, source),
    localFile: source.local_file,
    localFileUrl: source.local_file ? `/api/legal-sources/${encodeURIComponent(source.id)}/file` : null,
    sourceUrl: source.source_url
  };
}

function buildLegalPoint(item: CheckResultItem, section: CheckReportSection, source: LegalSource): string {
  const itemprop = item.itemprop ? `itemprop="${item.itemprop}"` : `ключ правила "${item.key}"`;

  if (source.id === "fz-273-art-29") {
    return `Статья 29, требование об открытом размещении сведений; раздел "${section.title}", ${itemprop}.`;
  }

  if (source.id === "pp-rf-1802") {
    return `Правила размещения информации на официальном сайте; раздел "${section.title}", пункт "${item.title}", ${itemprop}.`;
  }

  if (source.id.startsWith("rosobrnadzor-1493") || source.id === "rosobrnadzor-1353") {
    return `Структура специального раздела и HTML-разметка; подраздел "${section.title}", пункт "${item.title}", ${itemprop}.`;
  }

  if (source.id.startsWith("rosobrnadzor-955")) {
    return `Проверочный лист по официальному сайту; подраздел "${section.title}", пункт "${item.title}", ${itemprop}.`;
  }

  if (source.id.startsWith("methodical")) {
    return `Методические рекомендации по представлению сведений; подраздел "${section.title}", ${itemprop}.`;
  }

  return `${source.short_title ?? source.title}; подраздел "${section.title}", пункт "${item.title}", ${itemprop}.`;
}

function buildSectionUrl(siteUrl: string, path: string): string {
  return new URL(path, siteUrl).toString();
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncateValue(value: string): string {
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}

function escapeCssAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "неизвестная ошибка";
}
