import { STATUS_LABELS, TASK_STATUSES, type StatusCounts, type TaskStatus } from "@tracker/shared";

export type StatusFilterValue = TaskStatus | "all";

const FILTERS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: "Все" },
  ...TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

export function Toolbar({
  status,
  onStatusChange,
  search,
  onSearchChange,
  counts,
}: {
  status: StatusFilterValue;
  onStatusChange: (s: StatusFilterValue) => void;
  search: string;
  onSearchChange: (q: string) => void;
  counts?: StatusCounts;
}) {
  return (
    <div className="toolbar">
      <div className="tabs" role="tablist" aria-label="Фильтр по статусу">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={status === f.value}
            className={`tab ${status === f.value ? "active" : ""}`}
            onClick={() => onStatusChange(f.value)}
          >
            {f.label}
            <span className="count">{counts?.[f.value] ?? 0}</span>
          </button>
        ))}
      </div>
      <input
        type="search"
        className="input search"
        placeholder="Поиск…"
        aria-label="Поиск задач"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  );
}
