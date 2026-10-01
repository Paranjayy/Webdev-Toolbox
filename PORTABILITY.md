# Universal Portability Guide 🌐

This guide covers how to install the **Webdev Toolbox** on Chrome, Firefox, and Safari using the locally generated builds in the `/releases` directory.

## 🏗️ Generating the Builds
Run the release script to update all browser targets:
```bash
./release.sh
```

---

## 🖥️ Chrome / Brave / Edge (Chromium)
1. Open **Settings > Extensions** (or `chrome://extensions`).
2. Toggle **Developer Mode** (top right).
3. Click **Load Unpacked**.
4. Select the `releases/webdev-toolbox-chrome` folder.

---

## 🦊 Firefox
1. Open **Firefox** and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` file inside `releases/webdev-toolbox-firefox`.
*Note: Temporary add-ons disappear when you restart Firefox.*

---

## 🧭 Safari
Safari extensions require a native macOS app wrapper created via Xcode.

1. **Prerequisites**: Ensure Xcode is installed and initialized (`sudo xcodebuild -runFirstLaunch`).
2. **Build the Project**:
   The `release.sh` script automatically generates the Xcode project in `releases/Webdev Toolbox/`.
3. **Install**:
   - Open `releases/Webdev Toolbox/Webdev Toolbox.xcodeproj` in Xcode.
   - Press **Cmd + R** to build and run the app.
   - Once the app opens, go to **Safari > Settings > Extensions**.
   - Enable **Webdev Toolbox**.
*Note: You may need to enable "Allow Unsigned Extensions" in Safari's Develop menu.*
