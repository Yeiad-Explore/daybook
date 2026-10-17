"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/db-error";

type Save = {
  /** The Supabase call. Its error (if any) is thrown, so the database's rule message reaches the toast. */
  request: () => PromiseLike<{ data: unknown; error: unknown }>;
  /** Puts the optimistic change back when the write fails (NFR-5: never a silent loss). */
  rollback?: () => void;
};

/**
 * Every write in the app (ADR 0001, NFR-1): the caller changes local state first (optimistic), then
 * saves; a failure rolls back and shows the database's message; success refreshes the server-rendered
 * parts (space header, Index late-count, Today) with the new data.
 */
export function useSave() {
  const router = useRouter();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({ request }: Save) => {
      const { data, error } = await request();
      if (error) throw error;
      return data;
    },
    onError: (error, { rollback }) => {
      rollback?.();
      toast.error(errorMessage(error));
    },
    onSuccess: () => router.refresh(),
  });
}
