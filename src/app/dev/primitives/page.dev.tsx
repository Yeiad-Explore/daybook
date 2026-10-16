"use client";

// DEV-1: development-only gallery of the DESIGN.md primitives, for light/dark and 400/1440px checks.
// The .dev.tsx extension keeps it out of production builds (next.config.ts pageExtensions).
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FloatingCard } from "@/components/ui/floating-card";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tag } from "@/components/ui/tag";

const MARKS = ["moss", "slate", "ochre", "teal", "clay", "graphite"] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={title} className="flex flex-col gap-4">
      <h2 id={title} className="type-eyebrow text-ink-3-small">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function PrimitivesPage() {
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

  return (
    <main className="mx-auto flex max-w-content flex-col gap-12 px-6 py-12">
      <h1 className="type-display">
        <span className="text-ink-3">Daybook </span>primitives
      </h1>

      <Section title="Panel">
        <Panel>
          <h3 className="type-heading">Training plan</h3>
          <p className="type-body-sm text-ink-2">A white panel with the card shadow.</p>
        </Panel>
      </Section>

      <Section title="Auras, glass and floating card">
        <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {MARKS.map((mark) => (
            <div key={mark} data-mark={mark} className="aura rounded-xl p-6">
              <GlassPanel className="p-4">
                <p className="type-eyebrow text-ink-2">{mark}</p>
                <p className="type-number-lg">
                  77.2<span className="type-body-sm text-ink-3-small"> kg</span>
                </p>
              </GlassPanel>
            </div>
          ))}
        </div>
        <div data-mark="moss" className="aura relative rounded-xl p-6 pb-16">
          <GlassPanel tone="dark" className="p-4">
            <p className="type-body-sm">Dark glass, as in the Index sidebar.</p>
          </GlassPanel>
          <FloatingCard className="absolute right-6 -bottom-8 w-64 max-w-[calc(100%-3rem)]">
            <p className="type-number-lg">107</p>
            <p className="type-caption text-ink-2">days left · 31 Jan 2027</p>
          </FloatingCard>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<ArrowRight size={12} strokeWidth={1.5} />}>
            View insight
          </Button>
          <Button variant="primary" icon={<Plus size={12} strokeWidth={1.5} />}>
            New task
          </Button>
          <Button variant="secondary">Add to Google Calendar</Button>
          <Button variant="ghost">Break down</Button>
          <Button variant="lime">Start today</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section title="Tags">
        <div className="flex flex-wrap items-center gap-2">
          <Tag icon={<ArrowUpRight size={12} strokeWidth={1.5} aria-hidden />}>1.2 kg</Tag>
          <Tag>moved 2×</Tag>
          <Tag variant="outlined">12-day streak</Tag>
        </div>
      </Section>

      <Section title="Segmented control">
        <SegmentedControl
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: "7d", label: "7D" },
            { value: "30d", label: "30D" },
            { value: "90d", label: "90D" },
            { value: "all", label: "All" },
          ]}
        />
        <p className="type-body-sm text-ink-2">Selected: {range}</p>
      </Section>
    </main>
  );
}
