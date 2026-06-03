// Server-only helpers for calling the Lovable AI Gateway.
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

export class AIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: unknown };

export async function chat(
  messages: ChatMessage[],
  opts: { model?: string; tools?: unknown; tool_choice?: unknown } = {},
): Promise<any> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3-flash-preview",
      messages,
      ...(opts.tools ? { tools: opts.tools } : {}),
      ...(opts.tool_choice ? { tool_choice: opts.tool_choice } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429)
      throw new AIError(429, "AI rate limit reached. Please wait a moment and try again.");
    if (res.status === 402)
      throw new AIError(402, "AI credits exhausted. Please add credits to continue.");
    console.error("AI gateway error:", res.status, body);
    throw new AIError(res.status, "The AI service returned an error.");
  }
  return res.json();
}

export async function embed(input: string): Promise<number[]> {
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Embedding error:", res.status, body);
    throw new AIError(res.status, "Failed to generate embeddings.");
  }
  const json = await res.json();
  return json.data[0].embedding as number[];
}
