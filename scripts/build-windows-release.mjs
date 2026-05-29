import { build } from "esbuild";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const releaseRoot = join(root, "release");
const distRoot = join(releaseRoot, `sveden-checker-${version}-win-x64`);
const appRoot = join(distRoot, "app");

await rm(distRoot, { recursive: true, force: true });
await mkdir(appRoot, { recursive: true });
await mkdir(join(distRoot, "data"), { recursive: true });
await mkdir(join(distRoot, "reports"), { recursive: true });

await build({
  banner: {
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);"
  },
  bundle: true,
  entryPoints: [join(root, "apps", "server", "src", "index.ts")],
  external: ["better-sqlite3"],
  format: "esm",
  minify: false,
  outfile: join(appRoot, "server.mjs"),
  platform: "node",
  sourcemap: false,
  target: "node20"
});

await cp(join(root, "apps", "web", "dist"), join(distRoot, "public"), { recursive: true });
await cp(join(root, "legal-documents"), join(distRoot, "legal-documents"), { recursive: true });
await copyFile(
  join(root, "packages", "rulesets", "src", "sveden-itemprop-ruleset.json"),
  join(appRoot, "sveden-itemprop-ruleset.json")
);

await writeFile(
  join(appRoot, "package.json"),
  JSON.stringify(
    {
      name: "sveden-checker-runtime",
      version,
      private: true,
      type: "module",
      dependencies: {
        "better-sqlite3": "11.10.0"
      }
    },
    null,
    2
  )
);

await writeFile(join(distRoot, "reports", ".gitkeep"), "");

await writeFile(
  join(distRoot, "start-sveden-checker.cmd"),
  String.raw`@echo off
setlocal
cd /d "%~dp0"
set HOST=127.0.0.1
set PORT=5173
set SVEDEN_CHECKER_WEB_DIR=%~dp0public
set SVEDEN_CHECKER_DB=%~dp0data\sveden-checker.sqlite
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:5173"
"%~dp0node\node.exe" "%~dp0app\server.mjs"
pause
`
);

await writeFile(
  join(distRoot, "README-WINDOWS.txt"),
  `Sveden Checker ${version} for Windows x64

Запуск:
1. Распакуйте архив в любую папку.
2. Запустите start-sveden-checker.cmd.
3. Приложение откроется в браузере: http://127.0.0.1:5173

Все проверки выполняются локально. Проверяемые страницы скачивает только локальный backend.
SQLite-база создается автоматически в папке data.
Нормативные документы лежат в папке legal-documents.
Отчеты будут храниться в папке reports.

Sveden Checker не является официальной АИС «Мониторинг» и не заменяет официальную проверку.
`
);

console.log(`Windows release skeleton created: ${resolve(distRoot)}`);
