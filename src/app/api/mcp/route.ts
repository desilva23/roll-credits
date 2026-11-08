import { TOOLS, callTool } from "@/lib/server/mcp-tools";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A Model Context Protocol server over Streamable HTTP, so a coding agent can
 * ask who a project depends on and open a payment for them.
 *
 * It is deliberately stateless: no sessions, no server-sent stream, a JSON
 * reply to every request. That is all two tools need, and it means any
 * serverless instance can answer any message.
 */

/** Newest first. The client's version is echoed back when it is one of these. */
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const SERVER_INFO = { name: "roll-credits", title: "Roll Credits", version: "1.0.0" };

const INSTRUCTIONS =
  "Roll Credits reads a repository's code and pays the open-source maintainers it depends on through PayPal " +
  "(sandbox only). Call who_to_credit to see who would be paid and why. Call credit_maintainers to open a payment; " +
  "it returns a link a person must approve, and nothing is paid without that approval.";

type Id = string | number | null;

interface Message {
  jsonrpc?: string;
  id?: Id;
  method?: string;
  params?: Record<string, unknown>;
}

const reply = (id: Id, result: unknown): object => ({ jsonrpc: "2.0", id, result });
const fail = (id: Id, code: number, message: string): object => ({ jsonrpc: "2.0", id, error: { code, message } });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function initialize(id: Id, params: Record<string, unknown> | undefined): object {
  const requested = params?.protocolVersion;
  const protocolVersion =
    typeof requested === "string" && SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0];
  return reply(id, {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  });
}

async function toolCall(id: Id, params: Record<string, unknown> | undefined, origin: string): Promise<object> {
  const name = params?.name;
  if (typeof name !== "string") return fail(id, -32602, "tools/call needs a tool name");
  return reply(id, await callTool(name, params?.arguments ?? {}, origin));
}

/** Answers one message. Notifications get no answer, as the protocol requires. */
async function answer(message: unknown, origin: string): Promise<object | null> {
  if (typeof message !== "object" || message === null) return fail(null, -32600, "Invalid request");
  const { id, method, params } = message as Message;
  if (id === undefined) return null;
  if (typeof method !== "string") return fail(id, -32600, "Invalid request");

  if (method === "initialize") return initialize(id, params);
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") return reply(id, { tools: TOOLS });
  if (method === "tools/call") return toolCall(id, params, origin);
  return fail(id, -32601, `Method not found: ${method}`);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(fail(null, -32700, "Parse error"), 400);
  }

  // Payment links must return to the address the agent is actually talking to.
  const origin = new URL(request.url).origin;
  const batch = Array.isArray(body);
  const messages: readonly unknown[] = batch ? (body as unknown[]) : [body];
  const answers = (await Promise.all(messages.map(async (m) => answer(m, origin)))).filter(
    (a): a is object => a !== null,
  );

  // Only notifications arrived, so there is nothing to say back.
  if (answers.length === 0) return new Response(null, { status: 202 });
  return json(batch ? answers : answers[0]);
}

/** No server-initiated stream is offered; the protocol asks for a 405 in that case. */
export function GET(): Response {
  return new Response("This MCP server answers POST requests only.", { status: 405, headers: { Allow: "POST" } });
}

/** There are no sessions to end. */
export function DELETE(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
