import Fastify from "fastify";
import { access, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { getLegalSources, openDatabase } from "@sveden-checker/database";
import type { CheckReport, CheckRequest, ProjectInfo } from "@sveden-checker/shared";
import { checkSvedenSite } from "./checker.js";

const app = Fastify({
  logger: true
});

openDatabase();

app.get("/api/health", async () => ({
  status: "ok",
  app: "sveden-checker"
}));

app.get("/api/legal-sources", async () => getLegalSources());

app.get("/api/project-info", async (): Promise<ProjectInfo> => ({
  name: "Sveden Checker",
  version: "0.1.0",
  purpose:
    "Локальное веб-приложение для предварительной самопроверки раздела «Сведения об образовательной организации» на сайте образовательной организации.",
  warning:
    "Sveden Checker не является официальной АИС «Мониторинг», не связан с Рособрнадзором и не заменяет официальную проверку.",
  workflow: [
    "Пользователь вводит адрес сайта.",
    "Локальный backend скачивает открытые страницы сайта.",
    "Парсер анализирует HTML-разметку и itemprop.",
    "Правила сверяют найденные сведения с локальной нормативной базой.",
    "Пользователь получает предварительный отчет."
  ],
  aisMonitoringInstruction:
    "Для официальной работы с АИС «Мониторинг» образовательной организации необходимо получить доступ в установленном порядке. Как правило, нужно обратиться к актуальной информации на официальном сайте Рособрнадзора, найти форму заявки на предоставление доступа к АИС «Мониторинг», заполнить сведения об организации и ответственном сотруднике, затем дождаться предоставления доступа или ответа уполномоченных специалистов. Порядок подключения, форма заявки и контактные данные могут меняться, поэтому перед подачей заявки нужно сверяться с актуальной информацией на официальном сайте Рособрнадзора.",
  legalSources: getLegalSources()
}));

app.post<{ Body: CheckRequest }>("/api/check", async (request, reply): Promise<CheckReport> => {
  try {
    return await checkSvedenSite(request.body.url);
  } catch (error) {
    return reply.status(400).send({
      error: "invalid_url",
      message: error instanceof Error ? error.message : "Не удалось обработать URL"
    }) as never;
  }
});

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith("/api/")) {
    return reply.status(404).send({
      error: "not_found",
      message: "API endpoint not found"
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return reply.status(404).send();
  }

  const staticRoot = process.env.SVEDEN_CHECKER_WEB_DIR ?? join(process.cwd(), "apps", "web", "dist");
  const requestedPath = decodeURIComponent(request.url.split("?")[0] ?? "/");
  const normalizedPath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = join(staticRoot, normalizedPath);
  const fallbackPath = join(staticRoot, "index.html");
  const pathToServe = await fileExists(filePath) ? filePath : fallbackPath;

  try {
    const file = await readFile(pathToServe);
    return reply.type(contentType(pathToServe)).send(file);
  } catch {
    return reply.status(404).send({
      error: "not_found",
      message: "Frontend build not found"
    });
  }
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function contentType(path: string): string {
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp"
  };

  return types[extname(path)] ?? "application/octet-stream";
}
