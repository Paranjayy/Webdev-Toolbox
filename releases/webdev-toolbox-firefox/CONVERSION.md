# Webdev Toolbox Cross-Browser Conversion Guide 🚀

The Webdev Toolbox is built using standard Manifest V3 APIs, making it highly compatible with modern browsers.

## 🦊 Firefox (Gecko)
Firefox supports Manifest V3 with some minor differences.

### Steps to Install:
1.  Open **Firefox**.
2.  Type `about:debugging` in the address bar.
3.  Click **"This Firefox"** on the left.
4.  Click **"Load Temporary Add-on..."**.
5.  Select the `manifest.json` from this project directory.

### Compatibility Notes:
- The `manifest.json` already includes the `browser_specific_settings` block required for Firefox MV3.
- Firefox uses the `browser` namespace by default, but it provides a polyfill for the `chrome` namespace, so the current code should work without changes.

---

## 🧭 Safari (WebKit)
Safari requires a conversion process using Xcode tools.

### Steps to Convert & Install:
1.  Open **Terminal** on your Mac.
2.  Run the following command in the project root:
    ```bash
    xcrun safari-web-extension-converter .
    ```
3.  This will create a new Xcode project.
4.  Open the `.xcodeproj` file in **Xcode**.
5.  Press **Cmd+R** to build and run the extension.
6.  Open **Safari** → **Settings** → **Extensions**.
7.  Enable **"Allow Unsigned Extensions"** in the Develop menu (if you don't have a developer account).
8.  Check the box next to **Webdev Toolbox**.

---

## 🧭 Edge / Brave / Opera
These browsers are Chromium-based and use the exact same process as Chrome.

### Steps to Install:
1.  Open the browser's extension page (e.g., `edge://extensions`).
2.  Enable **Developer Mode**.
3.  Click **"Load unpacked"** and select this directory.

---

## 🛠 Maintenance Tip
For 100% seamless cross-browser support, consider using the [WebExtension Polyfill](https://github.com/mozilla/webextension-polyfill) to normalize the `chrome` and `browser` namespaces if you encounter API issues in older versions of Firefox or Safari.
