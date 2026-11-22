import type {
  StatusCounts,
  Subtask,
  Task,
  TaskQuery,
  TaskStatus,
} from "@tracker/shared";
import { transaction, type Db } from "../db.ts";

interface TaskRow {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

interface SubtaskRow {
  id: number;
  task_id: number;
  title: string;
  done: number;
  position: number;
}

export interface NewTask {
  title: string;
  description: string;
  status: TaskStatus;
}

export type TaskPatch = Partial<NewTask>;
export type SubtaskPatch = Partial<Pick<Subtask, "title" | "done">>;

const toSubtask = (row: SubtaskRow): Subtask => ({
  id: row.id,
  taskId: row.task_id,
  title: row.title,
  done: row.done === 1,
  position: row.position,
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Единственное место, где живёт SQL. Роуты работают только с доменными объектами. */
export class TaskRepository {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(query: TaskQuery = {}): Task[] {
    const where: string[] = [];
    const params: string[] = [];
    if (query.status) {
      where.push("status = ?");
      params.push(query.status);
    }
    if (query.q) {
      where.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
      const like = `%${escapeLike(query.q)}%`;
      params.push(like, like);
    }

    const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
                 ORDER BY created_at DESC, id DESC`;
    const rows = this.db.prepare(sql).all(...params) as unknown as TaskRow[];
    return this.withSubtasks(rows);
  }

  /** Счётчики по статусам — с учётом поиска, но без учёта фильтра по статусу. */
  counts(q?: string): StatusCounts {
    const counts: StatusCounts = { all: 0, new: 0, in_progress: 0, done: 0 };
    const filter = q ? "WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'" : "";
    const like = q ? [`%${escapeLike(q)}%`, `%${escapeLike(q)}%`] : [];
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) AS n FROM tasks ${filter} GROUP BY status`)
      .all(...like) as unknown as { status: TaskStatus; n: number }[];

    for (const { status, n } of rows) {
      counts[status] = n;
      counts.all += n;
    }
    return counts;
  }

  get(id: number): Task | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | TaskRow
      | undefined;
    return row ? this.withSubtasks([row])[0] : undefined;
  }

  create(input: NewTask): Task {
    const ts = this.now().toISOString();
    const { lastInsertRowid } = this.db
      .prepare(
        "INSERT INTO tasks (title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(input.title, input.description, input.status, ts, ts);
    return this.get(Number(lastInsertRowid))!;
  }

  update(id: number, patch: TaskPatch): Task | undefined {
    const fields = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (fields.length === 0) return this.get(id);

    const assignments = fields.map(([key]) => `${key} = ?`).join(", ");
    const { changes } = this.db
      .prepare(`UPDATE tasks SET ${assignments}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(([, v]) => v as string), this.now().toISOString(), id);
    return changes ? this.get(id) : undefined;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id).changes > 0;
  }

  addSubtasks(taskId: number, titles: string[]): Subtask[] | undefined {
    if (!this.exists(taskId)) return undefined;

    return transaction(this.db, () => {
      const { next } = this.db
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM subtasks WHERE task_id = ?")
        .get(taskId) as { next: number };
      const insert = this.db.prepare(
        "INSERT INTO subtasks (task_id, title, position) VALUES (?, ?, ?) RETURNING *",
      );
      const created = titles.map(
        (title, i) => insert.get(taskId, title, next + i) as unknown as SubtaskRow,
      );
      this.touch(taskId);
      return created.map(toSubtask);
    });
  }

  updateSubtask(taskId: number, subtaskId: number, patch: SubtaskPatch): Subtask | undefined {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      params.push(patch.title);
    }
    if (patch.done !== undefined) {
      sets.push("done = ?");
      params.push(patch.done ? 1 : 0);
    }
    if (sets.length === 0) return this.getSubtask(taskId, subtaskId);

    const row = this.db
      .prepare(`UPDATE subtasks SET ${sets.join(", ")} WHERE id = ? AND task_id = ? RETURNING *`)
      .get(...params, subtaskId, taskId) as SubtaskRow | undefined;
    if (row) this.touch(taskId);
    return row ? toSubtask(row) : undefined;
  }

  deleteSubtask(taskId: number, subtaskId: number): boolean {
    const ok =
      this.db
        .prepare("DELETE FROM subtasks WHERE id = ? AND task_id = ?")
        .run(subtaskId, taskId).changes > 0;
    if (ok) this.touch(taskId);
    return ok;
  }

  private getSubtask(taskId: number, subtaskId: number): Subtask | undefined {
    const row = this.db
      .prepare("SELECT * FROM subtasks WHERE id = ? AND task_id = ?")
      .get(subtaskId, taskId) as SubtaskRow | undefined;
    return row ? toSubtask(row) : undefined;
  }

  private exists(id: number): boolean {
    return this.db.prepare("SELECT 1 FROM tasks WHERE id = ?").get(id) !== undefined;
  }

  private touch(id: number): void {
    this.db.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(this.now().toISOString(), id);
  }

  /** Подзадачи подгружаются одним запросом на весь список — без N+1. */
  private withSubtasks(rows: TaskRow[]): Task[] {
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const subRows = this.db
      .prepare(
        `SELECT * FROM subtasks WHERE task_id IN (${ids.map(() => "?").join(",")})
         ORDER BY position, id`,
      )
      .all(...ids) as unknown as SubtaskRow[];

    const byTask = new Map<number, Subtask[]>();
    for (const s of subRows) {
      const list = byTask.get(s.task_id) ?? [];
      list.push(toSubtask(s));
      byTask.set(s.task_id, list);
    }

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      subtasks: byTask.get(r.id) ?? [],
    }));
  }
}
