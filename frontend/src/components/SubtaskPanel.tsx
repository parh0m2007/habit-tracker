import { LIMITS, type GenerateSubtasksResponse, type Task } from "@tracker/shared";
import { useState, type FormEvent } from "react";
import { useGenerateSubtasks, useTaskActions } from "../hooks/useTasks";
import { ErrorText } from "./ui";

export function SubtaskPanel({ task }: { task: Task }) {
  const { addSubtasks, updateSubtask, deleteSubtask } = useTaskActions();
  const [newTitle, setNewTitle] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      await addSubtasks.mutateAsync({ taskId: task.id, titles: [title] });
      setNewTitle("");
    } catch {
      /* сообщение покажет addSubtasks.error */
    }
  }

  const error = addSubtasks.error ?? updateSubtask.error ?? deleteSubtask.error;

  return (
    <div className="subtasks">
      {task.subtasks.length > 0 && (
        <ul className="subtask-list">
          {task.subtasks.map((s) => (
            <li key={s.id} className="subtask">
              <label>
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={(e) =>
                    updateSubtask.mutate({ taskId: task.id, id: s.id, patch: { done: e.target.checked } })
                  }
                />
                <span className={s.done ? "done" : ""}>{s.title}</span>
              </label>
              <button
                className="icon-btn small"
                aria-label={`Удалить подзадачу «${s.title}»`}
                onClick={() => deleteSubtask.mutate({ taskId: task.id, id: s.id })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="row" onSubmit={add}>
        <input
          className="input grow small"
          placeholder="Новая подзадача"
          aria-label="Новая подзадача"
          value={newTitle}
          maxLength={LIMITS.subtaskTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button className="btn small" disabled={addSubtasks.isPending || !newTitle.trim()}>
          Добавить
        </button>
      </form>

      <AiSuggestions task={task} />
      <ErrorText>{error?.message}</ErrorText>
    </div>
  );
}

/** Предложения от ИИ: пользователь сам выбирает, какие из трёх сохранить. */
function AiSuggestions({ task }: { task: Task }) {
  const generate = useGenerateSubtasks();
  const { addSubtasks } = useTaskActions();
  const [result, setResult] = useState<GenerateSubtasksResponse | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);

  async function run() {
    try {
      const res = await generate.mutateAsync({ title: task.title, description: task.description || undefined });
      setResult(res);
      setSelected(res.subtasks.map(() => true));
    } catch {
      /* сообщение покажет generate.error */
    }
  }

  async function accept() {
    if (!result) return;
    const titles = result.subtasks.filter((_, i) => selected[i]);
    if (titles.length === 0) return;
    try {
      await addSubtasks.mutateAsync({ taskId: task.id, titles });
      setResult(null);
    } catch {
      /* сообщение покажет addSubtasks.error */
    }
  }

  if (!result) {
    return (
      <div className="ai-row">
        <button className="btn ai" onClick={run} disabled={generate.isPending}>
          {generate.isPending ? "Думаю…" : "✨ Предложить 3 подзадачи"}
        </button>
        <ErrorText>{generate.error?.message}</ErrorText>
      </div>
    );
  }

  return (
    <div className="ai-box" aria-label="Предложения ИИ">
      <div className="ai-box-head">
        <strong>Предложения</strong>
        <span className={`badge ${result.source}`}>
          {result.source === "stub" ? "заглушка" : (result.model ?? "ИИ")}
        </span>
      </div>
      {result.warning && <p className="warning">{result.warning}</p>}
      <ul className="subtask-list">
        {result.subtasks.map((s, i) => (
          <li key={i} className="subtask">
            <label>
              <input
                type="checkbox"
                checked={selected[i] ?? false}
                onChange={(e) => setSelected((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
              />
              <span>{s}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="row end">
        <button className="btn small" onClick={() => setResult(null)}>
          Скрыть
        </button>
        <button className="btn small" onClick={run} disabled={generate.isPending}>
          {generate.isPending ? "…" : "Ещё вариант"}
        </button>
        <button
          className="btn primary small"
          onClick={accept}
          disabled={addSubtasks.isPending || !selected.some(Boolean)}
        >
          Добавить выбранные
        </button>
      </div>
    </div>
  );
}
