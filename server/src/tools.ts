import { z } from "zod";

// ============================================================
// TOOL INTERFACE
// ============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  execute: (args: any) => Promise<any>;
}

// ============================================================
// TOOLS DEFINITION (Single Source of Truth)
// ============================================================

export const tools: ToolDefinition[] = [
  {
    name: "search_products",
    description:
      "Search products in the product catalog when the user is asking about products, prices, availability, specifications, or recommendations.",
    schema: z.object({
      query: z
        .string()
        .describe("The product search query extracted from the user's request."),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of products to return."),
    }),
    execute: async ({ query, limit }) => {
      console.log("EXECUTING TOOL: search_products");
      console.log({ query, limit });

      return {
        products: [
          {
            id: "P001",
            name: "Nike Air Max 270",
            price: 3200000,
            currency: "VND",
            stock: 12,
          },
          {
            id: "P002",
            name: "Nike Air Force 1",
            price: 2800000,
            currency: "VND",
            stock: 5,
          },
        ],
      };
    },
  },

  {
    name: "get_order_status",
    description:
      "Get the current status of a customer's order when the user asks about an order, shipment, delivery, or order progress.",
    schema: z.object({
      order_id: z.string().describe("The customer's order ID."),
    }),
    execute: async ({ order_id }) => {
      console.log("EXECUTING TOOL: get_order_status");
      console.log({ order_id });

      return {
        order_id,
        status: "shipping",
        carrier: "DHL",
        estimated_delivery: "2026-10-04",
      };
    },
  },

  {
    name: "search_web",
    description:
      "Search the public web when the user asks for current, external, or up-to-date information that cannot be answered reliably from the provided knowledge base.",
    schema: z.object({
      query: z.string().describe("The web search query."),
    }),
    execute: async ({ query }) => {
      console.log("EXECUTING TOOL: search_web");
      console.log({ query });

      return {
        results: [
          {
            title: "Example web result",
            url: "https://example.com",
            snippet: "Example external information.",
          },
        ],
      };
    },
  },

  {
    name: "contact_human",
    description:
      "Transfer the conversation to a human support agent when the user explicitly asks to speak with a human, staff member, administrator, or support agent.",
    schema: z.object({
      reason: z.string().describe("Why the user wants human assistance."),
    }),
    execute: async ({ reason }) => {
      console.log("EXECUTING TOOL: contact_human");
      console.log({ reason });

      return {
        success: true,
        message: "Conversation has been transferred to a human agent.",
      };
    },
  },
];
