import { cx } from "@/lib/cx";
import { Constants, type Enums } from "@/lib/database.types";

type Mark = Enums<"mark_color">;

/** A space's colour (PRD §10.1 mark_color → DESIGN.md aura palette), as a radio group of aura swatches. */
export function MarkPicker({ value, onChange }: { value: Mark; onChange: (mark: Mark) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="type-heading pb-1.5">Colour</legend>
      <div className="flex flex-wrap gap-2">
        {Constants.public.Enums.mark_color.map((m) => (
          <label key={m} className="cursor-pointer">
            <input type="radio" name="mark" value={m} checked={value === m} onChange={() => onChange(m)} className="peer sr-only" />
            <span
              className={cx(
                "type-button flex min-h-9 items-center gap-2 rounded-pill bg-canvas-2 py-1.5 pr-3.5 pl-1.5 capitalize ring-1 ring-inset ring-control-edge peer-focus-visible:outline peer-focus-visible:outline-ink pointer-coarse:min-h-11",
                value === m && "bg-surface shadow-card ring-ink",
              )}
            >
              <span aria-hidden data-mark={m} className="aura size-6 rounded-pill" />
              {m}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
