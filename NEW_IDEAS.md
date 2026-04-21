# Experimental & Permission-Required Ideas 🧪

These are features that might be intrusive, require high-level permissions, or change the extension's behavior significantly. **Requires user approval before implementation.**

## 1. Deep Background Automation
- **Auto-Snap on Error**: Automatically trigger a GIGASNAP when a 500 error is detected in the network log.
- **Tab Syncing**: Keep storage state synced across multiple tabs of the same domain automatically.

## 2. Intrusive Reverse Engineering
- **Global MITM Proxy**: Intercept and *modify* network responses before they reach the page.
- **WebSocket Sniffer**: High-performance binary stream interception.
- **Window Variable Hijacking**: Inject custom objects into the global `window` scope for framework-level debugging.

## 3. High-Fidelity Capture
- **Video Replay (Lighthouse style)**: Record a small video buffer of the last 10 seconds before an error.
- **Canvas/WebGL Snapshotting**: Capture the state of 3D/2D canvas elements.

## 4. UI Overhauls
- **Floating Nexus Toolbar**: Move the Dev Vault into a floating sidebar that works on any page without opening the popup.
- **Visual Diff Mode**: Show side-by-side snapshots of the DOM to see what changed between two GIGASNAPs.

---
*Drafted for Antigravity Dev Vault.*
