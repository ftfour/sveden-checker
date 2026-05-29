import Fastify from "fastify";
import { access, readFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { findWorkspaceRoot, getLegalSources, openDatabase } from "@sveden-checker/database";
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

app.get<{ Params: { id: string } }>("/api/legal-sources/:id/file", async (request, reply) => {
  const source = getLegalSources().find((item) => item.id === request.params.id);

  if (!source?.local_file) {
    return reply.status(404).send({
      error: "legal_file_not_found",
      message: "Локальный файл нормативного документа не найден"
    });
  }

  const legalDocumentsRoot = resolve(
    process.env.SVEDEN_CHECKER_LEGAL_DIR ?? join(findWorkspaceRoot(), "legal-documents")
  );
  const filePath = resolve(join(legalDocumentsRoot, source.local_file));

  if (!isInsideDirectory(legalDocumentsRoot, filePath)) {
    return reply.status(400).send({
      error: "invalid_legal_file_path",
      message: "Некорректный путь к нормативному документу"
    });
  }

  try {
    const file = await readFile(filePath);
    return reply
      .type(contentType(filePath))
      .header("content-disposition", `inline; filename*=UTF-8''${encodeRfc5987ValueChars(basename(filePath))}`)
      .send(file);
  } catch {
    return reply.status(404).send({
      error: "legal_file_not_found",
      message: "Файл нормативного документа отсутствует в legal-documents"
    });
  }
});

app.get("/api/project-info", async (): Promise<ProjectInfo> => ({
  name: "Sveden Checker",
  version: "0.1.2",
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

  const staticRoot = resolve(process.env.SVEDEN_CHECKER_WEB_DIR ?? join(process.cwd(), "apps", "web", "dist"));
  const requestedPath = decodeURIComponent(request.url.split("?")[0] ?? "/");
  const normalizedPath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = resolve(join(staticRoot, normalizedPath));
  const fallbackPath = join(staticRoot, "index.html");
  const pathToServe = isInsideDirectory(staticRoot, filePath) && (await fileExists(filePath)) ? filePath : fallbackPath;

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
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp"
  };

  return types[extname(path)] ?? "application/octet-stream";
}

function isInsideDirectory(root: string, target: string): boolean {
  const relation = relative(root, target);
  return relation === "" || (!relation.startsWith("..") && !relation.includes(`..${sep}`));
}

function encodeRfc5987ValueChars(value: string): string {
  return encodeURIComponent(value)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A")
    .replace(/%(?:7C|60|5E)/g, decodeURIComponent);
}
