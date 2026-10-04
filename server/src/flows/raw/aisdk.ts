import dotenv from "dotenv";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, tool, stepCountIs } from "ai";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tools } from "../../tools.ts";
import { createEmitter, type LogEmitter } from "../../socket.ts";

dotenv.config();

const API_KEY = process.env.API_KEY;
const MODEL = "openai/gpt-5-mini";

// ============================================================
// 1. OPENROUTER PROVIDER VIA VERCEL AI SDK
// ============================================================

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: API_KEY,
  compatibility: "compatible",
});

// ============================================================
// 2. ADAPT TOOLS FOR AI SDK
// ============================================================

const aiSdkTools = Object.fromEntries(
  tools.map((t) => [
    t.name,
    tool({
      description: t.description,
      inputSchema: t.schema,
      execute: async (args) => {
        return t.execute(args);
      },
    }),
  ]),
);

// ============================================================
// 3. SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `
You are an AI customer support assistant.

Your job is to answer the user's question using the available context.

You have access to several optional tools.

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

export const defaultMessage =
  "Order #45 của tôi đến đâu rồi? tôi muốn nói chuyện với nhân viên hỗ trợ đc ko";

// ============================================================
// 4. CORE LOGIC (AI SDK WITH AUTOMATIC TOOL CALLING LOOP)
// ============================================================

export async function runAiSdk(
  userMessage: string = defaultMessage,
  emit?: LogEmitter,
): Promise<string> {
  const query = userMessage.trim() || defaultMessage;
  console.log(`\nUser Question: ${query}\n`);
  emit?.({
    flow: "raw-aisdk",
    type: "info",
    message: `Bắt đầu xử lý với AI SDK: "${query}"`,
  });

  const ragContext = `
Available knowledge base context:

Our store sells shoes, clothes and accessories.

For detailed product availability and pricing,
the product catalog search tool can be used.
`;

  emit?.({
    flow: "raw-aisdk",
    type: "llm",
    message: `Khởi chạy AI SDK generateText (${MODEL})...`,
  });

  const result = await generateText({
    model: openrouter.chat(MODEL),
    system: SYSTEM_PROMPT,
    prompt: `User question:\n${query}\n\nRelevant knowledge base context:\n${ragContext}`,
    tools: aiSdkTools,
    stopWhen: stepCountIs(6),
    onStepFinish: (step) => {
      if (step.toolCalls?.length) {
        for (const tc of step.toolCalls) {
          emit?.({
            flow: "raw-aisdk",
            type: "tool_call",
            message: `AI SDK yêu cầu gọi tool [${tc.toolName}]`,
            data: tc.input || tc.args,
          });
        }
      }
      if (step.toolResults?.length) {
        for (const tr of step.toolResults) {
          emit?.({
            flow: "raw-aisdk",
            type: "tool_result",
            message: `Tool [${tr.toolName}] đã thực thi xong`,
            data: tr.output || tr.result,
          });
        }
      }
    },
  });

  console.log("\nFINAL ANSWER (AI SDK)");
  console.log(result.text);

  emit?.({
    flow: "raw-aisdk",
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

export async function aisdkHandler(request: FlowRequest, reply: FastifyReply) {
  try {
    const queryParam = request.query?.q || request.query?.question;
    const bodyParam = request.body?.q || request.body?.question;
    const sessionId = request.query?.sessionId || request.body?.sessionId;
    const userMessage = (queryParam || bodyParam || "").trim() || defaultMessage;

    const emit = createEmitter(sessionId);
    const answer = await runAiSdk(userMessage, emit);

    if (request.query?.format === "text" || request.body?.format === "text") {
      return reply.type("text/plain").send(answer);
    }

    return { answer };
  } catch (err: any) {
    console.error("Error in aisdkHandler:", err);
    reply.status(500).send({ error: err.message || "Internal server error" });
  }
}

export async function aisdkRoutes(fastify: FastifyInstance) {
  fastify.get("/raw-aisdk", aisdkHandler);
  fastify.post("/raw-aisdk", aisdkHandler);
  fastify.get("/aisdk", aisdkHandler);
  fastify.post("/aisdk", aisdkHandler);
}

// ============================================================
// 6. CLI SUPPORT
// ============================================================

async function main() {
  const userMessage = process.argv.slice(2).join(" ").trim() || defaultMessage;
  await runAiSdk(userMessage);
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
