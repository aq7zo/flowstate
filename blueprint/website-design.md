# Flowstate — Website Design Prompt

## Reference
**Inspiration Site:** [throxy.com](https://throxy.com/?ref=siteinspire)

Throxy sets the benchmark: dark, confident, extremely clean. It uses a near-black background with a high-contrast off-white body copy, a single accent color that punches through (orange/amber), generous whitespace, bold editorial headlines, and animated UI "proof" panels that demonstrate the product mid-page. There is no clutter — every pixel is intentional.

---

## Aesthetic Direction

**Tone:** Dark luxury meets focused utility. Think "premium productivity tool for serious students."
**Archetype:** Deep night, focus mode, flow state — the screen at 2am when everything clicks.
**One memorable thing:** The hero section has a live, animated Pomodoro ring slowly ticking, surrounded by floating task cards that drift in and gently settle — showing the product *in motion* before the user reads a single word.

---

## Color Palette

```
--bg-base:        #0A0A0C       /* near-black with a blue-violet undertone */
--bg-surface:     #111118       /* card/panel backgrounds */
--bg-raised:      #1A1A26       /* elevated surfaces, modals */
--accent-primary: #7C6EF7       /* electric violet — the "flow" color */
--accent-warm:    #F5A623       /* amber — used sparingly for alerts, priority HIGH */
--accent-cool:    #3DD9C5       /* teal — streak indicators, completion states */
--text-primary:   #F0EFF8       /* warm white — main body */
--text-secondary: #7B7A96       /* muted lavender-gray for subtitles */
--text-faint:     #3D3C52       /* dividers, disabled states */
--success:        #4ADE80
--danger:         #F87171
--border:         rgba(124, 110, 247, 0.15)  /* violet-tinted subtle borders */
```

---

## Typography

```
Display font:  "Canela" or "Tiempos Headline" (serif with editorial weight)
              → Used ONLY for the hero H1 and major section titles
              → Italic weight for stylistic contrast on key phrases

Body font:     "Söhne" or "DM Sans" (clean, geometric, legible at small sizes)
              → All UI copy, labels, descriptions

Mono font:     "Berkeley Mono" or "JetBrains Mono"
              → Used for timestamps, task durations, Pomodoro countdown, any data
```

**Type Scale:**
- Hero H1: `clamp(52px, 7vw, 88px)`, light weight, tight letter-spacing (`-0.04em`)
- Section H2: `36–48px`, medium
- Card titles: `16–18px`, medium
- Body: `15–16px`, regular, line-height `1.7`
- Labels/tags: `11–12px`, uppercase, `0.08em` letter-spacing, mono

---

## Layout Principles

Inspired by Throxy's use of constrained-width centered content with full-bleed atmospheric backgrounds.

- **Max content width:** `1160px`, centered
- **Horizontal padding:** `24px` mobile → `80px` desktop
- **Grid:** Primarily single-column for copy, 2-col and asymmetric 3-col for feature sections
- **Sections:** Each section has `120–160px` vertical breathing room
- **Card corners:** `16px` radius, consistent
- **No sharp dividers between sections** — use gradient fades into `--bg-base`

---

## Page Structure

### 1. Navigation
- Sticky, ultra-thin bar (`56px` height)
- Frosted glass: `backdrop-filter: blur(20px)` over a `rgba(10,10,12,0.8)` base
- Logo left: wordmark "flowstate" in display serif, with a tiny violet dot after the 'e'
- Links center: `Today`, `Calendar`, `Focus`, `About`
- CTA right: `Get Started — It's Free` in a pill button with violet fill + subtle glow on hover

### 2. Hero Section
**Layout:** Full-viewport-height, centered content

**Headline (two lines):**
```
Your day, designed
for deep work.
```
- Line 1: display serif, light weight
- Line 2: display serif, *italic*, with `--accent-primary` color on "deep work"

**Subheadline:**
```
Flowstate combines next-day planning, Pomodoro focus, and a 
smart calendar — built for DLSU students who refuse to wing it.
```

**CTAs:**
- Primary: `Start Planning Tonight →` — violet fill, pill shape
- Secondary: `See how it works ↓` — ghost/outline, text link style

**Hero Visual (right side or below on mobile):**
An animated product mockup panel showing:
- A Pomodoro timer ring, actively ticking (CSS animation)
- 3 task cards floating in with staggered `animation-delay`
- One card transitions from "locked 🔒" to "unlocked ✓" with a glow sweep
- Subtle particle drift in the background (very slow, very faint)

**Background:**
- Radial gradient from `rgba(124,110,247,0.12)` centered top-right
- Faint noise texture overlay (4% opacity SVG noise)

---

### 3. Social Proof / Tagline Strip
Thin full-width band, `--bg-surface` background:
```
Built for DLSU  ·  Works offline  ·  Zero tracking  ·  Your data, your device
```
Scrolling marquee (like throxy's client logos), but with benefit badges instead.

---

### 4. Feature Sections

Each feature section alternates: **left copy / right visual**, then **right copy / left visual**.

#### Section A: Next-Day Planning
- **Headline:** `Tomorrow starts tonight.`
- **Sub:** Drag, prioritize, and time-block your tasks before you sleep. Wake up with a plan, not a panic.
- **Visual:** Animated task list with priority color pills (red/amber/green), a time-blocking timeline view scrolling smoothly
- **Callout chip:** `"Template applied — 6 tasks loaded in 1 tap"`

#### Section B: Sequential Tasks & Dependencies
- **Headline:** `Some things have to wait. Flowstate knows that.`
- **Sub:** Lock tasks behind dependencies. When you finish the blocker, the next task slides into color — a small win that keeps the momentum going.
- **Visual:** Two task cards: one locked (grayed, lock icon with tooltip); one sweeping into color with a glow animation on unlock

#### Section C: Pomodoro Focus Mode
- **Headline:** `Go deep. Come back. Repeat.`
- **Sub:** Set your work and rest intervals. Upload a custom alarm sound or paste a YouTube link. Your focus ritual, your way.
- **Visual:** Full Pomodoro timer UI mockup — ring, session counter, alarm selector
- **Callout chip:** `"Session 3 of 4 · 18 min remaining"`

#### Section D: Calendar & Heatmap
- **Headline:** `See your streak. Feel the pull.`
- **Sub:** A GitHub-style heatmap of every day you showed up. Filter by tag, view weekly stats, and let your own history motivate the next session.
- **Visual:** Heatmap grid with a tooltip appearing on hover — glowing cells in violet/teal gradient
- **Callout chip:** `"7-day streak 🔥  ·  89% completion this week"`

---

### 5. Philosophy / About Block
Full-width, centered, large serif quote style:

> *"Most productivity apps are built for tech workers with Slack and standups. Flowstate is built for the student at 11pm, staring at a task list that keeps growing."*

— small attribution line below in mono: `// Built by a student, for students`

---

### 6. How It Works — 3-Step
Horizontal 3-col layout with numbered steps and icon illustrations:

```
01 · Plan Tonight      02 · Focus Tomorrow      03 · Review & Streak
Set tasks, templates,  Lock in Pomodoro mode,   See your heatmap, carry
and priorities before  kill distractions, use   over unfinished tasks,
you go to sleep.       your alarm ritual.       build the habit.
```

Each step has a subtle top border in `--accent-primary` that animates from 0 to full width on scroll-enter.

---

### 7. Integration Callout
Dark card with a teal left border accent:

**Headline:** `Canvas & DLSU UniCalendar — already on your list.`
**Body:** Pull your Canvas assignments and DLSU academic calendar automatically. Due dates, enrollment milestones, and holidays appear directly in your plan — no copy-pasting.
**Badge:** `Canvas API` · `UniCalendar` · `DLSU`

---

### 8. Footer
Minimal. Two columns:
- Left: Logo + one-liner `"Your local-first focus companion."`
- Right: `Export Data`, `Import Backup`, `About`, `GitHub`
- Bottom bar: `No accounts. No cloud. No tracking. Data lives on your device.`

---

## Motion & Animation Guidelines

| Element | Animation |
|---|---|
| Hero task cards | Fade + translate-up, staggered 120ms apart |
| Pomodoro ring | Stroke-dashoffset CSS animation, 25min cycle looped |
| Task unlock | Background color sweep left-to-right + box-shadow glow pulse |
| Heatmap cells | Scale from 0.8 → 1.0 + opacity, triggered on scroll |
| Section entry | `translateY(24px) → 0` + opacity, `0.5s ease-out` |
| CTA button hover | `box-shadow: 0 0 24px rgba(124,110,247,0.5)` grow |
| Nav on scroll | Transition `background` from transparent → frosted glass |

**Philosophy:** Motion should feel like breathing — not bouncing. Everything eases, nothing pops.

---

## Component Spec Highlights

### Task Card (used in hero + feature visuals)
```
background: --bg-raised
border: 1px solid --border
border-radius: 12px
padding: 14px 16px
width: 280–320px

Left stripe: 3px solid [priority color]
Top-right: lock icon OR checkmark
Body: task title (body font, 15px)
Bottom: tag pill + time estimate in mono
```

### Priority Pills
```
HIGH   → #F87171 bg at 15% opacity, #F87171 text, dot
MEDIUM → #F5A623 bg at 15% opacity, #F5A623 text, dot
LOW    → #4ADE80 bg at 15% opacity, #4ADE80 text, dot
```

### Pomodoro Ring (SVG)
```
Outer ring: stroke --text-faint, stroke-width 6
Progress ring: stroke --accent-primary, stroke-linecap round
Center: mono countdown timer, large
Outer label: "FOCUS / BREAK" uppercase, mono, --text-secondary
```

---

## Responsive Behavior

| Breakpoint | Changes |
|---|---|
| `< 768px` | Hero visual moves below copy; single-column features |
| `768–1024px` | 2-col features; reduced hero font size |
| `> 1024px` | Full layout as described above |

Mobile nav collapses to hamburger → full-screen menu with frosted overlay.

---

## Accessibility Notes
- All interactive elements: visible focus ring in `--accent-primary`
- Animations: respect `prefers-reduced-motion` — disable all motion, preserve layout
- Color contrast: all text combinations meet WCAG AA (minimum 4.5:1)
- Pomodoro timer: screen reader announces remaining time every 5 minutes
