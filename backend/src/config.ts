import { z } from "zod";

const EnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3001),
  DB_PATH: z.string().default("./data/tasks.db"),
  AI_API_KEY: z.string().trim().optional(),
  AI_BASE_URL: z.url().default("https://tooken.club/v1"),
  AI_MODEL: z.string().trim().default("deepseek-v4.1-flash-1017"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Некорректные переменные окружения: ${z.prettifyError(parsed.error)}`);
  }
  // Пустая строка в .env означает «ключа нет».
  return { ...parsed.data, AI_API_KEY: parsed.data.AI_API_KEY || undefined };
}
