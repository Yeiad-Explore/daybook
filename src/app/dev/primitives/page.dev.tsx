"use client";

// DEV-1: development-only gallery of the DESIGN.md primitives, for light/dark and 400/1440px checks.
// The .dev.tsx extension keeps it out of production builds (next.config.ts pageExtensions).
import { ArrowRight, ArrowUpRight, CalendarClock, Flame, ListChecks, Plus, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AuraCard } from "@/components/ui/aura-card";
import { Button } from "@/components/ui/button";
import { DeadlineTag } from "@/components/ui/deadline-tag";
import { FloatingCard } from "@/components/ui/floating-card";
import { GlassPanel } from "@/components/ui/glass-panel";
import { KpiItem } from "@/components/ui/kpi-item";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tag } from "@/components/ui/tag";
import { TaskRow } from "@/components/ui/task-row";
import { BehaviourDemos } from "./behaviour-demos";

const MARKS = ["moss", "slate", "ochre", "teal", "clay", "graphite"] as const;
const TODAY = "2026-10-16"; // PRD §12 fixture date, so the gallery never changes with the clock
const icon = { size: 16, strokeWidth: 1.5 } as const;

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
  const [done, setDone] = useState<Record<string, boolean>>({ "Book the gym induction": true });
  const toggle = (title: string) => (value: boolean) => setDone((d) => ({ ...d, [title]: value }));

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
              <GlassPanel className="p-4 text-ink">
                <p className="type-eyebrow">{mark}</p>
                <p className="type-number-lg">
                  77.2<span className="type-body-sm"> kg</span>
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
      <Section title="Deadline tags">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { due: "2026-10-14" },
            { due: "2026-10-16" },
            { due: "2026-10-16", dueTime: "18:00:00" },
            { due: "2026-10-17" },
            { due: "2026-10-19", movedCount: 1 },
            { due: "2026-10-25" },
            { due: "2027-01-31" },
            { due: "2026-10-14", done: true },
          ].map((t, i) => (
            <DeadlineTag key={i} today={TODAY} done={false} {...t} />
          ))}
        </div>
      </Section>

      <Section title="Task rows">
        <Panel className="p-2">
          <ul>
            {[
              { title: "Buy running shoes", due: "2026-10-14", source: { mark: "moss", label: "Health · Workouts" } },
              { title: "Loops: for and while", due: "2026-10-16", source: { mark: "slate", label: "AI Engineering · Roadmap · Learn Python" } },
              { title: "Send proposal to Bayside Café", due: "2026-10-19", movedCount: 1 },
              { title: "Book the gym induction", due: "2026-10-14" },
            ].map((t) => (
              <TaskRow
                key={t.title}
                title={t.title}
                due={t.due}
                today={TODAY}
                movedCount={t.movedCount}
                source={t.source as { mark: "moss" | "slate"; label: string } | undefined}
                done={!!done[t.title]}
                onToggle={toggle(t.title)}
              />
            ))}
          </ul>
        </Panel>
      </Section>

      <Section title="KPI items">
        <div className="flex flex-wrap gap-6">
          <KpiItem icon={<Flame {...icon} />} value="2" caption="Late" />
          <KpiItem icon={<ListChecks {...icon} />} value="3" caption="Due today" />
          <KpiItem icon={<CalendarClock {...icon} />} value="3" caption="Time blocks" />
          <KpiItem icon={<Sparkles {...icon} />} value="2/7" caption="Routine steps" />
        </div>
      </Section>

      <Section title="Aura cards">
        <div className="grid gap-4 laptop:grid-cols-3">
          <AuraCard variant="glass" mark="slate">
            <p className="type-heading">AI Engineering</p>
            <p className="type-number-xl">27%</p>
            <p className="type-caption">14 of 52 steps done</p>
          </AuraCard>
          <AuraCard variant="dark" mark="moss">
            <p className="type-number-xl">
              77.2<span className="type-body-sm"> kg</span>
            </p>
            <p className="type-heading">Health</p>
            <p className="type-body-sm">Started 78.4 · target 72</p>
            <div className="mt-4">
              <KpiItem tone="dark" icon={<ArrowUpRight {...icon} className="text-lime" />} value="107" caption="days left" />
            </div>
          </AuraCard>
          <AuraCard variant="sand" mark="ochre">
            <p className="type-heading">AI Agency</p>
            <p className="type-number-xl">
              <span className="text-[0.6em]">৳</span>75,000
            </p>
            <p className="type-caption flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-pill bg-lime" />2 of 5 retainer clients
            </p>
          </AuraCard>
        </div>
      </Section>
      <Section title="Dialog, popover, menu, tooltip, command, toast">
        <BehaviourDemos />
      </Section>
    </main>
  );
}
