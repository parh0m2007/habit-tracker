import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HealthResponse } from "@tracker/shared";
import express, { type Express } from "express";
import { aiRouter } from "./ai/ai.routes.ts";
import type { SubtaskGenerator } from "./ai/subtask-generator.ts";
import { errorHandler, notFoundHandler } from "./http/errors.ts";
import { taskRouter } from "./tasks/task.routes.ts";
import type { TaskRepository } from "./tasks/task.repository.ts";

export interface AppDeps {
  tasks: TaskRepository;
  ai: SubtaskGenerator;
  /** Каталог собранного фронтенда; если существует — раздаётся как статика. */
  staticDir?: string;
}

const DEFAULT_STATIC = fileURLToPath(new URL("../../frontend/dist", import.meta.url));

export function createApp({ tasks, ai, staticDir = DEFAULT_STATIC }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    const body: HealthResponse = { status: "ok", ai: { source: ai.source, model: ai.model } };
    res.json(body);
  });
  app.use("/api/tasks", taskRouter(tasks));
  app.use("/api/ai", aiRouter(ai));
  app.use("/api", notFoundHandler);

  // Прод-режим: один процесс отдаёт и API, и SPA.
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("/{*path}", (_req, res) => res.sendFile("index.html", { root: staticDir }));
  }

  app.use(errorHandler);
  return app;
}
