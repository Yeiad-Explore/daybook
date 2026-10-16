# ADR 0002: DESIGN.md v2 is the only visual authority

## Status

Accepted (owner decision, 2026-10-16)

## Date

2026-10-16

## Context

- DESIGN.md v2 ("calm nature-tech") defines Daybook's look: tokens in the front matter (colours for light and dark, six aura palettes, typography, radii, spacing, elevation, layout), components, motion, do's and don'ts, responsive rules and accessibility.
- `design-reference.jpg` is the reference board DESIGN.md was extracted from. It is inspiration only: its name, logo, copy and photographs must never be reused.
- The development environment has many design skills and libraries installed (shadcn's default theme and several "taste" skills), each with its own palette, fonts and spacing. Mixing them would produce a generic or inconsistent UI.
- The precedence set by the owner: the owner's messages > PRD.md for behaviour > DESIGN.md for visuals.

## Decision

1. **DESIGN.md v2 is the only design system.** No other design system, theme, component-library look or design skill's defaults may set colours, type, spacing, radii, shadows or motion.
2. **Tokens are the only colour source.** Every DESIGN.md token becomes a CSS variable for light and dark themes (Tailwind v4 maps utilities onto those variables). Components never contain raw hex or rgba values; a check in CI rejects them outside the token file.
   - `src/styles/tokens.css` is generated from the DESIGN.md front matter (`pnpm tokens`); a unit test fails if the two drift.
   - Tailwind's default palette, radii, shadows, text sizes and breakpoints are removed (`--color-*: initial` etc.), so a class like `bg-red-500` does not exist. Spacing keeps Tailwind's numbers on a 4px base.
3. **Colour meaning is fixed.** Lime = now/live; ember (signal) = late. A space's aura comes from its `mark`. Everything else is ink and greys.
4. **shadcn/ui is behaviour only.** Dialog, popover, command, dropdown and tooltip are used as unstyled primitives and restyled entirely with DESIGN.md tokens. The default shadcn look never ships.
5. **Gaps go through the owner.** If DESIGN.md does not cover something, propose an addition (and record it in DESIGN.md) before building it. Visual-polish work uses `high-end-visual-design` only, always within DESIGN.md.
6. **Reference board rules.** Finished screens are compared with `design-reference.jpg` for look and feel, never copied. Cover photos and aura textures are original or properly licensed.

## Alternatives considered

### shadcn/ui with its default theme, adjusted
- Pros: fastest start.
- Cons: the default look leaks through (radii, borders, focus rings, neutral greys).
- Rejected: DESIGN.md defines every one of those values differently.

### A full component library (MUI, Chakra, Mantine)
- Pros: complete widget set.
- Cons: its own theming model and visual language; heavy overrides; extra bundle.
- Rejected: conflicts with a token-first design system.

### Letting design skills propose their own direction
- Rejected: DESIGN.md already sets the direction, and the owner approved it.

## Consequences

- A screen is done only after it is checked in light, dark and at 400px width (DESIGN.md "Iteration guide" step 5).
- `antislop-ui` runs after every screen to catch generic patterns; fixes are made against DESIGN.md.
- Any change to tokens or component rules is made in DESIGN.md first, with an ADR if it changes a design rule.
- The final product name and wordmark replace "Daybook" everywhere when chosen (PRD §15 D1); `brandkit` is used for that.
