import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as EnvModule from "./env";

// env() remembers what it parsed, so each test loads a fresh copy of the module.
async function load(): Promise<typeof EnvModule> {
  vi.resetModules();
  return import("./env");
}

beforeEach(() => {
  vi.stubEnv("PAYPAL_CLIENT_ID", "client-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "client-secret");
  vi.stubEnv("STAGE_NAME_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env", () => {
  it("reads the PayPal credentials, with the webhook id optional", async () => {
    const { env } = await load();
    expect(env()).toEqual({ PAYPAL_CLIENT_ID: "client-id", PAYPAL_CLIENT_SECRET: "client-secret" });
  });

  it("refuses to run without PayPal credentials", async () => {
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "");
    const { env } = await load();
    expect(() => env()).toThrow();
  });

  it("only ever talks to the sandbox", async () => {
    const { PAYPAL_API } = await load();
    expect(PAYPAL_API).toBe("https://api-m.sandbox.paypal.com");
  });
});

describe("stageSecret", () => {
  it("uses STAGE_NAME_SECRET when it is set", async () => {
    vi.stubEnv("STAGE_NAME_SECRET", "chosen-secret");
    const { stageSecret } = await load();
    expect(stageSecret()).toBe("chosen-secret");
  });

  it("otherwise derives one from the PayPal secret, without being the PayPal secret", async () => {
    const { stageSecret } = await load();
    const derived = stageSecret();
    expect(derived).toMatch(/^[0-9a-f]{64}$/);
    expect(derived).not.toContain("client-secret");
  });

  it("derives the same key wherever the same credentials run, so a name means the same person", async () => {
    const first = (await load()).stageSecret();
    const second = (await load()).stageSecret();
    expect(first).toBe(second);
  });

  it("derives a different key from different credentials", async () => {
    const first = (await load()).stageSecret();
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "another-secret");
    expect((await load()).stageSecret()).not.toBe(first);
  });
});
