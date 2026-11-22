import { GenerateSubtasksSchema } from "@tracker/shared";
import { Router } from "express";
import { parse } from "../http/errors.ts";
import type { SubtaskGenerator } from "./subtask-generator.ts";

export function aiRouter(generator: SubtaskGenerator): Router {
  const router = Router();

  /** POST /api/ai/subtasks { title, description? } → 3 предложенные подзадачи (не сохраняются). */
  router.post("/subtasks", async (req, res) => {
    const input = parse(GenerateSubtasksSchema, req.body);
    res.json(await generator.generate(input));
  });

  return router;
}
