import type { ApiErrorBody } from "@tracker/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  static notFound(what = "Ресурс") {
    return new HttpError(404, "not_found", `${what} не найден(а)`);
  }
}

/** Разбирает тело/параметры через zod-схему; ошибка превращается в 400 с деталями по полям. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "validation_error", "Некорректные данные запроса", z.flattenError(result.error));
  }
  return result.data;
}

const IdSchema = z.coerce.number().int().positive();

export function parseId(value: unknown, name = "id"): number {
  const result = IdSchema.safeParse(value);
  if (!result.success) throw new HttpError(400, "invalid_id", `Некорректный ${name}`);
  return result.data;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "route_not_found", `Маршрут ${req.method} ${req.path} не существует`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let body: ApiErrorBody;
  let status: number;

  if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    body = { error: { code: "invalid_json", message: "Тело запроса — некорректный JSON" } };
  } else {
    console.error(err);
    status = 500;
    body = { error: { code: "internal_error", message: "Внутренняя ошибка сервера" } };
  }

  res.status(status).json(body);
};
