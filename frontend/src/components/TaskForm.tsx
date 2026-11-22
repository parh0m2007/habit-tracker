import { CreateTaskSchema, LIMITS } from "@tracker/shared";
import { useState, type FormEvent } from "react";
import { useTaskActions } from "../hooks/useTasks";
import { ErrorText } from "./ui";

export function TaskForm() {
  const { create } = useTaskActions();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [withDescription, setWithDescription] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = CreateTaskSchema.safeParse({ title, description });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? "Проверьте поля");
      return;
    }
    setValidation(null);
    try {
      await create.mutateAsync(parsed.data);
    } catch {
      return; // сообщение покажет create.error
    }
    setTitle("");
    setDescription("");
    setWithDescription(false);
  }

  return (
    <form className="card task-form" onSubmit={submit} aria-label="Новая задача">
      <div className="row">
        <input
          className="input grow"
          placeholder="Что нужно сделать?"
          aria-label="Название новой задачи"
          value={title}
          maxLength={LIMITS.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn primary" disabled={create.isPending}>
          {create.isPending ? "Добавляю…" : "Добавить"}
        </button>
      </div>

      {withDescription ? (
        <textarea
          className="input"
          rows={2}
          placeholder="Описание (необязательно)"
          aria-label="Описание новой задачи"
          value={description}
          maxLength={LIMITS.description}
          onChange={(e) => setDescription(e.target.value)}
        />
      ) : (
        <button type="button" className="link" onClick={() => setWithDescription(true)}>
          + описание
        </button>
      )}

      <ErrorText>{validation ?? create.error?.message}</ErrorText>
    </form>
  );
}
