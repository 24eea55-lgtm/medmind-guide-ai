import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chat, embed, AIError } from "./ai.server";

async function retrieveContext(
  supabase: any,
  query: string,
  matchCount = 4,
): Promise<{ title: string; content: string }[]> {
  try {
    const queryEmbedding = await embed(query);
    const { data } = await supabase.rpc("match_knowledge_docs", {
      query_embedding: queryEmbedding,
      match_count: matchCount,
    });
    return (data ?? []).map((d: any) => ({ title: d.title, content: d.content }));
  } catch (e) {
    console.error("retrieveContext failed:", e);
    return [];
  }
}

// Medicine guidance agent (RAG over reference docs + AI knowledge).
export const getMedicineGuidance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ medicineId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      const { data: med } = await supabase
        .from("medicines")
        .select("id, name, dosage, frequency, notes")
        .eq("id", data.medicineId)
        .eq("user_id", userId)
        .single();
      if (!med) return { ok: false, error: "Medicine not found." };

      const docs = await retrieveContext(
        supabase,
        `${med.name} ${med.dosage ?? ""} usage, dosage, side effects, precautions`,
      );
      const contextText = docs.length
        ? docs.map((d) => `# ${d.title}\n${d.content}`).join("\n\n")
        : "No reference documents available.";

      const completion = await chat(
        [
          {
            role: "system",
            content:
              "You are a medication guidance agent. Using the provided reference documents first (and general medical knowledge to fill gaps), explain how to use the medicine safely. Use markdown with sections: What it's for, How to take it, Common side effects, Precautions. Be concise and always advise consulting a doctor or pharmacist.",
          },
          {
            role: "user",
            content: `Reference documents:\n${contextText}\n\nMedicine: ${med.name}${med.dosage ? `, dosage ${med.dosage}` : ""}${med.frequency ? `, frequency ${med.frequency}` : ""}. Provide guidance for the patient.`,
          },
        ],
        { model: "google/gemini-3-flash-preview" },
      );

      const guidance = completion.choices?.[0]?.message?.content ?? "";
      await supabase
        .from("medicines")
        .update({ guidance })
        .eq("id", med.id)
        .eq("user_id", userId);

      return { ok: true, guidance };
    } catch (e) {
      if (e instanceof AIError) return { ok: false, error: e.message };
      console.error("getMedicineGuidance failed:", e);
      return { ok: false, error: "Failed to generate guidance." };
    }
  });

// Doubt-clearing chat agent (RAG + patient context aware).
export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ message: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      await supabase
        .from("chat_messages")
        .insert({ user_id: userId, role: "user", content: data.message });

      const [{ data: history }, { data: meds }, { data: recentReports }] =
        await Promise.all([
          supabase
            .from("chat_messages")
            .select("role, content")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(12),
          supabase
            .from("medicines")
            .select("name, dosage, frequency")
            .eq("user_id", userId)
            .limit(20),
          supabase
            .from("reports")
            .select("title, summary, report_date")
            .eq("user_id", userId)
            .eq("status", "analyzed")
            .order("created_at", { ascending: false })
            .limit(3),
        ]);

      const docs = await retrieveContext(supabase, data.message);
      const contextText = docs.length
        ? docs.map((d) => `# ${d.title}\n${d.content}`).join("\n\n")
        : "No reference documents matched.";

      const ordered = (history ?? []).slice().reverse();
      const completion = await chat(
        [
          {
            role: "system",
            content: `You are a friendly medical assistant that helps patients understand their reports and medicines. Use the reference documents and the patient's own data when relevant. Be clear and supportive, use markdown, and always remind users to consult a healthcare professional for medical decisions. Never diagnose definitively.

Reference documents:
${contextText}

Patient medicines: ${JSON.stringify(meds ?? [])}
Recent report summaries: ${JSON.stringify(recentReports ?? [])}`,
          },
          ...ordered.map((m: any) => ({ role: m.role, content: m.content })),
        ],
        { model: "google/gemini-3-flash-preview" },
      );

      const reply =
        completion.choices?.[0]?.message?.content ??
        "Sorry, I couldn't generate a response.";
      await supabase
        .from("chat_messages")
        .insert({ user_id: userId, role: "assistant", content: reply });

      return { ok: true, reply };
    } catch (e) {
      if (e instanceof AIError) return { ok: false, error: e.message };
      console.error("sendChatMessage failed:", e);
      return { ok: false, error: "Failed to get a response." };
    }
  });

// Ingest a reference document into the RAG knowledge base.
export const ingestKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(50000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      // Chunk content into ~1500 char pieces.
      const chunks: string[] = [];
      const text = data.content.trim();
      for (let i = 0; i < text.length; i += 1400) {
        chunks.push(text.slice(i, i + 1500));
      }
      const rows = [];
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await embed(chunks[i]);
        rows.push({
          title: chunks.length > 1 ? `${data.title} (part ${i + 1})` : data.title,
          content: chunks[i],
          embedding: JSON.stringify(embedding),
        });
      }
      const { error } = await supabaseAdmin.from("knowledge_docs").insert(rows);
      if (error) throw error;
      return { ok: true, chunks: rows.length };
    } catch (e) {
      if (e instanceof AIError) return { ok: false, error: e.message };
      console.error("ingestKnowledge failed:", e);
      return { ok: false, error: "Failed to add reference document." };
    }
  });
