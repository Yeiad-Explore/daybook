"use client";

// Part of the DEV-1 gallery (imported only by page.dev.tsx, so never in production builds).
import { Check, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function BehaviourDemos() {
  const toast = useToast();
  const [palette, setPalette] = useState(false);
  const [last, setLast] = useState("none");
  const [noteDeleted, setNoteDeleted] = useState(false);

  function run(action: string) {
    setLast(action);
    setPalette(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Dialog>
          <DialogTrigger render={<Button variant="secondary" />}>Reschedule…</DialogTrigger>
          <DialogContent>
            <DialogTitle>Reschedule</DialogTitle>
            <DialogDescription>Moving a deadline needs a reason. It shows in your deadline history.</DialogDescription>
            <div className="flex justify-end gap-2">
              <DialogClose render={<Button variant="secondary" />}>Cancel</DialogClose>
              <DialogClose render={<Button variant="primary" icon={<Check size={12} strokeWidth={1.5} />} />}>Save</DialogClose>
            </div>
          </DialogContent>
        </Dialog>

        <Popover>
          <PopoverTrigger render={<Button variant="secondary" />}>Pick a date</PopoverTrigger>
          <PopoverContent>
            <p className="type-body-sm text-ink-2">A date picker opens here as a floating card.</p>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" aria-label="Block menu" />}>
            <MoreHorizontal size={16} strokeWidth={1.5} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => run("Rename")}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={() => run("Duplicate")}>Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem tone="danger" onClick={() => run("Delete")}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger render={<Button variant="secondary" />}>14 Oct</TooltipTrigger>
          <TooltipContent>Wed 14 Oct 2026</TooltipContent>
        </Tooltip>

        <Button variant="secondary" onClick={() => setPalette(true)}>
          Open command palette
        </Button>
        <CommandDialog open={palette} onOpenChange={setPalette}>
          <CommandInput placeholder="Search or run an action…" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => run("New task")}>New task</CommandItem>
              <CommandItem onSelect={() => run("Log weight")}>Log weight</CommandItem>
              <CommandItem onSelect={() => run("Go to Today")}>Go to Today</CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => toast.success("Saved.")}>
          Save
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setNoteDeleted(true);
            toast.undoable("Note moved to Trash.", () => setNoteDeleted(false));
          }}
        >
          Delete note
        </Button>
        <Button variant="secondary" onClick={() => toast.error("Couldn't save. Check your connection and try again.")}>
          Fail
        </Button>
      </div>

      <p role="status" className="type-body-sm text-ink-2">
        Last action: {last}. Note {noteDeleted ? "in Trash" : "kept"}.
      </p>
    </div>
  );
}
