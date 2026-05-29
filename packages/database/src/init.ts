import { getDatabasePath, getLegalSources, openDatabase } from "./index.js";

openDatabase();

console.log(`SQLite database is ready: ${getDatabasePath()}`);
console.log(`Imported legal sources: ${getLegalSources().length}`);
