"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AvatarField } from "./avatar-field";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import type { Profile } from "@/lib/profile";
import { profileFields, WEEK_STARTS, type ProfileFields } from "@/lib/profile-schema";
import { createClient } from "@/lib/supabase/client";

type ProfilePatch = Partial<Omit<Profile, "name" | "avatarUrl">>; // name is derived, not a column

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

const formValues = (p: Profile): ProfileFields => ({
  display_name: p.display_name ?? "",
  timezone: p.timezone,
  week_starts_on: p.week_starts_on as ProfileFields["week_starts_on"],
  currency: p.currency,
  theme: p.theme,
});

/**
 * SET-1: every field saves as soon as it changes (text fields on blur) and takes effect at once.
 * Optimistic: the theme switches immediately and rolls back with an error toast if the save fails.
 */
export function ProfileForm({ profile, zones }: { profile: Profile; zones: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState(profile);

  const form = useForm<ProfileFields>({
    resolver: zodResolver(profileFields),
    mode: "onBlur",
    defaultValues: formValues(profile),
  });

  const save = useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      const { error } = await createClient().from("profiles").update(patch).eq("id", profile.id);
      if (error) throw error;
    },
    onMutate: (patch) => {
      const before = saved;
      setSaved({ ...saved, ...patch });
      if (patch.theme) document.documentElement.dataset.theme = patch.theme;
      return { before };
    },
    onError: (_error, _patch, context) => {
      if (!context) return;
      setSaved(context.before);
      document.documentElement.dataset.theme = context.before.theme;
      form.reset(formValues(context.before));
      toast.error("Couldn't save. Check your connection and try again.");
    },
    onSuccess: () => {
      toast.success("Saved.");
      router.refresh(); // server-rendered parts (date pill, Index) use the new values
    },
  });

  // Save one field if it is valid and actually changed.
  async function commit<K extends keyof ProfileFields>(name: K) {
    if (!(await form.trigger(name))) return;
    const value = profileFields.shape[name].parse(form.getValues(name)) as ProfileFields[K];
    const next = name === "display_name" ? ((value as string) || null) : value;
    if (next === saved[name]) return;
    if (name === "currency") form.setValue("currency", value as string);
    save.mutate({ [name]: next } as ProfilePatch);
  }

  const { errors } = form.formState;

  return (
    <Panel className="flex max-w-document flex-col gap-6">
      <AvatarField ownerId={profile.id} name={profile.name} avatarPath={profile.avatar_path} avatarUrl={profile.avatarUrl} />

      <Field id="display_name" label="Display name" hint="Leave empty to use your Google account name." error={errors.display_name?.message}>
        <input
          id="display_name"
          className={inputClass}
          autoComplete="name"
          aria-invalid={!!errors.display_name}
          aria-describedby={errors.display_name ? "display_name-error" : "display_name-hint"}
          {...form.register("display_name", { onBlur: () => commit("display_name") })}
        />
      </Field>

      <Field id="timezone" label="Timezone" hint="Today and every deadline use this timezone.">
        <select
          id="timezone"
          className={inputClass}
          aria-describedby="timezone-hint"
          {...form.register("timezone", { onChange: () => commit("timezone") })}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex flex-col gap-1.5">
        <span id="week-label" className="type-heading">
          Week starts on
        </span>
        <SegmentedControl
          label="Week starts on"
          options={[...WEEK_STARTS]}
          value={String(saved.week_starts_on) as "6" | "0" | "1"}
          onChange={(v) => {
            form.setValue("week_starts_on", Number(v) as ProfileFields["week_starts_on"]);
            commit("week_starts_on");
          }}
        />
      </div>

      <Field id="currency" label="Currency" hint="Money amounts use this 3-letter code (BDT shows as Tk)." error={errors.currency?.message}>
        <input
          id="currency"
          className={`${inputClass} max-w-32 uppercase`}
          maxLength={3}
          autoComplete="off"
          aria-invalid={!!errors.currency}
          aria-describedby={errors.currency ? "currency-error" : "currency-hint"}
          {...form.register("currency", { onBlur: () => commit("currency") })}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="type-heading">Theme</span>
        <SegmentedControl
          label="Theme"
          options={[...THEMES]}
          value={saved.theme}
          onChange={(v) => {
            form.setValue("theme", v);
            commit("theme");
          }}
        />
        <p className="type-caption text-ink-3-small">System follows your computer&apos;s light or dark setting.</p>
      </div>

      <div className="border-t border-hairline pt-6">
        <Button
          variant="secondary"
          onClick={async () => {
            await createClient().auth.signOut({ scope: "local" }); // AUTH-3 AC3: this device only
            router.replace("/login");
            router.refresh();
          }}
        >
          Sign out
        </Button>
      </div>
    </Panel>
  );
}
