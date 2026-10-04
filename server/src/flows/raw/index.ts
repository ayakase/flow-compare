import dotenv from "dotenv";
import { z } from "zod";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tools } from "../../tools.ts";
import { createEmitter, type LogEmitter } from "../../socket.ts";

dotenv.config();

const API_KEY = process.env.API_KEY;
const MODEL = "openai/gpt-5-mini";

// ============================================================
// 1. ADAPT TOOLS FOR RAW (OPENAI SPEC)
// ============================================================

const rawTools = tools.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: z.toJSONSchema(t.schema),
  },
}));

async function executeTool(name: string, args: any) {
  const target = tools.find((t) => t.name === name);
  if (!target) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return target.execute(args);
}

// ============================================================
// 2. SYSTEM PROMPT
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

13. Please explain the reasoning before deciding to call any tool.
`;

// ============================================================
// 3. OPENROUTER REQUEST
// ============================================================

async function callOpenRouter(messages: any[]): Promise<any> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: rawTools,
        tool_choice: "auto",
        temperature: 0.2,
      }),
    },
  );

  const data = (await response.json()) as any;

  if (!response.ok) {
    console.error(data);
    throw new Error(
      data?.error?.message || `OpenRouter error ${response.status}`,
    );
  }

  return data;
}

export const defaultMessage =
  "Order #45 của tôi đến đâu rồi? tôi muốn nói chuyện với nhân viên hỗ trợ đc ko";

// ============================================================
// 4. CORE LOGIC (AGENT LOOP WITH REAL-TIME STREAMING)
// ============================================================

export async function runRaw(
  userMessage: string = defaultMessage,
  emit?: LogEmitter,
): Promise<string> {
  const query = userMessage.trim() || defaultMessage;
  // console.log(`\nUser Question: ${query}\n`);
  emit?.({ flow: "raw", type: "info", message: `Bắt đầu xử lý: "${query}"` });

  const ragContext = `
Available knowledge base context:

Our store sells shoes, clothes and accessories.

For detailed product availability and pricing,
the product catalog search tool can be used.
`;

  const messages: any[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: `
User question:
${query}

Relevant knowledge base context:
${ragContext}
`,
    },
  ];

  const maxSteps = 6;
  let step = 1;

  while (step <= maxSteps) {
    console.log(
      `\n📦 [Step #${step}] Mảng messages chuẩn bị gửi cho LLM (${messages.length} items):`,
    );
    console.table(
      messages.map((m, idx) => ({
        index: idx,
        role: m.role,
        content:
          m.role === "system"
            ? "(System Prompt & Tool Rules)"
            : m.role === "assistant" && m.tool_calls
              ? `${m.content ? `"${m.content}" ` : ""}[Gọi tool: ${m.tool_calls.map((t: any) => t.function?.name).join(", ")}]`
              : typeof m.content === "string"
                ? m.content.replace(/\s+/g, " ").trim().slice(0, 65) +
                  (m.content.length > 65 ? "..." : "")
                : m.content,
      })),
    );

    emit?.({
      flow: "raw",
      type: "llm",
      message: `Gửi request #${step} tới LLM (${MODEL})...`,
    });

    const response = await callOpenRouter(messages);
    const assistantMessage = response?.choices?.[0]?.message;
    if (!assistantMessage) {
      const errMsg = "OpenRouter returned no assistant message";
      emit?.({ flow: "raw", type: "error", message: errMsg });
      throw new Error(errMsg);
    }

    // console.log(`LLM RESPONSE #${step}`);
    // const { reasoning_details, ...cleanAssistantMessage } = assistantMessage;
    // console.dir(cleanAssistantMessage, { depth: null });

    // Khi model không gọi thêm tool nào -> đã có câu trả lời cuối cùng
    if (
      !assistantMessage.tool_calls ||
      assistantMessage.tool_calls.length === 0
    ) {
      const finalAnswer =
        assistantMessage.content || assistantMessage.reasoning || "";
      // console.log("\nFINAL ANSWER");
      // console.log(finalAnswer);
      emit?.({
        flow: "raw",
        type: "final",
        message: "Đã nhận câu trả lời cuối cùng",
        data: { answer: finalAnswer },
      });
      return finalAnswer;
    }

    // Model quyết định gọi 1 hoặc nhiều tools
    const toolNames = assistantMessage.tool_calls.map(
      (t: any) => t.function?.name,
    );
    // console.log(
    //   `MODEL DECIDED TO CALL ${assistantMessage.tool_calls.length} TOOL(S) at Step #${step}: ${toolNames.join(", ")}`,
    // );
    emit?.({
      flow: "raw",
      type: "tool_call",
      message: `Model yêu cầu gọi ${assistantMessage.tool_calls.length} tool(s): [${toolNames.join(", ")}]`,
      data: assistantMessage.tool_calls,
    });

    // Chuẩn hóa assistant message đưa vào conversation history
    messages.push({
      role: "assistant",
      content: assistantMessage.content ?? null,
      tool_calls: assistantMessage.tool_calls,
    });

    // Thực thi các tools được gọi
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function?.name || toolCall.name;
      let args: any = {};
      try {
        args = JSON.parse(toolCall.function?.arguments || "{}");
      } catch (err) {
        console.error(`Invalid JSON arguments from tool ${toolName}:`, err);
      }

      emit?.({
        flow: "raw",
        type: "tool_call",
        message: `Đang thực thi tool [${toolName}]...`,
        data: args,
      });

      const result = await executeTool(toolName, args);

      emit?.({
        flow: "raw",
        type: "tool_result",
        message: `Tool [${toolName}] đã thực thi xong`,
        data: result,
      });
      // console.log(`Tool [${toolName}] executed with result:`, result);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    step++;
  }

  // console.log("Reached maximum tool calling iterations.");
  const lastMsg = messages[messages.length - 1];
  const finalAnswer = lastMsg?.content || "";
  emit?.({
    flow: "raw",
    type: "final",
    message: "Hoàn tất các bước gọi tool",
    data: { answer: finalAnswer },
  });
  return finalAnswer;
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

export async function rawHandler(request: FlowRequest, reply: FastifyReply) {
  try {
    const queryParam = request.query?.q || request.query?.question;
    const bodyParam = request.body?.q || request.body?.question;
    const sessionId = request.query?.sessionId || request.body?.sessionId;
    const userMessage =
      (queryParam || bodyParam || "").trim() || defaultMessage;

    const emit = createEmitter(sessionId);
    const answer = await runRaw(userMessage, emit);

    if (request.query?.format === "text" || request.body?.format === "text") {
      return reply.type("text/plain").send(answer);
    }

    return { answer };
  } catch (err: any) {
    console.error("Error in rawHandler:", err);
    reply.status(500).send({ error: err.message || "Internal server error" });
  }
}

export async function rawRoutes(fastify: FastifyInstance) {
  fastify.get("/raw", rawHandler);
  fastify.post("/raw", rawHandler);
}

// ============================================================
// 6. CLI SUPPORT
// ============================================================

async function main() {
  const userMessage = process.argv.slice(2).join(" ").trim() || defaultMessage;
  await runRaw(userMessage);
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
