import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { StubSubtaskGenerator } from "../src/ai/subtask-generator.ts";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { TaskRepository } from "../src/tasks/task.repository.ts";

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  let tick = 0;
  // Монотонные часы — порядок сортировки по created_at детерминирован.
  const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
  app = createApp({
    tasks: new TaskRepository(openDb(":memory:"), now),
    ai: new StubSubtaskGenerator(),
    staticDir: "__none__",
  });
});

const create = (body: object) => request(app).post("/api/tasks").send(body);

describe("CRUD задач", () => {
  it("создаёт задачу со значениями по умолчанию", async () => {
    const res = await create({ title: "  Купить молоко  " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 1,
      title: "Купить молоко",
      description: "",
      status: "new",
      subtasks: [],
    });
  });

  it("валидирует название и статус", async () => {
    expect((await create({ title: "   " })).status).toBe(400);
    expect((await create({})).body.error.code).toBe("validation_error");
    expect((await create({ title: "x", status: "archived" })).status).toBe(400);
    expect((await create({ title: "x".repeat(201) })).status).toBe(400);
  });

  it("возвращает задачу по id и 404 для несуществующей", async () => {
    await create({ title: "A" });
    expect((await request(app).get("/api/tasks/1")).body.title).toBe("A");
    expect((await request(app).get("/api/tasks/99")).status).toBe(404);
    expect((await request(app).get("/api/tasks/abc")).status).toBe(400);
  });

  it("частично обновляет задачу и меняет updatedAt", async () => {
    const { body: created } = await create({ title: "A", description: "d" });
    const res = await request(app).patch("/api/tasks/1").send({ status: "in_progress" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "A", description: "d", status: "in_progress" });
    expect(res.body.updatedAt > created.updatedAt).toBe(true);

    expect((await request(app).patch("/api/tasks/1").send({})).status).toBe(400);
    expect((await request(app).patch("/api/tasks/9").send({ title: "B" })).status).toBe(404);
  });

  it("удаляет задачу вместе с подзадачами", async () => {
    await create({ title: "A" });
    await request(app).post("/api/tasks/1/subtasks").send({ titles: ["s1"] });
    expect((await request(app).delete("/api/tasks/1")).status).toBe(204);
    expect((await request(app).get("/api/tasks/1")).status).toBe(404);
    expect((await request(app).delete("/api/tasks/1")).status).toBe(404);
  });

  it("отвечает понятной ошибкой на битый JSON и неизвестный маршрут", async () => {
    const bad = await request(app)
      .post("/api/tasks")
      .set("Content-Type", "application/json")
      .send("{oops");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid_json");
    expect((await request(app).get("/api/nope")).status).toBe(404);
  });
});

describe("Список и фильтры", () => {
  beforeEach(async () => {
    await create({ title: "Написать отчёт", status: "new" });
    await create({ title: "Позвонить клиенту", status: "in_progress" });
    await create({ title: "Отчёт за квартал", description: "финансы", status: "done" });
    await create({ title: "Скидка 100%_акция", status: "new" });
  });

  it("сортирует от новых к старым и считает статусы", async () => {
    const res = await request(app).get("/api/tasks");
    expect(res.body.items.map((t: { id: number }) => t.id)).toEqual([4, 3, 2, 1]);
    expect(res.body.counts).toEqual({ all: 4, new: 2, in_progress: 1, done: 1 });
  });

  it("фильтрует по статусу, но счётчики остаются по всем статусам", async () => {
    const res = await request(app).get("/api/tasks?status=new");
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.every((t: { status: string }) => t.status === "new")).toBe(true);
    expect(res.body.counts.all).toBe(4);
  });

  it("ищет по названию и описанию без учёта спецсимволов LIKE", async () => {
    const byTitle = await request(app).get("/api/tasks").query({ q: "Отчёт" });
    expect(byTitle.body.items.map((t: { id: number }) => t.id)).toEqual([3]);
    const byDesc = await request(app).get("/api/tasks").query({ q: "финансы" });
    expect(byDesc.body.items).toHaveLength(1);
    const literal = await request(app).get("/api/tasks").query({ q: "100%_" });
    expect(literal.body.items.map((t: { id: number }) => t.id)).toEqual([4]);
    expect(literal.body.counts).toEqual({ all: 1, new: 1, in_progress: 0, done: 0 });
  });

  it("отклоняет неизвестный статус в фильтре", async () => {
    expect((await request(app).get("/api/tasks?status=wip")).status).toBe(400);
  });
});

describe("Подзадачи", () => {
  beforeEach(async () => {
    await create({ title: "Переезд" });
  });

  it("добавляет пачку подзадач по порядку", async () => {
    const res = await request(app)
      .post("/api/tasks/1/subtasks")
      .send({ titles: ["Упаковать", "Заказать машину"] });
    expect(res.status).toBe(201);
    expect(res.body.map((s: { position: number }) => s.position)).toEqual([0, 1]);

    await request(app).post("/api/tasks/1/subtasks").send({ titles: ["Разгрузить"] });
    const task = (await request(app).get("/api/tasks/1")).body;
    expect(task.subtasks.map((s: { title: string }) => s.title)).toEqual([
      "Упаковать",
      "Заказать машину",
      "Разгрузить",
    ]);
  });

  it("отмечает, переименовывает и удаляет подзадачу", async () => {
    await request(app).post("/api/tasks/1/subtasks").send({ titles: ["A"] });
    const done = await request(app).patch("/api/tasks/1/subtasks/1").send({ done: true });
    expect(done.body).toMatchObject({ id: 1, done: true, title: "A" });
    const renamed = await request(app).patch("/api/tasks/1/subtasks/1").send({ title: "B" });
    expect(renamed.body).toMatchObject({ done: true, title: "B" });
    expect((await request(app).delete("/api/tasks/1/subtasks/1")).status).toBe(204);
    expect((await request(app).get("/api/tasks/1")).body.subtasks).toEqual([]);
  });

  it("не даёт трогать подзадачу чужой задачи", async () => {
    await create({ title: "Другая" });
    await request(app).post("/api/tasks/1/subtasks").send({ titles: ["A"] });
    expect((await request(app).patch("/api/tasks/2/subtasks/1").send({ done: true })).status).toBe(404);
    expect((await request(app).delete("/api/tasks/2/subtasks/1")).status).toBe(404);
  });

  it("валидирует входные данные", async () => {
    expect((await request(app).post("/api/tasks/1/subtasks").send({ titles: [] })).status).toBe(400);
    expect((await request(app).post("/api/tasks/1/subtasks").send({ titles: [""] })).status).toBe(400);
    expect((await request(app).post("/api/tasks/9/subtasks").send({ titles: ["x"] })).status).toBe(404);
  });
});
