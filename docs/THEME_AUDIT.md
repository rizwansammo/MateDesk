# M2 REMEDIATION PLAN — MateDesk frontend theming

Repo root for all paths: `c:/Users/Rizwan/Desktop/MateDesk-Pro/frontend/`. All paths below are relative to that root. 76 finding records were handed to me; they resolve to **~64 distinct defects** (12 records are the same file:line seen through two or three audit lenses — `layout.tsx:102` appears 4×, `PageTransitionOverlay.tsx:77` 3×, `globals.css:240` 3×, and 5 more appear 2×). I re-read `src/app/globals.css` in full and ran usage counts to validate the structural claims below; I did **not** re-verify each individual finding.

---

## 1. ROOT CAUSES

### RC-1 — One grey ramp, two grounds: the bottom of the ramp fails in both themes (23 records / ~21 distinct)
`--text-4` is **byte-identical `#64748b` in both token blocks** (globals.css:56 dark, :107 light) — it is not a themed token at all. `--text-5` is themed but lands at `#475569` on near-black and `#9ca3af` on near-white, i.e. it fails 4.5:1 on both sides. Measured usage: **275 `var(--text-5)` + 420 `var(--text-4)` = 695 call sites, which is 42% of all 1,654 token references in `src`.** These two steps carry whole semantic roles — form labels, table headers, timestamps, empty states, placeholders (globals.css:240), ghost buttons (:217), pagination (:252), `.empty-state-text` (:259) — at 10–11px uppercase. `--text-pale` (globals.css:58/:109) makes it worse: it is *lighter* than `--text-4` in dark but *identical* to it in light, so its contrast rank inverts between modes (5 usages: home:54, home:248, dashboard:123, dashboard:231, dashboard:235).

### RC-2 — Half-tokenised color pairs: dark-palette hex literals sitting on tokenised surfaces (19 records / ~18 distinct)
The background is a token, the foreground is a literal sampled from the dark palette. When `data-theme="light"` flips the surface, the text does not move. Measured: **184 inline `color: '#<dark-palette-hex>'` sites across 69 files** (~117 of them in M2 scope after excluding `(public)/`, `mateconnect/`, `email-guides/`), plus 14 hardcoded dark `background:` literals. The purest instance is `PriorityDonutChart.tsx:14`: text hardcoded `#e2e8f0` on `.chart-tooltip`'s `background: var(--bg-hover)`, and light `--bg-hover` **is** `#e2e8f0` (globals.css:95) — exactly 1.0:1, literally invisible.

### RC-3 — The "accent-on-own-tint" badge pattern, duplicated per file instead of shared (12 records / ~9 distinct)
400-level accent text over a 15%-alpha tint of the same hue reads fine on near-black and collapses to 1.4–2.2:1 on near-white. globals.css **already solves this** at :284-292 with `[data-theme="light"] .badge-*` overrides — but the app does not use those classes. `requests/page.tsx:22-31`, `requests/[id]/page.tsx`, `UserProfileView.tsx:28` and `mc-utils.ts:52` each re-implement the same maps inline, dark-only. The fix exists and is bypassed.

### RC-4 — Chrome that paints before or outside the theme context (10 records / ~6 distinct)
`#app-splash` (layout.tsx:102) runs pre-hydration; `PageTransitionOverlay.tsx:77` and `SplashDismiss` are mounted **outside** `<ThemeProvider>` (layout.tsx:208-215); `MCSplashScreen.tsx:43`; `logout-complete/page.tsx:37`. All hardcode `#0E1117`. Also in this bucket: **no `color-scheme` declaration anywhere** (globals.css:10 / :70), so native spinners, date pickers and autofill ignore `data-theme` entirely, and no `disableTransitionOnChange` on the provider (layout.tsx:208).

### RC-5 — Theme is a half-wired preference, not a feature (5 records)
Neither Appearance page has a theme control (`settings/appearance/page.tsx:57`, `mateconnect/settings/appearance/page.tsx:118`); the only `setTheme` call in the product is buried in `ProfileDropdown.tsx:189`; saved zoom is applied only while that page is open (`appearance/page.tsx:65`); MC settings write keys nothing reads (`mateconnect/settings/appearance/page.tsx:90`).

### RC-6 — Token hygiene / non-theme residue (7 records / ~6 distinct)
`--bg-panel` consumed at **11 sites** and `--bg-input` at **3 sites**, defined in neither block (exact sites: TipTapEditor.tsx:319/438/485, SlashCommandList.tsx:49/60, DocLinkList.tsx:37/47, kb/documentation/[id]/page.tsx:455/512/519, kb/documentation/page.tsx:291; requests/[id]/page.tsx:1211/1226/1241). Plus `--bg-hover` == `--border-subtle` in *both* blocks (`#1e2130` / `#e2e8f0`), a malformed `boxShadow` (NotificationDropdown.tsx:77), a specificity collision (globals.css:355), and a redundant Google Fonts `@import` (globals.css:1).

### Direct answer: why white fonts in light and dull fonts in dark?

**These are two independent mechanisms, which is why the symptom looks bidirectional and "not dynamic".**

- **White text in light mode = RC-2/RC-3.** The theme *is* switching correctly — `data-theme` flips and every token flips with it. The failure is that **only about 47% of color decisions in this codebase go through a token at all** (1,654 `var(--*)` references vs ~1,087 hardcoded hex + ~769 `rgba()` literals). Where a tokenised background is paired with a literal `#e2e8f0` / `#f8fafc` / `#ffffff` foreground, the ground moves from near-black to near-white and the text stays near-white. Nothing "fails to be dynamic" — half of each color pair was never wired to the switch. Worst cases: `PriorityDonutChart.tsx:14` (1.0:1), `requests/[id]/page.tsx:370` (1.18:1 timestamps on every message in every thread), `settings/notifications/page.tsx:140`, `requests/[id]/page.tsx:1266/1294` (`#ffffff` on a 13–18% alpha tint).
- **Dull text in dark mode = RC-1.** `--text-4` is the same `#64748b` in both blocks and never clears 4.5:1 on any dark surface (≈3.5:1 on `--bg-card`); `--text-5` dark is `#475569` (≈2.5:1). Those two steps own 695 call sites and are assigned to roles that appear on every screen. So dark mode's secondary copy is muddy *by token definition*, independent of any literal.
- **And both halves compound on the same tokens.** `--text-5` fails in dark (2.5:1) *and* in light (2.3:1 on `--bg-base`). That single token (globals.css:57/:108, 275 sites) reproduces both halves of the user's complaint simultaneously — which is why toggling the theme never appears to fix anything.

### Was this built dark-only with light bolted on? Yes — with one honest qualification.

Structural evidence, all in `globals.css`:
- Line 9 comment: `/* Dark theme (default — no data-theme needed, prevents flash) */` on bare `:root`; line 69: `/* Light theme overrides */`. Dark is the base reality; light is a patch set.
- Base ProseMirror block (lines 333-352) is **entirely hardcoded dark hex** (`#151821`, `#1e2130`, `#c8d6e5`, `#60a5fa`, `#94a3b8`); a retrofit block at 353-360 patches 7 of those declarations. The hljs syntax palette injected at `TipTapEditor.tsx:264` never got the same retrofit — hence unreadable code blocks in light mode.
- Badges: dark set inside `@layer utilities` (271-280); light set appended *outside* the layer as a flat override (284-292) — and the two classes the settings pages actually need (`.badge-success` / `.badge-danger`) exist in neither.
- `.chart-tooltip` got a light retrofit for its **box-shadow only** (328-330) while its text color regression sat at 1.0:1.

**Qualification:** git says the token system and the `[data-theme="light"]` block landed in the *same* commit — `12be788 "Phase 2 - Ticket system, design system, user profiles, theme, and RBAC"` — and the most recent touch is `8f84d98 "Dark/Light Mode Adjustment…"`. So light mode was not chronologically added later. The accurate statement is: **light mode was authored as a mechanical override layer over a dark-first base, and never visually reviewed.** Every screen — before and after — was styled against dark literals in inline props, and the light values were derived by inverting tokens rather than by looking at the result.

---

## 2. SEVERITY TABLE (deduplicated; M2 scope)

### CRITICAL — breaks a daily task
| file:line | scope | defect |
|---|---|---|
| `src/app/globals.css:57` + `:108` | shared | `--text-5` fails AA in both themes; 275 sites. Both halves of the reported symptom. |
| `src/app/(dashboard)/requests/[id]/page.tsx:1266`, `:1276` | matedesk | Active reply-mode label `#ffffff` on alpha tint — user cannot read whether they are sending a public reply or an internal note. |
| `src/app/(dashboard)/requests/page.tsx:22-31` | matedesk | Status/Priority/SLA badge maps dark-only; 1.4–2.1:1 on every row in light. Queue cannot be triaged. |
| `src/components/charts/PriorityDonutChart.tsx:14`, `:51`, `:53`, `:61` | matedesk | Donut legend + tooltip invisible in light (1.04:1 counts, 1.0:1 tooltip value) on the first screen after login. |
| `src/components/kb/TipTapEditor.tsx:264` | matedesk | One-Dark hljs palette with no light override; KB code snippets unreadable in light. |

### HIGH
| file:line | scope | defect |
|---|---|---|
| `src/app/globals.css:56` + `:107` | shared | `--text-4` identical hex in both themes, fails AA in both; 420 sites. |
| `src/app/globals.css:284-292` | shared | `.badge-success` / `.badge-danger` (used by Settings→Organizations) defined in neither theme. |
| `src/components/kb/TipTapEditor.tsx:319` (+10 more sites) | matedesk | `--bg-panel` undefined in both blocks → see-through KB menus in **both** themes. |
| `src/components/PageTransitionOverlay.tsx:77` | shared | `#0E1117` full-screen flash on every navigation in light; component also sits outside `ThemeProvider` (layout.tsx:208-215). |
| `src/components/layout/NotificationDropdown.tsx:162`, `:163` | matedesk | Hover paints near-black under tokenised text — row text vanishes on hover. |
| `src/components/layout/NotificationDropdown.tsx:184`, `:143` | matedesk | Ticket ref / timestamp / group headers at `--text-5`. |
| `src/app/(dashboard)/requests/[id]/page.tsx:370` | matedesk | Every message timestamp hardcoded `#e2e8f0` → 1.18:1 in light. |
| `src/app/(dashboard)/settings/notifications/page.tsx:140` | matedesk | Heading + every toggle label near-white on near-white panel. |
| `src/components/layout/MainSidebar.tsx:138-139` | matedesk | Active nav item is the *least* readable item in light (2.13:1) — user loses sense of place on every screen. |
| `src/components/users/UserProfileView.tsx:81`, `:503` (12 labels), `:415` | matedesk | Detail-row captions, all edit-form labels and table headers at `--text-5`, failing in **both** themes. |
| `src/app/(dashboard)/requests/page.tsx:780` | matedesk | `'Unassigned'` / `'—'` at `--text-5` read as empty cells in both themes. |

### MEDIUM
`globals.css:240` (placeholders bound to `--text-5`) · `globals.css:10`/`:70` (no `color-scheme`) · `globals.css:217`,`:252`,`:259` (ghost/pagination/empty-state on `--text-4`) · `dashboard/page.tsx:123`,`:231`,`:232`,`:235`,`:292` · `home/page.tsx:496` · `requests/page.tsx:811` · `requests/[id]/page.tsx:1039`,`:1294`,`:1988` · `MainSidebar.tsx:184`,`:204`,`:213` · `ProfileDropdown.tsx:121`,`:131`,`:227` · `UserProfileView.tsx:28` · `EventWarningSystem.tsx:259` · `settings/appearance/page.tsx:57`,`:65`,`:350` · `settings/organizations/page.tsx:14`,`:340` · `kb/page.tsx:147` · `calendar/page.tsx:139` · `layout.tsx:102`,`:193`,`:202`

### LOW
`globals.css:1` (+`:338`,`:339` font-family) · `globals.css:95` (`--bg-hover` == `--border-subtle`) · `globals.css:99` (`--border-md`) · `globals.css:355` (ProseMirror code specificity) · `layout.tsx:208` (`disableTransitionOnChange`) · `NotificationDropdown.tsx:77`,`:145`,`:173` · `ui/tooltip.tsx:20` · `logout-complete/page.tsx:37` · `requests/[id]/page.tsx:464` (scrims) · `home/page.tsx:54`,`:214`,`:318`,`:335`,`:492`,`:493`,`:539` · `kb/page.tsx:127` · `calendar/page.tsx:454` · `CannedPicker.tsx:145` · `UserProfileView.tsx:96` · `HeroSection.tsx:170` (inverse bug: token used where a literal is wanted — marketing site is intentionally always-light)

### NOT M2 WORK — scope=mateconnect (leaving with the RMM product; do not fix)
| file:line | defect |
|---|---|
| `src/components/mateconnect/mc-utils.ts:52` | `severityBg` dark-only tints; MEDIUM/LOW severity labels unreadable in light. |
| `src/components/mateconnect/MCProfileDropdown.tsx:114` | No theme toggle anywhere in MC. |
| `src/app/mateconnect/settings/appearance/page.tsx:118` | Appearance page with no theme control. |
| `src/app/mateconnect/settings/appearance/page.tsx:90` | Preferences written that nothing reads; "Saved" confirms a no-op. |
| `src/components/MCSplashScreen.tsx:43` | Hardcoded dark splash on every entry into MC. |

**Boundary note:** `MainSidebar.tsx:184/204/213` (the MATECONNECT launcher, `#4ade80` at 1.53:1 in light) is tagged `matedesk` by path but is the entry point to the departing product. In M2 the correct action is **deletion, not repair** — that removes 3 of the accent-on-tint sites for free.

---

## 3. SYSTEMIC vs ONE-OFF

**Systemic — 6 sweeps cover ~55 of the ~64 distinct defects.**

**Sweep A — ramp values (1 file, 5 lines, fixes 695 call sites).** This is by far the highest leverage change in the whole plan.
```
globals.css:56  dark  --text-4: #64748b -> ~#8595a8   (≈4.6:1 on --bg-card #1a1d27)
globals.css:57  dark  --text-5: #475569 -> ~#7c8ba1   (≈5.2:1 on --bg-base #0f1117)
globals.css:107 light --text-4: #64748b -> ~#556070   (≈5.6:1 on --bg-base #f0f4f9)
globals.css:108 light --text-5: #9ca3af -> ~#5b6675   (≈5.5:1 on --bg-base)
globals.css:58/109    --text-pale: retire (5 sites -> var(--text-3))
```
Honest constraint the findings imply but never state outright: **you cannot have six mutually distinguishable greys that all clear 4.5:1 on `#0f1117`.** After Sweep A, dark `--text-3 #94a3b8` and the new `--text-4 ~#8595a8` are nearly indistinguishable. Decide deliberately: keep **four** AA-passing text steps (`--text-0/1/2/3`) plus one explicitly-decorative step used only for non-informational text, rather than pretending six steps exist. Every value above moves contrast *up*, so the worst possible regression from this sweep is "less visual hierarchy" — never "less readable".

**Sweep B — role remap for the roles globals.css already defines.** After Sweep A most `--text-5` sites become acceptable, so do **not** blanket-replace 275 sites. Target only the sites where a component picked a ramp step two rungs below the house style already declared in globals.css — `.label` = `--text-3` (:229-232), `.icon-btn` = `--text-3` (:222-224), `.data-table thead th` = `--text-3`. Those are: UserProfileView.tsx:81/:96/:415/:503(×12), calendar:139/:454, CannedPicker:145, requests/[id]:1039, requests/page:780, NotificationDropdown:143/:184, kb/page:127, home:539. ≈35-40 targeted edits, mechanical, `var(--text-5)` → `var(--text-3)`.

**Sweep C — text literal → token (184 sites total, ~117 in M2 scope, ~40 files).** Apply **only** under `src/app/(dashboard)/**` and `src/components/**`, excluding `mateconnect/`, `(public)/`, `email-guides/`, `MCSplashScreen.tsx`.
```
color: '#f8fafc' -> 'var(--text-0)'      color: '#94a3b8' -> 'var(--text-3)'
color: '#ECEEF2' -> 'var(--text-0)'      color: '#64748b' -> 'var(--text-4)'   [only AFTER Sweep A]
color: '#e2e8f0' -> 'var(--text-1)'      color: '#9ca3af' -> 'var(--text-5)'   [only AFTER Sweep A]
color: '#c8d6e5' -> 'var(--text-2)'      color: '#475569' -> 'var(--text-5)'   [only AFTER Sweep A]
```
`'#ffffff'` / `'#fff'` is **conditional and not mechanical**: change to `var(--text-0)` only when the element's own background is a `var()` or an `rgba()` tint (requests/[id]:1266, :1276, :1294, :1988); **keep the literal** when the background is a solid brand hex (requests/[id]:1592 white on `#2563eb` is correct in both themes, as are `.btn-primary` globals.css:205 and `.pagination-btn.active` :255). Split this into two commits: unambiguous greys first, the `#fff` subset second with per-site review.

**Sweep D — surface literal → token (14 sites, 12 files).**
```
'#0f1117' / '#0E1117' -> var(--bg-base)      '#252936' -> var(--bg-elevated)
'#151821'             -> var(--bg-surface)   '#0d1020' -> var(--bg-deep)
'#1a1d27'             -> var(--bg-card)      '#111527' -> var(--border-panel)   [border use, NotificationDropdown:145]
'#1e2130' -> var(--bg-hover) as background; var(--border-subtle) as border  [disambiguate per site]
```
Exclusions: `(public)/**` (marketing is intentionally always-light — `HeroSection.tsx:170` needs the *opposite* fix, restore a literal `#151821`), `MCSplashScreen.tsx`.

**Sweep E — badge/accent consolidation. This one is a refactor, not a find/replace.** Delete the duplicated maps at `requests/page.tsx:22-31`, the copies in `requests/[id]/page.tsx`, and `UserProfileView.tsx:28`; route through the existing `.badge-*` classes (globals.css:271-292) which already carry light overrides, e.g. `className={'badge-' + status}`. Add the missing `.badge` base + `.badge-success` / `.badge-danger`. Then add **theme-aware accent tokens** for the remaining accent-on-tint sites: `--accent-info-fg: #60a5fa / #1d4ed8`, `--accent-ok-fg: #34d399 / #047857`, `--accent-warn-fg: #fbbf24 / #92400e`, `--accent-danger-fg: #f87171 / #b91c1c` — consumed at MainSidebar:138-139, ProfileDropdown:121/:131/:227, settings/appearance:350, home:496, EventWarningSystem:259.

**Sweep F — define the missing tokens (2 lines).** Add `--bg-panel` (`#151821` dark / `#ffffff` light) and `--bg-input` (`#252936` / `#eef2f7`) to both blocks. Fixes all 14 sites at once, in both themes, with zero call-site edits.

**Genuinely bespoke (9, each needs its own thinking):**
1. `TipTapEditor.tsx:264` — needs a whole `[data-theme="light"] .hljs-*` palette authored (GitHub-light values), not a mapping.
2. `layout.tsx:50-77`/`:102` — the pre-hydration splash must read the next-themes localStorage key in the blocking boot script and stamp an attribute. Real logic.
3. `layout.tsx:208-215` — move `SplashDismiss` + `PageTransitionOverlay` inside `ThemeProvider`. Structural.
4. `globals.css:355` — CSS specificity fix: scope to `:not(pre) > code`.
5. `globals.css:95` — `--bg-hover` vs `--border-subtle` collision needs a design decision on which ramp moves.
6. `globals.css:99` — `--border-md` at 1.48:1/1.25:1; raising it to a true 3:1 will visibly change the whole app's density. Judgement call; the finding itself suggests splitting decorative edges from interactive controls (`.input` :237, `.btn-secondary` :211).
7. `settings/appearance/page.tsx:57`/`:65` — new Theme card with a `mounted` guard, plus zoom restoration in the boot script. New feature work.
8. `NotificationDropdown.tsx:77` — malformed nested `boxShadow` value; one-line, no pattern.
9. `HeroSection.tsx:170` — the inverse defect; must be *de*-tokenised.

**One extra site I noticed while validating, not in the 76:** `globals.css:244` — the `.select` chevron is an inline data-URI SVG with `stroke='%2364748b'` hardcoded, so every select arrow in the product is dark-mode `--text-4` in both themes. Unverified as a user-visible complaint; fold it into Sweep A's review.

---

## 4. ORDERED FIX PLAN FOR M2

Sequenced so no step leaves the app worse than it found it. "Mechanical" = safe to script + diff-review; "judgement" = needs a human looking at pixels.

| # | Step | Files / anchors | Effort | Kind |
|---|---|---|---|---|
| 0 | Add `color-scheme: dark` after globals.css:31 and `color-scheme: light` after :89; add `disableTransitionOnChange` to `ThemeProvider` | globals.css:10/:70, layout.tsx:208 | 0.5 h | Mechanical, zero-risk (pure addition) |
| 1 | **Sweep F** — define `--bg-panel` + `--bg-input` in both blocks | globals.css ~:43 and ~:96 | 0.5 h | Mechanical. Fixes see-through KB menus in *both* themes with no call-site churn |
| 2 | **Sweep A** — ramp values, and decide the 4-step vs 6-step question | globals.css:56,57,58,107,108,109 | 1 h edit + 2 h review | Edit is mechanical; **the ramp-compression decision is judgement.** Highest leverage step: 695 sites, and the single fix for "dull fonts in dark mode" |
| 3 | Placeholder + helper rebind: globals.css:240 → `var(--text-3)` (only step clearing 4.5:1 on `--bg-elevated` in **both** modes — the findings disagree here, `--text-4` does not qualify at 3.05:1 dark); re-verify :217/:252/:259 now pass post-Sweep A; add `.badge` + `.badge-success` + `.badge-danger` | globals.css:217,240,252,259,270-292 | 1.5 h | Mechanical + one contrast run |
| 4 | **Sweep B** — role remap of the ~35-40 `--text-5` sites that contradict `.label`/`.icon-btn`/`thead th` | see Sweep B list | 2 h | Mechanical |
| 5 | **RC-4 chrome:** `PageTransitionOverlay.tsx:77` → `var(--bg-base)`; move `SplashDismiss`+`PageTransitionOverlay` inside `ThemeProvider`; theme-aware splash boot script; `logout-complete/page.tsx:37`; layout.tsx:164/182/193/202 → tokens | layout.tsx:50-77,102,164,182,193,202,208-215; PageTransitionOverlay.tsx:77; logout-complete/page.tsx:37 | 3-4 h | Boot script is **judgement** (must run before paint, must not race next-themes); the rest mechanical. Do this early — the black flash on every navigation is the most-seen surface in the app |
| 6 | **Sweep D** — 14 surface literals → tokens (incl. NotificationDropdown:145/:162/:163, settings/notifications:140 backgrounds, settings/organizations:14) | see Sweep D mapping | 2-3 h | Mechanical, with per-site background-vs-border disambiguation for `#1e2130` |
| 7 | **Sweep C part 1** — unambiguous grey/near-white `color:` literals → tokens, ~90 sites | ~35 files under `(dashboard)/` + `components/` | 4-6 h | Mechanical. **Must come after step 2**, or you tokenise onto a still-failing `--text-4` |
| 8 | **Sweep C part 2** — the `#ffffff` / `#fff` subset, per-site | requests/[id]:1266,1276,1294,1988 and siblings | 1-2 h | **Judgement** — keep white on solid brand fills, swap on alpha tints |
| 9 | **Sweep E** — badge consolidation into one shared module + accent token pairs | requests/page.tsx:22-31, requests/[id], UserProfileView.tsx:28, MainSidebar.tsx:138-139, ProfileDropdown.tsx:121/131/227, appearance:350, home:496, EventWarningSystem:259, globals.css | 5-7 h | Design decision on light accent values is **judgement** (once); the rollout is mechanical |
| 10 | MC excision: delete the MateConnect launcher block and MCSplashScreen wiring rather than fixing them; drop the 5 MC findings from the M2 backlog | MainSidebar.tsx:184,204,213; MCSplashScreen usage | 1 h | Mechanical; removes 4 defects by deletion |
| 11 | KB/TipTap: author `[data-theme="light"] .hljs-*`; scope globals.css:355 to inline code; change globals.css:338-339 `'JetBrains Mono'` → `var(--font-mono)` **then** delete the `@import` at globals.css:1 | TipTapEditor.tsx:264; globals.css:1,338,339,355 | 2-3 h | Palette authoring is **judgement**; **ordering matters** — delete the `@import` only after the font-family change, or code blocks silently lose their typeface |
| 12 | Theme UX: Theme card on `settings/appearance` with `mounted` guard; restore saved zoom in the boot script | settings/appearance/page.tsx:57,65; layout.tsx boot script | 2-3 h | Feature work |
| 13 | Cosmetic tail: separate `--bg-hover`/`--border-subtle` (globals.css:95); `--border-md` decision (:99); `NotificationDropdown.tsx:77` boxShadow; `--scrim` token for requests/[id]:464 and 7 siblings; `ui/tooltip.tsx:20`; de-tokenise `HeroSection.tsx:170` | as listed | 2-3 h | `--border-md` is **judgement** (changes app-wide density); rest mechanical |

**Total ≈ 30-42 h engineering + ~6-8 h visual QA.** Critical dependency chain: **2 → 7** (never tokenise onto a broken token), **11 internal ordering** (font-family before `@import` deletion), and **10 before 9** (deleting MC removes sites you would otherwise refactor).

---

## 5. WHAT WOULD STILL BE UNVERIFIED

Every contrast number in these findings was computed against **nominal token hexes**. There are ~769 `rgba()` literals in `src`, so a large share of real effective backgrounds are composites (accent tint over `--bg-card` over `--bg-base`) that static analysis cannot resolve. Treat 1.0-1.5:1 calls as reliable (those are same-hex or near-same-hex collisions), and treat every 3.5-4.6:1 call as needing a measurement in a real browser.

**Screens to walk, in both modes, after the fixes:**
- `/home` (8 stat tiles, announcement pills, My Overdue badges, completed to-dos, notes panel empty state), `/dashboard` (6 KPI captions, Unassigned value, donut legend **and hover tooltip**, activity-feed previews)
- `/requests` (badges on every row, hovered row, pagination, search placeholder, `Unassigned`/`—` cells, "N total tickets" footer)
- `/requests/[id]` — highest defect density (69+ literals in one file): both reply-tab states, image-attach **with a file attached**, 20+ message timestamps, copy icons idle-not-hovered, To/CC/BCC fields, Merge/Absorb card (**requires an MSP-owner login**), time-log dates, resolution note, all modal scrims
- `/kb` (COMING SOON tile), `/kb/documentation/[id]` (slash menu, @-link picker, bubble menu, find-and-replace, and a fenced PowerShell block for hljs)
- `/calendar` (weekday letters, sidebar STATUS / THIS WEEK headings, event metadata), `/agents`, `/clients`, `/users/[id]` (detail captions, Edit Profile modal's 12 labels, Change Password modal, Recent Tickets headers + Priority column)
- `/settings/notifications`, `/settings/appearance`, `/settings/organizations` (create/edit modal + native `<option>` list), `/settings/organizations/[id]` (Active/Inactive badges)
- Overlays: notification panel (hover an **unread** row, group headers, read-vs-unread), profile dropdown (role + Online + Sign out), tooltips with the sidebar **collapsed**, the `EventWarningSystem` bar (needs a **seeded imminent/overdue event** — will not appear otherwise)
- Transitions: cold hard reload in light (splash), a nav click in light (transition overlay), sign-out (logout-complete), and a theme toggle mid-session

**Not verifiable without a real browser, at all:**
- `color-scheme` effects are user-agent-dependent: number spinners, `datetime-local` pickers, Chrome autofill background, native scrollbars. Check in Chrome **and** Firefox, dark mode.
- Whether the compressed dark ramp (step 2) still reads as a hierarchy — that is a pure perceptual question.
- Zoom interaction: users can set 85%/125% (`settings/appearance`), and many of these labels are 9-11px. Contrast fixes do not address size; check the extremes.
- The KB "Export PDF via print view" path renders light-only and was never audited by anyone.
- Role-gated surfaces (MSP owner, MateConnect-permitted, End User) render different trees; a single login covers none of the others.

**Claims I would not defend without a browser:** any "fails by 0.2" verdict; the precise post-fix hex values (they are contrast-calculated, not eye-checked); and whether raising `--border-md` (step 13) improves or wrecks the intended chrome-dense look.

---

## 6. TOKEN CONTRACT

**Every color that can appear on more than one background must be a `var(--token)`, and foreground and background must always come from the same layer of abstraction — never one token and one literal.** Concretely: a raw hex or `rgba()` is permitted in `src` only when the value is theme-invariant *by intent* (brand blue `#2563eb`, MC green `#10b981`, white on a solid brand fill) or when it lives inside the always-light marketing pages under `src/app/(public)/`; everywhere else, text uses `--text-0..--text-3` (`--text-4` and below are for non-informational decoration only, never for labels, values, placeholders, table headers or the idle state of an interactive control), surfaces use `--bg-*`, and borders use `--border-*`. Every token must be defined in **both** the `:root` and `[data-theme="light"]` blocks of `globals.css` — a token defined in only one block, or holding the identical hex in both (as `--text-4` does today), is a bug by definition and should fail CI. Semantic color pairs (status, priority, severity, accent-on-tint) live in exactly **one** shared place with a per-theme pair for both the fill and the text, and are consumed by class or token — never re-declared as a per-file hex map. And any element that paints before hydration or outside `<ThemeProvider>` must either read the persisted theme in the blocking boot script or use theme-invariant colors; it may not assume dark.