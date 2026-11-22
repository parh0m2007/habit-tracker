import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../scripts/env-crypt.ts";

const SECRET = "AI_API_KEY=tc_test_secret_value\nAI_MODEL=deepseek-v4.1-flash-1017\n";
const PASSWORD = "correct horse battery staple";

describe("Шифрование .env", () => {
  it("расшифровывает обратно с правильным паролем", () => {
    expect(decrypt(encrypt(SECRET, PASSWORD), PASSWORD)).toBe(SECRET);
  });

  it("не содержит открытого текста", () => {
    const json = JSON.stringify(encrypt(SECRET, PASSWORD));
    expect(json).not.toContain("tc_test_secret_value");
    expect(json).not.toContain(Buffer.from(SECRET).toString("base64"));
  });

  it("каждый раз даёт разный шифротекст (случайные соль и IV)", () => {
    expect(encrypt(SECRET, PASSWORD).data).not.toBe(encrypt(SECRET, PASSWORD).data);
  });

  it("отклоняет неверный пароль", () => {
    expect(() => decrypt(encrypt(SECRET, PASSWORD), "wrong password")).toThrow("Неверный пароль");
  });

  it("отклоняет изменённый шифротекст", () => {
    const file = encrypt(SECRET, PASSWORD);
    const data = Buffer.from(file.data, "base64");
    data[0] = data[0]! ^ 1;
    expect(() => decrypt({ ...file, data: data.toString("base64") }, PASSWORD)).toThrow();
  });
});
