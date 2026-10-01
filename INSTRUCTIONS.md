# 🚀 The Vault: Operator Instructions

Welcome to the **Antigravity Dev Vault**. This extension is a God-Tier Swiss Army Knife built for high-fidelity reverse engineering, AI context extraction, and deterministic "vibe coding".

## 🛠 Core Toolkit Usage

### 1. Theme Check (CSS Palette Extractor)
**What it does:** Rips through the current website's stylesheets and extracts all `--` CSS tokens (colors, spacing, typography variables).
**How to use:** 
1. Open the vault on a target website (e.g., a site with a premium design).
2. Go to the **Toolkit** tab.
3. Click **Extract** under Theme Check.
4. The exact CSS variable JSON will be copied to your clipboard, ready to drop into Design Palace or your Tailwind config.

### 2. GigaSnap (Token Optimized)
**What it does:** Grabs the clean, structural DOM and global variables, filtering out noise.
**How to use:** Use this when you want an LLM (like Claude or Gemini) to understand the layout of a page without feeding it 100,000 tokens of junk SVGs and nested divs. Click **Snap** and paste the result into the chat.

### 3. Privacy Shield & Ghost Mode
**What it does:** Prepares your screen for recording or sharing.
**How to use:** 
- **Shield:** Redacts strings found in your Global Redaction List (emails, API keys).
- **Ghost:** Instantly applies a heavy blur and grayscale filter to all images, videos, and avatars on the page.

---

## 🎧 Vibe Coding Determinism (Podcast Protocol)

Inspired by Syntax Episode 998, the Vault ecosystem relies on strict, deterministic tools to prevent AI "slop":

*   **chrome-devtools-mcp**: We use this server to directly control the browser via the DevTools Protocol. This bypasses Chrome Extension limitations (like `ShadowRoot` bugs) to grab pristine computed DOMs.
*   **Knip (`knip.dev`)**: Run this locally to instantly identify dead code, unused exports, and bloated dependencies in your projects.
*   **StyleLint & ESLint**: Enforce strict design tokens. If a color isn't in your extracted Theme JSON, StyleLint will block it.

## 🧪 Experimental Features (The "Fun" Stuff)
*Check the `IDEAS.md` for upcoming high-permission tools like Global MITM Proxies and WebSocket Sniffers.*
