import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { compareReports } from "@/lib/report.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/Markdown";
import { toast } from "sonner";
import { Loader2, Sparkles, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/trends")({
  head: () => ({ meta: [{ title: "Health Trends — MediSense" }] }),
  component: TrendsPage,
});

type Metric = {
  name: string;
  value: number | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: string | null;
  created_at: string;
  report_id: string;
};

function TrendsPage() {
  const compare = useServerFn(compareReports);
  const [comparison, setComparison] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["metrics"],
    queryFn: async () => {
      const { data } = await supabase
        .from("report_metrics")
        .select("name, value, unit, ref_low, ref_high, flag, created_at, report_id")
        .order("created_at", { ascending: true });
      return (data ?? []) as Metric[];
    },
  });

  const grouped = (data ?? []).reduce<Record<string, Metric[]>>((acc, m) => {
    if (m.value == null) return acc;
    (acc[m.name] ??= []).push(m);
    return acc;
  }, {});

  const runComparison = async () => {
    setComparing(true);
    try {
      const res = await compare();
      if (!res.ok) toast.error(res.error ?? "Comparison failed");
      else if (!res.comparison) toast.info("Upload at least two reports to compare.");
      else setComparison(res.comparison);
    } catch {
      toast.error("Comparison failed");
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Health trends</h1>
          <p className="mt-1 text-muted-foreground">
            How your lab values change across reports.
          </p>
        </div>
        <Button onClick={runComparison} disabled={comparing}>
          {comparing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Compare latest reports
        </Button>
      </div>

      {comparison && (
        <Card className="border-primary/30 bg-accent/40 p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="h-5 w-5 text-primary" /> AI health comparison
          </h2>
          <Markdown>{comparison}</Markdown>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No numeric values yet. Upload reports to see trends.
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {Object.entries(grouped).map(([name, points]) => {
            const last = points[points.length - 1];
            const chartData = points.map((p) => ({
              date: format(new Date(p.created_at), "MMM d"),
              value: p.value,
            }));
            return (
              <Card key={name} className="p-5">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Latest: {last.value} {last.unit ?? ""}
                      {last.ref_low != null && last.ref_high != null && (
                        <> · ref {last.ref_low}–{last.ref_high}</>
                      )}
                    </p>
                  </div>
                  {last.flag && last.flag !== "normal" && (
                    <Badge
                      variant={last.flag === "high" || last.flag === "low" ? "destructive" : "secondary"}
                    >
                      {last.flag}
                    </Badge>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                    {last.ref_low != null && last.ref_high != null && (
                      <ReferenceArea
                        y1={last.ref_low}
                        y2={last.ref_high}
                        fill="var(--success)"
                        fillOpacity={0.12}
                      />
                    )}
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} width={40} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
