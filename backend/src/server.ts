import { createSubtaskGenerator } from "./ai/subtask-generator.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { TaskRepository } from "./tasks/task.repository.ts";

const config = loadConfig();
const db = openDb(config.DB_PATH);
const ai = createSubtaskGenerator({
  apiKey: config.AI_API_KEY,
  baseURL: config.AI_BASE_URL,
  model: config.AI_MODEL,
  timeoutMs: config.AI_TIMEOUT_MS,
});

const app = createApp({ tasks: new TaskRepository(db), ai });

// Express 5 передаёт в колбэк ошибку запуска (например, занятый порт).
const server = app.listen(config.API_PORT, (err?: Error) => {
  if (err) {
    console.error(`Не удалось запустить API на порту ${config.API_PORT}: ${err.message}`);
    process.exit(1);
  }
  const aiMode = ai.source === "stub" ? "заглушка (AI_API_KEY не задан)" : `${ai.model} через ${config.AI_BASE_URL}`;
  console.log(`API: http://localhost:${config.API_PORT}/api  |  БД: ${config.DB_PATH}  |  ИИ: ${aiMode}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
