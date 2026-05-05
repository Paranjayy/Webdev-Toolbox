#!/bin/bash
# Nexus Release Orchestrator
# Builds Chrome, Firefox, and Safari versions of the Webdev Toolbox.

echo "🚀 Starting Nexus Release Build..."

# Ensure dist exists
mkdir -p releases

# Build Firefox
echo "📦 Building Firefox version..."
node converter.js ./ firefox
cp -r dist_firefox releases/webdev-toolbox-firefox

# Build Safari
echo "📦 Building Safari version..."
node converter.js ./ safari
cp -r dist_safari releases/webdev-toolbox-safari

# Build Chrome (Original)
echo "📦 Building Chrome version..."
mkdir -p releases/webdev-toolbox-chrome
cp -r ./* releases/webdev-toolbox-chrome/
rm -rf releases/webdev-toolbox-chrome/releases
rm -rf releases/webdev-toolbox-chrome/dist_*

echo "✅ All releases generated in /releases directory."
echo "   - releases/webdev-toolbox-chrome"
echo "   - releases/webdev-toolbox-firefox"
echo "   - releases/webdev-toolbox-safari"
