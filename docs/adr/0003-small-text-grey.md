# ADR 0003: A second grey for small text (DESIGN.md v2.1)

## Status

Accepted (owner decision, 2026-10-16)

## Date

2026-10-16

## Context

- DESIGN.md v2.0 used `ink-3` (#8C8F8F) for the grey half of two-tone headlines and for small labels, eyebrows and captions.
- On the light surfaces it measures 2.8:1 (canvas-2), 3.0:1 (canvas) and 3.3:1 (surface). WCAG 2.2 AA (PRD NFR-7, DESIGN.md Accessibility) needs 4.5:1 for normal-size text and 3:1 for large text (24px and up, or 18.66px bold).
- axe-core flagged every small `ink-3` label on the first primitives page (T16). Dark mode passes (4.6–5.0:1).

## Decision

- `ink-3` (#8C8F8F) is used only for text 24px and larger, where 3:1 is enough. This keeps the airy two-tone headlines exactly as designed.
- New token `ink-3-small`: light #696C6C (4.55:1 on canvas-2, 4.89:1 on canvas, 5.3:1 on surface), dark #7E8282 (same as dark ink-3, which already passes). It is used for eyebrows, labels, captions and chart or timetable labels.
- Wherever DESIGN.md mentions `ink-3` for text under 24px, `ink-3-small` applies.

## Alternatives considered

- **Darken `ink-3` everywhere to #696C6C.** One token, but the big headlines lose their light grey phrase. Rejected by the owner.
- **Use `ink-2` (#4A4D4D) for small grey text.** No new colour, but small labels become almost as dark as secondary text and the hierarchy flattens. Rejected.

## Consequences

- The e2e accessibility check (axe-core, light and dark) keeps enforcing this on every screen.
- Component code chooses between `text-ink-3` (24px and up) and `text-ink-3-small` (smaller).
