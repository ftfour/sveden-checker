# Sveden Checker

Sveden Checker — локальное веб-приложение для предварительной проверки раздела «Сведения об образовательной организации» на сайте образовательной организации.

Приложение запускается на компьютере пользователя, открывается в браузере и выполняет проверки локально. Проверяемый сайт, HTML-страницы и результаты анализа не отправляются на внешний сервер.

> Sveden Checker не является официальной АИС «Мониторинг», не связан с Рособрнадзором и не заменяет официальную проверку.

## Стек

- TypeScript
- Node.js
- Fastify
- React + Vite
- SQLite
- pnpm workspaces

## Структура

```text
sveden-checker/
  apps/
    web/
    server/
  packages/
    database/
    shared/
    rulesets/
  legal-documents/
  reports/
  README.md
```

## Запуск

```bash
pnpm install
pnpm dev
```

Если `pnpm` не установлен глобально, можно использовать совместимую версию через `npx`:

```bash
npx pnpm@9.15.9 install
npx pnpm@9.15.9 dev
```

По умолчанию:

- frontend: `http://127.0.0.1:5173`
- backend API: `http://127.0.0.1:3001`

## Windows release

Portable-сборка для Windows x64 создается командой:

```bash
pnpm release:win
```

Готовый архив появляется в:

```text
release/sveden-checker-0.1.0-win-x64.zip
```

Архив включает Windows Node.js runtime, собранный frontend, bundled backend, нормативные документы и production-зависимости, включая native-модуль SQLite. После распаковки пользователь запускает:

```text
start-sveden-checker.cmd
```

Приложение открывается в браузере на `http://127.0.0.1:5173`.

## База данных

SQLite-база создается автоматически при первом запуске backend или команды:

```bash
pnpm db:init
```

Файл базы лежит здесь:

```text
packages/database/data/sveden-checker.sqlite
```

Можно переопределить путь переменной окружения `SVEDEN_CHECKER_DB`.

## Нормативные документы

Документы из архива `sveden_legal_documents.zip` распакованы в:

```text
legal-documents/
```

Сохранены исходные PDF/MD-файлы, `legal-sources.json`, `source_urls.md` и `checksums.sha256`.

При первом запуске база заполняет таблицу `legal_sources` из `legal-documents/legal-sources.json`. Если в метаданных нет отдельных полей, приложение аккуратно выводит номер, дату, тип и краткое название из заголовка документа.

## Отчеты

Будущие отчеты проверок будут храниться в:

```text
reports/
```

В первой версии checker выполняет локальную HTML-проверку доступности страниц `/sveden/`, обязательных `itemprop`, дополнительных страниц `addRef` и ссылок на документы по расширенному JSON-ruleset.

## API

### `GET /api/health`

Возвращает статус backend:

```json
{
  "status": "ok",
  "app": "sveden-checker"
}
```

### `GET /api/project-info`

Возвращает сведения о проекте, предупреждение о неофициальном статусе, принцип работы, осторожную инструкцию по подключению к АИС «Мониторинг» и список нормативных источников из SQLite.

### `GET /api/legal-sources`

Возвращает список документов из таблицы `legal_sources`.

### `POST /api/check`

Запускает локальную проверку сайта. Frontend обращается только к этому endpoint, а внешние HTTP-запросы к проверяемому сайту выполняет backend.

Принимает:

```json
{
  "url": "https://example.ru"
}
```

Возвращает:

```json
{
  "siteUrl": "https://example.ru",
  "checkedAt": "2026-05-29T00:00:00.000Z",
  "overallScore": 72,
  "summary": {
    "total": 150,
    "found": 24,
    "partial": 1,
    "missing": 9,
    "errors": 0
  },
  "sections": []
}
```

Расширенный ruleset лежит в:

```text
packages/rulesets/src/sveden-itemprop-ruleset.json
```

## Рекомендации по исправлениям

После проверки сайта на странице `/check` приложение сохраняет последний отчет в `localStorage` с ключом `sveden_checker_last_report`. На странице `/recommendations` из этого отчета формируются рекомендации по пунктам со статусами `missing`, `partial`, `empty` и `error`.

Рекомендации показывают раздел, URL страницы, проблемный `itemprop`, статус, приоритет, объяснение проблемы, способ исправления и пример HTML-разметки. Для примеров доступна кнопка копирования.

Приоритеты рассчитываются автоматически: ошибки загрузки и обязательные отсутствующие пункты попадают в срочные, пустые и частично заполненные значения — в желательные, остальные предупреждения — в низкий приоритет.

Рекомендации являются справочными и не заменяют официальную проверку в АИС «Мониторинг».
