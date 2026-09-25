# CampusOS UI System

The CampusOS look is playful, academic and retro-modern: cream surfaces,
indigo primary, pastel tones, thick ink outlines, offset "pop" shadows, pixel
sprites and bold display type. Underneath it is a small set of reusable parts.
Every new screen is **composed** from them, so no page invents its own styles.

- Visual reference: the CampusOS dashboard board and the Tools & Utilities mockup (both kept in the redesign brief).
- Code:
  - `src/app/globals.css` (tokens)
  - `src/components/campus/*` (components)
  - `src/components/ui/index.tsx` (form primitives)

## 1. Tokens (`src/app/globals.css`)

All colours are HSL triplets in CSS variables, with a hand-tuned dark palette
under `.dark`. It is designed rather than inverted: tones darken while their
`-ink` text brightens, so contrast stays at AA or better.

| Token | Use |
|---|---|
| `--surface-muted` / `--surface` / `--surface-raised` / `--surface-sunken` | Page, panels, cards, wells (tracks, skeletons) |
| `--ink` | Outlines and pop shadows (`border-ink`, `shadow-pop`) |
| `--brand` | Indigo primary: buttons, active nav, slider fill |
| `--tone-{mint,coral,lavender,sun,peach,sky,rose}` | Pastel card backgrounds (`bg-mint` …) |
| `--tone-*-ink` | Readable text or icon colour on that tone (`text-mint-ink` …) |
| `--border`, `--border-strong` | Hairlines, and inputs or dashed "planned" outlines |
| `--shadow-pop` | Offset ink shadow; `.campus-press` sinks it on press |

**Type:**

| Class or face | Use |
|---|---|
| `font-display` (Plus Jakarta Sans, extra-bold) | Headings and numbers |
| body text | Plus Jakarta Sans |
| `font-pixel` (Pixelify Sans) | Only for speech bubbles and small flavour text |

Both fonts are self-hosted through `@fontsource`, so there are no external requests.

**Radius:**

| Radius | Where |
|---|---|
| `rounded-2xl` | Cards |
| `rounded-xl` | Controls and inner panels |
| `rounded-full` | Pills, filters, rings |

**Outline widths:**

| Width | Where |
|---|---|
| 1.5px | Cards and controls |
| 2px | Slider thumb |

**Motion:** a single entrance animation, `animate-fade-up` (180 ms), plus a
shimmer for skeletons. Both are disabled under `prefers-reduced-motion`.

**Breakpoints:** Tailwind defaults.

| Breakpoint | What changes |
|---|---|
| `sm` 640 | Descriptions appear on tool cards; the search field appears in the top bar |
| `lg` 1024 | Sidebar replaces the drawer and bottom nav; quick-create becomes a centred dialog |
| `xl` 1280 | 4-up and 5-up grids |

**Touch:** every interactive element is at least 44px tall. That includes the
slider (whose hit area is 44px), bottom-nav tabs (56px), and quick-create rows (52–56px).

## 2. Components

### Layout: `src/components/layout`

| Component | Notes |
|---|---|
| `AppShell` | **Sidebar:** 232px; logo, nav groups, pinned Profile and Settings, user card with the **level/XP chip**. **Top bar:** search palette (⌘K), **Create** button (desktop), AI, notices, bell, theme, college chip, avatar. **Mobile:** 5-slot bottom nav with the central ＋, and the nav drawer. |
| `PortalLayout` | Filters navigation by permission and flag, builds the quick-create menu (working entries first, then planned ones), and passes the user's identity and progress. |
| `navigation.ts` | The IA. Items carry `feature`, `permissions`, `plannedPhase`. See §4. |

### Campus components: `src/components/campus/index.tsx` (server-compatible)

| Component | Purpose |
|---|---|
| `CampusCard`, `CampusSectionHeader` | Card shell; section title with a "View all" link |
| `CampusPill`, `CampusIconTile` | Tag pill; outlined icon square in a tone |
| `CampusProgressBar`, `CampusProgressRow` | Bar; a row with an honest empty state when the value is `null` |
| **`CampusRing`** | Donut (attendance, completion). `value: null` draws an empty track with `emptyLabel`. The optional `marker` draws a threshold tick. Small rings show whole percent. `role="img"` with a spoken label. |
| **`CampusStat`** | Number tile ("48 · Total classes"); `value: null` shows "—" |
| **`CampusSearch`** | GET form: works without JavaScript, keeps state in the URL, preserves other filters via `hidden` |
| **`CampusFilter`** | Link-based filter chips; scrolls horizontally on phones; the active chip has `aria-current` |
| **`CampusComingSoon`** | "Coming in Phase N" pill. The only permitted stand-in for an unbuilt feature. |
| **`CampusLevelChip`** | "Lv 4" with an XP bar; with `level: null` it shows the planned phase and never a fake level |
| `CampusXPBar`, `CampusStreak` | For the gamification phase (render only with real data) |
| `CampusTimeline`, `CampusNotice`, `CampusQuickAction`, `CampusLinkRow`, `CampusTabs` | Schedule, notices, shortcuts, lists, tabs |
| `CampusIllustration`, `CampusEmptyState`, `CampusSpeech` | Scene art, empty states with a sprite, pixel speech bubble |
| Pixel sprites (`pixel.tsx`) | `PixelAvatar`, `PixelRobot`, `PixelFlame`, `PixelBadge` |

### Overlays: `src/components/campus/overlays.tsx` (client)

These components share one dialog core, `useDialog`:

- rendered in a portal, with `role="dialog"`, `aria-modal`, and labelled by the title;
- focus moves into the panel on open, is trapped with Tab and Shift+Tab, and returns to the trigger on close;
- Escape or a backdrop click closes it;
- body scroll is locked while open.

| Component | Use |
|---|---|
| **`CampusModal`** | Centred dialog on desktop; slides up from the bottom on phones |
| **`CampusDrawer`** | Side panel (`side="left"`/`"right"`). `bare` lets the caller render its own chrome; the app nav drawer uses this. |
| **`CampusBottomSheet`** | Mobile sheet with a grab handle. `desktop="modal"` turns it into a centred dialog from `lg` up; the quick-create menu uses this. |
| **`CampusSlider`** | Native `<input type="range">`, so arrows, Page Up/Down, Home/End and screen readers work. It adds a live value readout, tick labels, a filled track and an `aria-valuetext` override. Styles are in `.campus-slider`. |

### Tools: `src/components/campus/tools.tsx` and `ToolOpenLink.tsx`

- **`CampusToolCard`** (`variant="feature" | "compact"`) renders a resolved tool from `src/lib/tools.ts`:
  - **AVAILABLE:** the CTA is a real link.
  - **PLANNED:** a "Coming in Phase N" pill, and nothing clickable.
  - **DISABLED:** "Off at your college".
  - `highlight` takes live, real data for this student.
- **`ToolOpenLink`** counts one open (fire-and-forget, `keepalive`) and then navigates. Prefetch is off, so hovering never counts.

## 3. Rules

1. **Real data only.** Components accept `null` and render an empty state. No placeholder numbers, ever.
2. **No dead controls.** A control either works, links to a page that exists, or shows `CampusComingSoon`. `tests/phase1-tools.test.ts` fails if any nav, quick-create or tool link points at a missing page.
3. **Tone means category, not status.** Status uses its own copy and icon (for example, a coral line reading "4 subjects below the line"), never colour alone.
4. **Server first.** Pages are Server Components; client code is limited to overlays, sliders, forms and counters.
5. **Recompose for mobile.** Don't just shrink the desktop layout. Tool cards drop descriptions below `sm`, grids become two columns, sticky actions sit above the bottom nav, and overlays become bottom sheets.

## 4. Feature flags and planned modules

`src/lib/features.ts#UNBUILT_MODULES` lists each flag whose module isn't built
yet, together with its roadmap phase.

- `isEnabled()` is always `false` for those flags.
- The settings API refuses to turn them on (422 `MODULE_NOT_BUILT`).
- Admin → Settings shows "Coming in Phase N" instead of a toggle.
- Navigation hides them.
- Quick-create and Tools show them as planned.

When a module ships, delete its line in the same commit as the pages.
