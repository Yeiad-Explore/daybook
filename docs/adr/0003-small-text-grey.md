# ADR 0003: Accessibility colour rules (DESIGN.md v2.1–2.2)

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

## Further measurements and decisions (DESIGN.md v2.2, owner, 2026-10-16)

Measured before building the T17 primitives (light theme unless noted):

| Pair | Ratio | Needed | Decision |
|---|---|---|---|
| Late tag: ember #E4572E on signal-wash | 3.07 | 4.5 | New `signal-ink` #BC3D18 for late text (4.58 on wash, 5.5 on surface); ember stays for dots, badge fill and nodes. Dark keeps #FF7A52 (6:1). |
| Done date: ink-4 struck | 1.5–2.3 | 4.5 | Done dates use `ink-3-small`, struck through (4.6–5.3). |
| Checkbox circle: ink-4 | 1.8 (dark 2.1) | 3 (non-text) | Control borders use `ink-3` (3.0–3.3 light, 4.6 dark). |
| Input border: hairline | 1.2 | 3 (non-text) | Same: `ink-3`. Hairlines stay for separators and panels. |
| Small ink-2 / ink-3-small on light glass over deep aura | 2.3–4.1 | 4.5 | Small text on glass is `ink` (8.4–12). Greys only for 24px+. |
| Small on-dark directly on ochre / graphite / slate aura | 3.6–4.4 | 4.5 | Small on-dark text only on a dark aura's fade or a 30% scrim. |
| White text on light-theme dark glass (58%) over the light corner of an aura | 4.17–4.68 (on-dark-2: 2.7–4.4) | 4.5 | Dark glass 62% in light theme (worst 4.55); small text on dark glass is full on-dark. |
| on-dark / surface-dark in dark theme | inverted (near-black text) | n/a | Aura cards and dark glass use theme-fixed copies (`*-fixed` tokens), per DESIGN.md "aura cards look the same in both themes". |

Rejected alternatives: darkening ember everywhere (duller dots and badges), keeping ink-4 done dates (an accessibility exception), keeping faint control borders (fails WCAG 1.4.11), raising glass to about 80% white (hides the auras).

## Consequences

- The e2e accessibility check (axe-core, light and dark) keeps enforcing this on every screen.
- Component code chooses between `text-ink-3` (24px and up) and `text-ink-3-small` (smaller).
