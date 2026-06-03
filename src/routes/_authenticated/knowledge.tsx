import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ingestKnowledge } from "@/lib/medicine.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BookOpen, Loader2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({ meta: [{ title: "Reference Docs — MediSense" }] }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const qc = useQueryClient();
  const ingest = useServerFn(ingestKnowledge);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["knowledge"],
    queryFn: async () => {
      const { data } = await supabase
        .from("knowledge_docs")
        .select("id, title, created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const handleAdd = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    try {
      const res = await ingest({ data: { title: title.trim(), content: content.trim() } });
      if (!res.ok) toast.error(res.error ?? "Failed");
      else {
        toast.success(`Added (${res.chunks} chunk${res.chunks === 1 ? "" : "s"}).`);
        setTitle("");
        setContent("");
        qc.invalidateQueries({ queryKey: ["knowledge"] });
      }
    } catch {
      toast.error("Failed to add document");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Reference documents</h1>
        <p className="mt-1 text-muted-foreground">
          Paste trusted medical reference text (drug leaflets, clinical guidelines).
          The AI agents retrieve from these to ground medicine guidance and chat answers.
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <div>
          <Label htmlFor="t">Title</Label>
          <Input
            id="t"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Metformin patient leaflet"
            disabled={busy}
          />
        </div>
        <div>
          <Label htmlFor="c">Content</Label>
          <Textarea
            id="c"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste reference text here…"
            rows={8}
            disabled={busy}
          />
        </div>
        <Button onClick={handleAdd} disabled={busy || !title.trim() || !content.trim()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add to knowledge base
        </Button>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Stored documents</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (docs?.length ?? 0) === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No reference documents yet.
          </Card>
        ) : (
          <ul className="space-y-2">
            {docs!.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="font-medium">{d.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
