import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDirectory = join(packageRoot, "src");
const outputDirectory = join(packageRoot, "dist");

mkdirSync(outputDirectory, { recursive: true });

for (const fileName of readdirSync(sourceDirectory)) {
  if (fileName.endsWith(".json")) {
    copyFileSync(join(sourceDirectory, fileName), join(outputDirectory, fileName));
  }
}
