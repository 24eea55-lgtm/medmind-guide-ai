import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSearch, Pill, Upload, MessageCircle, FileText } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MediSense" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [reports, medicines, metrics] = await Promise.all([
        supabase
          .from("reports")
          .select("id, title, status, report_date, created_at, summary")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("medicines").select("id").limit(1000),
        supabase.from("report_metrics").select("flag"),
      ]);
      const flags = metrics.data ?? [];
      const abnormal = flags.filter((m) => m.flag === "high" || m.flag === "low").length;
      return {
        reports: reports.data ?? [],
        medicineCount: medicines.data?.length ?? 0,
        abnormal,
        metricCount: flags.length,
      };
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Your health dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            An overview of your reports, medicines, and trends.
          </p>
        </div>
        <Button asChild>
          <Link to="/upload">
            <Upload className="mr-2 h-4 w-4" /> Upload report
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<FileSearch className="h-5 w-5" />}
          label="Reports"
          value={data?.reports.length ?? 0}
        />
        <StatCard
          icon={<Pill className="h-5 w-5" />}
          label="Medicines tracked"
          value={data?.medicineCount ?? 0}
        />
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="Values to watch"
          value={data?.abnormal ?? 0}
          highlight={(data?.abnormal ?? 0) > 0}
        />
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent reports</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/trends">View trends</Link>
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data?.reports.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">No reports yet.</p>
            <Button asChild className="mt-4">
              <Link to="/upload">Upload your first report</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {data!.reports.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{r.title}</p>
                  <p className="line-clamp-1 text-sm text-muted-foreground">
                    {r.summary ?? "Awaiting analysis"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(r.report_date ?? r.created_at), "PP")}
                  </p>
                </div>
                <Badge
                  variant={r.status === "analyzed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}
                >
                  {r.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4 bg-[image:var(--gradient-hero)] p-6">
        <div>
          <h2 className="text-lg font-semibold">Have a question?</h2>
          <p className="text-sm text-muted-foreground">
            Ask the AI assistant about your reports or medicines.
          </p>
        </div>
        <Button asChild>
          <Link to="/chat">
            <MessageCircle className="mr-2 h-4 w-4" /> Open assistant
          </Link>
        </Button>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div
          className={
            "flex h-10 w-10 items-center justify-center rounded-lg " +
            (highlight ? "bg-warning/15 text-warning" : "bg-accent text-accent-foreground")
          }
        >
          {icon}
        </div>
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </Card>
  );
}
