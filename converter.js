const fs = require('fs');
const path = require('path');

const target = process.argv[2]; // chrome, firefox, or safari
const manifestPath = path.join(process.cwd(), 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log(`🚀 Converting manifest for: ${target.toUpperCase()}`);

if (target === 'firefox') {
    // Firefox MV3 uses background.scripts instead of background.service_worker
    const sw = manifest.background.service_worker;
    delete manifest.background.service_worker;
    manifest.background.scripts = [sw];
}

if (target === 'safari') {
    // Safari is picky about some MV3 features, ensuring clean baseline
    // (Optional: add Safari-specific keys if needed)
}

// Ensure browser_specific_settings exists for non-chrome targets
if (target !== 'chrome' && !manifest.browser_specific_settings) {
    manifest.browser_specific_settings = {
        gecko: { id: "webdev-toolbox@paranjay.dev" }
    };
}

fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
console.log(`✅ ${target.toUpperCase()} manifest ready.`);
