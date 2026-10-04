import { createAgent } from "langchain";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tools } from "../../tools.ts";
import { createEmitter, type LogEmitter } from "../../socket.ts";

dotenv.config();

const API_KEY = process.env.API_KEY;
const MODEL = "openai/gpt-5-mini";

// ============================================================
// 1. MODEL
// ============================================================

const model = new ChatOpenAI({
  model: MODEL,
  apiKey: API_KEY,
  temperature: 0.2,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

// ============================================================
// 2. ADAPT TOOLS FOR LANGCHAIN
// ============================================================

const langchainTools = tools.map((t) =>
  tool(t.execute, {
    name: t.name,
    description: t.description,
    schema: t.schema,
  }),
);

// ============================================================
// 3. SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `
You are an AI customer support assistant.

Your job is to answer the user's question using the available context.

IMPORTANT RULES:

1. Do NOT call a tool unless it is actually useful.
2. If the provided context is sufficient, answer directly.
3. Use search_products for products, prices, specifications,
   availability, or recommendations.
4. Use get_order_status for order, shipment, delivery,
   or order status questions.
5. Use search_web when current external information is required.
6. Use contact_human when the user explicitly asks for a human.
7. Do not invent tool results.
8. Tool arguments must only contain information from the conversation.
9. If a required argument is missing, ask the user.
10. You may call multiple tools if necessary.
11. After receiving tool results, use them to produce the final answer.
12. Do not mention internal tool names to the user.
`;

// ============================================================
// 4. AGENT
// ============================================================

const agent = createAgent({
  model,
  tools: langchainTools,
  systemPrompt: SYSTEM_PROMPT,
});

export const defaultMessage =
  "Order #45 của tôi đến đâu rồi? tôi muốn nói chuyện với nhân viên hỗ trợ đc ko";

// ============================================================
// 5. CORE LOGIC (WITH REAL-TIME STREAMING)
// ============================================================

export async function runLangchain(
  userMessage: string = defaultMessage,
  emit?: LogEmitter,
): Promise<string> {
  const query = userMessage.trim() || defaultMessage;
  console.log(`\nUser Question: ${query}\n`);
  emit?.({
    flow: "langchain",
    type: "info",
    message: `Bắt đầu xử lý: "${query}"`,
  });

  const ragContext = `
Available knowledge base context:

Our store sells shoes, clothes and accessories.

For detailed product availability and pricing,
the product catalog search tool can be used.
`;

  const callbacks = emit
    ? [
        {
          handleLLMStart: () => {
            emit({
              flow: "langchain",
              type: "llm",
              message: `Gửi prompt tới LLM (${MODEL})...`,
            });
          },
          handleToolStart: (toolDef: any, input: any) => {
            emit({
              flow: "langchain",
              type: "tool_call",
              message: `Đang gọi tool [${toolDef.name || "tool"}]...`,
              data: input,
            });
          },
          handleToolEnd: (output: any) => {
            emit({
              flow: "langchain",
              type: "tool_result",
              message: `Tool trả về kết quả thành công`,
              data: output,
            });
          },
        },
      ]
    : undefined;

  const result = await agent.invoke(
    {
      messages: [
        {
          role: "user",
          content: `
User question:

${query}

Relevant knowledge base context:

${ragContext}
          `,
        },
      ],
    },
    { callbacks },
  );

  console.dir(result, { depth: null });

  const messages = result.messages;
  const finalMessage = messages[messages.length - 1];

  const finalAnswer =
    typeof finalMessage.content === "string"
      ? finalMessage.content
      : JSON.stringify(finalMessage.content);

  console.log("\nFINAL ANSWER");
  console.log(finalAnswer);

  emit?.({
    flow: "langchain",
    type: "final",
    message: "Đã nhận câu trả lời cuối cùng",
    data: { answer: finalAnswer },
  });

  return finalAnswer;
}

// ============================================================
// 6. HTTP REQUEST HANDLER & ROUTES
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

export async function langchainHandler(
  request: FlowRequest,
  reply: FastifyReply,
) {
  try {
    const queryParam = request.query?.q || request.query?.question;
    const bodyParam = request.body?.q || request.body?.question;
    const sessionId = request.query?.sessionId || request.body?.sessionId;
    const userMessage =
      (queryParam || bodyParam || "").trim() || defaultMessage;

    const emit = createEmitter(sessionId);
    const answer = await runLangchain(userMessage, emit);

    if (request.query?.format === "text" || request.body?.format === "text") {
      return reply.type("text/plain").send(answer);
    }

    return { answer };
  } catch (err: any) {
    console.error("Error in langchainHandler:", err);
    reply.status(500).send({ error: err.message || "Internal server error" });
  }
}

export async function langchainRoutes(fastify: FastifyInstance) {
  fastify.get("/langchain", langchainHandler);
  fastify.post("/langchain", langchainHandler);
}

// ============================================================
// 7. CLI SUPPORT
// ============================================================

async function main() {
  const userMessage = process.argv.slice(2).join(" ").trim() || defaultMessage;
  await runLangchain(userMessage);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch(console.error);
}
