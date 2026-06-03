import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Activity,
  FileSearch,
  Pill,
  LineChart,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MediSense — AI Medical Report Analysis & Health Companion" },
      {
        name: "description",
        content:
          "Upload lab reports, get plain-language analysis, medicine guidance, health trend monitoring, and an AI assistant for your health questions.",
      },
      { property: "og:title", content: "MediSense — AI Health Companion" },
      {
        property: "og:description",
        content:
          "AI-powered medical report analysis, medicine guidance, and health monitoring.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: FileSearch,
    title: "Report Analysis",
    desc: "Upload PDF or image reports. AI extracts every value and explains it in plain language.",
  },
  {
    icon: Pill,
    title: "Medicine Guidance",
    desc: "RAG-powered guidance on how to take your medicines, side effects, and precautions.",
  },
  {
    icon: LineChart,
    title: "Health Monitoring",
    desc: "Track values across reports and see what improved or needs attention over time.",
  },
  {
    icon: MessageCircle,
    title: "AI Doubt Clearing",
    desc: "Chat with an assistant that knows your reports and answers your health questions.",
  },
];

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 font-display text-xl font-semibold text-primary">
          <Activity className="h-6 w-6" /> MediSense
        </span>
        <Button asChild variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="bg-[image:var(--gradient-hero)]">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-4 py-1.5 text-sm text-primary">
            <ShieldCheck className="h-4 w-4" /> Multi-agent AI · Private to you
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight md:text-6xl">
            Understand your health,
            <br />
            <span className="bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">
              one report at a time.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            MediSense reads your medical reports, guides you through your medicines,
            monitors trends across visits, and answers your questions — powered by a
            team of AI agents.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Get started free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#features">See features</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold">Your AI health team</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-card)] transition-transform hover:-translate-y-1"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        MediSense provides educational information and is not a substitute for
        professional medical advice.
      </footer>
    </div>
  );
}
