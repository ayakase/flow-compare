import "dotenv/config";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
if (!process.env.API_KEY) throw new Error("no API_KEY");
process.env.OPENROUTER_API_KEY = process.env.API_KEY;
const getWeather = createTool({
  id: "get_weather",
  description: "Get the current weather of a city.",
  inputSchema: z.object({
    city: z.string().describe("The city to get weather for"),
  }),
  execute: async (inputData) => {
    console.log("useTool");
    return {
      city: inputData.city,
      temperature: 25,
      condition: "Sunny",
    };
  },
});
const agent = new Agent({
  id: "weather-assistant",
  name: "Weather Assistant",
  instructions: `
You are a helpful weather assistant.
Rules:
1. When the user asks about weather,
   use the get_weather tool.
2. Do not invent weather information.
3. After receiving the tool result,
   use it to answer the user.
4. If the user does not ask about weather,
   answer normally without using the tool.
`,
  model: "openrouter/openai/gpt-5-mini",
  tools: {
    get_weather: getWeather,
  },
});
async function main() {
  const userMessage =
    process.argv.slice(2).join(" ").trim() || "Hello, what is the weather now";
  const result = await agent.generate(userMessage);
  console.log("\nFINAL ANSWER:", result.text);
}
main().catch((error) => {
  console.error("\nERROR:", error);
});
