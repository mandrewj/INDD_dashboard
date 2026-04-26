# InsectID Style Guide

Portable visual system shared across InsectID web properties. Tuned to match insectid.org. Drop the snippets at the bottom into a Tailwind project, or use the CSS variables block for any framework.

## Colors

### Brand blue (primary)
Used for headings, primary actions, links, focus rings.

| Token        | Hex       | Use                                 |
| ------------ | --------- | ----------------------------------- |
| `blue-50`    | `#EEF4FF` | Tinted backgrounds, hover wash      |
| `blue-100`   | `#D9E5FF` | Subtle borders, dividers on accent  |
| `blue-600`   | `#116dff` | **Primary accent / link / button**  |
| `blue-800`   | `#0A3F95` | **Headings (h1/h2), hero text**     |
| `blue-900`   | `#0A2D6B` | Deepest emphasis, hover-on-blue     |

### Neutral gray (secondary)
Labels, captions, subdued UI. R≈G≈B, no hue cast.

| Token       | Hex       | Use                              |
| ----------- | --------- | -------------------------------- |
| `gray-100`  | `#EEF1F2` | Section backgrounds              |
| `gray-300`  | `#B7BDC0` | Hairline rules, disabled states  |
| `gray-500`  | `#6F7478` | Body secondary, captions         |
| `gray-600`  | `#5f6360` | **Default secondary text**       |

### Body text scale
Near-black, not pure black, for legibility.

| Token       | Hex       | Use                              |
| ----------- | --------- | -------------------------------- |
| `text-500`  | `#404342` | Secondary body                   |
| `text-600`  | `#1F2222` | **Default body text**            |
| `text-700`  | `#080808` | High-emphasis body               |

### Surfaces
White and very light gray. Avoid warm tints.

| Token         | Hex       | Use                            |
| ------------- | --------- | ------------------------------ |
| `surface-0`   | `#FFFFFF` | Page, card                     |
| `surface-1`   | `#F8F9FA` | Page-level subtle tint         |
| `surface-2`   | `#F1F3F5` | Sunken regions                 |
| `surface-3`   | `#E5E7EB` | Card border, hairline divider  |

Default page background is a vertical gradient `#FFFFFF → #F8F9FA`.

### Accent (cyan)
Sparingly, for secondary callouts that need to read distinct from the primary blue.

| Token       | Hex       | Use                  |
| ----------- | --------- | -------------------- |
| `cyan-400`  | `#3FB6D8` | Highlight pill, tag  |
| `cyan-500`  | `#1F95B8` | Hover on `cyan-400`  |
| `cyan-600`  | `#0E7693` | Pressed              |

### Data viz palettes (dashboards only)

**Qualitative — Okabe-Ito** (8-class, colorblind-safe). Use for categorical encodings (taxonomy, groupings).

```
#000000  #E69F00  #56B4E9  #009E73  #F0E442  #0072B2  #D55E00  #CC79A7
black    orange   sky      green    yellow   blue     vermil.  purple
```

**Sequential — viridis**. Use for ordered/quantitative encodings (choropleths, heatmaps). Generate via `d3-scale-chromatic` or interpolate manually; don't substitute another sequential ramp.

## Typography

**Family**: Lato — 300 / 400 / 700 / 900. Same stack for body and headings (no serif treatment).

```
Lato, Helvetica, Arial, ui-sans-serif, system-ui, sans-serif
```

Load via `next/font/google` (Next.js) or `<link>`:
```html
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
```

**Heading rule**: tighten letter-spacing to `-0.005em`. No uppercasing of body headings.

**Weights**: body 400, headings 700, hero/display 900, eyebrow/legal 300.

**Eyebrow label** (small uppercase tag above headings):
- Size 11px, `tracking-[0.2em]`, color `gray-600`, `uppercase`.

## Components

### Card
White surface, hairline border, soft shadow.
```
border 1px #E5E7EB · bg #FFFFFF · radius 8px
shadow: 0 1px 0 rgba(15,23,42,0.04), 0 4px 16px -8px rgba(15,23,42,0.10)
```
Optional 2px top accent in `blue-600` for "primary" cards.

### Section heading rule
Short underline beneath h2/h3:
```
2px tall · 40px wide · blue-600 · pill (full radius) · 8px gap to heading
```

### Divider
1px horizontal rule in `surface-3` (`#E5E7EB`).

### Focus ring
Visible keyboard ring on every interactive element. Required for accessibility.
```css
outline: 2px solid #116dff;
outline-offset: 2px;
border-radius: 4px;
```

## Logo

`insectID-brand.png` is the recolored mark — text + magnifier outline `blue-800`, handle `gray-300`, beetle preserved. Aspect ratio is **1094×474 (~2.31:1)** — never style with equal width/height.

```html
<a href="https://insectid.org">
  <img src="/images/insectID.png" alt="InsectID"
       style="height: 56px; width: auto;">
</a>
```

## Drop-in: Tailwind config

```ts
// tailwind.config.ts — extend.theme.colors
colors: {
  blue:   { 50:'#EEF4FF', 100:'#D9E5FF', 200:'#B3CBFF', 300:'#7AA5FF',
            400:'#4783FA', 500:'#2C7AFB', 600:'#116dff', 700:'#0A4FBE',
            800:'#0A3F95', 900:'#0A2D6B' },
  gray:   { 100:'#EEF1F2', 200:'#D9DDDF', 300:'#B7BDC0', 400:'#8A9094',
            500:'#6F7478', 600:'#5f6360', 700:'#4A4F50', 800:'#363A3B' },
  text:   { 100:'#F2F2F2', 200:'#D5D5D5', 300:'#A5A5A5', 400:'#6D6F6E',
            500:'#404342', 600:'#1F2222', 700:'#080808' },
  surface:{ 0:'#FFFFFF', 1:'#F8F9FA', 2:'#F1F3F5', 3:'#E5E7EB' },
  cyan:   { 400:'#3FB6D8', 500:'#1F95B8', 600:'#0E7693' },
  ok: { black:'#000000', orange:'#E69F00', skyblue:'#56B4E9', green:'#009E73',
        yellow:'#F0E442', blue:'#0072B2', vermillion:'#D55E00', purple:'#CC79A7' },
},
fontFamily: {
  sans: ['Lato','Helvetica','Arial','ui-sans-serif','system-ui','sans-serif'],
},
backgroundImage: {
  'page': 'linear-gradient(180deg, #FFFFFF 0%, #F8F9FA 100%)',
},
boxShadow: {
  card: '0 1px 0 rgba(15,23,42,0.04), 0 4px 16px -8px rgba(15,23,42,0.10)',
},
```

## Drop-in: CSS variables

```css
:root {
  /* Brand */
  --blue-50:#EEF4FF; --blue-100:#D9E5FF; --blue-600:#116dff;
  --blue-800:#0A3F95; --blue-900:#0A2D6B;
  /* Neutrals */
  --gray-100:#EEF1F2; --gray-300:#B7BDC0; --gray-500:#6F7478; --gray-600:#5f6360;
  --text-500:#404342; --text-600:#1F2222; --text-700:#080808;
  /* Surfaces */
  --surface-0:#FFFFFF; --surface-1:#F8F9FA; --surface-2:#F1F3F5; --surface-3:#E5E7EB;
  /* Accent */
  --cyan-400:#3FB6D8; --cyan-500:#1F95B8; --cyan-600:#0E7693;
  /* Type */
  --font-sans: 'Lato', Helvetica, Arial, ui-sans-serif, system-ui, sans-serif;
  /* Shadow */
  --shadow-card: 0 1px 0 rgba(15,23,42,0.04), 0 4px 16px -8px rgba(15,23,42,0.10);
}

body {
  font-family: var(--font-sans);
  color: var(--text-600);
  background: linear-gradient(180deg, var(--surface-0) 0%, var(--surface-1) 100%);
}
h1, h2, h3 { letter-spacing: -0.005em; color: var(--blue-800); }
a { color: var(--blue-600); }
:where(button, a, input, select, [role="button"]):focus-visible {
  outline: 2px solid var(--blue-600); outline-offset: 2px; border-radius: 4px;
}
```

## Quick rules

- Default heading color is `blue-800`, not the body text color.
- Default link color is `blue-600`, underline on hover.
- Body text is `text-600` (`#1F2222`), never pure black.
- Backgrounds are white or near-white; avoid warm/cream tints.
- Charts encode with Okabe-Ito (categorical) or viridis (sequential) — both are colorblind-safe. Don't substitute.
- Every interactive element gets the visible blue focus ring.
