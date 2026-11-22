import type {
  CreateTaskInput,
  GenerateSubtasksInput,
  TaskQuery, UpdateSubtaskInput, UpdateTaskInput } from "@tracker/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

const TASKS_KEY = ["tasks"] as const;

export function useTaskList(query: TaskQuery) {
  return useQuery({
    queryKey: [...TASKS_KEY, query],
    queryFn: () => api.listTasks(query),
    placeholderData: keepPreviousData, // без мигания при смене фильтра
  });
}

export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: Infinity, retry: false });
}

/**
 * Мутация, которая после успеха перечитывает список задач: сервер — единственный
 * источник истины (счётчики статусов и сортировка считаются там).
 */
function useTaskMutation<V, R>(mutationFn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useTaskActions() {
  return {
    create: useTaskMutation((input: CreateTaskInput) => api.createTask(input)),
    update: useTaskMutation(({ id, patch }: { id: number; patch: UpdateTaskInput }) =>
      api.updateTask(id, patch),
    ),
    remove: useTaskMutation((id: number) => api.deleteTask(id)),
    addSubtasks: useTaskMutation(({ taskId, titles }: { taskId: number; titles: string[] }) =>
      api.addSubtasks(taskId, titles),
    ),
    updateSubtask: useTaskMutation(
      ({ taskId, id, patch }: { taskId: number; id: number; patch: UpdateSubtaskInput }) =>
        api.updateSubtask(taskId, id, patch),
    ),
    deleteSubtask: useTaskMutation(({ taskId, id }: { taskId: number; id: number }) =>
      api.deleteSubtask(taskId, id),
    ),
  };
}

export function useGenerateSubtasks() {
  return useMutation({ mutationFn: (input: GenerateSubtasksInput) => api.generateSubtasks(input) });
}
