import { LIMITS, UpdateTaskSchema, type Task } from "@tracker/shared";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useTaskActions } from "../hooks/useTasks";
import { SubtaskPanel } from "./SubtaskPanel";
import { ErrorText, StatusSelect } from "./ui";

export function TaskCard({ task }: { task: Task }) {
  const { update, remove } = useTaskActions();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const doneCount = task.subtasks.filter((s) => s.done).length;
  const error = update.error?.message ?? remove.error?.message;

  return (
    <li className={`card task status-border-${task.status}`}>
      {editing ? (
        <EditForm task={task} onClose={() => setEditing(false)} />
      ) : (
        <>
          <div className="task-head">
            <StatusSelect
              value={task.status}
              disabled={update.isPending}
              onChange={(status) => update.mutate({ id: task.id, patch: { status } })}
            />
            <h3 className={`task-title ${task.status === "done" ? "done" : ""}`}>{task.title}</h3>

            <div className="actions">
              {confirmDelete ? (
                <>
                  <span className="muted">Удалить?</span>
                  <button
                    className="btn danger small"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(task.id)}
                  >
                    Да
                  </button>
                  <button className="btn small" onClick={() => setConfirmDelete(false)}>
                    Нет
                  </button>
                </>
              ) : (
                <>
                  <button className="icon-btn" title="Редактировать" aria-label="Редактировать" onClick={() => setEditing(true)}>
                    ✎
                  </button>
                  <button className="icon-btn" title="Удалить" aria-label="Удалить" onClick={() => setConfirmDelete(true)}>
                    🗑
                  </button>
                </>
              )}
            </div>
          </div>

          {task.description && <p className="task-desc">{task.description}</p>}

          <button className="link subtasks-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? "▾" : "▸"} Подзадачи
            {task.subtasks.length > 0 && (
              <span className="progress-text">
                {doneCount}/{task.subtasks.length}
              </span>
            )}
          </button>
          {task.subtasks.length > 0 && !expanded && (
            <div className="progress" aria-hidden>
              <div style={{ width: `${(doneCount / task.subtasks.length) * 100}%` }} />
            </div>
          )}
          {expanded && <SubtaskPanel task={task} />}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

function EditForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const { update } = useTaskActions();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [validation, setValidation] = useState<string | null>(null);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const parsed = UpdateTaskSchema.safeParse({ title, description });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? "Проверьте поля");
      return;
    }
    try {
      await update.mutateAsync({ id: task.id, patch: parsed.data });
      onClose();
    } catch {
      /* сообщение покажет update.error */
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
  }

  return (
    <form className="edit-form" onSubmit={save} onKeyDown={onKeyDown}>
      <input
        className="input"
        aria-label="Название"
        autoFocus
        value={title}
        maxLength={LIMITS.title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="input"
        aria-label="Описание"
        rows={3}
        placeholder="Описание"
        value={description}
        maxLength={LIMITS.description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="row end">
        <span className="muted hint">Ctrl+Enter — сохранить, Esc — отмена</span>
        <button type="button" className="btn" onClick={onClose}>
          Отмена
        </button>
        <button className="btn primary" disabled={update.isPending}>
          Сохранить
        </button>
      </div>
      <ErrorText>{validation ?? update.error?.message}</ErrorText>
    </form>
  );
}
