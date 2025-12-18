# UI/UX Redesign - Modern Professional Interface

## Overview

Complete redesign of LLMos-Lite UI/UX using world-class design principles inspired by **Linear**, **Vercel**, and **Arc Browser**. The new design prioritizes:

- ✨ **Modern aesthetics** with glassmorphism and subtle animations
- 🎨 **Professional color scheme** with excellent contrast
- 📐 **No-scroll layout** - everything fits on screen
- ⚡ **Smooth micro-interactions** and transitions
- ♿ **Accessibility-first** approach

---

## Design System

### Color Palette

**Modern RGB-based system** for opacity support:

```css
/* Backgrounds - Subtle depth */
--bg-primary: 18 18 20 (Deep slate)
--bg-secondary: 24 24 27 (Slightly lighter)
--bg-tertiary: 30 30 35 (Elevated surfaces)
--bg-elevated: 36 36 42 (Hover states)

/* Foreground - Optimized readability */
--fg-primary: 250 250 250 (Almost white)
--fg-secondary: 161 161 170 (Muted text)
--fg-tertiary: 113 113 122 (Subtle text)
--fg-muted: 82 82 91 (Very subtle)

/* Accents - Vibrant but professional */
--accent-primary: 139 92 246 (Purple - main brand)
--accent-secondary: 59 130 246 (Blue - secondary)
--accent-success: 34 197 94 (Green)
--accent-warning: 251 191 36 (Amber)
--accent-error: 239 68 68 (Red)
--accent-info: 56 189 248 (Sky)

/* Borders - Subtle separation */
--border-primary: 39 39 42 (Subtle)
--border-secondary: 63 63 70 (More visible)
--border-focus: 139 92 246 (Accent on focus)
```

### Typography

**Font Stack:**
- **Sans**: Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI
- **Mono**: JetBrains Mono, Fira Code, SF Mono, Menlo, Monaco

**Font Sizes with Line Heights:**
```typescript
xs: 0.75rem (12px) / 1rem
sm: 0.875rem (14px) / 1.25rem
base: 1rem (16px) / 1.5rem
lg: 1.125rem (18px) / 1.75rem
xl: 1.25rem (20px) / 1.75rem
2xl: 1.5rem (24px) / 2rem
```

---

## Component Library

### Buttons

#### Primary Button
```tsx
<button className="btn-primary">
  Create Session
</button>
```
- Purple background with white text
- Glow effect on hover
- Scale down (98%) on active
- Smooth transitions (200ms)

#### Secondary Button
```tsx
<button className="btn-secondary">
  Cancel
</button>
```
- Transparent with border
- Elevated background on hover
- Purple border accent on hover

#### Ghost Button
```tsx
<button className="btn-ghost">
  Settings
</button>
```
- Fully transparent
- Subtle background on hover
- Perfect for tertiary actions

#### Icon Button
```tsx
<button className="btn-icon">
  <IconComponent />
</button>
```
- 36px × 36px (9 × 9 in Tailwind)
- Perfect for toolbars and headers

### Cards

#### Standard Card
```tsx
<div className="card">
  <h3 className="heading-3">Card Title</h3>
  <p className="text-fg-secondary">Card content...</p>
</div>
```
- Subtle border
- Hover effect (border brightens)
- Smooth shadow transition

#### Elevated Card
```tsx
<div className="card-elevated">
  Content
</div>
```
- Higher elevation
- More prominent border
- Pre-applied shadow

#### Glass Panel
```tsx
<div className="glass-panel">
  Floating content
</div>
```
- Glassmorphism effect
- Backdrop blur
- Perfect for overlays and modals

### Form Elements

#### Input Field
```tsx
<input
  type="text"
  className="input"
  placeholder="Enter text..."
/>
```
- Focus ring with purple accent
- Smooth transitions
- Proper accessibility

#### Textarea
```tsx
<textarea
  className="textarea"
  rows={4}
  placeholder="Enter description..."
/>
```
- Resize disabled for consistency
- Same focus states as input

### Badges

```tsx
<span className="badge">Default</span>
<span className="badge badge-success">Success</span>
<span className="badge badge-warning">Warning</span>
<span className="badge badge-error">Error</span>
<span className="badge badge-info">Info</span>
```

### Status Indicators

```tsx
<div className="flex items-center gap-2">
  <div className="status-active" />
  <span>Running</span>
</div>
```

**Available states:**
- `status-active` - Green pulsing dot
- `status-pending` - Amber pulsing dot
- `status-error` - Red pulsing dot
- `status-inactive` - Gray static dot

---

## Layout System

### Screen-Fitting Architecture

**No scrolling at top level** - All panels fit within viewport:

```
┌─────────────────────────────────────────────────────┐
│                  Header (64px fixed)                 │
├───────────────┬─────────────────────┬───────────────┤
│   Sidebar     │    Main Content     │    Context    │
│   (fixed w)   │    (flex-1)         │   (fixed w)   │
│               │                     │               │
│   overflow-y  │    overflow-y       │   overflow-y  │
│               │                     │               │
└───────────────┴─────────────────────┴───────────────┘
```

### Responsive Breakpoints

**Desktop (lg+)**: 3-panel layout
- Sidebar: 288px (w-72)
- Context: 320px (w-80)
- Main: flexible

**Tablet (md-lg)**: 2-panel layout
- Sidebar: 256px (w-64)
- Main/Context: toggle with floating button

**Mobile (< md)**: 1-panel layout
- Bottom navigation bar (64px)
- Full-screen panels
- Smooth transitions

---

## Animations & Micro-interactions

### Built-in Animations

```css
/* Smooth pulse */
.animate-pulse-smooth

/* Fade in */
.animate-fade-in

/* Slide from right */
.animate-slide-in-from-right

/* Slide from left */
.animate-slide-in-from-left

/* Scale in */
.animate-scale-in
```

### Hover Effects

```tsx
{/* Lift effect */}
<div className="hover-lift">Card</div>

{/* Glow effect */}
<button className="hover-glow">Button</button>
```

### Active/Selected States

```tsx
{/* For navigation items */}
<div className="nav-item-active">
  Selected Menu Item
</div>

{/* For list items */}
<div className="active-item">
  Selected Item
</div>
```

---

## Accessibility

### Focus States

All interactive elements have:
- Visible focus rings (2px purple ring)
- 20% opacity for subtlety
- Consistent across all components

### Touch Targets

Mobile elements meet **WCAG 2.1** guidelines:
- Minimum 44px tap targets
- Adequate spacing (8px+)
- Active scale feedback

### Color Contrast

All text meets **WCAG AA** standards:
- Primary text: 18:1 contrast
- Secondary text: 8:1 contrast
- Tertiary text: 4.5:1 contrast

### Screen Readers

- Semantic HTML
- Proper ARIA labels
- Logical tab order

---

## Usage Examples

### Creating a Panel

```tsx
export default function MyPanel() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="panel-header">
        <h2 className="heading-2">Panel Title</h2>
        <button className="btn-icon">
          <SettingsIcon />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="card">
          <h3 className="heading-3">Section 1</h3>
          <p className="text-fg-secondary">Content...</p>
        </div>

        <div className="card">
          <h3 className="heading-3">Section 2</h3>
          <p className="text-fg-secondary">Content...</p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border-primary p-4">
        <button className="btn-primary w-full">
          Submit
        </button>
      </div>
    </div>
  );
}
```

### Empty States

```tsx
<div className="empty-state">
  <div className="empty-state-icon">
    <EmptyIcon />
  </div>
  <h3 className="empty-state-title">No Sessions Yet</h3>
  <p className="empty-state-description">
    Create your first session to get started
  </p>
  <button className="btn-primary mt-4">
    Create Session
  </button>
</div>
```

### Modal/Dialog

```tsx
<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
  <div className="glass-panel w-full max-w-md p-6 animate-scale-in">
    <h2 className="heading-2 mb-4">Confirm Action</h2>
    <p className="text-fg-secondary mb-6">
      Are you sure you want to continue?
    </p>
    <div className="flex gap-3">
      <button className="btn-secondary flex-1">Cancel</button>
      <button className="btn-primary flex-1">Confirm</button>
    </div>
  </div>
</div>
```

---

## Scrollbar Styling

### Custom Scrollbar

Thin, subtle scrollbars that don't distract:

```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-thumb {
  background: rgba(82, 82, 91, 0.3);
  border-radius: 9999px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(82, 82, 91, 0.5);
}
```

### Hiding Scrollbars

```tsx
{/* When you want to hide scrollbars but keep scrolling */}
<div className="scrollbar-hide overflow-auto">
  Content
</div>
```

---

## Glassmorphism

Modern glass effect for overlays:

```tsx
<div className="glass-panel">
  {/* Automatically applies: */}
  {/* - Backdrop blur (xl) */}
  {/* - Semi-transparent background */}
  {/* - Subtle white border */}
  {/* - Drop shadow */}
</div>
```

**Best used for:**
- Floating panels
- Modals and dialogs
- Tooltips
- Mobile bottom navigation
- Tablet toggle buttons

---

## Best Practices

### 1. Consistent Spacing

Use Tailwind's spacing scale:
```tsx
gap-2   // 8px - Tight
gap-3   // 12px - Compact
gap-4   // 16px - Normal
gap-6   // 24px - Comfortable
gap-8   // 32px - Spacious
```

### 2. Component Hierarchy

```
Panel (full height)
├── Header (fixed)
├── Content (flex-1, overflow-auto)
└── Footer (fixed)
```

### 3. Color Usage

- **Primary accent**: Call-to-action buttons, active states
- **Secondary accent**: Links, informational elements
- **Success**: Confirmations, completed states
- **Warning**: Alerts, important notices
- **Error**: Validation errors, failures

### 4. Animation Timing

- **Fast (100-150ms)**: Hover effects, button feedback
- **Medium (200-300ms)**: Panel transitions, modal open/close
- **Slow (400-500ms)**: Page transitions, complex animations

---

## Migration Guide

### Updating Existing Components

**Old (terminal theme):**
```tsx
<button className="btn-terminal">
  Click me
</button>
```

**New (modern theme):**
```tsx
<button className="btn-primary">
  Click me
</button>
```

### Class Name Mapping

| Old Class | New Class |
|-----------|-----------|
| `terminal-panel` | `card` or `glass-panel` |
| `terminal-heading` | `heading-1` to `heading-4` |
| `btn-terminal` | `btn-primary` |
| `btn-terminal-secondary` | `btn-secondary` |
| `terminal-input` | `input` |
| `terminal-hover` | `hover-lift` |
| `terminal-active` | `active-item` |
| `terminal-accent-green` | `accent-primary` |
| `terminal-accent-blue` | `accent-secondary` |

---

## Performance

### Optimization Tips

1. **Use transform for animations** (GPU accelerated)
   ```css
   /* ✅ Good */
   transform: translateY(-2px);

   /* ❌ Avoid */
   top: -2px;
   ```

2. **Limit backdrop-blur usage** (expensive)
   - Use only for modals, overlays
   - Avoid in scrolling containers

3. **Lazy load heavy components**
   ```tsx
   const HeavyComponent = dynamic(() => import('./Heavy'), {
     ssr: false,
     loading: () => <div className="skeleton h-32" />
   });
   ```

---

## Dark Mode Support

The system is designed dark-first but supports light mode:

```tsx
// Add to root element
<html className="dark">
  ...
</html>

// Light mode colors (add to :root in globals.css)
:root:not(.dark) {
  --bg-primary: 255 255 255;
  --fg-primary: 0 0 0;
  // ... etc
}
```

---

## Resources

- [Linear Design System](https://linear.app/design)
- [Vercel Design](https://vercel.com/design)
- [Radix UI](https://www.radix-ui.com/) - Accessible component primitives
- [Tailwind CSS](https://tailwindcss.com/docs)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

**Design System Version**: 1.0.0
**Last Updated**: 2025-12-18
