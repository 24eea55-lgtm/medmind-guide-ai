import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMedicineGuidance } from "@/lib/medicine.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/Markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pill, Plus, Sparkles, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/medicines")({
  head: () => ({ meta: [{ title: "Medicines — MediSense" }] }),
  component: MedicinesPage,
});

type Medicine = {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  guidance: string | null;
};

function MedicinesPage() {
  const qc = useQueryClient();
  const guide = useServerFn(getMedicineGuidance);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data: meds, isLoading } = useQuery({
    queryKey: ["medicines"],
    queryFn: async () => {
      const { data } = await supabase
        .from("medicines")
        .select("id, name, dosage, frequency, guidance")
        .order("created_at", { ascending: false });
      return (data ?? []) as Medicine[];
    },
  });

  const addMedicine = async () => {
    if (!name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("medicines").insert({
      user_id: u.user!.id,
      name: name.trim(),
      dosage: dosage.trim() || null,
      frequency: frequency.trim() || null,
    });
    if (error) return toast.error(error.message);
    setName("");
    setDosage("");
    setFrequency("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["medicines"] });
  };

  const removeMedicine = async (id: string) => {
    await supabase.from("medicines").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["medicines"] });
  };

  const getGuidance = async (id: string) => {
    setLoadingId(id);
    try {
      const res = await guide({ data: { medicineId: id } });
      if (!res.ok) toast.error(res.error ?? "Failed");
      else qc.invalidateQueries({ queryKey: ["medicines"] });
    } catch {
      toast.error("Failed to get guidance");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Your medicines</h1>
          <p className="mt-1 text-muted-foreground">
            Get AI guidance grounded in your reference documents.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add medicine
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a medicine</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Name (e.g. Metformin)" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Dosage (e.g. 500mg)" value={dosage} onChange={(e) => setDosage(e.target.value)} />
              <Input placeholder="Frequency (e.g. twice daily)" value={frequency} onChange={(e) => setFrequency(e.target.value)} />
              <Button className="w-full" onClick={addMedicine}>
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (meds?.length ?? 0) === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No medicines yet. Add one, or upload a report that mentions medicines.
        </Card>
      ) : (
        <div className="space-y-4">
          {meds!.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Pill className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {[m.dosage, m.frequency].filter(Boolean).join(" · ") || "No details"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => getGuidance(m.id)}
                    disabled={loadingId === m.id}
                  >
                    {loadingId === m.id ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-4 w-4" />
                    )}
                    {m.guidance ? "Refresh" : "Get guidance"}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => removeMedicine(m.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              {m.guidance && (
                <div className="mt-4 rounded-lg bg-muted/50 p-4">
                  <Markdown>{m.guidance}</Markdown>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
