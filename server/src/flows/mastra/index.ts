import dotenv from "dotenv";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tools } from "../../tools.ts";
import { createEmitter, type LogEmitter } from "../../socket.ts";

dotenv.config();

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY is missing");
}

process.env.OPENROUTER_API_KEY = API_KEY;

// ============================================================
// 1. ADAPT TOOLS FOR MASTRA
// ============================================================

const mastraTools = Object.fromEntries(
  tools.map((t) => [
    t.name,
    createTool({
      id: t.name,
      description: t.description,
      inputSchema: t.schema,
      execute: t.execute,
    }),
  ]),
);

// ============================================================
// 2. SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `
You are an AI customer support assistant.

Your job is to answer the user's question using the available context.

IMPORTANT RULES:

1. Do NOT call a tool unless it is actually useful for answering the user's request.

2. If the provided context is sufficient to answer the question,
   answer directly without calling any tool.

3. Use search_products when the user is asking about products,
   product recommendations, prices, specifications, or availability.

4. Use get_order_status when the user asks about a specific order,
   shipment, delivery, or order status.

5. Use search_web when the answer requires current external information
   that is not available in the provided context.

6. Use contact_human when the user explicitly asks to speak with
   a human, staff member, administrator, or support agent.

7. Do not invent tool results.

8. Tool arguments must contain only information that can reasonably
   be extracted from the conversation.

9. If a required argument is missing, do not invent it.
   Ask the user for the missing information instead.

10. You may call more than one tool if necessary.

11. After receiving tool results, use those results to produce
    the final answer to the user.

12. Do not mention internal tool names to the user.
`;

// ============================================================
// 3. AGENT
// ============================================================

const agent = new Agent({
  id: "support-agent",
  name: "Support Agent",
  instructions: SYSTEM_PROMPT,
  model: "openrouter/openai/gpt-5-mini",
  tools: mastraTools,
});

export const defaultMessage =
  "Order #45 của tôi đến đâu rồi? tôi muốn nói chuyện với nhân viên hỗ trợ đc ko";

// ============================================================
// 4. CORE LOGIC (WITH REAL-TIME STREAMING)
// ============================================================

export async function runMastra(
  userMessage: string = defaultMessage,
  emit?: LogEmitter,
): Promise<string> {
  const query = userMessage.trim() || defaultMessage;
  console.log(`\nUser Question: ${query}\n`);
  emit?.({ flow: "mastra", type: "info", message: `Bắt đầu xử lý: "${query}"` });

  const ragContext = `
Available knowledge base context:

Our store sells shoes, clothes and accessories.

For detailed product availability and pricing,
the product catalog search tool can be used.
`;

  console.log("START AGENT");
  emit?.({ flow: "mastra", type: "llm", message: "Khởi chạy Mastra Agent..." });

  const result = await agent.generate(
    `
User question:

${query}

Relevant knowledge base context:

${ragContext}
    `,
    {
      onStepFinish: (step: any) => {
        if (step.toolCalls?.length) {
          for (const tc of step.toolCalls) {
            emit?.({
              flow: "mastra",
              type: "tool_call",
              message: `Mastra gọi tool [${tc.toolName || tc.payload?.name || "tool"}]`,
              data: tc.args || tc.payload?.args,
            });
          }
        }
        if (step.toolResults?.length) {
          for (const tr of step.toolResults) {
            emit?.({
              flow: "mastra",
              type: "tool_result",
              message: `Tool thực thi trả về kết quả cho Mastra`,
              data: tr.result,
            });
          }
        }
      },
    },
  );

  console.log("\nFINAL ANSWER");
  console.log(result.text);

  console.log("\nUSAGE");
  console.dir(result.usage, { depth: null });

  emit?.({
    flow: "mastra",
    type: "final",
    message: "Đã nhận câu trả lời cuối cùng",
    data: { answer: result.text },
  });

  return result.text;
}

// ============================================================
// 5. HTTP REQUEST HANDLER & ROUTES
// ============================================================

export interface FlowQuery {
  q?: string;
  question?: string;
  format?: string;
  sessionId?: string;
}

export interface FlowBody {
  q?: string;
  question?: string;
  format?: string;
  sessionId?: string;
}

export type FlowRequest = FastifyRequest<{
  Querystring: FlowQuery;
  Body: FlowBody;
}>;

export async function mastraHandler(request: FlowRequest, reply: FastifyReply) {
  try {
    const queryParam = request.query?.q || request.query?.question;
    const bodyParam = request.body?.q || request.body?.question;
    const sessionId = request.query?.sessionId || request.body?.sessionId;
    const userMessage = (queryParam || bodyParam || "").trim() || defaultMessage;

    const emit = createEmitter(sessionId);
    const answer = await runMastra(userMessage, emit);

    if (request.query?.format === "text" || request.body?.format === "text") {
      return reply.type("text/plain").send(answer);
    }

    return { answer };
  } catch (err: any) {
    console.error("Error in mastraHandler:", err);
    reply.status(500).send({ error: err.message || "Internal server error" });
  }
}

export async function mastraRoutes(fastify: FastifyInstance) {
  fastify.get("/mastra", mastraHandler);
  fastify.post("/mastra", mastraHandler);
}

// ============================================================
// 6. CLI SUPPORT
// ============================================================

async function main() {
  const userMessage = process.argv.slice(2).join(" ").trim() || defaultMessage;
  await runMastra(userMessage);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error("ERROR:");
    console.error(error);
  });
}
