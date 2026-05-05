#!/bin/bash

# Webdev Toolbox Release Orchestrator
# Bundles for Chrome, Firefox, and Safari

echo "📦 Starting Multi-Browser Build Pipeline..."

# Clean and Prep
rm -rf releases/
mkdir -p releases/webdev-toolbox-chrome
mkdir -p releases/webdev-toolbox-firefox
mkdir -p releases/webdev-toolbox-safari

FILES=("manifest.json" "background.js" "popup.js" "popup.html" "icon.png" "dashboard.html" "dashboard.js")

copy_files() {
    local target_dir=$1
    for file in "${FILES[@]}"; do
        if [ -f "$file" ]; then
            cp "$file" "$target_dir/"
        else
            echo "⚠️ Warning: $file missing, skipping."
        fi
    done
}

# 1. Chrome Build
echo "🔹 Building CHROME..."
copy_files "releases/webdev-toolbox-chrome"

# 2. Firefox Build
echo "🔹 Building FIREFOX..."
copy_files "releases/webdev-toolbox-firefox"
cd releases/webdev-toolbox-firefox
node ../../converter.js firefox
cd ../..

# 3. Safari Build (Source for xcrun)
echo "🔹 Building SAFARI (Source)..."
copy_files "releases/webdev-toolbox-safari"
cd releases/webdev-toolbox-safari
node ../../converter.js safari
cd ../..

# 4. Generate/Update Xcode Project
echo "🔹 Converting to Safari/Xcode Project..."
xcrun safari-web-extension-converter ./releases/webdev-toolbox-safari --project-location ./releases/ --macos-only --no-open --no-prompt --force

# 5. Build Native App (Optional: requires Xcode)
echo "🔹 Building Native Safari App (Release)..."
rm -rf build_output/
xcodebuild -project "releases/Webdev Toolbox/Webdev Toolbox.xcodeproj" \
           -scheme "Webdev Toolbox" \
           -configuration Release \
           -derivedDataPath ./build_output > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Native Build Successful!"
    echo "🔹 Creating Safari ZIP..."
    zip -r "releases/Webdev-Toolbox-Safari.zip" "build_output/Build/Products/Release/Webdev Toolbox.app" > /dev/null
else
    echo "❌ Native Build Failed. Ensure Xcode is installed."
fi

echo "🏁 Build Complete! Bundles located in /releases"
ls -F releases
