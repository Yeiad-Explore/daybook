"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { cx } from "@/lib/cx";
import { Constants } from "@/lib/database.types";
import { errorMessage } from "@/lib/db-error";
import { newSpace, spaceRow, type NewSpace } from "@/lib/space-schema";
import { createClient } from "@/lib/supabase/client";

const KINDS = [
  { value: "goal", label: "Goal" },
  { value: "area", label: "Life area" },
] as const;

/** SPC-1: create a goal (end goal, start, deadline) or a life area; open it on "Overview" with the block menu. */
export function NewSpaceForm({ today, initialKind }: { today: string; initialKind: NewSpace["kind"] }) {
  const router = useRouter();
  const toast = useToast();
  const form = useForm<NewSpace>({
    resolver: zodResolver(newSpace),
    defaultValues: { kind: initialKind, name: "", mark: "moss", end_goal: "", description: "", start_date: today, deadline: "" },
  });
  const [kind, mark, startDate] = useWatch({ control: form.control, name: ["kind", "mark", "start_date"] });
  const { errors, isSubmitting } = form.formState;

  async function create(values: NewSpace) {
    const supabase = createClient();
    try {
      // SPC-1 AC3: at the bottom of its Index group.
      const { data: last } = await supabase
        .from("spaces").select("position").eq("kind", values.kind).is("deleted_at", null)
        .order("position", { ascending: false }).limit(1).maybeSingle();
      const { data: space, error } = await supabase.from("spaces").insert(spaceRow(values, (last?.position ?? 0) + 1)).select("id").single();
      if (error) throw error;
      const { data: page } = await supabase.from("pages").select("id").eq("space_id", space.id).order("position").limit(1).single();
      // SPC-1 AC2: opens on "Overview" with the block menu open.
      router.push(`/s/${space.id}/${page?.id}?add=block`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const describedBy = (name: keyof NewSpace) => (errors[name] ? `${name}-error` : undefined);

  return (
    <Panel className="max-w-document">
      <form noValidate onSubmit={form.handleSubmit(create)} className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="type-heading">Kind</span>
          <SegmentedControl label="Kind" options={[...KINDS]} value={kind} onChange={(v) => form.setValue("kind", v)} />
          <p className="type-caption text-ink-3-small">
            {kind === "goal" ? "A goal has an end goal and a strict deadline." : "A life area keeps going, with no end date."}
          </p>
        </div>

        <Field id="name" label="Name" error={errors.name?.message}>
          <input id="name" className={inputClass} maxLength={60} autoComplete="off" aria-invalid={!!errors.name} aria-describedby={describedBy("name")} {...form.register("name")} />
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="type-heading pb-1.5">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {Constants.public.Enums.mark_color.map((m) => (
              <label key={m} className="cursor-pointer">
                <input type="radio" value={m} className="peer sr-only" {...form.register("mark")} />
                <span
                  className={cx(
                    "type-button flex min-h-9 items-center gap-2 rounded-pill bg-canvas-2 py-1.5 pr-3.5 pl-1.5 capitalize ring-1 ring-inset ring-control-edge peer-focus-visible:outline peer-focus-visible:outline-ink pointer-coarse:min-h-11",
                    mark === m && "bg-surface shadow-card ring-ink",
                  )}
                >
                  <span aria-hidden data-mark={m} className="aura size-6 rounded-pill" />
                  {m}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {kind === "goal" ? (
          <>
            <Field id="end_goal" label="End goal" hint="One sentence: what does done look like?" error={errors.end_goal?.message}>
              <input id="end_goal" className={inputClass} maxLength={200} aria-invalid={!!errors.end_goal} aria-describedby={describedBy("end_goal") ?? "end_goal-hint"} {...form.register("end_goal")} />
            </Field>
            <div className="grid gap-4 tablet:grid-cols-2">
              <Field id="start_date" label="Start" error={errors.start_date?.message}>
                <input id="start_date" type="date" className={inputClass} aria-invalid={!!errors.start_date} aria-describedby={describedBy("start_date")} {...form.register("start_date")} />
              </Field>
              <Field id="deadline" label="Deadline" hint="Moving it later needs a reason, so pick it with care." error={errors.deadline?.message}>
                <input id="deadline" type="date" min={startDate || undefined} className={inputClass} aria-invalid={!!errors.deadline} aria-describedby={describedBy("deadline") ?? "deadline-hint"} {...form.register("deadline")} />
              </Field>
            </div>
          </>
        ) : (
          <Field id="description" label="Description" hint="Optional. One line about what lives here." error={errors.description?.message}>
            <input id="description" className={inputClass} maxLength={200} {...form.register("description")} />
          </Field>
        )}

        <Button type="submit" variant="primary" disabled={isSubmitting} icon={<ArrowRight size={12} strokeWidth={2} />} className="self-start">
          {kind === "goal" ? "Create goal" : "Create life area"}
        </Button>
      </form>
    </Panel>
  );
}
