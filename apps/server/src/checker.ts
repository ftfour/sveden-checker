import * as cheerio from "cheerio";
import { getLegalSources } from "@sveden-checker/database";
import { getSvedenItempropRuleset, type SvedenRuleSection } from "@sveden-checker/rulesets";
import type { CheckLegalReference, CheckReport, CheckReportSection, CheckResultInstance, CheckResultItem, CheckSummary, LegalSource } from "@sveden-checker/shared";

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

type StructureCheckResult = {
  score: number;
  diagnostics: string[];
  missingPaths: string[];
};

type ResourceCheckResult = {
  ok: boolean;
  statusCode?: number;
  message: string;
  contentType?: string | null;
  contentLength?: number | null;
};

export type CheckSvedenOptions = {
  pageTimeoutMs?: number;
  resourceTimeoutMs?: number;
  maxAddRefPages?: number;
  checkResourceLinks?: boolean;
  signal?: AbortSignal;
};

type ResolvedCheckSvedenOptions = Required<Omit<CheckSvedenOptions, "signal">> & {
  signal?: AbortSignal;
};

const defaultCheckOptions: Required<Omit<CheckSvedenOptions, "signal">> = {
  pageTimeoutMs: 12000,
  resourceTimeoutMs: 9000,
  maxAddRefPages: 10,
  checkResourceLinks: true
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

export async function checkSvedenSite(rawUrl: string, options: CheckSvedenOptions = {}): Promise<CheckReport> {
  const resolvedOptions: ResolvedCheckSvedenOptions = { ...defaultCheckOptions, ...options };
  throwIfAborted(resolvedOptions);
  const siteUrl = normalizeSiteUrl(rawUrl);
  const ruleset = getSvedenItempropRuleset();
  const rulesBySection = new Map(ruleset.sections.map((section) => [section.section, section]));
  const legalSourcesById = new Map(getLegalSources().map((source) => [source.id, source]));

  const svedenRootResult = await fetchHtml(buildSectionUrl(siteUrl, "/sveden/"), resolvedOptions.pageTimeoutMs, resolvedOptions.signal);
  const structureCheck = analyzeSvedenStructure(siteUrl, svedenRootResult);

  const sections = await Promise.all(
    mainSvedenSections.map((section) => checkSection(siteUrl, section, rulesBySection.get(section.id), resolvedOptions))
  );
  const sectionsWithLegalReferences = sections.map((section) => attachLegalReferences(section, legalSourcesById));
  const summary = mergeSummaries(sectionsWithLegalReferences.map((section) => section.summary));
  const diagnostics = buildReportDiagnostics(sectionsWithLegalReferences, structureCheck);

  return {
    siteUrl,
    checkedAt: new Date().toISOString(),
    overallScore: calculateOverallScore(sectionsWithLegalReferences),
    summary,
    sections: sectionsWithLegalReferences,
    diagnostics,
    fixPlan: buildFixPlan(sectionsWithLegalReferences, structureCheck, diagnostics),
    scoreBreakdown: buildScoreBreakdown(sectionsWithLegalReferences, structureCheck)
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
  ruleSection: SvedenRuleSection | undefined,
  options: ResolvedCheckSvedenOptions
): Promise<CheckReportSection> {
  throwIfAborted(options);
  const pageResult = await fetchSectionPage(siteUrl, pageSection, options);
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
      status: "error",
      score: 0,
      weight: getRuleWeight(rule),
      maxScore: getRuleWeight(rule),
      message: isOptionalOnlySection
        ? `Условный раздел не открылся: ${fetchResult.error}`
        : `Страница раздела не открылась: ${fetchResult.error}`,
      legalSourceId: rule.legalSourceId,
      severity: rule.severity,
      problemType: "page_error"
    }));

    return {
      id: pageSection.id,
      title: ruleSection?.title ?? pageSection.title,
      url,
      status: "error",
      score: 0,
      summary: buildSummary(items, rules.length === 0 || !isOptionalOnlySection ? 1 : 0),
      items,
      message: `Страница раздела не открылась: ${fetchResult.error}`,
      diagnostics: [`Проверьте доступность URL раздела, редиректы и HTTP-статус: ${url}`]
    };
  }

  const additionalHtml = await fetchAdditionalPages(url, fetchResult.html, options);
  const $ = cheerio.load([fetchResult.html, ...additionalHtml].join("\n"));
  const items = await Promise.all(rules.map(async (rule) => attachRuleMetadata(await checkRule($, rule, url, options), rule)));

  return {
    id: pageSection.id,
    title: ruleSection?.title ?? pageSection.title,
    url,
    status: "checked",
    score: calculateSectionScore(items),
    summary: buildSummary(items),
    items,
    diagnostics: buildSectionDiagnostics(items),
    message:
      rules.length === 0
        ? "Страница открылась. Itemprop-правила для этого раздела будут добавлены позже."
        : additionalHtml.length > 0
          ? `Дополнительно проверено страниц addRef: ${additionalHtml.length}.`
          : undefined
  };
}

async function fetchSectionPage(
  siteUrl: string,
  pageSection: PageCheckSection,
  options: ResolvedCheckSvedenOptions
): Promise<{ url: string; fetchResult: FetchResult }> {
  const paths = [pageSection.path, ...(pageSection.fallbackPaths ?? [])];
  let lastResult: { url: string; fetchResult: FetchResult } | null = null;

  for (const path of paths) {
    const url = buildSectionUrl(siteUrl, path);
    const fetchResult = await fetchHtml(url, options.pageTimeoutMs, options.signal);
    lastResult = { url, fetchResult };

    if (fetchResult.ok) {
      return lastResult;
    }
  }

  return lastResult ?? { url: buildSectionUrl(siteUrl, pageSection.path), fetchResult: { ok: false, error: "страница не найдена" } };
}

async function fetchHtml(url: string, timeoutMs: number, signal?: AbortSignal): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

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
    if (signal?.aborted) {
      throw new Error("Проверка остановлена пользователем");
    }

    return {
      ok: false,
      error: error instanceof Error && error.name === "AbortError" ? "таймаут запроса" : getErrorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function checkRule(
  $: cheerio.CheerioAPI,
  rule: SvedenRuleSection["items"][number],
  pageUrl: string,
  options: ResolvedCheckSvedenOptions
): Promise<CheckResultItem> {
  const elements = findRuleElements($, rule);
  const parentElements = findParentRuleElements($, rule);
  const instances = buildRuleInstances($, rule, pageUrl);

  if (elements.length === 0) {
    if (rule.requiredWhenParentExists && parentElements.length > 0) {
      return {
        key: rule.key,
        title: rule.title,
        itemprop: rule.itemprop,
        ruleType: rule.type,
        status: "missing",
        score: 0,
        weight: getRuleWeight(rule),
        maxScore: getRuleWeight(rule),
        message: `В строках itemprop ${rule.parentItemprop} не найден обязательный itemprop ${rule.itemprop}`,
        legalSourceId: rule.legalSourceId,
        severity: rule.severity,
        problemType: "missing_itemprop",
        instances
      };
    }

    if (!rule.required) {
      return {
        key: rule.key,
        title: rule.title,
        itemprop: rule.itemprop,
        ruleType: rule.type,
        status: "not_applicable",
        score: 1,
        weight: getRuleWeight(rule),
        maxScore: getRuleWeight(rule),
        message: `Условный itemprop ${rule.itemprop} не найден. Если пункт неприменим к организации, это не снижает оценку.`,
        legalSourceId: rule.legalSourceId,
        severity: rule.severity,
        problemType: "not_applicable",
        instances
      };
    }

    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "missing",
      score: 0,
      weight: getRuleWeight(rule),
      maxScore: getRuleWeight(rule),
      message: `itemprop ${rule.itemprop} не найден`,
      legalSourceId: rule.legalSourceId,
      severity: rule.severity,
      problemType: "missing_itemprop",
      instances
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
      weight: getRuleWeight(rule),
      maxScore: getRuleWeight(rule),
      message: `itemprop ${rule.itemprop} найден, но значение не заполнено`,
      legalSourceId: rule.legalSourceId,
      severity: rule.severity,
      problemType: "empty_value",
      instances
    };
  }

  const joinedValue = filledValues.join("; ");

  if (rule.type === "itempropLink") {
    return await checkItempropLink($, elements, rule, pageUrl, joinedValue, options, instances);
  }

  const quality = validateItemValue(rule, filledValues, pageUrl);

  if (quality) {
    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "invalid",
      score: 0.5,
      weight: getRuleWeight(rule),
      maxScore: getRuleWeight(rule),
      message: quality.message,
      value: truncateValue(joinedValue),
      legalSourceId: rule.legalSourceId,
      severity: rule.severity,
      problemType: "invalid_value",
      quality,
      instances
    };
  }

  const missingInstances = instances.filter((instance) => instance.status === "missing").length;
  const emptyInstances = instances.filter((instance) => instance.status === "empty").length;

  if (filledValues.length < values.length || missingInstances > 0 || emptyInstances > 0) {
    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "partial",
      score: 0.5,
      weight: getRuleWeight(rule),
      maxScore: getRuleWeight(rule),
      message: `itemprop ${rule.itemprop} найден, но часть значений пустая`,
      value: truncateValue(joinedValue),
      legalSourceId: rule.legalSourceId,
      severity: rule.severity,
      problemType: missingInstances > 0 ? "missing_itemprop" : "empty_value",
      instances
    };
  }

  return {
    key: rule.key,
    title: rule.title,
    itemprop: rule.itemprop,
    ruleType: rule.type,
    status: "found",
    score: 1,
    weight: getRuleWeight(rule),
    maxScore: getRuleWeight(rule),
    message: "Пункт найден и заполнен",
    value: truncateValue(joinedValue),
    legalSourceId: rule.legalSourceId,
    severity: rule.severity,
    problemType: "ok",
    instances
  };
}

async function checkItempropLink(
  $: cheerio.CheerioAPI,
  elements: CheerioElement[],
  rule: SvedenRuleSection["items"][number],
  pageUrl: string,
  joinedValue: string,
  options: ResolvedCheckSvedenOptions,
  instances: CheckResultInstance[] = []
): Promise<CheckResultItem> {
  const links = elements
    .map((element) => extractElementUrl($, element, pageUrl))
    .filter((value): value is string => Boolean(value));

  if (links.length === 0) {
    if (rule.allowTextFallback && joinedValue.length > 0) {
      return {
        key: rule.key,
        title: rule.title,
        itemprop: rule.itemprop,
        ruleType: rule.type,
        status: "found",
        score: 1,
        weight: getRuleWeight(rule),
        maxScore: getRuleWeight(rule),
        message: `Пункт найден и заполнен текстовым значением`,
        value: truncateValue(joinedValue),
        legalSourceId: rule.legalSourceId,
        severity: rule.severity,
        problemType: "ok",
        instances
      };
    }

    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "partial",
      score: 0.5,
      weight: getRuleWeight(rule),
      maxScore: getRuleWeight(rule),
      message: `itemprop ${rule.itemprop} найден, но ссылка на документ или ресурс не найдена`,
      value: truncateValue(joinedValue),
      legalSourceId: rule.legalSourceId,
      severity: rule.severity,
      problemType: "document_unavailable",
      quality: {
        kind: "document",
        message: "Ссылка на документ или ресурс отсутствует",
        suggestion: "Укажите href у ссылки с нужным itemprop или вложенной ссылки внутри блока."
      },
      instances
    };
  }

  const missingInstances = instances.filter((instance) => instance.status === "missing").length;
  const emptyInstances = instances.filter((instance) => instance.status === "empty").length;

  if (!options.checkResourceLinks) {
    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: missingInstances > 0 || emptyInstances > 0 ? "partial" : "found",
      score: missingInstances > 0 || emptyInstances > 0 ? 0.5 : 1,
      weight: getRuleWeight(rule),
      maxScore: getRuleWeight(rule),
      message: missingInstances > 0 || emptyInstances > 0 ? "Пункт найден, но не во всех строках указана ссылка" : "Пункт найден, ссылка указана",
      value: truncateValue(links.join("; ")),
      legalSourceId: rule.legalSourceId,
      severity: rule.severity,
      problemType: missingInstances > 0 || emptyInstances > 0 ? "document_unavailable" : "ok",
      instances
    };
  }

  const checks = await Promise.all(links.slice(0, 3).map((link) => checkResource(link, options)));
  const available = checks.filter((check) => check.ok);
  const suspicious = checks.find((check, index) => check.ok && isSuspiciousDocumentResponse(links[index], check, rule));

  if (available.length === 0) {
    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "document_error",
      score: 0,
      weight: getRuleWeight(rule),
      maxScore: getRuleWeight(rule),
      message: `Ссылка найдена, но не открылась: ${checks[0]?.message ?? "ресурс недоступен"}`,
      value: truncateValue(links.join("; ")),
      legalSourceId: rule.legalSourceId,
      severity: rule.severity,
      problemType: "document_unavailable",
      quality: {
        kind: "document",
        message: checks[0]?.message ?? "Документ недоступен",
        suggestion: "Проверьте путь к файлу, права доступа, редиректы и наличие файла на сайте."
      },
      instances
    };
  }

  if (suspicious) {
    return {
      key: rule.key,
      title: rule.title,
      itemprop: rule.itemprop,
      ruleType: rule.type,
      status: "document_error",
      score: 0,
      weight: getRuleWeight(rule),
      maxScore: getRuleWeight(rule),
      message: `Ссылка открылась, но ресурс похож не на документ: ${suspicious.message}`,
      value: truncateValue(links.join("; ")),
      legalSourceId: rule.legalSourceId,
      severity: rule.severity,
      problemType: "document_unavailable",
      quality: {
        kind: "document",
        message: suspicious.message,
        suggestion: "Проверьте, что ссылка ведёт прямо на PDF/DOC/DOCX/XLS/XLSX или другой доступный файл."
      },
      instances
    };
  }

  return {
    key: rule.key,
    title: rule.title,
    itemprop: rule.itemprop,
    ruleType: rule.type,
    status: available.length === checks.length && missingInstances === 0 && emptyInstances === 0 ? "found" : "partial",
    score: available.length === checks.length && missingInstances === 0 && emptyInstances === 0 ? 1 : 0.5,
    weight: getRuleWeight(rule),
    maxScore: getRuleWeight(rule),
    message:
      available.length === checks.length
        ? missingInstances === 0 && emptyInstances === 0
          ? "Пункт найден, ссылка открывается"
          : "Пункт найден, но не во всех строках указана ссылка"
        : "Пункт найден, но часть ссылок не открылась",
    value: truncateValue(links.join("; ")),
    legalSourceId: rule.legalSourceId,
    severity: rule.severity,
    problemType: available.length === checks.length && missingInstances === 0 && emptyInstances === 0 ? "ok" : "document_unavailable",
    instances
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

function findParentRuleElements($: cheerio.CheerioAPI, rule: SvedenRuleSection["items"][number]): CheerioElement[] {
  if (!rule.parentItemprop) {
    return [];
  }

  return $(`[itemprop~="${escapeCssAttribute(rule.parentItemprop)}"]`).toArray();
}

function buildRuleInstances(
  $: cheerio.CheerioAPI,
  rule: SvedenRuleSection["items"][number],
  pageUrl: string
): CheckResultInstance[] {
  const parents = findParentRuleElements($, rule);

  if (parents.length === 0) {
    return [];
  }

  const selector = `[itemprop~="${escapeCssAttribute(rule.itemprop)}"]`;

  return parents.map((parent, index) => {
    const child = $(parent).find(selector).first();

    if (child.length === 0) {
      return {
        index: index + 1,
        status: "missing",
        message: `В строке ${index + 1} не найден itemprop="${rule.itemprop}"`
      };
    }

    const value = extractElementValue($, child.get(0));
    const href = rule.type === "itempropLink" ? extractElementUrl($, child.get(0), pageUrl) ?? undefined : undefined;

    if (!value && !href) {
      return {
        index: index + 1,
        status: "empty",
        message: `В строке ${index + 1} itemprop="${rule.itemprop}" пустой`
      };
    }

    return {
      index: index + 1,
      status: "found",
      value: truncateValue(value || href || ""),
      href
    };
  });
}

function attachRuleMetadata(item: CheckResultItem, rule: SvedenRuleSection["items"][number]): CheckResultItem {
  return {
    ...item,
    parentItemprop: rule.parentItemprop,
    ruleNumber: rule.number,
    ruleHint: rule.hint,
    layout: rule.layout
  };
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

async function fetchAdditionalPages(pageUrl: string, html: string, options: ResolvedCheckSvedenOptions): Promise<string[]> {
  const $ = cheerio.load(html);
  const addRefUrls = $('a[itemprop~="addRef"][href], [itemprop~="addRef"] a[href]')
    .toArray()
    .map((element) => extractElementUrl($, element, pageUrl))
    .filter((value): value is string => Boolean(value))
    .slice(0, options.maxAddRefPages);

  const uniqueUrls = [...new Set(addRefUrls)];
  const results = await Promise.all(uniqueUrls.map((url) => fetchHtml(url, options.pageTimeoutMs, options.signal)));

  return results.flatMap((result) => (result.ok ? [result.html] : []));
}

async function checkResource(url: string, options: ResolvedCheckSvedenOptions): Promise<ResourceCheckResult> {
  const headResult = await fetchResource(url, "HEAD", options.resourceTimeoutMs, options.signal);

  if (headResult.ok || headResult.statusCode === 405 || headResult.statusCode === 403) {
    return headResult.ok ? headResult : await fetchResource(url, "GET", options.resourceTimeoutMs, options.signal);
  }

  return headResult;
}

async function fetchResource(
  url: string,
  method: "HEAD" | "GET",
  timeoutMs: number,
  signal?: AbortSignal
): Promise<ResourceCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

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
      message: response.ok ? `HTTP ${response.status}` : `HTTP ${response.status}`,
      contentType: response.headers.get("content-type"),
      contentLength: parseContentLength(response.headers.get("content-length"))
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Проверка остановлена пользователем");
    }

    return {
      ok: false,
      message: error instanceof Error && error.name === "AbortError" ? "таймаут запроса" : getErrorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function calculateSectionScore(items: CheckResultItem[]): number {
  if (items.length === 0) {
    return 100;
  }

  const maxScore = items.reduce((sum, item) => sum + getItemWeight(item), 0);

  if (maxScore === 0) {
    return 100;
  }

  return Math.round((items.reduce((sum, item) => sum + item.score * getItemWeight(item), 0) / maxScore) * 100);
}

function calculateOverallScore(sections: CheckReportSection[]): number {
  const items = sections.flatMap((section) => section.items);

  if (items.length === 0) {
    return 0;
  }

  const maxScore = items.reduce((sum, item) => sum + getItemWeight(item), 0);

  if (maxScore === 0) {
    return 0;
  }

  return Math.round((items.reduce((sum, item) => sum + item.score * getItemWeight(item), 0) / maxScore) * 100);
}

function buildSummary(items: CheckResultItem[], pageErrors = 0): CheckSummary {
  const weightedScore = items.reduce((sum, item) => sum + item.score * getItemWeight(item), 0);
  const maxScore = items.reduce((sum, item) => sum + getItemWeight(item), 0);

  return {
    total: items.length,
    found: items.filter((item) => item.status === "found").length,
    partial: items.filter((item) => item.status === "partial" || item.status === "empty").length,
    missing: items.filter((item) => item.status === "missing").length,
    errors: items.filter((item) => item.status === "error").length + pageErrors,
    invalid: items.filter((item) => item.status === "invalid").length,
    documentErrors: items.filter((item) => item.status === "document_error").length,
    notApplicable: items.filter((item) => item.status === "not_applicable").length,
    weightedScore,
    maxScore
  };
}

function mergeSummaries(summaries: CheckSummary[]): CheckSummary {
  return summaries.reduce<CheckSummary>(
    (result, summary) => ({
      total: result.total + summary.total,
      found: result.found + summary.found,
      partial: result.partial + summary.partial,
      missing: result.missing + summary.missing,
      errors: result.errors + summary.errors,
      invalid: (result.invalid ?? 0) + (summary.invalid ?? 0),
      documentErrors: (result.documentErrors ?? 0) + (summary.documentErrors ?? 0),
      notApplicable: (result.notApplicable ?? 0) + (summary.notApplicable ?? 0),
      weightedScore: (result.weightedScore ?? 0) + (summary.weightedScore ?? 0),
      maxScore: (result.maxScore ?? 0) + (summary.maxScore ?? 0)
    }),
    { total: 0, found: 0, partial: 0, missing: 0, errors: 0, invalid: 0, documentErrors: 0, notApplicable: 0, weightedScore: 0, maxScore: 0 }
  );
}

function getRuleWeight(rule: SvedenRuleSection["items"][number]): number {
  if (!rule.required) {
    return 0.4;
  }

  if (rule.severity === "error") {
    return 1;
  }

  if (rule.severity === "warning") {
    return 0.65;
  }

  return 0.35;
}

function getItemWeight(item: CheckResultItem): number {
  return item.weight ?? item.maxScore ?? (item.severity === "error" ? 1 : item.severity === "info" ? 0.35 : 0.65);
}

function validateItemValue(
  rule: SvedenRuleSection["items"][number],
  values: string[],
  pageUrl: string
): CheckResultItem["quality"] | null {
  const lowerItemprop = rule.itemprop.toLowerCase();
  const normalizedValues = values.map((value) => normalizeText(value));
  const meaningfulValues = normalizedValues.filter((value) => !isPlaceholderValue(value));

  if (meaningfulValues.length === 0) {
    return {
      kind: "placeholder",
      message: `itemprop ${rule.itemprop} заполнен служебной заглушкой или формальным пустым значением`,
      suggestion: "Замените «нет», «-», «не заполнено» и похожие заглушки на реальное значение или понятное текстовое пояснение."
    };
  }

  if (lowerItemprop.includes("email") || lowerItemprop.includes("mail")) {
    const invalidEmail = meaningfulValues.find((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

    if (invalidEmail) {
      return {
        kind: "email",
        message: `Некорректный адрес электронной почты в itemprop ${rule.itemprop}`,
        suggestion: `Проверьте формат адреса: сейчас найдено «${truncateValue(invalidEmail)}».`
      };
    }
  }

  if (lowerItemprop.includes("telephone") || lowerItemprop.includes("tel")) {
    const invalidPhone = meaningfulValues.find((value) => value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "").length < 6);

    if (invalidPhone) {
      return {
        kind: "telephone",
        message: `Некорректный телефон в itemprop ${rule.itemprop}`,
        suggestion: `Укажите телефон в читаемом формате, например +7 (41132) 00-0-00. Сейчас найдено «${truncateValue(invalidPhone)}».`
      };
    }
  }

  if (lowerItemprop.includes("website") || lowerItemprop === "site") {
    const invalidUrl = meaningfulValues.find((value) => !isValidUrlLike(value, pageUrl));

    if (invalidUrl) {
      return {
        kind: "url",
        message: `Некорректная ссылка в itemprop ${rule.itemprop}`,
        suggestion: `Проверьте href или текст ссылки. Сейчас найдено «${truncateValue(invalidUrl)}».`
      };
    }
  }

  return null;
}

function isPlaceholderValue(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[.\s]+$/g, "").trim();
  const placeholders = new Set([
    "-",
    "--",
    "—",
    "нет",
    "нет данных",
    "не заполнено",
    "информация отсутствует",
    "сведения отсутствуют",
    "не имеется",
    "отсутствует",
    "n/a"
  ]);

  return normalized.length === 0 || placeholders.has(normalized);
}

function isValidUrlLike(value: string, pageUrl: string): boolean {
  try {
    new URL(value, pageUrl);
    return true;
  } catch {
    return false;
  }
}

function isSuspiciousDocumentResponse(
  url: string | undefined,
  check: ResourceCheckResult,
  rule: SvedenRuleSection["items"][number]
): boolean {
  if (!check.ok) {
    return false;
  }

  if (check.contentLength === 0) {
    return true;
  }

  const contentType = (check.contentType ?? "").toLowerCase();
  const lowerUrl = (url ?? "").toLowerCase();
  const looksLikeDocumentRule =
    rule.itemprop.toLowerCase().includes("doc") ||
    rule.itemprop.toLowerCase().includes("link") ||
    /\.(pdf|doc|docx|xls|xlsx|odt|ods|rtf)(\?|#|$)/i.test(lowerUrl);

  return looksLikeDocumentRule && contentType.includes("text/html") && /\.(pdf|doc|docx|xls|xlsx|odt|ods|rtf)(\?|#|$)/i.test(lowerUrl);
}

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function analyzeSvedenStructure(siteUrl: string, rootResult: FetchResult): StructureCheckResult {
  if (!rootResult.ok) {
    return {
      score: 0,
      diagnostics: [`Главная страница /sveden/ не открылась: ${rootResult.error}.`],
      missingPaths: mainSvedenSections.map((section) => section.path)
    };
  }

  const $ = cheerio.load(rootResult.html);
  const hrefs = new Set(
    $("a[href]")
      .toArray()
      .map((element) => {
        try {
          return new URL($(element).attr("href") ?? "", buildSectionUrl(siteUrl, "/sveden/")).pathname.replace(/\/+$/, "/");
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );
  const missingPaths = mainSvedenSections
    .filter((section) => !hrefs.has(section.path))
    .map((section) => section.path);
  const score = Math.round(((mainSvedenSections.length - missingPaths.length) / mainSvedenSections.length) * 100);

  return {
    score,
    diagnostics:
      missingPaths.length > 0
        ? [`На странице /sveden/ не найдены ссылки на подразделы: ${missingPaths.join(", ")}.`]
        : ["Структура /sveden/ содержит ссылки на основные подразделы."],
    missingPaths
  };
}

function buildSectionDiagnostics(items: CheckResultItem[]): string[] {
  const diagnostics: string[] = [];
  const missing = items.filter((item) => item.status === "missing").length;
  const invalid = items.filter((item) => item.status === "invalid").length;
  const documentErrors = items.filter((item) => item.status === "document_error").length;

  if (missing > 0) {
    diagnostics.push(`Отсутствуют обязательные itemprop: ${missing}.`);
  }

  if (invalid > 0) {
    diagnostics.push(`Найдены значения, похожие на ошибочные или формальные: ${invalid}.`);
  }

  if (documentErrors > 0) {
    diagnostics.push(`Есть недоступные или подозрительные ссылки на документы: ${documentErrors}.`);
  }

  return diagnostics;
}

function buildReportDiagnostics(sections: CheckReportSection[], structureCheck: StructureCheckResult): string[] {
  const items = sections.flatMap((section) => section.items);
  const sectionErrors = sections.filter((section) => section.status === "error").length;
  const missing = items.filter((item) => item.status === "missing").length;
  const invalid = items.filter((item) => item.status === "invalid").length;
  const documentErrors = items.filter((item) => item.status === "document_error").length;
  const notApplicable = items.filter((item) => item.status === "not_applicable").length;
  const diagnostics = [...structureCheck.diagnostics];

  if (sectionErrors > 0) {
    diagnostics.push(`Не открываются подразделы /sveden/: ${sectionErrors}. Эти сайты или страницы нужно проверить до анализа itemprop.`);
  }

  if (missing > 0) {
    diagnostics.push(`Часть сведений отсутствует в HTML-разметке itemprop: ${missing} пунктов.`);
  }

  if (invalid > 0) {
    diagnostics.push(`Есть некорректные значения: email, телефон, URL или формальные заглушки: ${invalid} пунктов.`);
  }

  if (documentErrors > 0) {
    diagnostics.push(`Есть проблемы с документами и ссылками на файлы: ${documentErrors} пунктов.`);
  }

  if (notApplicable > 0) {
    diagnostics.push(`Условные пункты отмечены как неприменимые без штрафа: ${notApplicable}. Их стоит подтвердить вручную.`);
  }

  if (diagnostics.length === 0) {
    diagnostics.push("Критичных типовых проблем не найдено.");
  }

  return diagnostics;
}

function buildFixPlan(
  sections: CheckReportSection[],
  structureCheck: StructureCheckResult,
  diagnostics: string[]
): string[] {
  const items = sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionTitle: section.title, sectionUrl: section.url })));
  const criticalMissing = items.filter((item) => item.status === "missing" && item.severity === "error");
  const pageErrors = sections.filter((section) => section.status === "error");
  const documentErrors = items.filter((item) => item.status === "document_error");
  const invalid = items.filter((item) => item.status === "invalid");
  const plan: string[] = [];

  if (structureCheck.missingPaths.length > 0) {
    plan.push(`Восстановить навигацию на /sveden/: добавить ссылки на ${structureCheck.missingPaths.join(", ")}.`);
  }

  if (pageErrors.length > 0) {
    plan.push(`Сначала открыть недоступные подразделы: ${pageErrors.map((section) => section.title).join(", ")}.`);
  }

  if (criticalMissing.length > 0) {
    plan.push(`Добавить обязательные itemprop с высокой важностью: ${criticalMissing.slice(0, 8).map((item) => item.itemprop ?? item.key).join(", ")}.`);
  }

  if (documentErrors.length > 0) {
    plan.push(`Проверить файлы и прямые ссылки на документы: ${documentErrors.slice(0, 8).map((item) => item.itemprop ?? item.key).join(", ")}.`);
  }

  if (invalid.length > 0) {
    plan.push(`Исправить качество значений: ${invalid.slice(0, 8).map((item) => item.itemprop ?? item.key).join(", ")}.`);
  }

  if (plan.length === 0 && diagnostics.length > 0) {
    plan.push("Проверить оставшиеся предупреждения и условные пункты вручную.");
  }

  return plan;
}

function buildScoreBreakdown(sections: CheckReportSection[], structureCheck: StructureCheckResult): CheckReport["scoreBreakdown"] {
  const items = sections.flatMap((section) => section.items);
  const documentItems = items.filter((item) => item.ruleType === "itempropLink");
  const qualityItems = items.filter((item) => item.status === "invalid" || item.status === "found" || item.status === "partial" || item.status === "empty");

  return {
    structure: structureCheck.score,
    completeness: calculateOverallScore(sections),
    quality: calculateItemsScore(qualityItems),
    documents: documentItems.length > 0 ? calculateItemsScore(documentItems) : 100
  };
}

function calculateItemsScore(items: CheckResultItem[]): number {
  if (items.length === 0) {
    return 100;
  }

  const maxScore = items.reduce((sum, item) => sum + getItemWeight(item), 0);
  return maxScore === 0 ? 100 : Math.round((items.reduce((sum, item) => sum + item.score * getItemWeight(item), 0) / maxScore) * 100);
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
        legalSource: buildLegalReference(item, section, source),
        legalPoint: buildLegalPoint(item, section, source)
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
  const ruleNumber = item.ruleNumber ? `п. ${item.ruleNumber}, ` : "";

  if (source.id === "fz-273-art-29") {
    return `Статья 29, требование об открытом размещении сведений; ${ruleNumber}раздел "${section.title}", ${itemprop}.`;
  }

  if (source.id === "pp-rf-1802") {
    return `Правила размещения информации на официальном сайте; ${ruleNumber}раздел "${section.title}", пункт "${item.title}", ${itemprop}.`;
  }

  if (source.id.startsWith("rosobrnadzor-1493") || source.id === "rosobrnadzor-1353") {
    return `Структура специального раздела и HTML-разметка; ${ruleNumber}подраздел "${section.title}", пункт "${item.title}", ${itemprop}.`;
  }

  if (source.id.startsWith("rosobrnadzor-955")) {
    return `Проверочный лист по официальному сайту; ${ruleNumber}подраздел "${section.title}", пункт "${item.title}", ${itemprop}.`;
  }

  if (source.id.startsWith("methodical")) {
    return `Методические рекомендации v9.0.0, ${getMethodicalTableNumber(section.id)}; ${ruleNumber}подраздел "${section.title}", пункт "${item.title}", ${itemprop}.`;
  }

  return `${source.short_title ?? source.title}; ${ruleNumber}подраздел "${section.title}", пункт "${item.title}", ${itemprop}.`;
}

function getMethodicalTableNumber(sectionId: string): string {
  const tables: Record<string, string> = {
    common: "таблица 3.2.1",
    struct: "таблица 3.3.1",
    document: "таблица 3.4.1"
  };

  return tables[sectionId] ?? "таблица с перечнем атрибутов микроразметки";
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

function throwIfAborted(options: Pick<CheckSvedenOptions, "signal">): void {
  if (options.signal?.aborted) {
    throw new Error("Проверка остановлена пользователем");
  }
}
