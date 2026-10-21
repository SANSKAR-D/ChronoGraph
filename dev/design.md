# ChronoGraph Design System: Technical Forest Slate
**Theme Name:** Technical Forest Slate (Instrument Dark)  
**Aesthetic:** Near-black organic slate, precision instrument telemetry, subtle liquid glass  
**Target Atmosphere:** High-throughput DAG orchestration with organic forest undertones and muted terracotta alerts.

---

## 1. Executive Summary & Brand Mood
The **Technical Forest Slate** palette replaces harsh cyber neons and flat pure blacks with an organic, instrument-grade aesthetic. The deep near-black backdrop has a faint forest-green tint (`#0C100D`), supported by dark slate glass surfaces (`#141A15`), structured borders (`#243026`), warm off-white typography (`#E8ECE4`), and a restrained leaf-green accent (`#7FBF6A`). Alerts (such as DLQ status) use a muted terracotta red (`#E5735C`) rather than aggressive crimson.

```
       [ Deep Forest Near-Black #0C100D ]  ──── Canvas & Viewport
                  │
   ┌──────────────┼──────────────┐
   ▼              ▼              ▼
[ Surface ]    [ Border ]     [ Text ]
 #141A15        #243026        #E8ECE4
Elevated Glass Structure      Warm Off-White
   │
   ├───────────► [ Accent ] ──────────► #7FBF6A (Softer Leaf Green)
   │             [ Accent Hover ] ────► #92CF7D
   │
   └───────────► [ Alert ] ───────────► #E5735C (Muted Terracotta Red)
```

---

## 2. Core Palette Specifications

### 2.1 Foundational Tokens
| Token Name | Hex Code | RGB | HSL | Semantic Role |
| :--- | :--- | :--- | :--- | :--- |
| **Background** | `#0C100D` | `rgb(12, 16, 13)` | `hsl(135, 14%, 5%)` | Deep near-black with faint green tint. Base canvas and non-video viewport. |
| **Surface** | `#141A15` | `rgb(20, 26, 21)` | `hsl(130, 13%, 9%)` | Glass cards, floating navbar fill, toolbar pill containers, telemetry panels. |
| **Border** | `#243026` | `rgb(36, 48, 38)` | `hsl(130, 14%, 16%)` | Subtle structural 1px dividers, card boundaries, tab strip outline. |
| **Text** | `#E8ECE4` | `rgb(232, 236, 228)` | `hsl(90, 18%, 91%)` | Warm off-white primary text, card headings, active values, button labels. |
| **Muted Text** | `#8B968B` | `rgb(139, 150, 139)` | `hsl(120, 5%, 57%)` | Subtitles, spec labels, inactive navigation tabs, frame counter. |
| **Accent** | `#7FBF6A` | `rgb(127, 191, 106)` | `hsl(105, 41%, 58%)` | Softer, yellow-leaning leaf green. Primary CTA button ("Run DAG"), active status dots, progress bar. |
| **Accent Hover** | `#92CF7D` | `rgb(146, 207, 125)` | `hsl(105, 48%, 65%)` | Interactive hover highlight on accent buttons and key triggers. |
| **Alert** | `#E5735C` | `rgb(229, 115, 92)` | `hsl(10, 73%, 63%)` | Muted terracotta red replacing generic red dots (DLQ tab dot, unresolved badges, error states). |

---

## 3. Surface & Glassmorphism Tokens

### 3.1 Floating Liquid Glass Navbar
Floating liquid-glass pill capsule elevated above the 3D scroll canvas:

```css
.navbar-floating-glass {
  position: fixed;
  top: 1rem;
  left: 0;
  right: 0;
  z-index: 50;
  background: rgba(20, 26, 21, 0.65);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid #243026;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.40), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  border-radius: 9999px;
}
```

### 3.2 Liquid Glass Card Standard (`.liquid-glass`)
```css
.liquid-glass {
  position: relative;
  background: linear-gradient(
    135deg,
    rgba(20, 26, 21, 0.70) 0%,
    rgba(20, 26, 21, 0.45) 50%,
    rgba(20, 26, 21, 0.60) 100%
  );
  backdrop-filter: blur(28px) saturate(140%);
  -webkit-backdrop-filter: blur(28px) saturate(140%);
  border: 1px solid #243026;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 20px 45px -10px rgba(0, 0, 0, 0.65),
    0 8px 20px -4px rgba(0, 0, 0, 0.35),
    inset 0 1px 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -1px 1px 0 rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
```

---

## 4. Typography Scale & Font Pairing

| Role | Font Family | Weight | Size / Line Height | Color | Semantic Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Global Sans** | `Ranade` (self-hosted WOFF2) | 400, 500, 700 | Modular scale | `#E8ECE4` / `#8B968B` | Primary UI, navigation, buttons, telemetry labels |
| **Display Script** | `Belinda` (self-hosted WOFF) | Normal | `1.75rem (28px) / 1.15` | `#E8ECE4` | Milestone card headings ("The Dormammu Loop?", "The Time Stone?") |
| **Brand Monogram** | `Oxanium` | 700 | `2.5rem - 4.5rem` | `#E8ECE4` + `#7FBF6A` | Plucked text interactive hero title (`CHRONOGRAPH`) |
| **Code / Telemetry** | `Geist Mono` | 400, 500 | `0.6875rem (11px)` | `#8B968B` | Worker IDs, timestamps, Lua algorithms, Redis keys |

---

## 5. UI Component Specifications

### 5.1 Swipeable Tabs (`components/ui/swipeable-tabs.tsx`)
* **Inactive Tab:** `text-[#8B968B] hover:text-[#E8ECE4]`
* **Active Selected Tab:** `text-[#0C100D] font-semibold`
* **Sliding Selection Indicator:** `bg-[#E8ECE4] rounded-full`
* **DLQ Alert Indicator:** `bg-[#E5735C]` 6px circular dot
* **Focus Ring:** `ring-2 ring-[#7FBF6A]`

### 5.2 Milestone Cards (`HomeView.tsx`)
* **Appearance Scroll Trigger:** Frame 75 (`p ≈ 0.244`)
* **Card Shell:** `w-64 sm:w-72 lg:w-80`, `bg: rgba(20, 26, 21, 0.65)`, `border: 1px solid #243026`
* **Card Headings:** Belinda script font, color `#E8ECE4`
* **Spec Snippet Box:** `bg-[#0C100D]/60 border border-[#243026]`
* **Key/Value Pairs:** Keys `#8B968B`, Values `#E8ECE4 font-mono`
* **Status Dot:** `#7FBF6A`

### 5.3 Buttons & Actions
* **Navbar Login:** Solid fill `#7FBF6A` with dark text `#0C100D`, hover state `#92CF7D`
* **Bottom Pill CTA ("Explore your creativity"):**
  * Primary Button: `Studio` (`#7FBF6A` fill, `#0C100D` text)
  * Secondary Button: `Login` (`#141A15]/80` glass, `#243026` border, `#E8ECE4` text)
* **Alert / DLQ Action:** `bg-[#E5735C] hover:bg-[#d6654e] text-[#0C100D]`

### 5.4 End-of-Scroll Workflow Showcase Card (`HomeView.tsx`)
* **Trigger:** Ascends from bottom above the site when scroll approaches the end (`p >= 0.80 -> 0.96`).
* **Shell:** `rgba(20, 26, 21, 0.78)`, `blur(24px) saturate(140%)`, `1.5px solid #243026`, `rounded-3xl`, `shadow-2xl`.
* **Content:** Website architectural summary, live cluster health status, and 3 key capability highlights.
* **SVG DAG Execution:** Hardware-accelerated vector animation with 5 nodes (`Ingest Trigger` -> `Kahn DFS` & `Redis Lua Mutex` -> `BullMQ Workers` -> `Emit Receipt`), animated dashed energy lines, and moving packet pulses.

---

## 6. Implementation Reference (`app/globals.css`)
```css
:root {
  --background: #0C100D;
  --foreground: #E8ECE4;
  --surface: #141A15;
  --border: #243026;
  --muted: #8B968B;
  --accent: #7FBF6A;
  --accent-hover: #92CF7D;
  --alert: #E5735C;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-alert: var(--alert);
}
```
