import {
  CreateSubtasksSchema,
  CreateTaskSchema,
  TaskQuerySchema,
  UpdateSubtaskSchema,
  UpdateTaskSchema,
  type TaskListResponse,
} from "@tracker/shared";
import { Router } from "express";
import { HttpError, parse, parseId } from "../http/errors.ts";
import type { TaskRepository } from "./task.repository.ts";

export function taskRouter(repo: TaskRepository): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const query = parse(TaskQuerySchema, req.query);
    const body: TaskListResponse = { items: repo.list(query), counts: repo.counts(query.q) };
    res.json(body);
  });

  router.post("/", (req, res) => {
    const input = parse(CreateTaskSchema, req.body);
    res.status(201).json(repo.create(input));
  });

  router.get("/:id", (req, res) => {
    const task = repo.get(parseId(req.params.id));
    if (!task) throw HttpError.notFound("Задача");
    res.json(task);
  });

  router.patch("/:id", (req, res) => {
    const patch = parse(UpdateTaskSchema, req.body);
    const task = repo.update(parseId(req.params.id), patch);
    if (!task) throw HttpError.notFound("Задача");
    res.json(task);
  });

  router.delete("/:id", (req, res) => {
    if (!repo.delete(parseId(req.params.id))) throw HttpError.notFound("Задача");
    res.status(204).end();
  });

  // --- Подзадачи ---

  router.post("/:id/subtasks", (req, res) => {
    const { titles } = parse(CreateSubtasksSchema, req.body);
    const created = repo.addSubtasks(parseId(req.params.id), titles);
    if (!created) throw HttpError.notFound("Задача");
    res.status(201).json(created);
  });

  router.patch("/:id/subtasks/:subId", (req, res) => {
    const patch = parse(UpdateSubtaskSchema, req.body);
    const sub = repo.updateSubtask(parseId(req.params.id), parseId(req.params.subId, "subId"), patch);
    if (!sub) throw HttpError.notFound("Подзадача");
    res.json(sub);
  });

  router.delete("/:id/subtasks/:subId", (req, res) => {
    const ok = repo.deleteSubtask(parseId(req.params.id), parseId(req.params.subId, "subId"));
    if (!ok) throw HttpError.notFound("Подзадача");
    res.status(204).end();
  });

  return router;
}
