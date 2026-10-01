# Webdev Toolbox v3.1 — Sovereign Extraction Suite

> **Goal:** Fix the broken DOM cleaner, add a dedicated CSS extraction engine, fuse console/network forensics into snapshots, and redesign the popup/dashboard with the warm-parchment Cursor design system.

---

## Context

The current codebase is a Chrome/Safari/Firefox extension called **Webdev Toolbox** (formerly *The Vault*). It has two main user-facing surfaces:

- `popup.html` / `popup.js` — the main action popup.
- `dashboard.html` / `dashboard.js` — a separate full-page dashboard.
- `background.js` — the service worker that injects scripts and manages storage/network intercept.

The latest `main` branch is broken in these ways:

1. `handleDOMCleaner` in `background.js` was rewritten and now produces shallow, incomplete snapshots.
2. The token extraction scans only `document.documentElement.style` (inline styles), so most CSS variables are missed.
3. Snapshots are not saved to `snap_history`.
4. `dashboard.html` has a duplicate `</style>` tag.
5. The console and network interceptors exist but are not integrated into the snapshot output.

The `/Users/paranjay/Downloads/Antigravity-Dev-Vault` folder contains a functional older version with a better `handleGigaSnap` implementation that we should restore.

---

## Scope

1. **Archive the legacy release** — create git tag `v1.3-stable-archive` from the Downloads version.
2. **Fix DOM cleaner** — restore the robust `handleGigaSnap` algorithm, save snapshots to history, fix token extraction.
3. **Add CSS extraction engine** — collect external stylesheets, inline styles, inline element styles, and computed CSS variables.
4. **Add standalone CSS Ripper tool** — new UI in the popup for one-click CSS extraction.
5. **Fuse console + network forensics** — embed the last 50 console logs and 50 network requests into snapshots.
6. **Cursor design refresh** — apply the warm-parchment palette and typography to `popup.html` and `dashboard.html`.

---

## Architecture

### Modules

| Module | File | Responsibility |
|--------|------|----------------|
| Background orchestrator | `background.js` | Message routing, tab resolution, script injection, storage, network intercept, console/log capture. |
| DOM Cleaner | `background.js` (function) | Deep-clone DOM, strip noise, pierce Shadow DOM, produce token-optimized or raw HTML. |
| CSS Extractor | `background.js` (function) + `css-extractor.js` (new) | Collect all styles from the active page and produce JSON / CSS output. |
| Console/Network buffer | `background.js` | Maintain rolling buffers of last 50 logs and last 50 network requests. |
| Popup UI | `popup.html` / `popup.js` | Main interface, navigation, feature triggers, results rendering. |
| Dashboard UI | `dashboard.html` / `dashboard.js` | Full-page management view with extension list and settings. |
| Styles | `styles/variables.css` (new) | Cursor design tokens shared by popup and dashboard. |

### Data Flow

1. User clicks **Snapshot** in popup.
2. `popup.js` sends `PERFORM_SNAPSHOT` to `background.js` with active tab ID.
3. `background.js` calls `handleDOMCleaner(tabId, raw)` and `handleCSSExtractor(tabId)`.
4. Injected scripts collect DOM, CSS, stack, console logs, and network context.
5. Result is saved to `snap_history` and copied to clipboard.
6. Toast confirms success.

### Error Handling

- All injected scripts wrap in `try/catch` and return `{ success: false, error: message }`.
- `background.js` validates tab IDs through `runWithTab` helper.
- Restricted URLs (`chrome://`, `about:`, etc.) are blocked in the popup before sending messages.
- Network/console buffers are size-capped and never keep more than 100 entries.

### Testing

- Manual: load the extension in Chrome, run snapshot and CSS ripper on a real site, verify clipboard output.
- Syntax: `node --check background.js popup.js dashboard.js` must pass.
- HTML: open `popup.html` and `dashboard.html` in a browser to verify no broken markup.

---

## Design Tokens (Cursor Design System)

Use the warm-parchment palette and typography from the Cursor reference.

### Colors

| Name | Hex | Token | Usage |
|------|-----|-------|-------|
| Parchment | `#f7f7f4` | `--color-parchment` | Page background |
| Bone | `#f2f1ed` | `--color-bone` | Card surfaces |
| Linen | `#e6e5e0` | `--color-linen` | Secondary buttons |
| Stone | `#cdcdc9` | `--color-stone` | Hairline borders |
| Mist | `#a1a19f` | `--color-mist` | Tertiary text |
| Driftwood | `#84847e` | `--color-driftwood` | Secondary text |
| Ash | `#7a7974` | `--color-ash` | Icon/muted labels |
| Ink | `#26251e` | `--color-ink` | Primary text |
| Ember | `#f54e00` | `--color-ember` | Inline accent links |
| Amber | `#c08532` | `--color-amber` | Warm action buttons |
| Forest | `#34785c` | `--color-forest` | Success actions |
| Crimson | `#cf2d56` | `--color-crimson` | Danger actions |

### Typography

- Primary: `CursorGothic, Inter, system-ui, sans-serif`
- Serif: `EB Garamond, Iowan Old Style, ui-serif, Georgia`
- Mono: `berkeleyMono, ui-monospace, SFMono-Regular, Menlo, monospace`

### Shape

- Base radius: `4px` for cards, buttons, inputs, tiles.
- Modal radius: `8px`.
- Hairline borders: `1px solid color-mix(in oklab, var(--color-ink) 5%, transparent)`.
- Soft shadows: `rgba(0,0,0,0.14) 0px 28px 70px, rgba(0,0,0,0.1) 0px 14px 32px`.

---

## Snapshot Report Format

The new snapshot report will be a Markdown document with these sections:

```markdown
# 🧬 Antigravity Snapshot — {title}

**URL:** {url}
**Stack:** {stack}
**Timestamp:** {timestamp}

## 🎨 Design Tokens
```json
{tokens}
```

## 🎨 CSS Extraction
- External stylesheets: {count}
- Inline styles: {count}
- CSS variables: {count}

```json
{cssSummary}
```

## 📡 Network Forensics
| Method | Status | Type | URL |
|--------|--------|------|-----|
...

## 🖥️ Console Logs
| Level | Message |
|-------|---------|
...

## 🏗 DOM Architecture
```html
{cleanHtml}
```

## 🗺 Component Hierarchy
```mermaid
{mermaidDiagram}
```
```

---

## CSS Ripper UI

Add a new tab in the popup called **CSS Rip**.

- Button: **Extract CSS** — runs the CSS extractor on the active tab.
- Output: textarea showing the bundled CSS.
- Buttons: **Copy JSON**, **Copy CSS**, **Download .css**.
- Stats: external stylesheet count, inline style count, variable count.

---

## Console/Network Fusion

- Maintain `vaultConsoleBuffer` and `vaultTrafficBuffer` in `background.js`.
- Inject a content script that listens to `window.console` methods and dispatches `VAULT_CONSOLE_LOG` events.
- Interceptor already captures fetch/XHR; extend it to capture WebSocket messages.
- Snapshot includes the last 50 entries from each buffer.

---

## Rollout

1. Archive old version.
2. Restore/fix DOM cleaner and history.
3. Add CSS extraction engine.
4. Add CSS Ripper UI.
5. Wire console/network buffers into snapshot.
6. Apply Cursor design tokens to popup and dashboard.
7. Manual test + tag `v3.1.0-sovereign`.
