"use client";

import { ImagePlus } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cropRect } from "@/lib/cover-crop";
import { errorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/client";

const SIZE = 256;
const MAX_BYTES = 12 * 1024 * 1024; // the picture is shrunk before upload; this only stops absurd files

/** SET-1: an optional profile picture (centre-cropped square) in the private `avatars` bucket. */
export function AvatarField({ ownerId, name, avatarPath, avatarUrl }: { ownerId: string; name: string; avatarPath: string | null; avatarUrl: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode"));
        el.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const { sx, sy, sw, sh } = cropRect(img.naturalWidth, img.naturalHeight, SIZE, SIZE);
      canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
      if (!blob) throw new Error("encode");
      const ext = blob.type === "image/webp" ? "webp" : "png";
      const path = `${ownerId}/avatar.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: blob.type });
      if (error) throw error;
      const saved = await supabase.from("profiles").update({ avatar_path: path }).eq("id", ownerId);
      if (saved.error) throw saved.error;
      // After the update, so a failed save never leaves avatar_path pointing at a deleted file.
      if (avatarPath && avatarPath !== path) await supabase.storage.from("avatars").remove([avatarPath]);
      toast.success("Picture saved.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error && ["decode", "encode"].includes(error.message) ? "That file couldn't be read as a photo. Try a JPEG, PNG or WebP." : errorMessage(error));
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", ownerId);
    if (error) toast.error(errorMessage(error));
    else {
      if (avatarPath) await supabase.storage.from("avatars").remove([avatarPath]);
      toast.success("Picture removed.");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="type-heading">Profile picture</span>
      <div className="flex items-center gap-4">
        <span className="type-heading grid size-16 shrink-0 place-items-center overflow-hidden rounded-pill bg-canvas-2" aria-hidden>
          {avatarUrl ? <Image src={avatarUrl} alt="" width={64} height={64} unoptimized className="size-full object-cover" /> : name.slice(0, 1).toUpperCase()}
        </span>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose a profile picture"
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            if (picked.size > MAX_BYTES) return toast.error("That photo is over 12 MB. Pick a smaller one.");
            void upload(picked);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus size={14} strokeWidth={1.5} aria-hidden /> {avatarUrl ? "Replace" : "Choose a photo"}
          </Button>
          {avatarPath && (
            <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="type-caption text-ink-3-small">Cropped to a square from the centre.</p>
    </div>
  );
}
