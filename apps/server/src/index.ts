import Fastify from "fastify";
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

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
