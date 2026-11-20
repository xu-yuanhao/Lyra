# Lyra visual conformance rubric

Audience: Internal
Status: Active
Last verified: 2026-10-21

The Settings surface is the calibrated baseline. Every other surface must read as the same product. Audit each surface against these concrete checks. Cite `file:line` for every divergence.

## The canonical "ruler" (source of truth)
All visual values must resolve from these tokens, never bespoke literals. Color and material tokens live in `apps/desktop/src/renderer/styles/material.scss`; the type scale lives in `tokens.css` and is mirrored at runtime by `theme/foundation.ts`:

- Backgrounds: `--lyra-app-bg` `--lyra-app-sidebar-bg` `--lyra-app-panel-bg` `--lyra-app-surface-bg` `--lyra-app-muted-bg`
- Rows: `--lyra-app-row-bg` (transparent) / hover `--lyra-app-row-hover-bg` (#dfdfe0) / active `--lyra-app-row-active-bg` (#d9d9da) / active border `--lyra-app-row-active-border`
- Inputs: `--lyra-app-input-bg/-hover-bg/-focus-bg/-border/-focus-border/-placeholder`
- Borders: `--lyra-app-border` (#d7d7d9) / `--lyra-app-border-strong` (#c4c4c7)
- Focus ring: `box-shadow: 0 0 0 var(--lyra-stroke-strong) var(--lyra-app-focus)`
- Primary: `--lyra-app-primary-button` (#2f3033, neutral-dark, NOT blue) / fg `--lyra-app-primary-button-fg`
- Switch on: `--lyra-app-switch-on` (#52a66f)
- Radii: card `--lyra-radius-10`, control `--lyra-radius-8`
- Control heights: 24 is the floor for anything clickable; compact 28 / default 32 / prominent 40 (`--lyra-control-h-*`). Only two shell exceptions exist: titlebar 34 and browser pill 52, each with a comment at its use site.
- Line heights: never a bare ratio. Use a unitless `--lyra-text-line-*` tier (`flat` 1, `tight` 1.25, `snug` 1.35, `normal` 1.45, `comfortable` 1.5, `relaxed` 1.55, `loose` 1.65, `heading` 1.7, `body-copy` 1.75, `display` 1.05, `collapse` 0). Snap to the nearest tier instead of adding one.
- Disabled controls: `opacity: var(--lyra-opacity-disabled)` only. Decorative dimming (icons, glows, watermarks) may use its own value.
- Motion: `--lyra-motion-fast` (120ms), `--lyra-motion-standard` (190ms), `--lyra-motion-panel-layout` (260ms), `--lyra-motion-slow` (420ms, theme crossfade, number rolls and the installer slot only), `--lyra-motion-spin-duration` (1000ms). No raw `NNNms` in a transition or animation.
- Type scale: five tiers at 100% zoom — `--lyra-text-size-12` (caption), `-14` (body, the default), `-16` (title-sm), `-20` (title-md), `-24` (display). No sixth tier: no 11/13/15/17/18 or fractional sizes, and 12px is the floor for secondary text. Build hierarchy with weight, color and spacing first; jump a tier only when those are exhausted.
- Font scaling: every tier derives from `--lyra-ui-font-size` (Settings → Interface text size), so user font scaling and OS display scaling move the whole scale together. The values above are the 100% design baseline.
- Page titles: `--lyra-text-size-title-md` (20px at 100%) for the top heading of a full-page surface, including `AppSurfaceHeader`.
- List rows: compact 28 / default 36-40 (`--lyra-list-row-*`, AppObjectRow min 40)
- Icon sizes: toolbar 14 / button 16 (`--lyra-icon-size-*`)

## Per-surface checks (PASS / FLAG each)

1. **Component usage** — interactive controls are App components (`AppButton`/`AppIconButton`/`AppInput`/`AppSelect`/`AppSwitch`/`AppObjectRow`/`AppBadge`/`AppStatusMessage`/`AppTabs`), not bare `<button>/<input>/<select>/<textarea>` (except approved titlebar `lyra-titlebar-context-*` chrome and Monaco/xterm/canvas internals).

2. **Color discipline** — no bespoke hex/rgb/hsl in the surface's SCSS; all colors resolve from `--lyra-app-*` / `--lyra-*` tokens. No leftover demo palette (`--bg`/`--text`/`--color-*` private systems). No raw `accentColor`/blue decorative tints.

3. **Neutral-first accent** — hover/selected use neutral `--lyra-app-row-hover-bg`/`-active-bg`, NOT a saturated brand/blue fill. Primary color appears only on the single primary action / focus, not splattered on hover.

4. **State completeness** — interactive elements show default/hover/active(selected)/focus-visible/disabled. Focus uses the canonical ring token. Selected ≠ merely hover.

5. **Density & dimensions** — row heights, control heights, paddings, icon sizes pull from the scale tokens (28/32/36/40; icon 14/16; spacing 4/6/8/12/16). No off-scale magic numbers; no IDE-cramped or web-airy spacing.

6. **Radii & borders** — controls `--lyra-radius-8`, cards `--lyra-radius-10`, 1px hairline borders via `--lyra-app-border`. No oversized pill/rounded demo cards, no heavy shadows on content (shadows only on overlays/popovers).

7. **Hierarchy & layout** — surface background layering (app < sidebar/panel < card), section headers via `AppSurfaceHeader`, list main text vs meta vs description have fixed hierarchy; long text ellipsizes and does not shift affordances.

8. **No card-in-card / demo residue** — settings-style section + row-group, not nested cards; no embedded-demo look (esp. AI Panel).

## Output format per surface
- Verdict: CONFORMS / MINOR GAPS / NEEDS WORK
- Findings table: `#, severity(high/med/low), file:line, check#, what diverges, concrete fix`
- Only real, fixable divergences — not stylistic opinion. If it resolves from the right token and uses App components, it PASSES.
