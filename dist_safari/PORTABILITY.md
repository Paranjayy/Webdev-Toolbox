# 🌐 Universal Portability: Multi-Browser Installation

The Webdev Toolbox is a "God Build" utility designed to function seamlessly across **Chrome, Brave, Firefox, and Safari**. This guide explains how to install and sync the extension across your ecosystem.

---

## ⚡ Quick Start: Building Releases
Run the master release script to generate browser-optimized bundles in the `releases/` directory:
```bash
chmod +x release.sh
./release.sh
```

---

## 🦊 Firefox Installation
Firefox uses the Gecko engine and requires minor manifest adjustments, which are handled automatically by our build script.

1.  Open **Firefox**.
2.  Go to `about:debugging#/runtime/this-firefox`.
3.  Click **"Load Temporary Add-on..."**.
4.  Select `manifest.json` from `releases/webdev-toolbox-firefox/`.
5.  **Pro Tip**: The extension stays active until you quit Firefox. To persist across restarts, you must sign it via [AMO](https://addons.mozilla.org/).

---

## 🧭 Safari Installation (The macOS Way)
Safari does not support "unpacked" folders like Chrome. It requires a native macOS app container. We use Apple's built-in converter to bridge this gap.

### The "Easy" Workflow:
1.  **Run the Converter**:
    ```bash
    xcrun safari-web-extension-converter ./releases/webdev-toolbox-safari
    ```
2.  **Build & Run**:
    *   Xcode will open automatically.
    *   Click the **Play (Run)** button at the top left.
    *   This registers the extension with the macOS system.
3.  **Enable in Safari**:
    *   Open Safari and go to **Settings > Advanced**.
    *   Check **"Show Develop menu in menu bar"**.
    *   In the **Develop** menu, check **"Allow Unsigned Extensions"**.
    *   Go to **Settings > Extensions** and enable **Webdev Toolbox**.

---

## 🛡️ Portability Intelligence
Our build system (`converter.js`) implements the following logic to ensure cross-browser stability:

- **Namespace Bridging**: Injects a `browser` polyfill to reconcile the difference between `chrome.*` (Chromium) and `browser.*` (Firefox/Safari) APIs.
- **Manifest Shimming**: Automatically adjusts `background` scripts and `browser_specific_settings` for Gecko compatibility.
- **Visual DNA Integrity**: Ensures that high-fidelity screenshot and palette extraction works consistently across rendering engines.

---

## 🛠️ Developer Commands
- `./release.sh`: Rebuilds all bundles.
- `node converter.js <dir> <browser>`: Manually convert any extension.

---
*Built for the God Build ecosystem by Antigravity.*
