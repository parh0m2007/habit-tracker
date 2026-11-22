import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Встроенный в Node.js (>= 22.13) драйвер SQLite — без нативных зависимостей,
 * поэтому `npm install` не требует компилятора ни на Windows, ни на macOS.
 */
export type Db = DatabaseSync;

const MIGRATIONS: string[] = [
  `CREATE TABLE tasks (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     title       TEXT    NOT NULL,
     description TEXT    NOT NULL DEFAULT '',
     status      TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done')),
     created_at  TEXT    NOT NULL,
     updated_at  TEXT    NOT NULL
   );
   CREATE INDEX idx_tasks_status ON tasks(status);

   CREATE TABLE subtasks (
     id        INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     title     TEXT    NOT NULL,
     done      INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
     position  INTEGER NOT NULL
   );
   CREATE INDEX idx_subtasks_task ON subtasks(task_id, position);`,
];

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

/** Простые версионные миграции через PRAGMA user_version. */
function migrate(db: Db): void {
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };

  for (let version = current; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
