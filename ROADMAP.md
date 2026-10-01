# Webdev Toolbox Roadmap

## v3.1.0 — Sovereign Extraction Suite (Current)
- [x] DOM cleaner restored with Shadow DOM piercing
- [x] CSS extraction engine (external + inline + variables)
- [x] CSS Ripper tab in popup
- [x] Console log capture from main world
- [x] Network forensics (fetch/XHR/WebSocket)
- [x] Dark theme (GitHub Dark palette)
- [x] Safari temp extension compatibility
- [x] All 32 context menu commands wired
- [x] All popup buttons have handlers

## v3.2.0 — Intelligence & Accessibility
- [ ] **Accessibility X-Ray** — overlay ARIA roles, missing alt text, contrast ratios, tab order visualization
- [ ] **Layout Debugger** — detect flex/grid mismatches, measure spacing rhythm, flag inconsistent gaps
- [ ] **Performance Thermal Map** — overlay elements by render cost (layout thrash, paint regions)
- [ ] **SEO Meta Inspector** — extract Open Graph, Twitter cards, structured data, canonical URLs in one panel
- [ ] **Contrast Ratio Checker** — WCAG AA/AAA compliance overlay for all text elements

## v3.3.0 — Chaos Lab & Fun Tools
- [ ] **Typography Chaos Mode** — randomize font families to test fallback chains
- [ ] **Color Blindness Simulator** — protanopia, deuteranopia, tritanopia filters on the page
- [ ] **Slow Motion Mode** — inject `transition: all 2s` globally to watch animations
- [ ] **Pixel Sort Glitch** — canvas-based pixel sorting effect for screenshots
- [ ] **Retro CRT Filter** — scanlines + chromatic aberration overlay
- [ ] **Neon Glow Mode** — add neon glow to all text and borders

## v3.4.0 — Design Intelligence V2
- [ ] **Live Theme Swap** — capture one site's tokens, apply to another in real-time
- [ ] **Component Blueprint Export** — select element, get React/Vue/Tailwind component with props from attributes
- [ ] **Design System Diff** — compare two sites' token palettes side-by-side
- [ ] **Token Auto-Namer** — AI-powered naming for extracted CSS variables
- [ ] **Responsive Breakpoint Visualizer** — show all media query breakpoints as overlay

## v3.5.0 — Robustness & DX
- [ ] **Content Security Policy Bypass** — ISOLATED world fallbacks for sites with strict CSP
- [ ] **Tab Crash Recovery** — auto-retry failed injections with exponential backoff
- [ ] **Storage Quota Manager** — auto-prune old snapshots near Chrome's 5MB limit
- [ ] **Service Worker Heartbeat** — handle MV3 idle timeout gracefully
- [ ] **Keyboard Shortcuts** — assign hotkeys to most-used tools
- [ ] **Dark/Light Theme Toggle** — let users switch per preference in popup
- [ ] **Snapshot Annotations** — add notes/tags to saved snapshots in the vault
- [ ] **Batch Export** — select multiple snapshots, export as JSON/ZIP bundle

## v4.0.0 — Cross-Browser & Distribution
- [ ] **Safari Xcode Build** — automated `release.sh` with Xcode project
- [ ] **Firefox Manifest Patcher** — auto-generate `browser_specific_settings`
- [ ] **Edge Compatibility** — verify and label Edge-specific features
- [ ] **Chrome Web Store manifest** — separate manifest for store submission
- [ ] **Extension update system** — self-update notifications from GitHub releases

## Experimental / Backlog
- [ ] **AI Slop Auto-Fixer** — link slop detector to LLM that generates CSS fixes
- [ ] **Network-to-UI Bridge** — show which JSON payload rendered which element
- [ ] **State Time-Travel** — undo DOM mutations without page reload
- [ ] **Canvas/WebGL Snapshot** — capture state of 3D/2D canvas elements
- [ ] **Video Replay Buffer** — record last 10 seconds before an error
- [ ] **Floating Nexus Toolbar** — persistent sidebar that works without popup
- [ ] **Visual Diff Mode** — side-by-side DOM diff between two snapshots
- [ ] **Z-Index Layer Map** — 3D visualizer of page stacking context
