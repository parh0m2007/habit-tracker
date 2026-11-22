import { useEffect, useState } from "react";
import { TaskCard } from "./components/TaskCard";
import { TaskForm } from "./components/TaskForm";
import { Toolbar, type StatusFilterValue } from "./components/Toolbar";
import { ErrorText } from "./components/ui";
import { useHealth, useTaskList } from "./hooks/useTasks";

function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function App() {
  const [status, setStatus] = useState<StatusFilterValue>("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());

  const list = useTaskList({ status: status === "all" ? undefined : status, q: q || undefined });
  const health = useHealth();
  const items = list.data?.items ?? [];

  return (
    <div className="page">
      <header className="header">
        <h1>Мини-трекер задач</h1>
        {health.data && (
          <span
            className={`badge ${health.data.ai.source}`}
            title={
              health.data.ai.source === "stub"
                ? "AI_API_KEY не задан — подзадачи генерируются по шаблону"
                : "Подзадачи генерирует языковая модель"
            }
          >
            ИИ: {health.data.ai.source === "stub" ? "заглушка" : health.data.ai.model}
          </span>
        )}
      </header>

      <TaskForm />

      <Toolbar
        status={status}
        onStatusChange={setStatus}
        search={search}
        onSearchChange={setSearch}
        counts={list.data?.counts}
      />

      {list.isPending ? (
        <p className="muted center">Загрузка…</p>
      ) : list.isError ? (
        <div className="center">
          <ErrorText>{list.error.message}</ErrorText>
          <button className="btn" onClick={() => list.refetch()}>
            Повторить
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="muted center empty">
          {q || status !== "all" ? "Ничего не найдено" : "Задач пока нет — добавьте первую выше"}
        </p>
      ) : (
        <ul className={`task-list ${list.isPlaceholderData ? "stale" : ""}`}>
          {items.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
