import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { DATABASE_PATH } from "../config.js";

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

export const db = new DatabaseSync(DATABASE_PATH);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA synchronous = NORMAL;");
