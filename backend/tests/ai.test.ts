import OpenAI from "openai";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createSubtaskGenerator,
  extractSubtasks,
  OpenAiSubtaskGenerator,
  StubSubtaskGenerator,
  type ChatClient,
} from "../src/ai/subtask-generator.ts";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { TaskRepository } from "../src/tasks/task.repository.ts";

const MODEL = "deepseek-v4.1-flash-1017";
const base = { baseURL: "https://tooken.club/v1", model: MODEL, timeoutMs: 1000 };

/** Фейковый клиент: подменяем только chat.completions.create, сеть не трогаем. */
function fakeClient(impl: () => Promise<unknown>) {
  const create = vi.fn((_params: unknown) => impl());
  return { client: { chat: { completions: { create } } } as unknown as ChatClient, create };
}

const reply = (content: string, finish_reason = "stop") => async () => ({
  choices: [{ index: 0, finish_reason, message: { role: "assistant", content } }],
});

/** Ошибка API в том виде, в каком её бросает SDK (тело — как у tooken.club). */
const apiError = (status: number, message: string) => async () => {
  throw OpenAI.APIError.generate(status, { error: { message } }, undefined, new Headers());
};

describe("Выбор генератора", () => {
  it("без ключа выбирается заглушка", () => {
    expect(createSubtaskGenerator(base).source).toBe("stub");
    expect(createSubtaskGenerator({ ...base, apiKey: "" }).source).toBe("stub");
  });

  it("с ключом выбирается OpenAI-совместимый API", () => {
    expect(createSubtaskGenerator({ ...base, apiKey: "k" })).toMatchObject({ source: "openai", model: MODEL });
  });

  it("заглушка всегда отдаёт 3 подзадачи с названием задачи", async () => {
    const res = await new StubSubtaskGenerator().generate({ title: "Починить кран." });
    expect(res.source).toBe("stub");
    expect(res.subtasks).toHaveLength(3);
    expect(res.subtasks.every((s) => s.includes("«Починить кран»"))).toBe(true);
  });
});

describe("Разбор ответа модели", () => {
  it.each([
    ["чистый JSON", '{"subtasks":["А","Б","В"]}'],
    ["JSON в markdown", 'Вот:\n```json\n{"subtasks": ["А", "Б", "В"]}\n```'],
    ["нумерованный список", "1. А\n2) Б\n3. В."],
    ["маркированный список", "- А\n* Б\n• В"],
  ])("%s", (_name, text) => {
    expect(extractSubtasks(text)).toEqual(["А", "Б", "В"]);
  });

  it("мусор → пусто", () => {
    expect(extractSubtasks("Не знаю")).toEqual([]);
  });
});

describe("OpenAiSubtaskGenerator", () => {
  it("передаёт модель, промпт, название и описание; возвращает 3 очищенных пункта", async () => {
    const { client, create } = fakeClient(
      reply('{"subtasks":["1. Купить краску","Покрасить стены","Убрать мусор","Лишний"]}'),
    );

    const res = await new OpenAiSubtaskGenerator(client, MODEL).generate({ title: "Ремонт", description: "в спальне" });

    expect(res).toEqual({
      subtasks: ["Купить краску", "Покрасить стены", "Убрать мусор"],
      source: "openai",
      model: MODEL,
    });
    const params = create.mock.calls[0]![0] as Record<string, any>;
    expect(params.model).toBe(MODEL);
    expect(params.messages[0].role).toBe("system");
    expect(params.messages[1].content).toContain("<task_title>Ремонт</task_title>");
    expect(params.messages[1].content).toContain("<task_description>в спальне</task_description>");
  });

  it.each([
    ["неверный ключ", apiError(401, "API-ключ не принят"), "неверный API-ключ"],
    ["нет средств", apiError(402, "Пополните баланс"), "нет средств"],
    [
      "блокировка доступа (OpenRouter, тело-строка)",
      async () => {
        throw OpenAI.APIError.generate(403, { error: "Access denied by security policy." }, undefined, new Headers());
      },
      "403: Access denied by security policy.",
    ],
    ["нет модели", apiError(404, "model not found"), "модель не найдена"],
    ["лимит", apiError(429, "slow down"), "лимит"],
    ["сбой сервера", apiError(503, "Провайдер недоступен"), "ошибка API 503: Провайдер недоступен"],
    ["нет сети", async () => { throw new OpenAI.APIConnectionError({ message: "down" }); }, "нет соединения"],
    ["обрезанный ответ", reply('{"subtasks":["А"', "length"), "обрезан"],
    ["мало пунктов", reply('{"subtasks":["Один"]}'), "1 подзадач"],
    ["пустой ответ", async () => ({ choices: [] }), "пустой ответ"],
  ])("при «%s» откатывается на заглушку с предупреждением", async (_n, impl, reason) => {
    const { client } = fakeClient(impl);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await new OpenAiSubtaskGenerator(client, MODEL).generate({ title: "Задача" });

    expect(res.source).toBe("stub");
    expect(res.subtasks).toHaveLength(3);
    expect(res.warning).toContain(reason);
  });
});

describe("POST /api/ai/subtasks", () => {
  const app = createApp({
    tasks: new TaskRepository(openDb(":memory:")),
    ai: new StubSubtaskGenerator(),
    staticDir: "__none__",
  });

  it("возвращает 3 подзадачи и источник", async () => {
    const res = await request(app).post("/api/ai/subtasks").send({ title: "Выучить TypeScript" });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("stub");
    expect(res.body.subtasks).toHaveLength(3);
  });

  it("требует название", async () => {
    expect((await request(app).post("/api/ai/subtasks").send({})).status).toBe(400);
  });

  it("health сообщает режим ИИ", async () => {
    expect((await request(app).get("/api/health")).body).toEqual({ status: "ok", ai: { source: "stub" } });
  });
});
