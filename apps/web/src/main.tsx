import * as React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clipboard,
  Database,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  MonitorCheck,
  PlayCircle,
  Search,
  ShieldCheck,
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

type CheckItemStatus = "found" | "partial" | "empty" | "missing" | "error";

type CheckSummary = {
  total: number;
  found: number;
  partial: number;
  missing: number;
  errors: number;
};

type CheckResultItem = {
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

type CheckReportSection = {
  id: string;
  title: string;
  url: string;
  status: "checked" | "error";
  score: number;
  summary: CheckSummary;
  items: CheckResultItem[];
  message?: string;
};

type CheckReport = {
  siteUrl: string;
  checkedAt: string;
  overallScore: number;
  summary: CheckSummary;
  sections: CheckReportSection[];
};

type RecommendationPriority = "high" | "medium" | "low";

type RecommendationFilter = "all" | "high" | "medium" | "low" | "missing" | "empty" | "error";

type Recommendation = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  sectionUrl: string;
  itemKey: string;
  itemTitle: string;
  itemprop: string;
  status: CheckItemStatus;
  severity: "error" | "warning" | "info";
  priority: RecommendationPriority;
  problem: string;
  recommendation: string;
  exampleHtml: string;
  legalSource?: CheckLegalReference;
};

const LAST_REPORT_STORAGE_KEY = "sveden_checker_last_report";

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
  "Структура и органы управления",
  "Документы",
  "Образование",
  "Руководство",
  "Материально-техническое обеспечение",
  "Доступная среда",
  "Платные образовательные услуги",
  "Финансово-хозяйственная деятельность",
  "Вакантные места",
  "Стипендии",
  "Организация питания",
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

      const nextReport = payload as CheckReport;
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
      </div>

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

      <div className="section-results">
        {report.sections.map((section) => (
          <article className={`result-card result-card--${section.status}`} key={section.id}>
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
            </div>

            {section.message && <p className="result-card__message">{section.message}</p>}

            {section.items.length > 0 ? (
              <ul className="check-items">
                {section.items.map((item) => (
                  <li className={`check-item check-item--${item.status}`} key={item.key}>
                    <span className="status-dot" aria-hidden="true" />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      {item.value && <small>{item.value}</small>}
                      {item.legalSource && <LegalReferenceView reference={item.legalSource} compact />}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="result-card__message">Для раздела пока проверяется только доступность страницы.</p>
            )}
          </article>
        ))}
      </div>
    </div>
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
              Карточки сформированы из последнего отчёта проверки: missing, partial, empty и error. Все рекомендации
              справочные и помогают подготовить сайт к официальной проверке.
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
  { label: "Только ошибки загрузки", value: "error" }
];

function buildRecommendations(report: CheckReport): Recommendation[] {
  return report.sections.flatMap((section) =>
    section.items
      .filter((item) => item.status === "missing" || item.status === "partial" || item.status === "empty" || item.status === "error")
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
          status: item.status,
          severity: item.severity ?? "warning",
          priority,
          problem: recommendationProblem(item.status),
          recommendation: recommendationText(item.status, itemprop),
          exampleHtml: buildExampleHtml(itemprop, item.title, item.ruleType),
          legalSource: item.legalSource
        };
      })
  );
}

function legalFileUrl(id: string): string {
  return `/api/legal-sources/${encodeURIComponent(id)}/file`;
}

function calculatePriority(item: CheckResultItem): RecommendationPriority {
  if (item.status === "error" || (item.status === "missing" && item.severity === "error")) {
    return "high";
  }

  if ((item.status === "missing" && item.severity === "warning") || item.status === "partial" || item.status === "empty") {
    return "medium";
  }

  return "low";
}

function recommendationProblem(status: CheckItemStatus): string {
  if (status === "error") {
    return "Страница раздела не загрузилась.";
  }

  if (status === "partial" || status === "empty") {
    return "Разметка itemprop найдена, но значение пустое.";
  }

  return "Пункт не найден на странице раздела.";
}

function recommendationText(status: CheckItemStatus, itemprop: string): string {
  if (status === "error") {
    return "Проверьте доступность страницы, правильность ссылки, HTTP-статус, редиректы, SSL-сертификат, настройки VPN/Proxy и доступность сайта с компьютера пользователя.";
  }

  if (status === "partial" || status === "empty") {
    return `Заполните значение внутри элемента с itemprop="${itemprop}". Не оставляйте пустые span, div, td или ссылки.`;
  }

  return `Добавьте соответствующий блок информации на страницу раздела и укажите itemprop="${itemprop}". Данные должны быть доступны в HTML-коде страницы без загрузки через внешние скрипты.`;
}

function buildExampleHtml(itemprop: string, title: string, ruleType?: "itemprop" | "itempropLink"): string {
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
  return recommendation.status === filter;
}

function statusLabel(status: CheckItemStatus): string {
  const labels: Record<CheckItemStatus, string> = {
    found: "готово",
    partial: "частично",
    empty: "пусто",
    missing: "не найдено",
    error: "ошибка"
  };

  return labels[status];
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
