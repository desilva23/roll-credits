import { beforeEach, describe, expect, it, vi } from "vitest";
import { callTool } from "@/lib/server/mcp-tools";
import { DELETE, GET, POST } from "./route";

vi.mock("@/lib/server/mcp-tools", () => ({
  TOOLS: [{ name: "who_to_credit" }, { name: "credit_maintainers" }],
  callTool: vi.fn(),
}));
const tool = vi.mocked(callTool);

const post = (body: unknown): Promise<Response> =>
  POST(
    new Request("https://app.example/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const rpc = async (body: unknown): Promise<Record<string, unknown>> =>
  (await (await post(body)).json()) as Record<string, unknown>;

beforeEach(() => {
  tool.mockReset();
});

describe("the MCP endpoint", () => {
  it("starts a session in the client's protocol version when it supports it", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    expect(res.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "roll-credits" },
    });
  });

  it("answers an unknown protocol version with its newest", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
    expect((res.result as { protocolVersion: string }).protocolVersion).toBe("2025-11-25");
  });

  it("lists its tools and answers a ping", async () => {
    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect((list.result as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual([
      "who_to_credit",
      "credit_maintainers",
    ]);
    expect((await rpc({ jsonrpc: "2.0", id: 3, method: "ping" })).result).toEqual({});
  });

  it("calls a tool with the address it was reached on, so payment links return there", async () => {
    tool.mockResolvedValueOnce({ content: [{ type: "text", text: "done" }] });
    const res = await rpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "who_to_credit", arguments: { repo: "a/b" } },
    });
    expect(tool).toHaveBeenCalledWith("who_to_credit", { repo: "a/b" }, "https://app.example");
    expect(res.result).toEqual({ content: [{ type: "text", text: "done" }] });
  });

  it("passes empty arguments when a tool call has none", async () => {
    tool.mockResolvedValueOnce({ content: [{ type: "text", text: "x" }] });
    await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "who_to_credit" } });
    expect(tool).toHaveBeenCalledWith("who_to_credit", {}, "https://app.example");
  });

  it("refuses a tool call that names no tool", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: {} });
    expect(res.error).toMatchObject({ code: -32602 });
  });

  it("says when a method does not exist", async () => {
    expect((await rpc({ jsonrpc: "2.0", id: 7, method: "resources/list" })).error).toMatchObject({ code: -32601 });
  });

  it("accepts a notification without answering it", async () => {
    const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it.each([
    ["a message that is not an object", 42],
    ["a request with no method", { jsonrpc: "2.0", id: 8 }],
  ])("rejects %s as an invalid request", async (_label, body) => {
    expect((await rpc(body)).error).toMatchObject({ code: -32600 });
  });

  it("answers a batch with a batch, leaving out the notifications", async () => {
    const res = await post([
      { jsonrpc: "2.0", id: 9, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 10, method: "ping" },
    ]);
    const body = (await res.json()) as { id: number }[];
    expect(body.map((m) => m.id)).toEqual([9, 10]);
  });

  it("reports a body that is not JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32700);
  });

  it("offers no stream and has no sessions to end", () => {
    expect(GET().status).toBe(405);
    expect(DELETE().status).toBe(405);
  });
});
