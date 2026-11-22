import type {
  ApiErrorBody,
  CreateTaskInput,
  GenerateSubtasksInput,
  GenerateSubtasksResponse,
  HealthResponse,
  Subtask,
  Task,
  TaskListResponse,
  TaskQuery,
  UpdateSubtaskInput,
  UpdateTaskInput,
} from "@tracker/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network_error", "Сервер недоступен. Запущен ли бэкенд?");
  }

  if (res.status === 204) return undefined as T;

  const data = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    if (err) throw new ApiError(res.status, err.code, err.message);
    // Не-JSON ответ (например, dev-прокси без запущенного бэкенда).
    throw new ApiError(res.status, "http_error", `Сервер недоступен или ответил ошибкой (${res.status})`);
  }
  return data as T;
}

function toQueryString(query: TaskQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<HealthResponse>("GET", "/health"),

  listTasks: (query: TaskQuery) => request<TaskListResponse>("GET", `/tasks${toQueryString(query)}`),
  createTask: (input: CreateTaskInput) => request<Task>("POST", "/tasks", input),
  updateTask: (id: number, patch: UpdateTaskInput) => request<Task>("PATCH", `/tasks/${id}`, patch),
  deleteTask: (id: number) => request<void>("DELETE", `/tasks/${id}`),

  addSubtasks: (taskId: number, titles: string[]) =>
    request<Subtask[]>("POST", `/tasks/${taskId}/subtasks`, { titles }),
  updateSubtask: (taskId: number, id: number, patch: UpdateSubtaskInput) =>
    request<Subtask>("PATCH", `/tasks/${taskId}/subtasks/${id}`, patch),
  deleteSubtask: (taskId: number, id: number) =>
    request<void>("DELETE", `/tasks/${taskId}/subtasks/${id}`),

  generateSubtasks: (input: GenerateSubtasksInput) =>
    request<GenerateSubtasksResponse>("POST", "/ai/subtasks", input),
};
