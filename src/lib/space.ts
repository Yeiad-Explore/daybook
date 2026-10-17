import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A live space the owner can see (RLS), or the 404 page. Malformed ids are 404s, not errors. */
export async function getSpaceOr404(spaceId: string) {
  if (!isUuid(spaceId)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("spaces").select("id, name, kind, mark").eq("id", spaceId).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  return data;
}

export function isUuid(value: string) {
  return UUID.test(value);
}
