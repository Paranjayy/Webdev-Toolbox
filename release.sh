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

echo "🏁 Build Complete! Bundles located in /releases"
ls -R releases
