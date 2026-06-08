import * as React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Clipboard,
  Database,
  Download,
  Eye,
  ExternalLink,
  FileCheck2,
  FileText,
  LoaderCircle,
  MonitorCheck,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  Upload,
  WifiOff,
  Wrench,
  XCircle
} from "lucide-react";
import "./styles.css";

type LegalSource = {
  id: string;
  title: string;
  source_url?: string | null;
  short_title: string | null;
  status: string | null;
  used_for: string | null;
  local_file: string | null;
};

type CheckLegalReference = {
  id: string;
  title: string;
  shortTitle: string | null;
  point: string;
  localFile: string | null;
  localFileUrl: string | null;
  sourceUrl: string | null;
};

type CheckItemStatus = "found" | "partial" | "empty" | "missing" | "error" | "invalid" | "document_error" | "not_applicable";

type CheckSummary = {
  total: number;
  found: number;
  partial: number;
  missing: number;
  errors: number;
  invalid?: number;
  documentErrors?: number;
  notApplicable?: number;
  weightedScore?: number;
  maxScore?: number;
};

type CheckProblemType =
  | "ok"
  | "missing_itemprop"
  | "empty_value"
  | "invalid_value"
  | "document_unavailable"
  | "page_error"
  | "not_applicable";

type CheckQualityIssue = {
  kind: "email" | "telephone" | "url" | "document" | "placeholder" | "text";
  message: string;
  suggestion?: string;
};

type CheckResultInstance = {
  index: number;
  status: "found" | "empty" | "missing";
  value?: string;
  href?: string;
  message?: string;
};

type CheckResultItem = {
  key: string;
  title: string;
  itemprop?: string;
  parentItemprop?: string;
  ruleNumber?: string;
  ruleHint?: string;
  layout?: "text" | "link" | "table" | "table_row";
  ruleType?: "itemprop" | "itempropLink";
  status: CheckItemStatus;
  score: number;
  weight?: number;
  maxScore?: number;
  message: string;
  value?: string;
  legalSourceId?: string;
  legalSource?: CheckLegalReference;
  severity?: "error" | "warning" | "info";
  problemType?: CheckProblemType;
  quality?: CheckQualityIssue;
  legalPoint?: string;
  instances?: CheckResultInstance[];
};

type CheckReportSection = {
  id: string;
  title: string;
  url: string;
  status: "checked" | "error";
  score: number;
  summary: CheckSummary;
  items: CheckResultItem[];
  message?: string;
  diagnostics?: string[];
};

type CheckReport = {
  siteUrl: string;
  checkedAt: string;
  overallScore: number;
  summary: CheckSummary;
  sections: CheckReportSection[];
  diagnostics?: string[];
  fixPlan?: string[];
  previousComparison?: {
    previousCheckedAt: string;
    previousScore: number;
    delta: number;
  } | null;
  scoreBreakdown?: {
    structure: number;
    completeness: number;
    quality: number;
    documents: number;
  };
};

type RatingRunStatus = "idle" | "running" | "paused" | "completed" | "offline" | "error";

type RatingSiteStatus = "pending" | "running" | "checked" | "error" | "no_internet";

type RatingSettings = {
  concurrency: number;
  retries: number;
  pageTimeoutMs: number;
  resourceTimeoutMs: number;
  maxAddRefPages: number;
  checkResourceLinks: boolean;
};

type SiteList = {
  id: string;
  title: string;
  sourceName: string;
  createdAt: string;
  total: number;
  isDefault: boolean;
};

type RatingAnalyticsItem = {
  key: string;
  title: string;
  count: number;
};

type RatingAnalytics = {
  topMissingItems: RatingAnalyticsItem[];
  topErrorMessages: RatingAnalyticsItem[];
  scoreBuckets: Array<{ label: string; count: number }>;
};

type RatingResult = {
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

type RatingRunDetails = {
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
  results: RatingResult[];
  analytics: RatingAnalytics;
};

type UpdateInfo = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  downloadUrl: string | null;
  checkedAt: string;
  error: string | null;
};

type RecommendationPriority = "high" | "medium" | "low";

type RecommendationFilter = "all" | "high" | "medium" | "low" | "missing" | "empty" | "error" | "invalid" | "document_error";

type Recommendation = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  sectionUrl: string;
  itemKey: string;
  itemTitle: string;
  itemprop: string;
  ruleNumber?: string;
  ruleHint?: string;
  layout?: "text" | "link" | "table" | "table_row";
  status: CheckItemStatus;
  severity: "error" | "warning" | "info";
  priority: RecommendationPriority;
  problem: string;
  recommendation: string;
  exampleHtml: string;
  legalSource?: CheckLegalReference;
  problemType?: CheckProblemType;
  quality?: CheckQualityIssue;
};

const LAST_REPORT_STORAGE_KEY = "sveden_checker_last_report";
const REPORT_HISTORY_STORAGE_KEY = "sveden_checker_report_history";

const purposeItems = [
  "проверка структуры /sveden/",
  "проверка обязательных подразделов",
  "проверка itemprop",
  "поиск пустых значений",
  "проверка доступности документов",
  "подготовка к официальной проверке"
];

const workflowItems = [
  "Пользователь вводит адрес сайта",
  "Локальный backend скачивает страницы",
  "Парсер анализирует HTML",
  "Правила сверяют найденные сведения с нормативной базой",
  "Пользователь получает отчёт"
];

const aisSteps = [
  "Перейти на официальный сайт Рособрнадзора.",
  "Найти раздел про федеральный государственный контроль в сфере образования или АИС «Мониторинг».",
  "Найти форму заявки на доступ к АИС «Мониторинг».",
  "Заполнить заявку от имени образовательной организации.",
  "Указать организацию и ответственного сотрудника.",
  "Дождаться ответа или предоставления доступа.",
  "После получения доступа выполнить официальную проверку.",
  "Использовать Sveden Checker только как предварительную локальную самопроверку."
];

const futureSections = [
  "Основные сведения",
  "Структура и органы управления образовательной организацией",
  "Документы",
  "Образование",
  "Руководство",
  "Материально-техническое обеспечение и оснащённость образовательного процесса. Доступная среда",
  "Платные образовательные услуги",
  "Финансово-хозяйственная деятельность",
  "Вакантные места для приёма (перевода) обучающихся",
  "Стипендии и меры поддержки обучающихся",
  "Организация питания в образовательной организации",
  "Международное сотрудничество"
];

function App() {
  const [path, setPath] = React.useState(window.location.pathname);
  const [lastReport, setLastReportState] = React.useState<CheckReport | null>(() => readStoredReport());

  React.useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(nextPath: string) {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  }

  function setLastReport(report: CheckReport | null) {
    setLastReportState(report);

    if (report) {
      localStorage.setItem(LAST_REPORT_STORAGE_KEY, JSON.stringify(report));
    } else {
      localStorage.removeItem(LAST_REPORT_STORAGE_KEY);
    }
  }

  if (path === "/check") {
    return <CheckPage lastReport={lastReport} navigate={navigate} setLastReport={setLastReport} />;
  }

  if (path === "/recommendations") {
    return <RecommendationsPage report={lastReport ?? readStoredReport()} navigate={navigate} />;
  }

  if (path === "/rating") {
    return <RatingPage navigate={navigate} />;
  }

  return <HomePage />;
}

function HomePage() {
  const [legalSources] = useLegalSources();

  return (
    <main>
      <section className="hero" id="top">
        <div className="hero__content">
          <p className="eyebrow">Локальный инструмент предварительной самопроверки</p>
          <h1>Sveden Checker — локальная проверка раздела «Сведения об образовательной организации»</h1>
          <p className="hero__lead">
            Приложение помогает заранее проверить открытые страницы специального раздела, HTML-разметку, itemprop и
            наличие обязательных сведений перед официальными процедурами контроля.
          </p>
          <div className="hero__actions" aria-label="Основные действия">
            <a className="button button--primary" href="/check">
              <PlayCircle size={20} aria-hidden="true" />
              Начать проверку
            </a>
            <a className="button" href="/rating">
              <BarChart3 size={20} aria-hidden="true" />
              Рейтинг сайтов
            </a>
            <a className="button" href="#ais">
              <MonitorCheck size={20} aria-hidden="true" />
              Инструкция по АИС «Мониторинг»
            </a>
            <a className="button" href="#legal">
              <BookOpen size={20} aria-hidden="true" />
              Нормативная база
            </a>
          </div>
        </div>
      </section>

      <section className="section" id="start">
        <div className="section__heading">
          <p className="eyebrow">Назначение</p>
          <h2>Для чего предназначено приложение</h2>
        </div>
        <div className="card-grid card-grid--three">
          {purposeItems.map((item) => (
            <article className="card purpose-card" key={item}>
              <CheckCircle2 size={22} aria-hidden="true" />
              <span>{item}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--split">
        <div>
          <p className="eyebrow">Предварительный анализ</p>
          <h2>Почему это похоже на АИС «Мониторинг»</h2>
          <p>
            Приложение анализирует открытые страницы сайта, HTML-разметку и значения itemprop, поэтому логика проверки
            похожа на автоматизированный просмотр специального раздела. При этом Sveden Checker работает только как
            локальный предварительный инструмент для самопроверки.
          </p>
        </div>
        <aside className="warning">
          <AlertTriangle size={26} aria-hidden="true" />
          <strong>
            Sveden Checker не является официальной АИС «Мониторинг», не связан с Рособрнадзором и не заменяет
            официальную проверку.
          </strong>
        </aside>
      </section>

      <section className="section">
        <div className="section__heading">
          <p className="eyebrow">Принцип работы</p>
          <h2>Как работает приложение</h2>
        </div>
        <div className="workflow">
          {workflowItems.map((item, index) => (
            <div className="workflow__step" key={item}>
              <div className="workflow__number">{index + 1}</div>
              <p>{item}</p>
              {index < workflowItems.length - 1 && <ArrowDown className="workflow__arrow" size={20} aria-hidden="true" />}
            </div>
          ))}
        </div>
        <p className="privacy-note">
          Все проверки выполняются на компьютере пользователя. Проверяемый сайт, HTML-страницы и результаты анализа не
          передаются на внешний сервер.
        </p>
      </section>

      <section className="section" id="ais">
        <div className="section__heading">
          <p className="eyebrow">Официальный доступ</p>
          <h2>Инструкция по подключению к АИС «Мониторинг»</h2>
        </div>
        <div className="instruction">
          <p>
            Для официальной работы с АИС «Мониторинг» образовательной организации необходимо получить доступ в
            установленном порядке. Как правило, нужно обратиться к актуальной информации на официальном сайте
            Рособрнадзора, найти форму заявки на предоставление доступа к АИС «Мониторинг», заполнить сведения об
            организации и ответственном сотруднике, затем дождаться предоставления доступа или ответа уполномоченных
            специалистов.
          </p>
          <ol>
            {aisSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="note">
            Порядок подключения, форма заявки и контактные данные могут меняться. Перед подачей заявки нужно сверяться
            с актуальной информацией на официальном сайте Рособрнадзора.
          </p>
        </div>
      </section>

      <section className="section" id="legal">
        <div className="section__heading">
          <p className="eyebrow">SQLite + локальные файлы</p>
          <h2>Нормативная база</h2>
        </div>
        <div className="card-grid card-grid--two">
          {legalSources.length === 0 ? (
            <article className="card">Нормативная база загружается из локальной SQLite-базы.</article>
          ) : (
            legalSources.map((source) => (
              <article className="card legal-card" key={source.id}>
                <div className="legal-card__icon">
                  <FileCheck2 size={22} aria-hidden="true" />
                </div>
                <div>
                  <h3>{source.short_title ?? source.title}</h3>
                  <p>{source.title}</p>
                  <dl>
                    <div>
                      <dt>Статус</dt>
                      <dd>{source.status ?? "не указан"}</dd>
                    </div>
                    <div>
                      <dt>Используется для</dt>
                      <dd>{source.used_for ?? "будет уточнено"}</dd>
                    </div>
                    {source.local_file && (
                      <div>
                        <dt>Локальный файл</dt>
                        <dd>
                          <a
                            className="legal-link"
                            href={legalFileUrl(source.id)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <FileCheck2 size={16} aria-hidden="true" />
                            {source.local_file}
                          </a>
                        </dd>
                      </div>
                    )}
                    {source.source_url && (
                      <div>
                        <dt>Официальный источник</dt>
                        <dd>
                          <a className="legal-link" href={source.source_url} rel="noreferrer" target="_blank">
                            <ExternalLink size={16} aria-hidden="true" />
                            Открыть источник
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="section">
        <div className="section__heading">
          <p className="eyebrow">Следующий этап</p>
          <h2>Что будет проверяться дальше</h2>
        </div>
        <div className="section-list">
          {futureSections.map((section) => (
            <span key={section}>
              <ShieldCheck size={18} aria-hidden="true" />
              {section}
            </span>
          ))}
        </div>
      </section>

      <footer className="footer">
        <Database size={18} aria-hidden="true" />
        Локальная база SQLite и документы из архива используются только на компьютере пользователя.
      </footer>
    </main>
  );
}

function CheckPage({
  lastReport,
  navigate,
  setLastReport
}: {
  lastReport: CheckReport | null;
  navigate: (path: string) => void;
  setLastReport: (report: CheckReport | null) => void;
}) {
  const [url, setUrl] = React.useState("");
  const [report, setReport] = React.useState<CheckReport | null>(lastReport);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setReport(null);

    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ url })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message ?? "Не удалось выполнить проверку");
      }

      const nextReport = withPreviousComparison(payload as CheckReport);
      storeReportHistory(nextReport);
      setReport(nextReport);
      setLastReport(nextReport);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось выполнить проверку");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="checker-page">
      <section className="checker-hero">
        <div className="checker-hero__content">
          <a className="back-link" href="/">
            <ArrowLeft size={18} aria-hidden="true" />
            На главную
          </a>
          <a
            className="back-link"
            href="/recommendations"
            onClick={(event) => {
              event.preventDefault();
              navigate("/recommendations");
            }}
          >
            <Wrench size={18} aria-hidden="true" />
            Рекомендации по исправлениям
          </a>
          <a
            className="back-link"
            href="/rating"
            onClick={(event) => {
              event.preventDefault();
              navigate("/rating");
            }}
          >
            <BarChart3 size={18} aria-hidden="true" />
            Рейтинг сайтов
          </a>
          <div>
            <p className="eyebrow">Локальная проверка сайта</p>
            <h1>Проверка раздела «Сведения об образовательной организации»</h1>
            <p className="hero__lead">
              Введите адрес сайта. Frontend отправит запрос только на локальный backend, а backend скачает страницы
              `/sveden/`, проверит HTML, itemprop и ссылки на документы по расширенному ruleset.
            </p>
          </div>
          <form className="check-form" onSubmit={handleSubmit}>
            <label htmlFor="site-url">Адрес сайта образовательной организации</label>
            <div className="check-form__row">
              <input
                id="site-url"
                name="url"
                type="url"
                placeholder="https://example.ru"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required
              />
              <button className="button button--primary check-form__button" type="submit" disabled={isLoading}>
                {isLoading ? <LoaderCircle className="spin" size={20} aria-hidden="true" /> : <Search size={20} aria-hidden="true" />}
                Проверить
              </button>
            </div>
          </form>
          <p className="privacy-note checker-note">
            Все внешние HTTP-запросы выполняет только backend. Результаты проверки остаются в локальном приложении.
          </p>
        </div>
      </section>

      <section className="section">
        {isLoading && (
          <div className="loading-card">
            <LoaderCircle className="spin" size={26} aria-hidden="true" />
            Проверяем доступность страниц и itemprop-разметку...
          </div>
        )}

        {error && (
          <div className="error-card">
            <XCircle size={24} aria-hidden="true" />
            {error}
          </div>
        )}

        {report && <CheckReportView navigate={navigate} report={report} />}
      </section>
    </main>
  );
}

function CheckReportView({ report, navigate }: { report: CheckReport; navigate: (path: string) => void }) {
  const [activeSectionId, setActiveSectionId] = React.useState(report.sections[0]?.id ?? "");
  const activeSection = report.sections.find((section) => section.id === activeSectionId) ?? report.sections[0];

  React.useEffect(() => {
    setActiveSectionId(report.sections[0]?.id ?? "");
  }, [report.checkedAt, report.siteUrl, report.sections]);

  return (
    <div className="report">
      <div className="report-summary">
        <div>
          <p className="eyebrow">Результат</p>
          <h2>{report.overallScore}% готовности</h2>
          <p>
            Проверен сайт {report.siteUrl}. Дата проверки: {new Date(report.checkedAt).toLocaleString("ru-RU")}.
          </p>
        </div>
        <div className="score-ring" aria-label={`Общий процент готовности ${report.overallScore}%`}>
          {report.overallScore}%
        </div>
      </div>

      <div className="summary-strip">
        <SummaryBadge label="Всего пунктов" value={report.summary.total} />
        <SummaryBadge label="Найдено" value={report.summary.found} tone="found" />
        <SummaryBadge label="Частично" value={report.summary.partial} tone="partial" />
        <SummaryBadge label="Отсутствует" value={report.summary.missing} tone="missing" />
        <SummaryBadge label="Ошибки" value={report.summary.errors} tone="missing" />
        <SummaryBadge label="Некорректно" value={report.summary.invalid ?? 0} tone="partial" />
        <SummaryBadge label="Документы" value={report.summary.documentErrors ?? 0} tone="missing" />
        <SummaryBadge label="Неприменимо" value={report.summary.notApplicable ?? 0} />
      </div>

      {report.previousComparison && (
        <div className={report.previousComparison.delta >= 0 ? "notice-card notice-card--good" : "notice-card notice-card--warn"}>
          <Clock size={21} aria-hidden="true" />
          <span>
            Предыдущая проверка: {new Date(report.previousComparison.previousCheckedAt).toLocaleString("ru-RU")}, было{" "}
            {report.previousComparison.previousScore}%. Изменение: {formatScoreDelta(report.previousComparison.delta)}.
          </span>
        </div>
      )}

      {report.scoreBreakdown && (
        <div className="score-breakdown">
          <SummaryBadge label="Структура" value={report.scoreBreakdown.structure} />
          <SummaryBadge label="Заполненность" value={report.scoreBreakdown.completeness} />
          <SummaryBadge label="Качество" value={report.scoreBreakdown.quality} />
          <SummaryBadge label="Документы" value={report.scoreBreakdown.documents} />
        </div>
      )}

      {report.diagnostics && report.diagnostics.length > 0 && (
        <div className="diagnostics-card">
          <div>
            <p className="eyebrow">Диагностика</p>
            <h3>Типовые проблемы сайта</h3>
          </div>
          <ul>
            {report.diagnostics.map((diagnostic) => (
              <li key={diagnostic}>{diagnostic}</li>
            ))}
          </ul>
        </div>
      )}

      {report.fixPlan && report.fixPlan.length > 0 && (
        <div className="diagnostics-card diagnostics-card--plan">
          <div>
            <p className="eyebrow">План исправлений</p>
            <h3>Рекомендуемый порядок работ</h3>
          </div>
          <ol>
            {report.fixPlan.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="report-actions">
        <a
          className="action-button"
          href="/recommendations"
          onClick={(event) => {
            event.preventDefault();
            navigate("/recommendations");
          }}
        >
          <Wrench size={19} aria-hidden="true" />
          Сформировать рекомендации
        </a>
      </div>

      <div className="section-tabs" role="tablist" aria-label="Подразделы /sveden/">
        {report.sections.map((section) => (
          <button
            aria-selected={activeSection?.id === section.id}
            className={activeSection?.id === section.id ? "section-tab section-tab--active" : "section-tab"}
            key={section.id}
            onClick={() => setActiveSectionId(section.id)}
            role="tab"
            type="button"
          >
            <span>{section.title}</span>
            <strong>{section.score}%</strong>
          </button>
        ))}
      </div>

      {activeSection && <SectionResultCard section={activeSection} />}
    </div>
  );
}

function SectionResultCard({ section }: { section: CheckReportSection }) {
  return (
    <article className={`result-card result-card--${section.status}`}>
      <div className="result-card__header">
        <div>
          <h3>{section.title}</h3>
          <a href={section.url} target="_blank" rel="noreferrer">
            {section.url}
          </a>
        </div>
        <div className="result-card__score">{section.score}%</div>
      </div>

      <div className="result-card__stats">
        <SummaryBadge label="Найдено" value={section.summary.found} tone="found" />
        <SummaryBadge label="Частично" value={section.summary.partial} tone="partial" />
        <SummaryBadge label="Нет" value={section.summary.missing} tone="missing" />
        <SummaryBadge label="Ошибки" value={section.summary.errors} tone="missing" />
        <SummaryBadge label="Некорректно" value={section.summary.invalid ?? 0} tone="partial" />
        <SummaryBadge label="Документы" value={section.summary.documentErrors ?? 0} tone="missing" />
        <SummaryBadge label="Неприменимо" value={section.summary.notApplicable ?? 0} />
      </div>

      {section.message && <p className="result-card__message">{section.message}</p>}
      {section.diagnostics && section.diagnostics.length > 0 && (
        <ul className="section-diagnostics">
          {section.diagnostics.map((diagnostic) => (
            <li key={diagnostic}>{diagnostic}</li>
          ))}
        </ul>
      )}

      <SectionGroupedTables section={section} />

      {section.items.length > 0 ? (
        <ul className="check-items">
          {section.items.map((item) => (
            <CheckItemRow item={item} key={item.key} />
          ))}
        </ul>
      ) : (
        <p className="result-card__message">Для раздела пока проверяется только доступность страницы.</p>
      )}
    </article>
  );
}

function SectionGroupedTables({ section }: { section: CheckReportSection }) {
  const groups = buildSectionGroups(section);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="grouped-tables">
      {groups.map((group) => (
        <article className="grouped-table-card" key={group.parentItemprop}>
          <div className="grouped-table-card__heading">
            <div>
              <p className="eyebrow">{group.parent.ruleNumber ? `Пункт ${group.parent.ruleNumber}` : group.parent.itemprop}</p>
              <h4>{group.parent.title}</h4>
              {group.parent.ruleHint && <p>{group.parent.ruleHint}</p>}
            </div>
            <span>{group.rows.length} строк</span>
          </div>
          <div className="grouped-table-wrap">
            <table className="grouped-table">
              <thead>
                <tr>
                  <th>№</th>
                  {group.children.map((child) => (
                    <th key={child.key}>
                      {child.ruleNumber && <span>{child.ruleNumber}</span>}
                      {child.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.index}>
                    <td>{row.index}</td>
                    {group.children.map((child) => {
                      const instance = child.instances?.find((item) => item.index === row.index);

                      return (
                        <td className={instance ? `grouped-cell grouped-cell--${instance.status}` : "grouped-cell grouped-cell--missing"} key={child.key}>
                          <strong>{child.itemprop}</strong>
                          {instance?.href ? (
                            <a href={instance.href} rel="noreferrer" target="_blank">
                              {instance.value || instance.href}
                            </a>
                          ) : (
                            <span>{instance?.value || instance?.message || "не найдено"}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}

function buildSectionGroups(section: CheckReportSection): Array<{
  parentItemprop: string;
  parent: CheckResultItem;
  children: CheckResultItem[];
  rows: Array<{ index: number }>;
}> {
  const groupedParents = [...new Set(section.items.flatMap((item) => (item.parentItemprop && item.instances?.length ? [item.parentItemprop] : [])))];

  return groupedParents.flatMap((parentItemprop) => {
    const parent = section.items.find((item) => item.itemprop === parentItemprop);
    const children = section.items.filter((item) => item.parentItemprop === parentItemprop && item.instances && item.instances.length > 0);

    if (!parent || children.length === 0) {
      return [];
    }

    const rowIndexes = [
      ...new Set(children.flatMap((child) => child.instances?.map((instance) => instance.index) ?? []))
    ].sort((left, right) => left - right);

    return [
      {
        parentItemprop,
        parent,
        children,
        rows: rowIndexes.map((index) => ({ index }))
      }
    ];
  });
}

function CheckItemRow({ item }: { item: CheckResultItem }) {
  return (
    <li className={`check-item check-item--${item.status}`}>
      <span className="status-dot" aria-hidden="true" />
      <div>
        <div className="check-item__heading">
          {item.ruleNumber && <span className="rule-number">{item.ruleNumber}</span>}
          <strong>{item.title}</strong>
        </div>
        <p>{item.message}</p>
        {item.ruleHint && <p className="item-hint">{item.ruleHint}</p>}
        {item.quality?.suggestion && <p>{item.quality.suggestion}</p>}
        <div className="item-meta">
          {item.parentItemprop && <span>родитель: itemprop="{item.parentItemprop}"</span>}
          {item.itemprop && <span>itemprop="{item.itemprop}"</span>}
          {item.layout && <span>{layoutLabel(item.layout)}</span>}
          {item.weight && <span>вес {item.weight}</span>}
        </div>
        {item.value && <small>{item.value}</small>}
        {item.instances && item.instances.length > 0 && <ItemInstancesTable item={item} />}
        {item.legalSource && <LegalReferenceView reference={item.legalSource} compact />}
      </div>
    </li>
  );
}

function ItemInstancesTable({ item }: { item: CheckResultItem }) {
  return (
    <div className="instances-table-wrap">
      <table className="instances-table">
        <thead>
          <tr>
            <th>Строка</th>
            <th>Статус</th>
            <th>{item.itemprop ?? item.key}</th>
          </tr>
        </thead>
        <tbody>
          {item.instances?.map((instance) => (
            <tr className={`instances-table__row instances-table__row--${instance.status}`} key={instance.index}>
              <td>{instance.index}</td>
              <td>{instanceStatusLabel(instance.status)}</td>
              <td>
                {instance.href ? (
                  <a href={instance.href} rel="noreferrer" target="_blank">
                    {instance.value || instance.href}
                  </a>
                ) : (
                  instance.value || instance.message || "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RatingPage({ navigate }: { navigate: (path: string) => void }) {
  const [run, setRun] = React.useState<RatingRunDetails | null>(null);
  const [siteLists, setSiteLists] = React.useState<SiteList[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<"all" | RatingSiteStatus>("all");
  const [query, setQuery] = React.useState("");
  const [selectedSiteListId, setSelectedSiteListId] = React.useState("");
  const [settings, setSettings] = React.useState<RatingSettings>({
    concurrency: 3,
    retries: 1,
    pageTimeoutMs: 7000,
    resourceTimeoutMs: 4000,
    maxAddRefPages: 3,
    checkResourceLinks: false
  });
  const [importTitle, setImportTitle] = React.useState("");
  const [importContent, setImportContent] = React.useState("");
  const [selectedReport, setSelectedReport] = React.useState<CheckReport | null>(null);
  const [updateInfo, setUpdateInfo] = React.useState<UpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = React.useState(false);

  const isRunning = run?.status === "running";

  React.useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [nextRun, lists] = await Promise.all([fetchLatestRatingRun(), fetchSiteLists()]);
        if (isMounted) {
          setRun(nextRun);
          setSiteLists(lists);
          setSelectedSiteListId((current) => current || lists[0]?.id || "");
          setError(null);
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "Не удалось загрузить рейтинг");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();
    const interval = window.setInterval(() => void load(), isRunning ? 3500 : 9000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [isRunning]);

  async function handleStart(reset = false) {
    setIsActionLoading(true);
    setError(null);

    try {
      const nextRun = await postRatingAction("/api/rating-runs/start", {
        reset,
        siteListId: selectedSiteListId || undefined,
        settings
      });
      setRun(nextRun);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось запустить рейтинг");
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleImportSites(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsActionLoading(true);
    setError(null);

    try {
      const created = await createSiteList(importTitle, importContent);
      const lists = await fetchSiteLists();
      setSiteLists(lists);
      setSelectedSiteListId(created.id);
      setImportTitle("");
      setImportContent("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось импортировать список");
    } finally {
      setIsActionLoading(false);
    }
  }

  async function openRatingReport(result: RatingResult) {
    setError(null);

    try {
      const report = await fetchRatingResultReport(result.id);
      setSelectedReport(report);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Подробный отчет пока недоступен");
    }
  }

  async function handleCheckUpdate() {
    setIsCheckingUpdate(true);
    setError(null);

    try {
      setUpdateInfo(await fetchUpdateInfo());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось проверить обновления");
    } finally {
      setIsCheckingUpdate(false);
    }
  }

  async function handlePause() {
    setIsActionLoading(true);
    setError(null);

    try {
      const nextRun = await postRatingAction("/api/rating-runs/pause");
      setRun(nextRun);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось поставить рейтинг на паузу");
    } finally {
      setIsActionLoading(false);
    }
  }

  const progressPercent = run && run.total > 0 ? Math.round(((run.checked + run.failed) / run.total) * 100) : 0;
  const filteredResults = (run?.results ?? []).filter((result) => {
    const matchesStatus = statusFilter === "all" || result.status === statusFilter;
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      normalizedQuery.length === 0 ||
      result.siteUrl.toLowerCase().includes(normalizedQuery) ||
      (result.normalizedUrl?.toLowerCase().includes(normalizedQuery) ?? false);

    return matchesStatus && matchesQuery;
  });

  return (
    <main className="checker-page">
      <section className="checker-hero">
        <div className="checker-hero__content">
          <div className="top-links">
            <a
              className="back-link"
              href="/"
              onClick={(event) => {
                event.preventDefault();
                navigate("/");
              }}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              На главную
            </a>
            <a
              className="back-link"
              href="/check"
              onClick={(event) => {
                event.preventDefault();
                navigate("/check");
              }}
            >
              <Search size={18} aria-hidden="true" />
              Локальная проверка сайта
            </a>
          </div>
          <div>
            <p className="eyebrow">Массовая проверка</p>
            <h1>Рейтинг сайтов образовательных организаций</h1>
            <p className="hero__lead">
              Проверка выполняется локально по списку `obr-sites.txt`. Каждый сайт сохраняется в SQLite сразу после
              обработки, поэтому прогон можно поставить на паузу и продолжить позже с первого незавершённого адреса.
              Если у пользователя пропал интернет, текущий сайт помечается отдельно и не попадает в проверенные.
            </p>
          </div>
        </div>
      </section>

      <section className="section rating-page">
        {isLoading && <div className="loading-card">Загружаем состояние рейтинга...</div>}
        {error && (
          <div className="error-card">
            <XCircle size={24} aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="rating-actions">
          <button className="action-button" disabled={isActionLoading || isRunning} onClick={() => void handleStart(false)} type="button">
            {isActionLoading && !isRunning ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <PlayCircle size={18} aria-hidden="true" />}
            {run ? "Продолжить проверку" : "Начать рейтинг"}
          </button>
          <button className="secondary-action" disabled={isActionLoading || !isRunning} onClick={() => void handlePause()} type="button">
            <PauseCircle size={18} aria-hidden="true" />
            Пауза
          </button>
          <button className="secondary-action" disabled={isActionLoading || isRunning} onClick={() => void handleStart(true)} type="button">
            <RotateCcw size={18} aria-hidden="true" />
            Новый запуск
          </button>
          <button className="secondary-action" disabled={isCheckingUpdate} onClick={() => void handleCheckUpdate()} type="button">
            {isCheckingUpdate ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
            Проверить обновления
          </button>
        </div>

        {updateInfo && (
          <div className={updateInfo.updateAvailable ? "warning" : "loading-card"}>
            <Download size={22} aria-hidden="true" />
            <span>
              Текущая версия: {updateInfo.currentVersion}. Последняя версия: {updateInfo.latestVersion ?? "не определена"}.
              {updateInfo.updateAvailable && updateInfo.downloadUrl && (
                <>
                  {" "}
                  <a href={updateInfo.downloadUrl} rel="noreferrer" target="_blank">
                    Скачать новый exe
                  </a>
                </>
              )}
              {updateInfo.error && <> Ошибка проверки: {updateInfo.error}</>}
            </span>
          </div>
        )}

        <div className="rating-settings">
          <div className="rating-settings__panel">
            <div className="section__heading">
              <p className="eyebrow">Список сайтов</p>
              <h2>Источник рейтинга</h2>
            </div>
            <label>
              Активный список
              <select value={selectedSiteListId} onChange={(event) => setSelectedSiteListId(event.target.value)} disabled={isRunning}>
                {siteLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title} — {list.total} сайтов
                  </option>
                ))}
              </select>
            </label>
            <form className="site-import-form" onSubmit={handleImportSites}>
              <label>
                Название нового списка
                <input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} placeholder="Например, школы улуса" />
              </label>
              <label>
                Сайты, по одному адресу в строке
                <textarea
                  value={importContent}
                  onChange={(event) => setImportContent(event.target.value)}
                  placeholder="https://example.edu.ru&#10;https://school.example.ru"
                  rows={5}
                />
              </label>
              <button className="secondary-action" disabled={isActionLoading || isRunning || importContent.trim().length === 0} type="submit">
                <Upload size={18} aria-hidden="true" />
                Импортировать список
              </button>
            </form>
          </div>

          <div className="rating-settings__panel">
            <div className="section__heading">
              <p className="eyebrow">Скорость и глубина</p>
              <h2>Настройки проверки</h2>
            </div>
            <div className="settings-grid">
              <NumberSetting label="Параллельно сайтов" max={8} min={1} value={settings.concurrency} onChange={(value) => setSettings({ ...settings, concurrency: value })} />
              <NumberSetting label="Повторов при ошибке" max={3} min={0} value={settings.retries} onChange={(value) => setSettings({ ...settings, retries: value })} />
              <NumberSetting label="Таймаут страницы, мс" max={20000} min={3000} step={1000} value={settings.pageTimeoutMs} onChange={(value) => setSettings({ ...settings, pageTimeoutMs: value })} />
              <NumberSetting label="Доп. страниц addRef" max={10} min={0} value={settings.maxAddRefPages} onChange={(value) => setSettings({ ...settings, maxAddRefPages: value })} />
            </div>
            <label className="toggle-row">
              <input
                checked={settings.checkResourceLinks}
                onChange={(event) => setSettings({ ...settings, checkResourceLinks: event.target.checked })}
                type="checkbox"
              />
              Глубоко проверять открытие ссылок на документы
            </label>
          </div>
        </div>

        {run ? (
          <>
            <div className="rating-summary">
              <div>
                <p className="eyebrow">{ratingStatusLabel(run.status)}</p>
                <h2>{run.title}</h2>
                <p>
                  Список: {run.sourceName}. Создан: {new Date(run.createdAt).toLocaleString("ru-RU")}.
                  <br />
                  Последнее обновление: {new Date(run.updatedAt).toLocaleString("ru-RU")}.
                </p>
              </div>
              <div className="score-ring" aria-label={`Прогресс рейтинга ${progressPercent}%`}>
                {progressPercent}%
              </div>
            </div>

            <div className="summary-strip">
              <SummaryBadge label="Всего сайтов" value={run.total} />
              <SummaryBadge label="Проверено" value={run.checked} tone="found" />
              <SummaryBadge label="Ошибки" value={run.failed} tone="missing" />
              <SummaryBadge label="Нет интернета" value={run.noInternet} tone="partial" />
              <SummaryBadge label="Осталось" value={run.pending} tone="partial" />
              <SummaryBadge label="Средний балл" value={run.averageScore ?? 0} />
            </div>

            <div className="rating-meta-strip">
              <span>
                <Settings size={17} aria-hidden="true" />
                Потоков: {run.settings.concurrency}, повторов: {run.settings.retries}, документы:{" "}
                {run.settings.checkResourceLinks ? "глубоко" : "быстро"}
              </span>
              <span>
                <Clock size={17} aria-hidden="true" />
                ETA: {run.etaSeconds === null ? "пока неизвестно" : formatDuration(run.etaSeconds)}
              </span>
              {run.status === "offline" && (
                <span className="rating-offline">
                  <WifiOff size={17} aria-hidden="true" />
                  {run.error ?? "Нет подключения к интернету"}
                </span>
              )}
            </div>

            <div className="rating-progress" aria-label={`Проверено ${progressPercent}%`}>
              <span style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="rating-tools">
              <label>
                Поиск сайта
                <input
                  placeholder="Например, school или obr.sakha.gov.ru"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="recommendation-filters" aria-label="Фильтр статуса сайтов">
                {ratingFilters.map((filter) => (
                  <button
                    className={statusFilter === filter.value ? "filter-button filter-button--active" : "filter-button"}
                    key={filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rating-analytics">
              <AnalyticsCard title="Распределение баллов" items={run.analytics.scoreBuckets.map((item) => ({ key: item.label, title: item.label, count: item.count }))} />
              <AnalyticsCard title="Частые недочёты" items={run.analytics.topMissingItems} />
              <AnalyticsCard title="Частые ошибки" items={run.analytics.topErrorMessages} />
            </div>

            <div className="rating-table-card">
              <div className="rating-table-card__header">
                <div>
                  <p className="eyebrow">Результаты</p>
                  <h2>{filteredResults.length} сайтов</h2>
                </div>
                <Trophy size={28} aria-hidden="true" />
              </div>
              <div className="rating-table-wrap">
                <table className="rating-table">
                  <thead>
                    <tr>
                      <th>Место</th>
                      <th>Сайт</th>
                      <th>Готовность</th>
                      <th>Статус</th>
                      <th>Дата</th>
                      <th>Сводка</th>
                      <th>Детали</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((result, index) => (
                      <tr key={result.id}>
                        <td>{result.score === null ? "-" : index + 1}</td>
                        <td>
                          <a href={result.normalizedUrl ?? result.siteUrl} rel="noreferrer" target="_blank">
                            {result.normalizedUrl ?? result.siteUrl}
                          </a>
                          {result.error && <small>{result.error}</small>}
                        </td>
                        <td>
                          <strong>{result.score === null ? "-" : `${result.score}%`}</strong>
                        </td>
                        <td>
                          <span className={`rating-status rating-status--${result.status}`}>{ratingSiteStatusLabel(result.status)}</span>
                        </td>
                        <td>{result.checkedAt ? new Date(result.checkedAt).toLocaleString("ru-RU") : "-"}</td>
                        <td>{result.summary ? ratingSummaryText(result.summary) : "-"}</td>
                        <td>
                          <button
                            className="table-action"
                            disabled={result.status !== "checked"}
                            onClick={() => void openRatingReport(result)}
                            type="button"
                          >
                            <Eye size={16} aria-hidden="true" />
                            Отчёт
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          !isLoading && (
            <div className="loading-card">
              Рейтинг ещё не запускался. Нажмите «Начать рейтинг», чтобы создать проверку по списку сайтов.
            </div>
          )
        )}
        {selectedReport && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Подробный отчёт сайта">
            <div className="report-modal">
              <div className="report-modal__header">
                <div>
                  <p className="eyebrow">Подробный отчёт</p>
                  <h2>{selectedReport.siteUrl}</h2>
                </div>
                <button className="secondary-action" onClick={() => setSelectedReport(null)} type="button">
                  Закрыть
                </button>
              </div>
              <CheckReportView report={selectedReport} navigate={navigate} />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function RecommendationsPage({ report, navigate }: { report: CheckReport | null; navigate: (path: string) => void }) {
  const [filter, setFilter] = React.useState<RecommendationFilter>("all");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const recommendations = React.useMemo(() => (report ? buildRecommendations(report) : []), [report]);
  const filteredRecommendations = recommendations.filter((recommendation) => matchesRecommendationFilter(recommendation, filter));
  const highCount = recommendations.filter((recommendation) => recommendation.priority === "high").length;
  const mediumCount = recommendations.filter((recommendation) => recommendation.priority === "medium").length;
  const lowCount = recommendations.filter((recommendation) => recommendation.priority === "low").length;

  async function copyExample(recommendation: Recommendation) {
    await copyText(recommendation.exampleHtml);
    setCopiedId(recommendation.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  if (!report) {
    return (
      <main className="checker-page">
        <section className="checker-hero">
          <div className="checker-hero__content">
            <a
              className="back-link"
              href="/"
              onClick={(event) => {
                event.preventDefault();
                navigate("/");
              }}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              На главную
            </a>
            <div>
              <p className="eyebrow">Рекомендации</p>
              <h1>Рекомендации по исправлениям</h1>
              <p className="hero__lead">Сначала выполните проверку сайта на странице “Локальная проверка сайта”.</p>
            </div>
            <a
              className="button button--primary empty-action"
              href="/check"
              onClick={(event) => {
                event.preventDefault();
                navigate("/check");
              }}
            >
              <Search size={20} aria-hidden="true" />
              Перейти к проверке
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="checker-page">
      <section className="checker-hero">
        <div className="checker-hero__content">
          <div className="top-links">
            <a
              className="back-link"
              href="/check"
              onClick={(event) => {
                event.preventDefault();
                navigate("/check");
              }}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              Назад к проверке
            </a>
            <a
              className="back-link"
              href="/"
              onClick={(event) => {
                event.preventDefault();
                navigate("/");
              }}
            >
              На главную
            </a>
          </div>
          <div>
            <p className="eyebrow">Следующий шаг после отчёта</p>
            <h1>Рекомендации по исправлениям</h1>
            <p className="hero__lead">
              Карточки сформированы из последнего отчёта проверки: missing, partial, empty, invalid, document_error и
              error. Все рекомендации справочные и помогают подготовить сайт к официальной проверке.
            </p>
          </div>
        </div>
      </section>

      <section className="section recommendations-page">
        <div className="recommendations-summary">
          <div>
            <p className="eyebrow">Сводка</p>
            <h2>{report.overallScore}% готовности</h2>
            <p>
              Сайт: {report.siteUrl}
              <br />
              Дата проверки: {new Date(report.checkedAt).toLocaleString("ru-RU")}
            </p>
          </div>
          <div className="summary-strip">
            <SummaryBadge label="Всего проблем" value={recommendations.length} tone="missing" />
            <SummaryBadge label="Срочно" value={highCount} tone="missing" />
            <SummaryBadge label="Желательно" value={mediumCount} tone="partial" />
            <SummaryBadge label="Низкий приоритет" value={lowCount} />
          </div>
        </div>

        {report.fixPlan && report.fixPlan.length > 0 && (
          <div className="diagnostics-card diagnostics-card--plan">
            <div>
              <p className="eyebrow">План исправлений</p>
              <h3>С чего начать</h3>
            </div>
            <ol>
              {report.fixPlan.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="recommendation-filters" aria-label="Фильтры рекомендаций">
          {recommendationFilters.map((item) => (
            <button
              className={filter === item.value ? "filter-button filter-button--active" : "filter-button"}
              key={item.value}
              onClick={() => setFilter(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {filteredRecommendations.length === 0 ? (
          <div className="loading-card">По выбранному фильтру рекомендаций нет.</div>
        ) : (
          <div className="recommendation-groups">
            <RecommendationGroup
              recommendations={filteredRecommendations.filter((recommendation) => recommendation.priority === "high")}
              title="Срочно исправить"
              copiedId={copiedId}
              onCopy={copyExample}
            />
            <RecommendationGroup
              recommendations={filteredRecommendations.filter((recommendation) => recommendation.priority === "medium")}
              title="Желательно исправить"
              copiedId={copiedId}
              onCopy={copyExample}
            />
            <RecommendationGroup
              recommendations={filteredRecommendations.filter((recommendation) => recommendation.priority === "low")}
              title="Низкий приоритет"
              copiedId={copiedId}
              onCopy={copyExample}
            />
          </div>
        )}
      </section>
    </main>
  );
}

function RecommendationGroup({
  recommendations,
  title,
  copiedId,
  onCopy
}: {
  recommendations: Recommendation[];
  title: string;
  copiedId: string | null;
  onCopy: (recommendation: Recommendation) => Promise<void>;
}) {
  if (recommendations.length === 0) {
    return null;
  }

  return (
    <section className="recommendation-group">
      <div className="section__heading">
        <p className="eyebrow">{recommendations.length} проблем</p>
        <h2>{title}</h2>
      </div>
      <div className="recommendation-list">
        {recommendations.map((recommendation) => (
          <article className={`recommendation-card recommendation-card--${recommendation.priority}`} key={recommendation.id}>
            <div className="recommendation-card__header">
              <div>
                <p className="recommendation-card__section">{recommendation.sectionTitle}</p>
                <h3>{recommendation.itemTitle}</h3>
                <a href={recommendation.sectionUrl} target="_blank" rel="noreferrer">
                  {recommendation.sectionUrl}
                </a>
              </div>
              <div className="recommendation-tags">
                <span>{statusLabel(recommendation.status)}</span>
                <span>{priorityLabel(recommendation.priority)}</span>
              </div>
            </div>

            <dl className="recommendation-details">
              <div>
                <dt>itemprop</dt>
                <dd>{recommendation.itemprop}</dd>
              </div>
              {recommendation.ruleNumber && (
                <div>
                  <dt>Пункт методички</dt>
                  <dd>{methodicalTableLabel(recommendation.sectionId)}, пункт {recommendation.ruleNumber}</dd>
                </div>
              )}
              {recommendation.ruleHint && (
                <div>
                  <dt>Как размещать</dt>
                  <dd>{recommendation.ruleHint}</dd>
                </div>
              )}
              {recommendation.legalSource && (
                <div>
                  <dt>Нормативное основание</dt>
                  <dd>
                    <LegalReferenceView reference={recommendation.legalSource} />
                  </dd>
                </div>
              )}
              <div>
                <dt>Проблема</dt>
                <dd>{recommendation.problem}</dd>
              </div>
              {recommendation.quality?.suggestion && (
                <div>
                  <dt>Проверка качества</dt>
                  <dd>{recommendation.quality.suggestion}</dd>
                </div>
              )}
              <div>
                <dt>Почему это важно</dt>
                <dd>{whyImportant(recommendation)}</dd>
              </div>
              <div>
                <dt>Как исправить</dt>
                <dd>{recommendation.recommendation}</dd>
              </div>
            </dl>

            <div className="code-example">
              <div className="code-example__header">
                <span>Пример HTML</span>
                <button className="copy-button" onClick={() => void onCopy(recommendation)} type="button">
                  <Clipboard size={17} aria-hidden="true" />
                  {copiedId === recommendation.id ? "Скопировано" : "Скопировать пример"}
                </button>
              </div>
              <pre>
                <code>{recommendation.exampleHtml}</code>
              </pre>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LegalReferenceView({ reference, compact = false }: { reference: CheckLegalReference; compact?: boolean }) {
  return (
    <div className={compact ? "legal-reference legal-reference--compact" : "legal-reference"}>
      <strong>{reference.shortTitle ?? reference.title}</strong>
      <p>{reference.point}</p>
      <div className="legal-reference__links">
        {reference.localFileUrl && (
          <a href={reference.localFileUrl} rel="noreferrer" target="_blank">
            <FileCheck2 size={15} aria-hidden="true" />
            {compact ? "Документ" : reference.localFile ?? "Открыть документ"}
          </a>
        )}
        {reference.sourceUrl && (
          <a href={reference.sourceUrl} rel="noreferrer" target="_blank">
            <ExternalLink size={15} aria-hidden="true" />
            Официальный источник
          </a>
        )}
      </div>
    </div>
  );
}

function NumberSetting({
  label,
  max,
  min,
  onChange,
  step = 1,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <label>
      {label}
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

function AnalyticsCard({ items, title }: { items: RatingAnalyticsItem[]; title: string }) {
  return (
    <article className="analytics-card">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p>Данных пока нет.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              <span>{item.title}</span>
              <strong>{item.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function SummaryBadge({ label, value, tone }: { label: string; value: number; tone?: "found" | "partial" | "missing" }) {
  return (
    <div className={`summary-badge ${tone ? `summary-badge--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const recommendationFilters: Array<{ label: string; value: RecommendationFilter }> = [
  { label: "Все", value: "all" },
  { label: "Срочные", value: "high" },
  { label: "Желательные", value: "medium" },
  { label: "Низкий приоритет", value: "low" },
  { label: "Только отсутствующие", value: "missing" },
  { label: "Только пустые", value: "empty" },
  { label: "Только некорректные", value: "invalid" },
  { label: "Только документы", value: "document_error" },
  { label: "Только ошибки загрузки", value: "error" }
];

const ratingFilters: Array<{ label: string; value: "all" | RatingSiteStatus }> = [
  { label: "Все", value: "all" },
  { label: "Проверено", value: "checked" },
  { label: "Ошибки", value: "error" },
  { label: "Нет интернета", value: "no_internet" },
  { label: "В очереди", value: "pending" },
  { label: "Сейчас проверяется", value: "running" }
];

async function fetchLatestRatingRun(): Promise<RatingRunDetails | null> {
  const response = await fetch("/api/rating-runs/latest");

  if (!response.ok) {
    throw new Error("Не удалось получить состояние рейтинга");
  }

  return (await response.json()) as RatingRunDetails | null;
}

async function fetchSiteLists(): Promise<SiteList[]> {
  const response = await fetch("/api/site-lists");

  if (!response.ok) {
    throw new Error("Не удалось загрузить списки сайтов");
  }

  return (await response.json()) as SiteList[];
}

async function createSiteList(title: string, content: string): Promise<SiteList> {
  const response = await fetch("/api/site-lists", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ title, content, sourceName: "manual-import.txt" })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message ?? "Не удалось импортировать список сайтов");
  }

  return payload as SiteList;
}

async function fetchRatingResultReport(resultId: string): Promise<CheckReport> {
  const response = await fetch(`/api/rating-results/${encodeURIComponent(resultId)}/report`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message ?? "Подробный отчёт недоступен");
  }

  return payload as CheckReport;
}

async function fetchUpdateInfo(): Promise<UpdateInfo> {
  const response = await fetch("/api/updates/check");

  if (!response.ok) {
    throw new Error("Не удалось проверить обновления");
  }

  return (await response.json()) as UpdateInfo;
}

async function postRatingAction(path: string, body?: unknown): Promise<RatingRunDetails | null> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message ?? "Не удалось выполнить действие");
  }

  return payload as RatingRunDetails | null;
}

function ratingStatusLabel(status: RatingRunStatus): string {
  const labels: Record<RatingRunStatus, string> = {
    completed: "завершено",
    error: "ошибка",
    idle: "ожидает запуска",
    offline: "нет интернета",
    paused: "на паузе",
    running: "выполняется"
  };

  return labels[status];
}

function ratingSiteStatusLabel(status: RatingSiteStatus): string {
  const labels: Record<RatingSiteStatus, string> = {
    checked: "проверено",
    error: "ошибка",
    no_internet: "нет интернета",
    pending: "в очереди",
    running: "проверяется"
  };

  return labels[status];
}

function ratingSummaryText(summary: CheckSummary): string {
  const extras = [];
  if ((summary.invalid ?? 0) > 0) extras.push(`некорректно ${summary.invalid}`);
  if ((summary.documentErrors ?? 0) > 0) extras.push(`документы ${summary.documentErrors}`);

  return `найдено ${summary.found}, частично ${summary.partial}, нет ${summary.missing}, ошибок ${summary.errors}${
    extras.length > 0 ? `, ${extras.join(", ")}` : ""
  }`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }

  if (minutes > 0) {
    return `${minutes} мин ${rest} с`;
  }

  return `${rest} с`;
}

function buildRecommendations(report: CheckReport): Recommendation[] {
  return report.sections.flatMap((section) =>
    section.items
      .filter((item) =>
        item.status === "missing" ||
        item.status === "partial" ||
        item.status === "empty" ||
        item.status === "error" ||
        item.status === "invalid" ||
        item.status === "document_error"
      )
      .map((item) => {
        const itemprop = item.itemprop ?? item.key;
        const priority = calculatePriority(item);

        return {
          id: `${section.id}-${item.key}`,
          sectionId: section.id,
          sectionTitle: section.title,
          sectionUrl: section.url,
          itemKey: item.key,
          itemTitle: item.title,
          itemprop,
          ruleNumber: item.ruleNumber,
          ruleHint: item.ruleHint,
          layout: item.layout,
          status: item.status,
          severity: item.severity ?? "warning",
          priority,
          problem: recommendationProblem(item),
          recommendation: recommendationText(item, itemprop),
          exampleHtml: buildExampleHtml(itemprop, item.title, item.ruleType),
          legalSource: item.legalSource,
          problemType: item.problemType,
          quality: item.quality
        };
      })
  );
}

function legalFileUrl(id: string): string {
  return `/api/legal-sources/${encodeURIComponent(id)}/file`;
}

function calculatePriority(item: CheckResultItem): RecommendationPriority {
  if (
    item.status === "error" ||
    item.status === "document_error" ||
    item.status === "invalid" ||
    (item.status === "missing" && item.severity === "error")
  ) {
    return "high";
  }

  if ((item.status === "missing" && item.severity === "warning") || item.status === "partial" || item.status === "empty") {
    return "medium";
  }

  return "low";
}

function recommendationProblem(item: CheckResultItem): string {
  if (item.problemType === "document_unavailable" || item.status === "document_error") {
    return item.message || "Документ или ссылка на ресурс недоступны.";
  }

  if (item.problemType === "invalid_value" || item.status === "invalid") {
    return item.quality?.message ?? item.message ?? "Значение найдено, но выглядит некорректным.";
  }

  if (item.status === "error") {
    return "Страница раздела не загрузилась.";
  }

  if (item.status === "partial" || item.status === "empty") {
    return "Разметка itemprop найдена, но значение пустое.";
  }

  return "Пункт не найден на странице раздела.";
}

function recommendationText(item: CheckResultItem, itemprop: string): string {
  if (item.problemType === "document_unavailable" || item.status === "document_error") {
    return `Проверьте ссылку с itemprop="${itemprop}": файл должен открываться без авторизации, редиректа на ошибку или подмены HTML-страницей. Лучше указывать прямую ссылку на PDF/DOC/DOCX/XLS/XLSX.`;
  }

  if (item.problemType === "invalid_value" || item.status === "invalid") {
    return item.quality?.suggestion ?? `Исправьте значение внутри элемента с itemprop="${itemprop}", чтобы оно соответствовало ожидаемому формату.`;
  }

  if (item.status === "error") {
    return "Проверьте доступность страницы, правильность ссылки, HTTP-статус, редиректы, SSL-сертификат, настройки VPN/Proxy и доступность сайта с компьютера пользователя.";
  }

  if (item.status === "partial" || item.status === "empty") {
    return `Заполните значение внутри элемента с itemprop="${itemprop}". Не оставляйте пустые span, div, td или ссылки.`;
  }

  return `Добавьте соответствующий блок информации на страницу раздела и укажите itemprop="${itemprop}". Данные должны быть доступны в HTML-коде страницы без загрузки через внешние скрипты.`;
}

function buildExampleHtml(itemprop: string, title: string, ruleType?: "itemprop" | "itempropLink"): string {
  if (itemprop === "uchredLaw") {
    return `<tr itemprop="uchredLaw">
  <td itemprop="nameUchred">Наименование учредителя</td>
  <td itemprop="addressUchred">Сведения о юридическом адресе учредителя</td>
  <td itemprop="telUchred">+7 (41132) 00-0-00</td>
  <td itemprop="mailUchred">example@example.ru</td>
  <td><a itemprop="websiteUchred" href="https://example.ru">https://example.ru</a></td>
</tr>`;
  }

  if (itemprop.toLowerCase().includes("email")) {
    return `<a itemprop="${itemprop}" href="mailto:example@example.ru">example@example.ru</a>`;
  }

  if (itemprop.toLowerCase().includes("telephone") || itemprop.toLowerCase().includes("tel")) {
    return `<a itemprop="${itemprop}" href="tel:+74113200000">+7 (41132) 00-0-00</a>`;
  }

  if (ruleType === "itempropLink" || itemprop.includes("DocLink") || itemprop.includes("Link")) {
    return `<a itemprop="${itemprop}" href="/files/${itemprop}.pdf">${title}</a>`;
  }

  return `<span itemprop="${itemprop}">${title}</span>`;
}

function matchesRecommendationFilter(recommendation: Recommendation, filter: RecommendationFilter): boolean {
  if (filter === "all") return true;
  if (filter === "high" || filter === "medium" || filter === "low") return recommendation.priority === filter;
  if (filter === "empty") return recommendation.status === "empty" || recommendation.status === "partial";
  return recommendation.status === filter;
}

function statusLabel(status: CheckItemStatus): string {
  const labels: Record<CheckItemStatus, string> = {
    found: "готово",
    partial: "частично",
    empty: "пусто",
    missing: "не найдено",
    error: "ошибка",
    invalid: "некорректно",
    document_error: "документ недоступен",
    not_applicable: "неприменимо"
  };

  return labels[status];
}

function instanceStatusLabel(status: CheckResultInstance["status"]): string {
  const labels: Record<CheckResultInstance["status"], string> = {
    empty: "пусто",
    found: "найдено",
    missing: "нет"
  };

  return labels[status];
}

function layoutLabel(layout: NonNullable<CheckResultItem["layout"]>): string {
  const labels: Record<NonNullable<CheckResultItem["layout"]>, string> = {
    link: "ссылка/документ",
    table: "таблица или повторяемый список",
    table_row: "строка таблицы",
    text: "текстовое значение"
  };

  return labels[layout];
}

function methodicalTableLabel(sectionId: string): string {
  const labels: Record<string, string> = {
    common: "Таблица 3.2.1",
    document: "Таблица 3.4.1",
    struct: "Таблица 3.3.1",
    education: "Таблица 3.5.1",
    eduStandarts: "Таблица 3.6.1",
    managers: "Таблица 3.7.1",
    employees: "Таблица 3.8.1",
    objects: "Таблица 3.9.1",
    grants: "Таблица 3.10.1",
    paid_edu: "Таблица 3.11.1",
    budget: "Таблица 3.12.1",
    vacant: "Таблица 3.13.1",
    inter: "Таблица 3.14.1",
    catering: "Таблица 3.15.1"
  };

  return labels[sectionId] ?? "Таблица методических рекомендаций";
}

function priorityLabel(priority: RecommendationPriority): string {
  const labels: Record<RecommendationPriority, string> = {
    high: "срочно",
    medium: "желательно",
    low: "низкий приоритет"
  };

  return labels[priority];
}

function whyImportant(recommendation: Recommendation): string {
  if (recommendation.legalSource) {
    return `Пункт связан с нормативным основанием: ${recommendation.legalSource.point}`;
  }

  if (recommendation.status === "error") {
    return "Если страница не открывается, автоматизированная проверка не сможет прочитать сведения раздела.";
  }

  return `Пункт относится к раскрытию сведений раздела «${recommendation.sectionTitle}». Без корректного itemprop автоматическая проверка может не распознать размещённую информацию.`;
}

function withPreviousComparison(report: CheckReport): CheckReport {
  const previous = readReportHistory()[report.siteUrl];

  if (!previous) {
    return { ...report, previousComparison: null };
  }

  return {
    ...report,
    previousComparison: {
      previousCheckedAt: previous.checkedAt,
      previousScore: previous.overallScore,
      delta: report.overallScore - previous.overallScore
    }
  };
}

function storeReportHistory(report: CheckReport): void {
  try {
    const history = readReportHistory();
    history[report.siteUrl] = {
      checkedAt: report.checkedAt,
      overallScore: report.overallScore
    };
    localStorage.setItem(REPORT_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // История сравнения вспомогательная: ошибка записи не должна ломать проверку.
  }
}

function readReportHistory(): Record<string, { checkedAt: string; overallScore: number }> {
  try {
    const rawHistory = localStorage.getItem(REPORT_HISTORY_STORAGE_KEY);
    return rawHistory ? (JSON.parse(rawHistory) as Record<string, { checkedAt: string; overallScore: number }>) : {};
  } catch {
    return {};
  }
}

function formatScoreDelta(delta: number): string {
  if (delta === 0) {
    return "0%";
  }

  return `${delta > 0 ? "+" : ""}${delta}%`;
}

function readStoredReport(): CheckReport | null {
  try {
    const rawReport = localStorage.getItem(LAST_REPORT_STORAGE_KEY);
    return rawReport ? (JSON.parse(rawReport) as CheckReport) : null;
  } catch {
    return null;
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function useLegalSources(): [LegalSource[], (sources: LegalSource[]) => void] {
  const [legalSources, setLegalSources] = React.useState<LegalSource[]>([]);

  React.useEffect(() => {
    fetch("/api/legal-sources")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Cannot load legal sources");
        }

        return response.json() as Promise<LegalSource[]>;
      })
      .then(setLegalSources)
      .catch(() => setLegalSources([]));
  }, []);

  return [legalSources, setLegalSources];
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
