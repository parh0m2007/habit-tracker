/**
 * Контракт между бэкендом и фронтендом.
 * Одни и те же zod-схемы валидируют запросы на сервере и формы в браузере,
 * а типы выводятся из схем — расхождение API и UI ловится компилятором.
 */
import { z } from "zod";

export const TASK_STATUSES = ["new", "in_progress", "done"] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const STATUS_LABELS: Record<TaskStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Готова",
};

export const LIMITS = {
  title: 200,
  description: 2000,
  subtaskTitle: 200,
  subtasksPerRequest: 20,
} as const;

const title = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Название не может быть пустым")
    .max(max, `Не длиннее ${max} символов`);

export const CreateTaskSchema = z.object({
  title: title(LIMITS.title),
  description: z.string().trim().max(LIMITS.description).default(""),
  status: TaskStatusSchema.default("new"),
});
export type CreateTaskInput = z.input<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z
  .object({
    title: title(LIMITS.title),
    description: z.string().trim().max(LIMITS.description),
    status: TaskStatusSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Нужно передать хотя бы одно поле");
export type UpdateTaskInput = z.input<typeof UpdateTaskSchema>;

export const TaskQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  q: z.string().trim().max(LIMITS.title).optional(),
});
export type TaskQuery = z.infer<typeof TaskQuerySchema>;

export const CreateSubtasksSchema = z.object({
  titles: z.array(title(LIMITS.subtaskTitle)).min(1).max(LIMITS.subtasksPerRequest),
});
export type CreateSubtasksInput = z.input<typeof CreateSubtasksSchema>;

export const UpdateSubtaskSchema = z
  .object({
    title: title(LIMITS.subtaskTitle),
    done: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Нужно передать хотя бы одно поле");
export type UpdateSubtaskInput = z.input<typeof UpdateSubtaskSchema>;

export const GenerateSubtasksSchema = z.object({
  title: title(LIMITS.title),
  description: z.string().trim().max(LIMITS.description).optional(),
});
export type GenerateSubtasksInput = z.input<typeof GenerateSubtasksSchema>;

export interface Subtask {
  id: number;
  taskId: number;
  title: string;
  done: boolean;
  position: number;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  subtasks: Subtask[];
}

export type StatusCounts = Record<TaskStatus | "all", number>;

export interface TaskListResponse {
  items: Task[];
  counts: StatusCounts;
}

export type AiSource = "openai" | "stub";

export interface GenerateSubtasksResponse {
  subtasks: string[];
  source: AiSource;
  model?: string;
  /** Заполняется, если ИИ был настроен, но ответить не смог и сработала заглушка. */
  warning?: string;
}

export interface HealthResponse {
  status: "ok";
  ai: { source: AiSource; model?: string };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
