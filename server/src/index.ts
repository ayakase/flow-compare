import Fastify from "fastify";
import dotenv from "dotenv";
import { langchainRoutes } from "./flows/langchain/index.ts";
import { rawRoutes } from "./flows/raw/index.ts";
import { aisdkRoutes } from "./flows/raw/aisdk.ts";
import { mastraRoutes } from "./flows/mastra/index.ts";
import { initSocketIO } from "./socket.ts";

dotenv.config();

const fastify = Fastify({
  logger: false,
});

// Enable CORS for browser requests
fastify.addHook("onRequest", async (request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (request.method === "OPTIONS") {
    reply.status(204).send();
  }
});

// Initialize Socket.io on Fastify's raw HTTP server
initSocketIO(fastify.server);

import { getToolsOverview } from "./tools.ts";

// Root endpoint: API Overview
fastify.get("/", async () => {
  return {
    status: "ok",
    message: "AgentRAG Fastify Server with Socket.IO",
    endpoints: {
      tools: "GET /tools",
      langchain: "GET or POST /langchain?q=...&sessionId=...",
      raw: "GET or POST /raw?q=...&sessionId=...",
      "raw-aisdk": "GET or POST /raw-aisdk?q=...&sessionId=...",
      mastra: "GET or POST /mastra?q=...&sessionId=...",
    },
    example: "/langchain?q=Shop có bán giày Nike Air Max không?",
  };
});

// GET /tools - Get all available tools, their parameters and outputs
fastify.get("/tools", async () => {
  return {
    tools: getToolsOverview(),
  };
});

// GET /tools/:name - Get a single tool details
fastify.get("/tools/:name", async (request, reply) => {
  const { name } = request.params as { name: string };
  const allTools = getToolsOverview();
  const tool = allTools.find((t) => t.name === name);
  if (!tool) {
    return reply.status(404).send({ error: `Tool ${name} not found` });
  }
  return tool;
});

// Register routes from the flows
fastify.register(langchainRoutes);
fastify.register(rawRoutes);
fastify.register(aisdkRoutes);
fastify.register(mastraRoutes);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 Server listening at http://localhost:${PORT}`);
    console.log(`🔌 Socket.io ready on http://localhost:${PORT}`);
    console.log(`Available flow routes:`);
    console.log(`  - GET/POST http://localhost:${PORT}/langchain?q=...`);
    console.log(`  - GET/POST http://localhost:${PORT}/raw?q=...`);
    console.log(`  - GET/POST http://localhost:${PORT}/raw-aisdk?q=...`);
    console.log(`  - GET/POST http://localhost:${PORT}/mastra?q=...\n`);
  } catch (err) {
    console.error("Error starting Fastify server:", err);
    process.exit(1);
  }
}

start();
