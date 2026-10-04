import { z } from "zod";

// ============================================================
// TOOL INTERFACE
// ============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  execute: (args: any) => Promise<any>;
  sampleArgs?: Record<string, any>;
  sampleOutput?: any;
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
        .describe(
          "The product search query extracted from the user's request.",
        ),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of products to return."),
    }),
    sampleArgs: { query: "Nike Air Max", limit: 2 },
    sampleOutput: {
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
    },
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
    sampleArgs: { order_id: "DH-12345" },
    sampleOutput: {
      order_id: "DH-12345",
      status: "shipping",
      carrier: "DHL",
      tracking_number: "DHL-VN-987654321",
      estimated_delivery: "2026-10-04",
    },

    execute: async ({ order_id }) => {
      console.log("EXECUTING TOOL: get_order_status");
      console.log({ order_id });

      return {
        order_id,
        status: "shipping",
        carrier: "DHL",
        tracking_number: "DHL-VN-987654321",
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
    sampleArgs: { query: "thời tiết Hà Nội hôm nay" },
    sampleOutput: {
      results: [
        {
          title: "Example web result",
          url: "https://example.com",
          snippet: "Example external information.",
        },
      ],
    },
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
    sampleArgs: { reason: "Cần hỗ trợ tư vấn bảo hành đặc biệt" },
    sampleOutput: {
      success: true,
      message: "Conversation has been transferred to a human agent.",
    },
    execute: async ({ reason }) => {
      console.log("EXECUTING TOOL: contact_human");
      console.log({ reason });

      return {
        success: true,
        message: "Conversation has been transferred to a human agent.",
      };
    },
  },
  {
    name: "get_shipping_details",

    description:
      "Get detailed shipping information using the tracking number returned by get_order_status.",

    schema: z.object({
      tracking_number: z
        .string()
        .describe("The tracking number returned by get_order_status."),
    }),
    sampleArgs: { tracking_number: "DHL-VN-987654321" },
    sampleOutput: {
      tracking_number: "DHL-VN-987654321",
      current_location: "Hanoi, Vietnam",
      carrier: "DHL",
      estimated_delivery: "2026-10-06",
      last_update: "Package arrived at Hanoi distribution center.",
    },

    execute: async ({ tracking_number }) => {
      console.log("EXECUTING TOOL: get_shipping_details");
      console.log({ tracking_number });

      return {
        tracking_number,
        current_location: "Hanoi, Vietnam",
        carrier: "DHL",
        estimated_delivery: "2026-10-06",
        last_update: "Package arrived at Hanoi distribution center.",
      };
    },
  },
];

export function getToolsOverview() {
  return tools.map((t) => {
    const jsonSchema = z.toJSONSchema(t.schema) as any;
    const properties = jsonSchema.properties || {};
    const requiredList = Array.isArray(jsonSchema.required) ? jsonSchema.required : [];
    const parameters = Object.entries(properties).map(([name, prop]: [string, any]) => ({
      name,
      type: prop.type || "any",
      description: prop.description || "",
      required: requiredList.includes(name),
    }));

    return {
      name: t.name,
      description: t.description,
      parameters,
      schema: jsonSchema,
      sampleArgs: t.sampleArgs,
      output: t.sampleOutput,
    };
  });
}
