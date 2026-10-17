"use client";

import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { DragHandle } from "@/components/ui/sortable";
import { errorMessage } from "@/lib/db-error";
import type { Block } from "@/lib/space-page";
import { createClient } from "@/lib/supabase/client";
import { BlockFrame, type BlockActions } from "./block-frame";

const AUTOSAVE_MS = 1000; // NOTE-2: debounced ~1 s

/**
 * PRD §6.11 Notes (NOTE-1, NOTE-2): paragraphs, headings (2 levels), lists, checkboxes, bold, italic,
 * inline code, code blocks, links, quotes and dividers, with Markdown shortcuts ("# ", "- ", "1. ",
 * "[] ", "```"). Saves itself about a second after typing stops; body_text feeds search (NOTE-3).
 */
export function NotesBlock({ block, body, actions, drag }: { block: Block; body: JSONContent | null; actions: BlockActions; drag: DragHandle }) {
  const toast = useToast();
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => Promise<void>) | null>(null);

  const editor = useEditor({
    immediatelyRender: false, // server render has no editor; avoids a hydration mismatch
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Write here. # for a heading, - for a list, [] for a checkbox." }),
    ],
    content: body && Object.keys(body).length > 0 ? body : undefined,
    editorProps: { attributes: { class: "note-body", "aria-label": `${block.title} text`, role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor }) => {
      setStatus("saving");
      const json = editor.getJSON();
      const text = editor.getText();
      pending.current = async () => {
        pending.current = null;
        const { error } = await createClient().from("notes").upsert({ block_id: block.id, body: json, body_text: text }, { onConflict: "block_id" });
        if (error) {
          setStatus("idle");
          toast.error(errorMessage(error));
        } else setStatus("saved");
      };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void pending.current?.(), AUTOSAVE_MS);
    },
  });

  // Leaving the page within the second still saves (NFR-5: nothing silently lost).
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void pending.current?.();
    },
    [],
  );

  return (
    <BlockFrame
      block={block}
      actions={actions}
      drag={drag}
      controls={
        <span role="status" className="type-caption min-w-12 text-right text-ink-3-small">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
        </span>
      }
    >
      <EditorContent editor={editor} className="max-w-document" />
    </BlockFrame>
  );
}
