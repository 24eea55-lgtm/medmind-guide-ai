import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chat, AIError } from "./ai.server";

const analyzeInput = z.object({
  reportId: z.string().uuid(),
  fileDataUrl: z.string().min(10).max(20_000_000),
  title: z.string().min(1).max(200),
});

const extractionTool = {
  type: "function",
  function: {
    name: "record_report",
    description: "Record the structured contents of a medical lab report.",
    parameters: {
      type: "object",
      properties: {
        report_date: {
          type: "string",
          description: "Report date in YYYY-MM-DD if present, else empty string.",
        },
        summary: {
          type: "string",
          description:
            "A clear, friendly 2-4 sentence summary of the report for a non-expert patient, noting any out-of-range values.",
        },
        metrics: {
          type: "array",
          description: "Every measurable lab value found in the report.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: { type: "number" },
              unit: { type: "string" },
              ref_low: { type: "number" },
              ref_high: { type: "number" },
              flag: {
                type: "string",
                enum: ["normal", "high", "low", "unknown"],
              },
            },
            required: ["name", "flag"],
            additionalProperties: false,
          },
        },
        medicines: {
          type: "array",
          description: "Any medicines or prescriptions mentioned in the report.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              dosage: { type: "string" },
            },
            required: ["name"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "metrics"],
      additionalProperties: false,
    },
  },
};

export const analyzeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => analyzeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      const completion = await chat(
        [
          {
            role: "system",
            content:
              "You are a clinical lab report extraction agent. Read the provided medical report and extract every lab value precisely. Always call the record_report tool.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all lab values, reference ranges, flags, a patient-friendly summary, and any medicines from this medical report.",
              },
              { type: "image_url", image_url: { url: data.fileDataUrl } },
            ],
          },
        ],
        {
          model: "google/gemini-2.5-flash",
          tools: [extractionTool],
          tool_choice: { type: "function", function: { name: "record_report" } },
        },
      );

      const call = completion.choices?.[0]?.message?.tool_calls?.[0];
      if (!call) throw new AIError(500, "Could not read the report contents.");
      const parsed = JSON.parse(call.function.arguments);

      const reportDate =
        parsed.report_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.report_date)
          ? parsed.report_date
          : null;

      await supabase
        .from("reports")
        .update({
          status: "analyzed",
          summary: parsed.summary ?? null,
          report_date: reportDate,
          title: data.title,
        })
        .eq("id", data.reportId)
        .eq("user_id", userId);

      const metrics = (parsed.metrics ?? []) as any[];
      if (metrics.length) {
        await supabase.from("report_metrics").insert(
          metrics.map((m) => ({
            report_id: data.reportId,
            user_id: userId,
            name: String(m.name).slice(0, 120),
            value: typeof m.value === "number" ? m.value : null,
            unit: m.unit ? String(m.unit).slice(0, 40) : null,
            ref_low: typeof m.ref_low === "number" ? m.ref_low : null,
            ref_high: typeof m.ref_high === "number" ? m.ref_high : null,
            flag: m.flag ?? "unknown",
          })),
        );
      }

      const meds = (parsed.medicines ?? []) as any[];
      if (meds.length) {
        await supabase.from("medicines").insert(
          meds.map((m) => ({
            user_id: userId,
            name: String(m.name).slice(0, 120),
            dosage: m.dosage ? String(m.dosage).slice(0, 80) : null,
          })),
        );
      }

      return { ok: true, summary: parsed.summary, metricCount: metrics.length };
    } catch (e) {
      await supabase
        .from("reports")
        .update({ status: "failed" })
        .eq("id", data.reportId)
        .eq("user_id", userId);
      if (e instanceof AIError) return { ok: false, error: e.message };
      console.error("analyzeReport failed:", e);
      return { ok: false, error: "Failed to analyze the report." };
    }
  });

// Health monitoring agent: compares the two most recent reports and narrates changes.
export const compareReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    try {
      const { data: reports } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at")
        .eq("user_id", userId)
        .eq("status", "analyzed")
        .order("created_at", { ascending: false })
        .limit(2);

      if (!reports || reports.length < 2) {
        return { ok: true, comparison: null };
      }

      const [latest, previous] = reports;
      const { data: metrics } = await supabase
        .from("report_metrics")
        .select("name, value, unit, flag, report_id, created_at")
        .eq("user_id", userId)
        .in("report_id", [latest.id, previous.id]);

      const completion = await chat(
        [
          {
            role: "system",
            content:
              "You are a health monitoring agent. Compare a patient's two most recent lab reports and explain in plain, encouraging language what improved, what worsened, and what to watch. Use short markdown sections. Always remind them this is not a substitute for a doctor.",
          },
          {
            role: "user",
            content: `Latest report: ${latest.title} (${latest.report_date ?? latest.created_at}). Previous report: ${previous.title} (${previous.report_date ?? previous.created_at}). Metrics JSON (latest report_id=${latest.id}, previous report_id=${previous.id}): ${JSON.stringify(metrics)}`,
          },
        ],
        { model: "google/gemini-3-flash-preview" },
      );

      const comparison = completion.choices?.[0]?.message?.content ?? "";
      return { ok: true, comparison };
    } catch (e) {
      if (e instanceof AIError) return { ok: false, error: e.message };
      console.error("compareReports failed:", e);
      return { ok: false, error: "Failed to compare reports." };
    }
  });
