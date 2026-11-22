import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Task } from "@tracker/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { api } from "./api/client";

vi.mock("./api/client", async (orig) => {
  const mod = await orig<typeof import("./api/client")>();
  return { ...mod, api: Object.fromEntries(Object.keys(mod.api).map((k) => [k, vi.fn()])) };
});
const mocked = vi.mocked(api);

const task = (over: Partial<Task>): Task => ({
  id: 1,
  title: "Задача",
  description: "",
  status: "new",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  subtasks: [],
  ...over,
});

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocked.health.mockResolvedValue({ status: "ok", ai: { source: "stub" } });
  mocked.listTasks.mockResolvedValue({
    items: [task({ id: 1, title: "Написать README" }), task({ id: 2, title: "Задеплоить", status: "done" })],
    counts: { all: 2, new: 1, in_progress: 0, done: 1 },
  });
});

describe("App", () => {
  it("показывает задачи, счётчики и режим ИИ", async () => {
    renderApp();
    expect(await screen.findByText("Написать README")).toBeInTheDocument();
    expect(screen.getByText("Задеплоить")).toHaveClass("done");
    expect(screen.getByRole("tab", { name: /Готова/ })).toHaveTextContent("1");
    expect(await screen.findByText("ИИ: заглушка")).toBeInTheDocument();
  });

  it("фильтр по статусу уходит в запрос", async () => {
    renderApp();
    await screen.findByText("Написать README");
    await userEvent.click(screen.getByRole("tab", { name: /В работе/ }));
    await waitFor(() => expect(mocked.listTasks).toHaveBeenLastCalledWith({ status: "in_progress", q: undefined }));
  });

  it("не создаёт задачу с пустым названием", async () => {
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: "Добавить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Название не может быть пустым");
    expect(mocked.createTask).not.toHaveBeenCalled();
  });

  it("создаёт задачу", async () => {
    mocked.createTask.mockResolvedValue(task({ id: 3, title: "Новая" }));
    renderApp();
    await userEvent.type(await screen.findByLabelText("Название новой задачи"), "Новая{Enter}");
    await waitFor(() => expect(mocked.createTask).toHaveBeenCalledWith({ title: "Новая", description: "", status: "new" }));
  });

  it("удаляет задачу после подтверждения", async () => {
    mocked.deleteTask.mockResolvedValue(undefined);
    renderApp();
    const card = (await screen.findByText("Написать README")).closest("li")!;
    await userEvent.click(within(card).getByRole("button", { name: "Удалить" }));
    expect(mocked.deleteTask).not.toHaveBeenCalled();
    await userEvent.click(within(card).getByRole("button", { name: "Да" }));
    await waitFor(() => expect(mocked.deleteTask).toHaveBeenCalledWith(1));
  });

  it("ИИ предлагает 3 подзадачи, сохраняются только выбранные", async () => {
    mocked.generateSubtasks.mockResolvedValue({ subtasks: ["Раз", "Два", "Три"], source: "stub" });
    mocked.addSubtasks.mockResolvedValue([]);
    renderApp();

    const card = (await screen.findByText("Написать README")).closest("li")!;
    await userEvent.click(within(card).getByRole("button", { name: /Подзадачи/ }));
    await userEvent.click(within(card).getByRole("button", { name: /Предложить 3 подзадачи/ }));

    expect(mocked.generateSubtasks).toHaveBeenCalledWith({ title: "Написать README", description: undefined });
    await userEvent.click(await within(card).findByRole("checkbox", { name: "Два" }));
    await userEvent.click(within(card).getByRole("button", { name: "Добавить выбранные" }));

    await waitFor(() => expect(mocked.addSubtasks).toHaveBeenCalledWith(1, ["Раз", "Три"]));
  });
});
