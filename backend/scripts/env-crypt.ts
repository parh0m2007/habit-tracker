/**
 * Шифрование backend/.env для передачи ключа ИИ проверяющему через публичный репозиторий.
 *
 *   npm run lock-key     — зашифровать backend/.env → backend/.env.enc (для автора)
 *   npm run unlock-key   — расшифровать backend/.env.enc → backend/.env (для проверяющего)
 *
 * Пароль берётся из переменной KEY_PASSWORD или запрашивается в терминале.
 * Схема: scrypt (N=2^17) → ключ 256 бит → AES-256-GCM (шифрование + проверка целостности).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export interface EncryptedFile {
  v: 1;
  kdf: "scrypt";
  N: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

function deriveKey(password: string, salt: Buffer, params = SCRYPT): Buffer {
  return scryptSync(password, salt, 32, params);
}

export function encrypt(plaintext: string, password: string): EncryptedFile {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(password, salt), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    v: 1,
    kdf: "scrypt",
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export function decrypt(file: EncryptedFile, password: string): string {
  if (file.v !== 1 || file.kdf !== "scrypt") throw new Error("Неизвестный формат файла");
  const key = deriveKey(password, Buffer.from(file.salt, "base64"), {
    ...SCRYPT,
    N: file.N,
    r: file.r,
    p: file.p,
  });
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "base64"));
  decipher.setAuthTag(Buffer.from(file.tag, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(file.data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Неверный пароль или повреждённый файл");
  }
}

/** Запрос пароля: в терминале — без эха, при перенаправленном вводе — весь stdin. */
async function askPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    return input.trim();
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  out._writeToOutput = (s: string) => {
    if (s.includes(prompt)) out.output.write(s);
  };
  return new Promise((resolve) =>
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    }),
  );
}

async function main() {
  const dir = fileURLToPath(new URL("..", import.meta.url));
  const envPath = `${dir}.env`;
  const encPath = `${dir}.env.enc`;
  const [command] = process.argv.slice(2);
  const force = process.argv.includes("--force");

  if (command !== "encrypt" && command !== "decrypt") {
    console.error("Использование: env-crypt.ts encrypt|decrypt [--force]");
    process.exit(2);
  }

  const from = command === "encrypt" ? envPath : encPath;
  const to = command === "encrypt" ? encPath : envPath;
  if (!existsSync(from)) {
    console.error(`Нет файла ${from}`);
    process.exit(1);
  }
  if (existsSync(to) && !force) {
    console.error(`${to} уже существует. Добавьте --force, чтобы перезаписать.`);
    process.exit(1);
  }

  const password = process.env.KEY_PASSWORD || (await askPassword("Пароль: "));
  if (!password) {
    console.error("Пароль не задан");
    process.exit(1);
  }

  if (command === "encrypt") {
    if (password.length < 16) {
      console.error("Пароль слишком короткий: нужно не меньше 16 символов");
      process.exit(1);
    }
    const encrypted = encrypt(readFileSync(from, "utf8"), password);
    writeFileSync(to, `${JSON.stringify(encrypted, null, 2)}\n`);
    console.log(`Зашифровано: ${to}`);
  } else {
    try {
      writeFileSync(to, decrypt(JSON.parse(readFileSync(from, "utf8")) as EncryptedFile, password));
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
    console.log(`Готово: создан ${to}. Запустите npm run dev — ИИ подключится автоматически.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
