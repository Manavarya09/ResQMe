# ResQMe design — soft neumorphic

The app keeps its original look: soft, tactile neumorphic surfaces on cool grey with a warm orange accent.
Polish comes from consistency, not new styles.

## Foundations
- **Background / surfaces:** `bg-bg-base` (#eef0f5). Raised controls use `raised()` from `src/theme.js`; inputs and data wells use `inset()`.
- **Accent:** orange `#f48c25` (`text-primary`, `bg-primary`) for primary actions and active states.
- **Danger:** red `#ef4444` only for SOS, critical severity and destructive actions. Green `#16a34a` for safe/success.
- **Text:** headings `text-slate-800`, body `text-slate-600/700`, captions `text-slate-400`.
- **Font:** Manrope everywhere (applied automatically by `src/components/Text`). Use `font-mono` only to get fixed-width digits for timers and counters — it stays Manrope, no code-editor fonts.
  Always import `Text` from `src/components/Text`, never from `react-native`.

## Type scale
- Screen title: `text-2xl font-extrabold text-slate-800` (via `Header`)
- Section label: `SectionLabel` — 11px extrabold uppercase, `tracking-widest`, slate-400
- Card title: `text-base font-extrabold text-slate-800`
- Body: `text-sm font-medium text-slate-600`, caption: `text-[11px] font-semibold text-slate-400`

## Components (`src/components/ui.js`)
Screen, Header, Card, Inset, Button (primary / danger / success / ghost), Field, ToggleRow, Pill, SectionLabel,
IconButton, PressScale, EmptyState. Build new screens from these.

## Rules
- Icons: slate-400/500 at rest, orange when active; one accent colour per card. No rainbow palettes, no emoji.
- Left-align content; one primary action per screen; touch targets ≥ 44 px.
- Every async screen has loading, empty and error states.
