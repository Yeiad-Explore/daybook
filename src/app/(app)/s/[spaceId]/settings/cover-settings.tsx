"use client";

import { ImagePlus } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { COVER_HEIGHT, COVER_WIDTH, cropRect } from "@/lib/cover-crop";
import type { Tables } from "@/lib/database.types";
import { errorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";

const MAX_BYTES = 12 * 1024 * 1024; // the picture is shrunk before upload; this only stops absurd files

/** PRD §5.5: an optional cover photo (upload, crop, remove) in the private `covers` bucket, shown blurred behind the space hero. */
export function CoverSettings({ space, coverUrl }: { space: Tables<"spaces">; coverUrl: string | null }) {
  const save = useSave();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  async function remove() {
    const supabase = createClient();
    if (space.cover_path) {
      const { error } = await supabase.storage.from("covers").remove([space.cover_path]);
      if (error) return toast.error(errorMessage(error));
    }
    save.mutate({ request: () => createClient().from("spaces").update({ cover_path: null }).eq("id", space.id) }, { onSuccess: () => toast.success("Cover removed.") });
  }

  return (
    <Panel className="flex flex-col gap-4" aria-label="Cover photo">
      <div>
        <h2 className="type-heading">Cover photo</h2>
        <p className="type-body-sm mt-1 text-ink-2">Shown softly blurred behind the top of this space. Without one, the space&apos;s colour is used.</p>
      </div>
      {coverUrl && (
        <div className="relative aspect-[1600/560] overflow-hidden rounded-md bg-canvas-2">
          <Image src={coverUrl} alt={`Cover photo of ${space.name}`} fill unoptimized sizes="(min-width: 900px) 800px, 100vw" className="object-cover" />
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose a cover photo"
        className="sr-only"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (!picked) return;
          if (picked.size > MAX_BYTES) return toast.error("That photo is over 12 MB. Pick a smaller one.");
          setFile(picked);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => input.current?.click()}>
          <ImagePlus size={14} strokeWidth={1.5} aria-hidden /> {coverUrl ? "Replace the photo" : "Choose a photo"}
        </Button>
        {space.cover_path && (
          <Button variant="ghost" onClick={() => void remove()}>
            Remove the cover
          </Button>
        )}
      </div>
      {file && <CropDialog file={file} space={space} onClose={() => setFile(null)} />}
    </Panel>
  );
}

/** Crop: the photo is cut to the hero's shape; the slider says which band of a tall photo to keep. */
function CropDialog({ file, space, onClose }: { file: File; space: Tables<"spaces">; onClose: () => void }) {
  const save = useSave();
  const toast = useToast();
  const [url] = useState(() => URL.createObjectURL(file));
  const [focus, setFocus] = useState(50);
  const [busy, setBusy] = useState(false);

  async function upload() {
    setBusy(true);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode"));
        el.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = COVER_WIDTH;
      canvas.height = COVER_HEIGHT;
      const { sx, sy, sw, sh } = cropRect(img.naturalWidth, img.naturalHeight, COVER_WIDTH, COVER_HEIGHT, focus / 100);
      canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, COVER_WIDTH, COVER_HEIGHT);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
      if (!blob) throw new Error("encode");
      const path = `${space.owner_id}/${space.id}/cover.webp`;
      const { error } = await createClient().storage.from("covers").upload(path, blob, { upsert: true, contentType: "image/webp" });
      if (error) throw error;
      await save.mutateAsync({ request: () => createClient().from("spaces").update({ cover_path: path }).eq("id", space.id) });
      toast.success("Cover saved.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error && ["decode", "encode"].includes(error.message) ? "That file couldn't be read as a photo. Try a JPEG, PNG or WebP." : errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(40rem,calc(100%-2rem))]">
        <DialogTitle>Crop the cover</DialogTitle>
        <DialogDescription>This is the part that will show. Slide to choose which band of a tall photo to keep.</DialogDescription>
        <div className="relative aspect-[1600/560] overflow-hidden rounded-md bg-canvas-2">
          <Image src={url} alt="Preview of the cover" fill unoptimized sizes="640px" className="object-cover" style={{ objectPosition: `50% ${focus}%` }} />
        </div>
        <label className="type-body-sm flex items-center gap-3">
          <span className="shrink-0">Position</span>
          <input type="range" min={0} max={100} value={focus} onChange={(e) => setFocus(Number(e.target.value))} className="flex-1 accent-[var(--ink)]" aria-label="Vertical position of the crop" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void upload()}>
            Save the cover
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
