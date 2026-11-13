---
name: luxor-design
description: Apply Luxor Event Space's design system and responsive interaction standards whenever creating or changing frontend UI for its owner portal or public website.
---

# Luxor design

Tracked copy for **cloud agents and automations** (committed under `docs/`). Local Cursor may also use `C:/Users/lewis/.codex/skills/luxor-design/SKILL.md`; keep substantive edits in sync here.

Use for every frontend change in `luxor-event-space`, including styling, components, interactions, motion and responsive fixes on the portal or public site. Read the repository's `AGENTS.md` first; current user instructions and repository rules take precedence. Inspect the active route, nearby components, tokens and actual computed styles before choosing an implementation. Preserve unrelated work and existing flows.

## Product and visual direction

- Design the portal for Arianna to find context and act quickly: clear hierarchy, useful information close to the action, strong defaults and progressive disclosure. Connect the public experience to inquiries and tours with clear, trustworthy choices.
- Use iOS as inspiration for simplicity, familiar controls, smooth transitions and precise spacing; do not copy Apple's visual identity. Luxor's public site is warm, quiet, light and luxurious; the portal is calm, practical and light-first with a fully usable dark theme.
- **Operational Typography Standard:**
  - **Portal Standard Font:** The entire owner portal strictly uses **`Manrope` (`font-sans`)** for all headings, page titles, section labels, metrics, and numbers.
  - **Tabular Numerals:** Always use `tabular-nums` for currency, percentages, counts, and dates (`$0.00`, `1`, `0`, `75.0%`).
  - **Serif Font Reservation:** `Cormorant Garamond` (`font-serif`) is reserved strictly for the top-left `LUXOR` brand wordmark and actual client-facing documents, contracts, and email template previews. Do not introduce `font-serif` to portal workspace titles, buttons, or KPI counters.
- **Card Hierarchy & Restraint:**
  - Every element must earn its space. Remove redundant wrappers, labels, pills, decorations and competing actions. Avoid generic AI-generated aesthetics: repetitive cards, gratuitous gradients or glows, tiny overtracked text, unnecessary blur, decorative motion and generic copy.
  - Section and card headings use sentence case with crisp `font-sans font-bold text-base sm:text-lg text-[color:var(--portal-text)]`. Avoid stacking uppercase eyebrow labels directly above every heading.
  - Use restrained Luxor gold intentionally; the raised gold primary action is an established brand pattern (`luxor-gold-raised`). Don't add UI or redesign unrelated areas just because a pattern could be improved.
  - Prioritize readable text, natural alignment, useful density, meaningful empty states and clear next actions. Do not invent customer data or default operational values.

## Shared controls & navigation

- **Inspect `src/components/portal/PortalUI.tsx` and `src/app/globals.css` before creating controls.**
  - Reuse `PortalButton`, `PortalSelect`, `PortalDatePicker`, `PortalCloseButton`, `PortalModal`, `PortalStatusBadge`, `PortalAnimatedTabs`, and pagination where appropriate.
  - Portal dropdowns and calendars must be React elements, not native browser dropdowns or calendars.
  - Match shared input surfaces, focus, disabled and error states; do not use `portal-input-transparent` unless transparency is intentional.
- **Primary Gold Actions:** Portal primary gold actions use `luxor-gold-raised` with white text and icons (`!text-white` with white SVG strokes/fills). Match close buttons to the shared close control (`PortalCloseButton`). Status badges should be borderless by default while remaining legible and meaningfully distinct.
- **Animated View Selectors (Tabs):**
  - Desktop sub-navigation uses `PortalAnimatedTabs` with `variant="slider"` (the white/card floating selector with smooth spring animation and border outline).
  - Wrap tab content panels in `<PortalTabTransition activeKey={activeTab}>` for smooth fade/slide handoffs.
- **Browse Views Consistency Across Desktop, iPad, and Mobile:**
  - **Desktop (>=1280px / XL):** Render full horizontal sliding tabs (`PortalAnimatedTabs variant="slider"`).
  - **Tablet / iPad (768px – 1279px):** Render the standard Browse Views trigger button in the page header actions row (`hidden md:inline-flex xl:hidden min-h-10 items-center gap-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3.5 py-1.5`) showing `<Menu size={16} />`, small uppercase `Browse views` kicker, and current view title.
  - **Mobile (<768px):** Render the full-width tap trigger (`md:hidden flex w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3`).
  - **Dialog/Menu Sheet:** On click, opens the unified `PortalModal` or bottom drawer with grouped views, clear descriptions, semantic icons, and active page indicator.
- **Task Completion & Cross-Offs:**
  - Marking tasks as completed across the entire portal (Home Priorities, Calendar, Leads tasks, and Planner tasks) strictly uses the signature animated gold organic pencil strikethrough component (`PortalTaskCrossOff`), fading text to muted opacity without harsh visual cutoffs.
  - **Calendar Schedule & Overdue Behavior:** In schedule views, completed tasks retain their strikethrough for the day and clear on the next day. In overdue tasks, checking off a task animates the strikethrough and smoothly transitions off the list with subsequent tasks gliding up.
  - **Task & Calendar Modals:** Remove redundant inline actions (e.g., duplicate "Open linked lead" and "Open task" buttons). Linked entities (leads/clients) must be presented as interactive portal cards with hover highlight (`hover:border-[#caa24c]/50 hover:bg-[color:var(--portal-soft)]`), arrow indicator (`ArrowUpRight`), and direct routing.
  - **Title & Label Cleanliness:** Do not duplicate contact names in task headings when the contact name is already displayed on the line below. Use clean, direct page titles (e.g. `Calendar` rather than `Tours & Booked Events`).
- **Theming & Surfaces:**
  - Use portal theme tokens (`var(--portal-card)`, `var(--portal-soft)`, `var(--portal-border)`, `var(--portal-text)`, `var(--portal-muted)`), not hard-coded light-only surfaces (`#fffdfa`, `#eadfcf`).
  - Check light and dark styles, including hover, focus, selection, disabled, empty and loading states.
  - For the public site follow its own components, fonts, brand assets and light-first styling; don't transplant the portal's dark treatment into it.
- **Frosted popovers and backdrop blur:** A translucent `bg-…/90` class alone often reads as see-through glass with **no blur** in the portal. Tailwind `backdrop-blur-*` on a menu inside a **transformed ancestor** (for example Elena’s sliding `motion.aside`, or Framer **scale/translate** on the same node as the blur) usually fails silently. **Pattern:** portal the menu to `document.body` with `position: fixed` and coordinates from an anchor ref (match `PortalSelect`, Elena attach menu, `ElenaSlashCommandMenu`). On the frosted shell use the shared CSS in `src/app/globals.css`: `portal-popover-surface` and, for Elena slash commands, `elena-slash-command-popover` (explicit `background-color` plus `backdrop-filter` / `-webkit-backdrop-filter`). Keep `backdrop-filter` on a **non-transformed** inner panel; animate **opacity only** on an outer motion wrapper. Put `overflow-y-auto` on an inner scroller, not on the blurred surface (`overflow-hidden` on the blur layer can kill the effect). Set `data-portal-popover="true"`. **QA:** Confirm computed `backdrop-filter` is non-`none` and that busy content behind the menu is visibly softened in **light and dark** (`body[data-portal-theme]`); do not ship transparency without verified blur. Reference: `src/components/portal/ElenaSlashCommandMenu.tsx`.

## Motion and loading

- Transitions should feel deliberate and smooth in both directions: opening and closing modals, drawers, menus and readers; expanding and collapsing content; switching tabs; and loading-to-content handoffs. Avoid abrupt unmounts and height jumps, including when async content changes size or the user toggles rapidly. Keep interactions responsive and preserve focus and keyboard access.
- Skeletons should match the actual container and content geometry at each viewport, avoid layout shifts, and animate in and out with a subtle blur and opacity handoff. Scope loading to the content being fetched; do not cover an otherwise usable page with a global skeleton. Use `PortalSkeletonTransition` and `PortalTabTransition` where appropriate, but verify their options and mounted behavior: defaults may not animate initial or exit states.
- Respect `prefers-reduced-motion` with immediate or greatly reduced movement and blur. Motion must clarify state and never delay primary content, interfere with interaction or become a decorative flourish. Public above-the-fold content must render immediately; do not use scroll-triggered `Reveal` there.

## Verification

- Validate the actual affected journey in the Codex in-app browser or Chrome DevTools, using the user's exact viewport when supplied. Check desktop (1440px), portrait iPad/tablet (834px), and mobile (390px) at meaningful sizes and breakpoints. Exercise opening and closing, keyboard and focus, scroll and overflow, loading, empty and error states, controls and theme contrast as relevant. Do not trigger real calls, texts, sends or destructive actions merely for QA.
- Check rendered geometry and computed styles, not just source classes; global theme and coarse-pointer rules can override component styling. Verify skeleton-to-content transitions and both expansion directions with real or safe representative content. Report what was checked and any blocked or unverified viewport, theme, interaction or loading state honestly. Follow repository guidance for typecheck/lint and disposable verification; no committed test-only routes or fixtures.

For inspiration, [unslop](https://github.com/heydamir/unslop) and [unslop-ui-skill](https://github.com/claudiusararu/unslop-ui-skill) offer useful checks for generic UI patterns. Treat them as prompts for judgment, not as a replacement for Luxor's brand, required motion, repository rules or the user's request.
