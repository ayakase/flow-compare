const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("Missing OPENROUTER_API_KEY");
}

const prompt = `
You are a retrieval planner for a Retrieval-Augmented Generation (RAG) system used by an automotive garage.

Return ONLY a valid JSON object. The response must contain JSON and nothing else.

The knowledge base contains documents about Mitsubishi vehicles from model year 2016 onward.

Your task is to analyze the latest user question and produce a retrieval plan.

IMPORTANT PRINCIPLES

1. Treat the latest user message as the primary source of intent.
2. Use conversation history only to resolve missing or ambiguous references.
3. Never replace an explicitly mentioned vehicle, model, year, engine, transmission, or part with a different entity from conversation history.
4. Do not invent vehicle facts, specifications, DTC codes, symptoms, or technical details.
5. Generated retrieval queries are search instructions, not answers.
6. Do not generate every retrieval strategy by default. Only use a strategy when it is likely to improve retrieval.
7. Keep all generated queries focused on the user's actual intent.
8. Preserve vehicle-specific constraints such as model, model year, engine, transmission, generation, and market when explicitly known.
9. If the user asks about multiple independent things, use query decomposition.
10. If the user asks one focused question, do not unnecessarily decompose it.
11. If an exact identifier is present, such as a DTC code, engine code, part number, or model code, preserve it exactly.
12. Use the same language as the latest user message.

RETRIEVAL STRATEGIES

A. query

Create one canonical, self-contained retrieval query.
This is always required.

B. hyde

Generate a hypothetical document that would likely appear in the knowledge base and would help retrieve the relevant real documents.

The hypothetical document is ONLY a retrieval aid and must not be treated as factual evidence.

Return null when HyDE is unlikely to improve retrieval.

C. query_expansion

Generate alternative retrieval queries that express the same information need from different useful retrieval angles.

Do not merely replace individual words with synonyms.

Use 0-4 queries.

D. query_decomposition

If the question contains multiple independent information needs, split it into self-contained retrieval queries.

Use 0-6 queries.

If decomposition is unnecessary, return [].

E. search_strategy

Choose the retrieval mechanisms:

- vector: semantic/vector search
- keyword: exact keyword/BM25 search
- hybrid: both vector and keyword search

Use keyword or hybrid when the query contains exact identifiers such as:
- DTC/error codes
- engine codes
- part numbers
- model codes
- exact component names
- technical abbreviations

Use vector when semantic similarity is important.

F. filters

Select documents/files only when the available metadata clearly indicates that they are relevant.

Do not guess.

If the user's question specifies a model, year, engine, transmission, or document type and the file metadata clearly identifies matching documents, select them.

Otherwise leave the arrays empty.

OUTPUT JSON SCHEMA

{
  "query": "...",
  "hyde": null,
  "query_expansion": [],
  "query_decomposition": [],
  "search_strategy": {
    "vector": true,
    "keyword": false,
    "hybrid": false
  },
  "filters": {
    "selected_document_uuids": [],
    "selected_files": []
  }
}

Rules:
- query must be <= 300 characters.
- hyde must be null when not useful.
- query_expansion must contain 0-4 items.
- query_decomposition must contain 0-6 items.
- selected_document_uuids must use ONLY document_uuid values from the file candidates.
- selected_files must use ONLY filename values from the file candidates.
- Never invent document UUIDs or filenames.
- Return valid JSON only.

==================================================
CONVERSATION HISTORY
==================================================

User: Tôi đang xây RAG cho một gara ô tô.
Assistant: Knowledge base có các tài liệu kỹ thuật về xe Mitsubishi từ năm 2016 trở lên.
User: Tôi muốn retrieval không chỉ dựa vào một query embedding mà có thể dùng query expansion, HyDE và decomposition.
Assistant: Có thể dùng một retrieval planner để tạo nhiều retrieval signals trong một lần gọi LLM, sau đó backend merge và rerank các candidate documents.

==================================================
KNOWLEDGE DESCRIPTIONS
==================================================

${JSON.stringify(
  [
    {
      knowledge_id: "knowledge-garage-mitsubishi",
      name: "Mitsubishi Garage Technical Knowledge",
      description:
        "Technical documentation for Mitsubishi passenger cars, SUVs and pickup trucks from model year 2016 onward. Contains maintenance schedules, engine specifications, fluids, repair procedures, diagnostics, DTCs and common service information.",
    },
    {
      knowledge_id: "knowledge-garage-maintenance",
      name: "Garage Maintenance Procedures",
      description:
        "General workshop maintenance procedures covering engine oil, transmission fluid, brake systems, cooling systems, batteries, suspension, steering and scheduled maintenance. Includes Mitsubishi-specific procedures where available.",
    },
    {
      knowledge_id: "knowledge-garage-diagnostics",
      name: "Mitsubishi Diagnostic Database",
      description:
        "Diagnostic information for Mitsubishi vehicles including DTC codes, diagnostic trees, symptoms, possible causes, inspection procedures, sensors, actuators and ECU-related troubleshooting.",
    },
  ],
  null,
  2,
)}

==================================================
FILE CANDIDATES
==================================================

${JSON.stringify(
  [
    {
      document_uuid: "a18f6e42-7c91-4b23-91e1-001",
      filename: "mitsubishi_xpander_2018_2020_maintenance.pdf",
      description:
        "Maintenance schedule and service specifications for Mitsubishi Xpander model years 2018-2020. Includes engine oil, filters, coolant, brake inspection and scheduled maintenance intervals.",
      knowledge_id: "knowledge-garage-mitsubishi",
    },
    {
      document_uuid: "b27c91d5-52a4-48f7-82d2-002",
      filename: "mitsubishi_xpander_2021_2023_service_manual.pdf",
      description:
        "Service manual for Mitsubishi Xpander model years 2021-2023. Covers engine, transmission, brakes, suspension, electrical systems and maintenance procedures.",
      knowledge_id: "knowledge-garage-mitsubishi",
    },
    {
      document_uuid: "c39ad821-16f2-4e92-9bc4-003",
      filename: "mitsubishi_outlander_2016_2018_maintenance.pdf",
      description:
        "Maintenance and service information for Mitsubishi Outlander 2016-2018, including engine oil specifications, capacities, service intervals, brakes and cooling system.",
      knowledge_id: "knowledge-garage-mitsubishi",
    },
    {
      document_uuid: "d41be736-8a27-45c1-a7f5-004",
      filename: "mitsubishi_outlander_2019_2021_service_manual.pdf",
      description:
        "Service manual for Mitsubishi Outlander 2019-2021. Includes engine, CVT, drivetrain, electrical systems, diagnostics and repair procedures.",
      knowledge_id: "knowledge-garage-mitsubishi",
    },
    {
      document_uuid: "e52cf914-3d61-4d88-bc26-005",
      filename: "mitsubishi_triton_2016_2019_maintenance.pdf",
      description:
        "Maintenance schedule and technical specifications for Mitsubishi Triton 2016-2019. Covers diesel engines, engine oil, fuel system, transmission, brakes and scheduled maintenance.",
      knowledge_id: "knowledge-garage-mitsubishi",
    },
    {
      document_uuid: "f63da825-94b2-4fc7-9e37-006",
      filename: "mitsubishi_triton_2020_2023_service_manual.pdf",
      description:
        "Service manual for Mitsubishi Triton 2020-2023. Contains engine, fuel injection, transmission, brakes, suspension, electrical and diagnostic procedures.",
      knowledge_id: "knowledge-garage-mitsubishi",
    },
    {
      document_uuid: "g74eb936-15c3-41da-8f48-007",
      filename: "mitsubishi_pajero_sport_2016_2019_service_manual.pdf",
      description:
        "Service manual for Mitsubishi Pajero Sport 2016-2019. Covers diesel engine systems, transmission, braking system, suspension, steering and diagnostics.",
      knowledge_id: "knowledge-garage-mitsubishi",
    },
    {
      document_uuid: "h85fc147-26d4-42eb-a159-008",
      filename: "mitsubishi_pajero_sport_2020_2023_service_manual.pdf",
      description:
        "Service manual for Mitsubishi Pajero Sport 2020-2023 including engine, transmission, braking, ADAS, electrical and diagnostic systems.",
      knowledge_id: "knowledge-garage-mitsubishi",
    },
    {
      document_uuid: "i96ad258-37e5-43fc-b260-009",
      filename: "mitsubishi_2016_2023_dtc_diagnostic_database.pdf",
      description:
        "Mitsubishi diagnostic database covering common DTC codes and diagnostic procedures across multiple models from 2016-2023, including P0xxx codes, sensor faults, emissions faults and ECU diagnostics.",
      knowledge_id: "knowledge-garage-diagnostics",
    },
    {
      document_uuid: "j07be369-48f6-44ad-c371-010",
      filename: "mitsubishi_brake_system_diagnostics_2016_2023.pdf",
      description:
        "Brake system diagnostic procedures for Mitsubishi vehicles from 2016-2023. Covers brake judder, vibration, disc runout, pad wear, ABS faults and brake inspection procedures.",
      knowledge_id: "knowledge-garage-diagnostics",
    },
    {
      document_uuid: "k18cf471-59a7-45be-d482-011",
      filename: "mitsubishi_engine_oil_and_fluid_specifications.pdf",
      description:
        "Mitsubishi engine oil, coolant, transmission fluid and other fluid specifications for multiple models from 2016 onward. Organized by model, engine and model year.",
      knowledge_id: "knowledge-garage-maintenance",
    },
    {
      document_uuid: "l29dg582-60b8-46cf-e593-012",
      filename: "mitsubishi_general_maintenance_schedule_2016_2023.pdf",
      description:
        "General scheduled maintenance intervals for Mitsubishi vehicles from 2016-2023, including inspections and replacement intervals for filters, fluids, brakes, belts and other consumables.",
      knowledge_id: "knowledge-garage-maintenance",
    },
  ],
  null,
  2,
)}

==================================================
LATEST USER MESSAGE
==================================================

Mitsubishi Outlander 2018 dùng dầu máy gì, bao nhiêu lít và lịch thay dầu như thế nào?
`;

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Mitsubishi RAG Retrieval Planner",
  },
  body: JSON.stringify({
    model: "openai/gpt-5-mini",
    temperature: 0.1,

    response_format: {
      type: "json_object",
    },

    messages: [
      {
        role: "system",
        content: prompt,
      },
    ],
  }),
});

if (!response.ok) {
  console.error("HTTP", response.status);
  console.error(await response.text());
  process.exit(1);
}

const data = await response.json();

const content = data.choices?.[0]?.message?.content;

if (!content) {
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

try {
  console.log(JSON.stringify(JSON.parse(content), null, 2));
} catch {
  console.log(content);
}
