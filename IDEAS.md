# Future Ideas & Saturated Status 🧪

This file tracks "The Vault" - features that require deeper permissions or higher complexity.

## 🔴 Saturated Status: 75%
The extension is currently a "God-Tier" Swiss Army Knife. Adding too much more to the UI might lead to clutter. Next phase should focus on **Background Autonomy**.

## 🚀 High-Impact Ideas (Permission Required)

### 1. Global Intercept Proxy (MITM)
- Move beyond console logging and allow **rewriting** of Fetch/XHR responses in the background.
- UI to "Force Success" on 500 errors or "Mock Data" for specific endpoints.

### 2. The Recorder (Macro Mode)
- Record a series of clicks and typing.
- Export as a Playwright/Puppeteer script instantly.
- *Status: High complexity.*

### 3. I18n Ghost Writer
- Scan the page for all text nodes.
- Use a local/API model to translate the UI on the fly without refreshing.

### 4. DOM Mutation "Pulse"
- Add a visual heat-map to the page showing which elements are changing the most (good for spotting live score updates or hidden background polling).

### 5. WebSocket Sniffer
- Hook into the `WebSocket` constructor to monitor live binary/JSON stream data (essential for betting sites/crypto dashboards).

---
*Drafted for Antigravity Dev Vault.*
