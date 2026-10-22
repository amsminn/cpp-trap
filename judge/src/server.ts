import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ALLOWED_FLAGS } from "../../shared/src/contract.js";
import type { JudgeRequest } from "../../shared/src/contract.js";
import { health, initialize, judge } from "./run.js";

const allowed = new Set<string>(ALLOWED_FLAGS);
let busy = false;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readRequest(request: IncomingMessage): Promise<JudgeRequest | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 65_536) {
      request.resume();
      return undefined;
    }
    chunks.push(bytes);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  if (typeof body !== "object" || body === null || !("source" in body) || typeof body.source !== "string") return undefined;
  if ("flags" in body) {
    if (!Array.isArray(body.flags) || !body.flags.every((flag: unknown) => typeof flag === "string" && !flag.startsWith("@") && allowed.has(flag))) return undefined;
    return { source: body.source, flags: body.flags };
  }
  return { source: body.source };
}

await initialize();
createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    json(response, 200, health);
    return;
  }
  if (request.method !== "POST" || request.url !== "/judge") {
    json(response, 404, { error: "Not found" });
    return;
  }
  if (!health.ok) {
    json(response, 500, { error: "Judge unhealthy" });
    return;
  }
  if (busy) {
    json(response, 503, { error: "Judge busy" });
    return;
  }
  busy = true;
  try {
    const body = await readRequest(request);
    if (!body) {
      json(response, 400, { error: "Invalid body or flags" });
      return;
    }
    json(response, 200, await judge(body));
  } catch (error) {
    // HTTP boundary: do not return source, compiler internals, or token details.
    console.error(error instanceof Error ? error.name : "JudgeError");
    json(response, 500, { error: "Judge failed" });
  } finally {
    busy = false;
  }
}).listen(8080, "0.0.0.0");
