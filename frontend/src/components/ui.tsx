import { STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@tracker/shared";
import type { ReactNode } from "react";

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="error" role="alert">
      {children}
    </p>
  );
}

export function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className={`status-select status-${value}`}
      aria-label="Статус"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
    >
      {TASK_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
