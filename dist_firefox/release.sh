#!/bin/bash
# 🌌 Nexus Release Orchestrator v2.1.0-GOLD
# High-Fidelity Cross-Browser Distribution Engine

set -e

echo "🚀 [NEXUS] Starting Production Release Build..."

# ── PREPARE ──────────────────────────────────────────────────────────
mkdir -p releases
mkdir -p build_output

# ── BROWSER: Firefox ─────────────────────────────────────────────────
echo "📦 [NEXUS] Minting Firefox Core..."
node converter.js ./ firefox
rm -rf releases/webdev-toolbox-firefox
cp -r dist_firefox releases/webdev-toolbox-firefox
echo "✅ Firefox Core Generated."

# ── BROWSER: Safari ──────────────────────────────────────────────────
echo "📦 [NEXUS] Minting Safari Core..."
node converter.js ./ safari
rm -rf releases/webdev-toolbox-safari
cp -r dist_safari releases/webdev-toolbox-safari
echo "✅ Safari Core Linked."

# ── NATIVE: Safari App ───────────────────────────────────────────────
echo "🔨 [NEXUS] Compiling Native Safari App..."
# Build the project using the linked webdev-toolbox-safari folder
xcodebuild -project "releases/Webdev Toolbox/Webdev Toolbox.xcodeproj" \
           -scheme "Webdev Toolbox" \
           -configuration Release \
           -derivedDataPath "build_output" \
           build

# Extract the .app
echo "🚚 [NEXUS] Extracting Native Bundle..."
cp -r "build_output/Build/Products/Release/Webdev Toolbox.app" "releases/Webdev Toolbox.app"
echo "✅ Native Safari App Minted: releases/Webdev Toolbox.app"

# ── BROWSER: Chrome ──────────────────────────────────────────────────
echo "📦 [NEXUS] Minting Chrome Core (Original)..."
rm -rf releases/webdev-toolbox-chrome
mkdir -p releases/webdev-toolbox-chrome
cp -r ./* releases/webdev-toolbox-chrome/
# Clean up build artifacts from chrome bundle
rm -rf releases/webdev-toolbox-chrome/releases
rm -rf releases/webdev-toolbox-chrome/dist_*
rm -rf releases/webdev-toolbox-chrome/build_output
echo "✅ Chrome Core Generated."

# ── DISTRIBUTION: Packaging ──────────────────────────────────────────
echo "📦 [NEXUS] Packaging Distribution Bundles..."
cd releases
zip -r "Webdev-Toolbox-v2.1.0-Safari.zip" "Webdev Toolbox.app" > /dev/null
zip -r "Webdev-Toolbox-v2.1.0-Chrome.zip" "webdev-toolbox-chrome" > /dev/null
zip -r "Webdev-Toolbox-v2.1.0-Firefox.zip" "webdev-toolbox-firefox" > /dev/null
cd ..

echo ""
echo "✨ [VAULT UNLOCKED] Release v2.1.0 Ready."
echo "------------------------------------------"
echo "📍 Safari App:  releases/Webdev Toolbox.app"
echo "📍 Chrome:      releases/webdev-toolbox-chrome"
echo "📍 Firefox:     releases/webdev-toolbox-firefox"
echo "------------------------------------------"
echo "🚀 Drag 'Webdev Toolbox.app' to your Applications folder to finish."
