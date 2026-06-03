import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { analyzeReport } from "@/lib/report.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UploadCloud, Loader2, FileCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Upload Report — MediSense" }] }),
  component: UploadPage,
});

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function UploadPage() {
  const navigate = useNavigate();
  const analyze = useServerFn(analyzeReport);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      setStep("Uploading file…");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user!.id;
      const reportTitle = title.trim() || file.name.replace(/\.[^.]+$/, "");

      const { data: report, error: insErr } = await supabase
        .from("reports")
        .insert({ user_id: userId, title: reportTitle, status: "pending" })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${userId}/${report.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("reports")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      await supabase.from("reports").update({ file_path: path }).eq("id", report.id);

      setStep("AI is reading your report…");
      const dataUrl = await fileToDataUrl(file);
      const res = await analyze({
        data: { reportId: report.id, fileDataUrl: dataUrl, title: reportTitle },
      });

      if (!res.ok) {
        toast.error(res.error ?? "Analysis failed");
      } else {
        toast.success(`Analyzed — ${res.metricCount} values found.`);
        navigate({ to: "/trends" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setStep("");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Upload a medical report</h1>
        <p className="mt-1 text-muted-foreground">
          Upload a PDF or image of your lab report. Our AI agent extracts the values,
          summarizes them, and tracks them over time.
        </p>
      </div>

      <Card className="space-y-5 p-6">
        <div>
          <Label htmlFor="title">Report title (optional)</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Blood test — June 2026"
            disabled={busy}
          />
        </div>

        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/40 p-10 text-center transition-colors hover:border-primary"
        >
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <FileCheck className="h-10 w-10 text-success" />
              <p className="mt-3 font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">Click to change</p>
            </>
          ) : (
            <>
              <UploadCloud className="h-10 w-10 text-primary" />
              <p className="mt-3 font-medium">Click to choose a file</p>
              <p className="text-sm text-muted-foreground">PDF or image, up to ~15MB</p>
            </>
          )}
        </label>

        <Button className="w-full" onClick={handleUpload} disabled={!file || busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy ? step || "Working…" : "Analyze report"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          MediSense is for educational purposes and not a substitute for professional
          medical advice.
        </p>
      </Card>
    </div>
  );
}
