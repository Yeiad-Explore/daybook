---
version: 2.3  # 2.3 (17 Oct 2026): control-edge, light theme default. 2.1/2.2 (16 Oct 2026): WCAG AA colour rules (ink-3-small, signal-ink, control borders, text on glass), see docs/adr/0003
name: Daybook
status: "Working name. Replace 'Daybook' everywhere once the final product name is chosen."
inspiration: "Aesthetic extracted from the 'Synex – AI Fintech Website' concept by Awsmd (Dribbble). Inspiration only: no Synex name, logo, copy, photography or other assets are reused. Daybook is an original implementation of the same visual language."
description: "Calm nature-tech. A light, airy off-white canvas; crisp white and frosted-glass panels; signature 'aura cards' whose backgrounds are softly blurred nature (moss, sky, sand) with glass or dark panels floating on top; near-black ink; one electric lime highlight used sparingly; two-tone headlines in light weights (grey phrase, then black phrase); big confident numbers; pill-shaped controls; and delicate data graphics: dense 'barcode' hairline bars, dotted line charts with hatched bands, small value bubbles. Small cards float over larger ones with real depth. The feel is premium, quiet and alive: a personal dashboard that feels like looking out of a window."

colors:
  # Canvas & surfaces
  canvas: "#F4F6F6"           # app background (sampled #F4F6F6 / #F9FBFB)
  canvas-2: "#ECEEEE"         # section bands, segmented-control track
  surface: "#FFFFFF"          # main panels, rows, inputs
  surface-glass: "rgba(255,255,255,0.62)"      # light frosted glass (over auras/images only)
  surface-glass-dark: "rgba(52,54,54,0.62)"    # Index sidebar glass, dark chips (0.62 from v2.2: white text >= 4.5:1 over every aura)
  surface-dark: "#0E0F0F"     # dark cards, primary buttons, toast
  # Ink
  ink: "#0F1010"
  ink-2: "#4A4D4D"
  ink-3: "#8C8F8F"            # first phrase of two-tone headlines (sampled #8C8C8C); text 24px and larger only
  ink-3-small: "#696C6C"      # small grey text: eyebrows, labels, captions, chart labels (ink-3 fails AA below 24px)
  ink-4: "#BFC2C2"            # placeholders, inactive barcode bars, disabled
  on-dark: "#F7F8F8"
  on-dark-2: "rgba(247,248,248,0.64)"
  # Lines
  hairline: "#E6E8E8"
  hairline-strong: "#D3D6D6"
  hairline-glass: "rgba(255,255,255,0.45)"     # 1px edge on glass panels
  control-edge: "rgba(0,0,0,0)"   # inset edge on canvas-2 controls; none in light, visible in dark (v2.3)
  # Accent
  lime: "#E9FF6A"             # electric lime (sampled #ECFF6E): NOW marker, live dots, one hero CTA, trend arrows on dark
  lime-soft: "#E8E9C7"        # pale lime card (sampled #E8E9C7): Routine card, highlighted column
  lime-ink: "#4F6B1F"         # positive text on light surfaces (lime itself fails contrast on white)
  # Time states
  signal: "#E4572E"           # ember: overdue / late only (dots, badge fill, late nodes)
  signal-ink: "#BC3D18"       # late TEXT ("2d late"); ember text fails AA on the wash
  signal-wash: "#FBE6DE"      # overdue band background, late tag background
  # Aura palettes (blurred nature backgrounds). Each = [light, mid, deep]
  aura-moss: ["#9DB168", "#4D6230", "#1E2814"]
  aura-slate: ["#B9C9E6", "#5874B0", "#1F315E"]
  aura-ochre: ["#E3C79A", "#A47B47", "#4A3720"]
  aura-teal: ["#A9D3CD", "#3C7C76", "#173836"]
  aura-clay: ["#E3B6A7", "#A55E4E", "#4A2620"]
  aura-graphite: ["#D2D4D4", "#7A7D7D", "#2A2C2C"]

colors-dark:
  canvas: "#0C0D0D"
  canvas-2: "#141616"
  surface: "#161818"
  surface-glass: "rgba(28,30,30,0.62)"
  surface-glass-dark: "rgba(18,19,19,0.66)"
  surface-dark: "#F2F3F3"     # dark cards invert to light in dark theme only for primary buttons; aura cards stay dark
  ink: "#F2F3F3"
  ink-2: "#B4B8B8"
  ink-3: "#7E8282"
  ink-3-small: "#7E8282"
  ink-4: "#4A4E4E"
  on-dark: "#0E0F0F"
  hairline: "#242727"
  hairline-strong: "#323636"
  hairline-glass: "rgba(255,255,255,0.10)"
  control-edge: "#323636"
  lime: "#E9FF6A"
  lime-soft: "#2C2F1C"
  lime-ink: "#D6F25A"
  signal: "#FF7A52"
  signal-ink: "#FF7A52"
  signal-wash: "#3A1D14"

typography:
  hero:
    fontFamily: Inter Tight
    fontSize: 56px
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: -0.035em
  display:
    fontFamily: Inter Tight
    fontSize: 40px
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: -0.03em
  number-xl:
    fontFamily: Inter Tight
    fontSize: 48px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: -0.035em
    fontFeature: "tnum"
  number-lg:
    fontFamily: Inter Tight
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: -0.025em
    fontFeature: "tnum"
  title:
    fontFamily: Inter Tight
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: -0.015em
  heading:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.005em
  body:
    fontFamily: Inter
    fontSize: 14.5px
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: Inter
    fontSize: 11.5px
    fontWeight: 400
    lineHeight: 1.35
  eyebrow:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0.08em
    textTransform: uppercase
  button:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1
  number:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
    fontFeature: "tnum"

rounded:
  xs: 6px       # tiny chips inside cards, value bubbles
  sm: 10px      # inputs, menu items
  md: 14px      # rows on hover, inner glass panels, floating mini-cards
  lg: 20px      # panels, standard cards, blocks
  xl: 28px      # aura cards, space hero, app frame
  pill: 9999px  # buttons, tags, segmented controls, badges, avatars

spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  7: 32px
  8: 48px
  9: 72px

elevation:
  card: "0 1px 1px rgba(15,16,16,.03), 0 6px 20px rgba(15,16,16,.05)"
  float: "0 2px 6px rgba(15,16,16,.06), 0 24px 48px rgba(15,16,16,.14)"
  glass-edge: "inset 0 1px 0 rgba(255,255,255,.55)"
  blur-glass: "backdrop-filter: blur(24px) saturate(140%)"

layout:
  index-width: 264px
  content-max: 1240px
  document-max: 860px
  row-height: 44px
  gutter: 24px

components:
  button-primary:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 10px 6px 10px 18px
    trailingIcon: "20px white circle with ink arrow/dot"
  button-secondary:
    backgroundColor: "{colors.canvas-2}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 10px 16px
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: 8px 12px
  button-lime:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: 10px 18px
  segmented:
    track: "{colors.canvas-2}"
    item: "text {colors.ink-3}, 12px, padding 6px 10px"
    itemActive: "{colors.surface} pill + {colors.ink} text + {elevation.card}"
  tag:
    backgroundColor: "{colors.canvas-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 3px 8px
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    shadow: "{elevation.card}"
    padding: 24px
  aura-card:
    background: "aura gradient (see Aura recipe) + optional photo"
    rounded: "{rounded.xl}"
    padding: 24px
  glass-panel:
    backgroundColor: "{colors.surface-glass}"
    border: "1px solid {colors.hairline-glass}"
    rounded: "{rounded.lg}"
    effect: "{elevation.blur-glass}, {elevation.glass-edge}"
  floating-card:
    backgroundColor: "{colors.surface-glass}"
    rounded: "{rounded.md}"
    shadow: "{elevation.float}"
    padding: 16px
  text-input:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.ink-3}"   # controls need 3:1 (WCAG 1.4.11); hairlines are for separators
    rounded: "{rounded.sm}"
    padding: 10px 12px
  text-input-focused:
    border: "1px solid {colors.ink}"
    ring: "0 0 0 4px {colors.lime-soft}"
  toast:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.md}"
    shadow: "{elevation.float}"
---

# Daybook design system (v2: calm nature-tech)

> **Working name.** "Daybook" is a placeholder product name. Replace it everywhere when the final name is chosen.
>
> **Source.** This version is extracted from the "Synex – AI Fintech Website" Dribbble concept (by Awsmd) that the owner chose as the look he wants. It reproduces that **aesthetic, card design, colour logic and feature presentation**, applied to Daybook's own screens. It must not reuse Synex's name, logo, copy or photographs.

## Overview

Daybook should feel like a premium, quiet dashboard set against nature: an airy off-white canvas, crisp white panels, frosted glass, and a few rich "aura" cards whose backgrounds are blurred moss, sky or sand. Ink is near-black. One electric lime highlight marks what is live right now. Numbers are big and confident, headlines are light and two-toned, and controls are soft pills.

What makes the look recognisable (keep all of these):

1. **Airy light canvas.** `{colors.canvas}` #F4F6F6 with white `{colors.surface}` panels. Lots of breathing room.
2. **Aura cards.** Rounded 28px cards with blurred nature backgrounds (moss green, sky blue, warm sand) and either a frosted-glass panel or a dark gradient panel inside. They carry the hero numbers.
3. **Frosted glass, used over imagery only.** Glass panels (white at 62% + 24px blur) and a dark-glass sidebar sit over auras or photos, never over flat white.
4. **Two-tone light headlines.** First phrase in `{colors.ink-3}`, second phrase in `{colors.ink}`, weight 400, tight tracking: "Friday, 16 October / 3 things due today."
5. **Big numbers.** Values like `77.2 kg`, `107 days`, `৳75,000` set large in Inter Tight 500 with tabular figures, next to a small grey trend tag (`↗ 1.2 kg`).
6. **Electric lime, scarce.** `{colors.lime}` #E9FF6A for the NOW marker, live dots, trend arrows on dark cards, and at most one lime CTA per screen. Pale `{colors.lime-soft}` #E8E9C7 for one highlighted card (the Routine card).
7. **Pills everywhere for controls.** Black pill primary button with a small white circular icon at its end; grey pill secondary; pill tags; pill segmented controls (`7D 30D 90D All`).
8. **Delicate data graphics.** Dense "barcode" charts made of 1px vertical bars; dotted line charts with circular nodes, a diagonally hatched band and a white value bubble; thin connector lines with nodes.
9. **Floating cards.** A small glass card overlaps the edge of a bigger card (offset 24–40px, `{elevation.float}`), carrying one insight and one pill action.
10. **Small uppercase eyebrows and bracket numbers.** `TODAY · FRIDAY`, `[1] Learn Python`.

## Colors

### Canvas and surfaces
- **Canvas** `{colors.canvas}`: the app background on every screen.
- **Canvas 2** `{colors.canvas-2}`: section bands, segmented-control tracks, secondary buttons, tags.
- **Surface** `{colors.surface}`: panels, blocks, rows, inputs, menus.
- **Glass (light)** `{colors.surface-glass}` + 1px `{colors.hairline-glass}` + blur: panels and floating cards placed over auras or photos.
- **Glass (dark)** `{colors.surface-glass-dark}`: the Index sidebar and dark chips over imagery.
- **Dark** `{colors.surface-dark}`: dark cards (fading from an aura at the top to near-black at the bottom), primary buttons, toast.

### Ink
`{colors.ink}` for primary text and numbers; `{colors.ink-2}` secondary; `{colors.ink-3}` the grey half of two-tone headlines and other text 24px and larger; `{colors.ink-3-small}` small grey text: labels, eyebrows, captions, chart and timetable labels (light-mode ink-3 is only 2.8–3.3:1, below WCAG AA for small text); `{colors.ink-4}` placeholders, inactive barcode bars, disabled. Wherever this document says "ink-3" for text smaller than 24px, use ink-3-small. On dark: `{colors.on-dark}` and `{colors.on-dark-2}`.

### Accent
- **Lime** `{colors.lime}`: live/now only (NOW marker on the Deadline Rail and Day Timetable, the live dot before a card title, trend arrows on dark cards, one hero CTA per screen). Never as text on light backgrounds.
- **Lime soft** `{colors.lime-soft}`: the Routine card background and a highlighted comparison column.
- **Lime ink** `{colors.lime-ink}`: positive deltas as text on light surfaces ("↗ on target").

### Time states
- **Signal (ember)** `{colors.signal}` #E4572E: late/overdue only (the late-count badge, late milestone nodes, alert dots).
- **Signal ink** `{colors.signal-ink}`: late text such as "2d late" (ember itself is only 3.1:1 on the wash).
- **Signal wash** `{colors.signal-wash}`: background of late tags and of the Overdue panel header strip.
Lime means "now / good", ember means "late". Nothing else is coloured.

### Auras (space colours)
Each space has a **mark** (PRD enum `mark_color`), which maps to an aura palette of three stops [light, mid, deep]:

| Mark | Mood | Use |
|---|---|---|
| `moss` | moss and forest | default for Health |
| `slate` | sky and blue glass | default for AI Engineering |
| `ochre` | sand and dusk | default for AI Agency |
| `teal` | lake and lichen | default for Finance |
| `clay` | warm stone | default for Skincare |
| `graphite` | mist and rock | default for Personal |

**Aura recipe** (CSS, no images needed):
```
background:
  radial-gradient(60% 70% at 25% 20%, {light} 0%, transparent 60%),
  radial-gradient(70% 80% at 80% 30%, {mid} 0%, transparent 65%),
  radial-gradient(90% 90% at 50% 100%, {deep} 0%, transparent 70%),
  {mid};
filter: none;           /* the gradients are already soft */
```
Add a subtle grain overlay (2–3% opacity noise) so auras look photographic. Optionally a space can use a **cover photo** (moss, bark, stone, mist, sky; owner's own or properly licensed), shown blurred 40px behind the same glass layers.

Where the mark appears: space hero background, the space's aura card(s), a 10px aura dot next to the space name in the Index and on Today rows, and the left edge of time slots on the Day Timetable.

### Dark theme
Light is the default theme (owner, 17 Oct 2026). Dark is an option the owner chooses in Settings, either directly or by following the system setting. Canvas becomes `#0C0D0D`, panels `#161818`, glass darkens, ink inverts (`colors-dark`). Aura cards look the same in both themes (they are already rich). Lime stays the same; ember brightens to `#FF7A52`.

## Typography

### Families
- **Inter Tight** (Google Fonts, 400/500): headlines, big numbers, titles. Tight tracking.
- **Inter** (Google Fonts, 400/500/600): UI text, body, labels, buttons, small numbers.
- Both with `font-variant-numeric: tabular-nums` wherever numbers are shown.
- Load: `https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500&family=Inter:wght@400;500;600&display=swap`
- Fallback: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

### Hierarchy

| Token | Size / weight | Use |
|---|---|---|
| `{typography.hero}` | 56 / 400, −0.035em | Today headline, space hero headline (two-tone) |
| `{typography.display}` | 40 / 400, −0.03em | Section headlines (Review, Settings) |
| `{typography.number-xl}` | 48 / 500, −0.035em | Countdown, the main metric on an aura card |
| `{typography.number-lg}` | 28 / 500 | KPI values, tracker current values, money totals |
| `{typography.title}` | 22 / 500 | Page title, aura card title |
| `{typography.heading}` | 15 / 600 | Block titles, panel titles |
| `{typography.body}` | 14.5 / 400 | Rows, notes, inputs |
| `{typography.body-sm}` | 13 / 400 | Meta lines, table cells, Index items |
| `{typography.caption}` | 11.5 / 400 | Chart labels, tags, captions under numbers |
| `{typography.eyebrow}` | 11 / 500, uppercase, +0.08em | Section eyebrows, table headers |
| `{typography.button}` | 13 / 500 | Buttons and segmented items |
| `{typography.number}` | 13 / 500, tabular | Deadlines, times, row amounts |

### Rules
- **Two-tone headlines**: split the sentence into a context phrase (ink-3) and a statement phrase (ink). Use on Today, space hero, Review. Not on block titles.
- Big numbers use a smaller unit or currency symbol beside them (`77.2` + `kg` at body-sm ink-3; `$`-style prefix `৳` at 60% size).
- Eyebrows are the only uppercase text. Keep them short (1–3 words).
- Bracket indices `[1] [2] [3]` in caption ink-3 above feature-like items: Roadmap stages, Review sections.
- Body text 400; never bold body paragraphs.

## Layout

### App shell
- **Index (sidebar)**: 264px, a **dark-glass panel** (`{colors.surface-glass-dark}`, blur, `{rounded.lg}`) floating 12px inside the left edge over a fixed **ambient aura** (the owner's chosen aura or cover photo, blurred). White text. Contents top to bottom:
  1. Profile row: avatar circle, name, a small outlined tag (e.g. the current streak "12-day streak"), collapse button.
  2. Search pill: "Search" + `Ctrl K` hint.
  3. **Today** with a count badge (pill; ember fill when anything is late, glass otherwise).
  4. **Goals** group: each goal with its aura dot, name and days-left in `{typography.number}` at the right; expandable to show its pages as a tree (hairline guide line, like a file tree).
  5. **Life areas** group, same pattern.
  6. Bottom: Review, Settings, "+ New space" (glass pill).
- **Top bar** (inside content area, 64px): left: breadcrumb or greeting; right: theme toggle (pill switch), date pill ("Fri, 16 Oct" with a bell icon in a small circle), quick-capture button (black pill "New task ⊕").
- **Content**: max 1240px, 24px gutters, 32px between major sections. Document-style pages (Notes-heavy) narrow to 860px.

### Space view anatomy
1. **Space hero** (`aura-card`, full content width, 280px tall, `{rounded.xl}`) using the space's aura or cover photo:
   - Top-left: eyebrow ("GOAL · HEALTH" or "LIFE AREA").
   - Left: two-tone headline: space name (ink-3 on light auras / on-dark-2 on deep auras) + end goal (ink / on-dark).
   - Right: **Countdown** glass panel: `107` in number-xl + "days left · 31 Jan 2027".
   - **Floating card** overlapping the bottom edge: the goal's progress (e.g. "77.2 kg · started 78.4 · target 72" with a progress bar) and a black pill action ("Log weight ⊙").
2. **Deadline Rail** panel directly under the hero (see Components).
3. **Page tabs** as a pill segmented control (`Daily Tracker · Workouts · + Page`).
4. Page title (title style, editable) and the blocks laid out on a **12-column grid**: blocks span 12 (full), 8, 6 or 4 columns. Default spans: Tracker 12, Roadmap 12, Table 12, To-do 6, Time block 6, Routine 4–6, Notes 8–12. The owner can change a block's span (S/M/L/Full). Blocks never stretch to fill empty space; rows wrap.

### Today layout
- Headline row: two-tone hero ("Friday, 16 October" / "3 things due today.") with a summary row of 4 **KPI items** (icon in a 32px circle + number-lg value + caption): Late, Due today, Time blocks, Routine steps.
- Grid: left 8 columns: **Overdue** panel (ember-wash header strip), **Due today**, **Next 7 days**; right 4 columns: **Day Timetable** card, **Routine** card (lime-soft), **Trackers** glass card(s).
- Optional bottom strip **Recent activity**: 4 columns, each an icon + bold title + caption (e.g. "Logged weight 77.2 kg · 08:10").

### Spacing
4px base. Panel padding 24px; aura card padding 24–28px; row height 44px; gap between cards 16–20px; between sections 32–48px.

## Elevation & depth

| Level | Treatment | Use |
|---|---|---|
| 0 | Canvas, no shadow | Background |
| 1 | `{colors.surface}` + `{elevation.card}` | Panels, blocks, table containers |
| 2 | Glass: `{colors.surface-glass}` + blur + `{elevation.glass-edge}` + 1px hairline-glass | Panels over auras/photos, Index (dark glass) |
| 3 | `{elevation.float}` | Floating cards, menus, popovers, toast, dragged items |

Rules: at most **two glass layers** stacked; glass only where something rich is behind it; hover on cards lifts 2px and slightly increases shadow.

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 6px | Value bubbles, tiny chips |
| `{rounded.sm}` | 10px | Inputs, menu items |
| `{rounded.md}` | 14px | Floating cards, inner glass panels, timetable slots |
| `{rounded.lg}` | 20px | Panels, blocks, Index |
| `{rounded.xl}` | 28px | Aura cards, space hero |
| `{rounded.pill}` | 9999px | Buttons, tags, segmented controls, badges, avatars, checkboxes (circular) |

Icons: thin line icons (1.5px stroke, e.g. Lucide) at 16px, often inside a 28–32px circle (white on light, glass on dark).

## Components

### Buttons
- **Primary**: black pill, white label, with a 20px white circle at the right end holding a small ink icon (arrow, dot or plus): "View insight ⊙", "Log today ⊙", "New task ⊕".
- **Secondary**: canvas-2 pill, ink label ("Request…", "Cancel", "Add to Google Calendar").
- **Ghost**: transparent, ink-2 label; underline on hover ("Break down", "Remove").
- **Lime**: lime pill, ink label. Max one per screen, for the single most important action (e.g. "Start today" on an empty Today).
- Focus: 4px lime-soft ring + ink 1px border. Pressed: scale 0.98.

### Segmented control
Pill track in canvas-2; active item is a white pill with card shadow. Used for: page tabs, tracker ranges (`7D 30D 90D All`), table/board view switch, Today filters.

### Tags and badges
- **Tag**: canvas-2 pill, caption text, optional leading icon: `↗ 1.2 kg`, `moved 2×`, `Pro`-style outlined variant for streaks.
- **Count badge**: 18px pill; glass/grey normally, ember fill + white text when it counts late items.

### KPI item
32px icon circle + value (`number-lg` or `number`) + caption under it. In a row, separated by 24px; used on Today and in aura card footers.

### Aura card (signature)
Three variants, all `{rounded.xl}`, padding 24px:
- **Glass aura** (light aura, e.g. slate/sky): aura background with a light glass panel inset 16px; title row (icon + title + "⋯" menu); 3 KPI columns separated by hairline-glass; chart; list rows with label left and value right.
- **Dark aura** (e.g. moss): aura visible in the top third, fading to `{colors.surface-dark}` at the bottom; on-dark text; big number with a lime trend arrow (`27.4% ↗` style); a title + one-sentence description; footer of 3 mini stats with lime arrows.
- **Sand aura** (e.g. ochre): warm aura with a translucent dark-glass panel; big number + caption with a small coloured dot; a map- or chart-like graphic in white.
Usage: space hero, the main metric of each goal, and the "Goals" overview strip on Today (one aura card per active goal, 3 across). Max **3 aura cards visible at once**.

### Floating card
Glass, `{rounded.md}`, `{elevation.float}`, 16px padding, overlapping the edge of a parent card by 24–40px. Content: number-lg value + caption + one primary pill button, or an alert: small eyebrow ("Late") + a nested white sub-card with one sentence ("2 tasks in Health are past their deadline"). Use one per hero, never more than two on a screen.

### Block chrome
Every block is a white panel (`{rounded.lg}`, `{elevation.card}`). Header row: 28px icon circle for the block type, block title (heading, editable), a small type tag (canvas-2 pill: "Tracker", "Roadmap"…), and on the right the block's own controls (segmented ranges, view switch) plus a "⋯" menu. On hover a 6-dot drag handle appears outside the top-left corner, and a span control (S · M · L · Full) appears in the menu.

### Index item
Icon/aura dot + label (body-sm, on-dark) + optional right-aligned count badge or days-left. Hover: white 8% overlay pill. Active: white 14% pill + 500 weight. Children of a space are indented with a 1px hairline-glass tree line.

### Task row
44px, white surface, hairline separators (inset 16px), hover background canvas, radius md on hover. Layout: **circular checkbox** (18px, 1.5px ink-3 border; checked = black circle with white tick) · title (body) · source line under the title on Today (aura dot + "Health · Workouts", caption ink-3) · deadline tag at the right · a ⋯ menu on hover. Late rows: the deadline tag turns ember and a 6px ember dot sits before the title.

### Deadline tag
A small pill (caption/number style):

| State | Look |
|---|---|
| Future (`25 Oct`) | canvas-2 pill, ink-2 text |
| Soon (`tomorrow`, `in 3d`) | white pill with hairline border, ink text |
| Today (`today`, `today 18:00`) | black pill, white text |
| Late (`2d late`) | signal-wash pill, signal-ink text, ember dot |
| Done | no pill; date in ink-3-small, struck through |
| Moved | extra canvas-2 tag `moved 2×` |

### Countdown
Glass panel in the space hero: number-xl days + caption "days left" + deadline date. Past deadline: number in ember with caption "days past deadline".

### Deadline Rail (signature chart)
A white panel with a **barcode timeline**: one 1px vertical bar per day from the goal's start date to its deadline (3px gap; on long ranges, one bar per 2–3 days).
- Bar height encodes **how many tasks are due that day** (minimum height for empty days), so busy weeks are visible at a glance.
- Elapsed days in ink-2; future days in ink-4; the range of the current page/stage can be highlighted in the deep aura colour.
- **NOW**: a lime pill label "Today" above a 1.5px ink line.
- **Milestones**: small circles on top of their day's bar: filled ink = done, white with ink border = upcoming, ember = late. A short label under each (caption) where space allows; full title on hover.
- Below the bars: month labels (caption ink-3) and, at the far right, the deadline date in number style.
- Segmented control at the top right: `All · This month · This week` to zoom.

### Tracker chart
Inside a panel or aura card:
- Line: 1.5px ink (on light) or on-dark (on dark) connecting circular nodes (6px, white fill, ink stroke).
- Area: a **diagonally hatched band** under the line (45°, 1px lines, ink-4 at 6px spacing) instead of a solid fill.
- Target: dashed line in ink-3 with a small caption at the right ("target 2,000").
- Latest point: a white **value bubble** (`{rounded.xs}`, card shadow) with the value, plus a lime dot on dark cards.
- Header: title with a lime live-dot, range segmented control, current value in number-lg with a trend tag.
- Optional **barcode bar view** (like the Deadline Rail) for daily totals such as calories.

### Roadmap
Stages as a vertical list of white panels, each with a bracket index `[1]`, title (heading), a progress tag `3/7`, a thin progress bar (ink on canvas-2, pill ends), the stage deadline tag, and child steps as task rows with a hairline tree line. A thin connector line with nodes may link stages vertically (like the "intelligence layers" diagram).

### Table
White panel; header in eyebrow style on a canvas-2 band; rows 44px with hairlines; numbers right-aligned with tabular figures; status cells as tags with a leading dot (lime-ink dot for active states like "Client", ink-3 dot for early states, ember only if a date column is overdue). Money: `৳` prefix at 70% size. Summary footer row in 600 weight. **Board view** columns are canvas-2 lanes with white cards (rounded md, card shadow).

### Time slot and Day Timetable
- **Time slot row**: time range (number) · title · Google Calendar status (tag "On calendar ✓" in lime-ink, or secondary pill "Add to Google Calendar").
- **Day Timetable** card: hour labels (caption ink-3) from 06:00 to 24:00, hairlines per hour, slots as white rounded-md cards with a 3px left edge in the space's aura mid colour, title + time. NOW: 1.5px ink line with a lime pill showing the current time.

### Routine card
The pale-lime card (`{colors.lime-soft}`, `{rounded.lg}`): title + streak tag ("12-day streak"), steps as rows with circular black checkmarks on the right (like a comparison column), and a footer "2 of 4 today". Completing all steps triggers a small lime burst on the streak tag.

### Notes
White panel, document width (860px max), 16px body text at 1.65 line-height, headings in Inter Tight 500. No glass behind text.

### Inputs
White, 1px ink-3 border (controls need 3:1), `{rounded.sm}`; focus = ink border + lime-soft ring. Date/time pickers open as floating cards. Inline add forms are a single pill-shaped row at the bottom of a block: "+ Add a task" field, date pill, black pill button.

### Toast
Dark rounded-md card bottom-right with a lime dot for success and an ember dot for errors; one line + optional "Undo" ghost button.

### Empty states
A soft aura blob (small, 120px, blurred) behind one line of text and one secondary pill action. No illustrations.

## Motion
- **Blur-in reveal** for headlines and big numbers on first load: from `opacity 0, filter blur(12px), translateY(8px)` to clear in 600ms, staggered 60ms per element.
- **Number roll** when a big value changes (300ms).
- **Card hover**: translateY(−2px) + slightly stronger shadow, 200ms.
- **Floating cards** drift 4px on scroll (subtle parallax) on the space hero only.
- **Aura drift**: radial gradient positions animate very slowly (20–30s loop) on hero cards only.
- Everything respects `prefers-reduced-motion` (no blur-in, no drift, instant changes).

## Do's and Don'ts

### Do
- Keep the canvas light and airy; let white panels and generous spacing do most of the work.
- Use aura cards for the few things that matter most (space hero, goal metrics); max 3 visible.
- Put glass only over auras or photos.
- Use two-tone light headlines and big medium-weight numbers.
- Use pills for every control, tag and button.
- Reserve lime for now/live and ember for late.
- Show every status with words as well as colour ("2d late", "today", "On calendar").
- Check text contrast on every aura (add a dark or light scrim if needed).

### Don't
- Don't put lime text on white or light surfaces (fails contrast). Lime is a fill, a dot or an arrow on dark.
- Don't use purple/blue tech gradients, neon glows or coloured drop shadows.
- Don't stack more than two glass layers, or use glass over flat white.
- Don't put dense tables or long notes on aura backgrounds.
- Don't use more than one dark aura card per row.
- Don't use heavy bold headlines; the look depends on light 400 headlines.
- Don't reuse Synex's name, logo, copy or photographs. Use original auras or properly licensed nature photos.
- Don't use emoji as icons or section markers.

## Responsive behavior

Desktop-first; usable at 400px.

| Name | Width | Changes |
|---|---|---|
| Desktop | ≥1200px | Index visible; 12-column grid; Today 8 + 4 columns |
| Laptop | 900–1199px | Index collapsible to icons; Today right column moves below |
| Tablet | 640–899px | Index becomes an overlay drawer; blocks become full width; aura cards 2 across |
| Phone | <640px | Single column; hero headline 36px; space hero 220px with the countdown below the headline; floating cards stop overlapping and stack under their parent; Deadline Rail scrolls horizontally inside its panel |

Touch targets ≥44px on touch devices. The page never scrolls sideways; wide tables and the Deadline Rail scroll inside their own containers.

## Accessibility
- Text contrast ≥4.5:1 (body) and ≥3:1 (large numbers) on every surface, including glass and auras; use a 20–40% scrim behind text on busy auras.
- On light glass over an aura, small text is `{colors.ink}` (greys fall below 4.5:1 where the aura is deep); greys only for text 24px and larger. Small `{colors.on-dark}` text never sits directly on an aura: only on the dark fade of a dark aura card or on a 30% scrim.
- Control boundaries (checkboxes, inputs) are ≥3:1: `{colors.ink-3}`. Hairlines are only for separators and panels.
- Secondary buttons, segmented-control items and other canvas-2 pills carry a 1px inset `{colors.control-edge}`: transparent in light (the look is unchanged), #323636 in dark, where canvas-2 is almost the colour of the surface and the pill would otherwise vanish (v2.3).
- On dark glass, small text is full `{colors.on-dark}`; `{colors.on-dark-2}` only for text 24px and larger.
- Aura cards and dark glass look the same in both themes: they use the light-theme values of surface-dark, on-dark and on-dark-2 (the dark theme inverts those only for primary buttons).
- Focus is always visible (lime-soft ring + ink border).
- Status never by colour alone.
- Blur effects have a solid fallback when `backdrop-filter` is unsupported (use `{colors.surface}` at 92% opacity).
- Text on lime (the lime button, the "Today" pill on the Deadline Rail and Day Timetable) is always the near-black light value of `{colors.surface-dark}`, in both themes: `{colors.ink}` turns light in the dark theme and would vanish on lime (v2.2).

## Iteration guide (for Claude Code)
1. Generate CSS variables (or your styling system's theme) from the front matter for light and dark, including the six aura palettes and the aura recipe as a reusable utility.
2. Build primitives first: Panel, Glass panel, Aura card (3 variants), Floating card, Pill button (4 variants), Segmented control, Tag, KPI item, Task row, Deadline tag. Then compose screens from them.
3. Before adding colour, ask: is this "now" (lime), "late" (ember), or a space identity (aura)? If none, use ink and greys.
4. Every new number: Inter Tight or Inter with tabular figures, unit smaller and grey.
5. Check light, dark and 400px before calling a screen done.

### Prompts that stay on-system
- "Build the Space hero per DESIGN.md: aura card with the space's mark, two-tone headline (space name / end goal), Countdown glass panel on the right, a floating progress card overlapping the bottom edge."
- "Render the Deadline Rail as a barcode timeline per DESIGN.md: one bar per day, bar height = tasks due that day, elapsed in ink-2, future in ink-4, lime 'Today' pill, milestone nodes."
- "Make the tracker chart per DESIGN.md: line with circular nodes, hatched band, dashed target, white value bubble, 7D/30D/90D segmented control."

## Known gaps
- Exact photography set for space covers is the owner's choice (keep it to nature: moss, bark, stone, mist, sky, water).
- Board-view drag states and the Weekly Review layout should be mocked before building, using the components above.
