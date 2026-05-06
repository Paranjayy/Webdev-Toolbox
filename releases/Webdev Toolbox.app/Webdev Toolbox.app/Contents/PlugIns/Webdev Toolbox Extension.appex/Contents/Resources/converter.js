/**
 * NEXUS CONVERTER v1.0
 * Converts Chrome Manifest V3 extensions to Firefox/Safari compatible formats.
 */

const fs = require('fs');
const path = require('path');

async function convertExtension(sourceDir, targetBrowser) {
    const manifestPath = path.join(sourceDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.error("Error: manifest.json not found in source directory.");
        return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const distDir = path.join(sourceDir, `dist_${targetBrowser}`);

    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);

    // 1. Adjust Manifest
    if (targetBrowser === 'firefox') {
        manifest.browser_specific_settings = {
            gecko: {
                id: `${manifest.name.toLowerCase().replace(/\s+/g, '-')}-nexus@vault.dev`
            }
        };
        // Firefox uses 'background.scripts' array for MV3 in some versions, 
        // but service_worker is supported in newer ones.
        // We'll keep service_worker but ensure it's handled.
    }

    if (targetBrowser === 'safari') {
        // Safari is mostly same as Chrome for MV3
    }

    // Write adjusted manifest
    fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    function copyRecursive(src, dest) {
        const stats = fs.lstatSync(src);
        const isDirectory = stats.isDirectory();
        
        if (isDirectory) {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest);
            fs.readdirSync(src).forEach(childItemName => {
                copyRecursive(path.join(src, childItemName), path.join(dest, childItemName));
            });
        } else {
            // Inject polyfill during copy if it's JS
            if (src.endsWith('.js') && !src.includes('node_modules')) {
                let content = fs.readFileSync(src, 'utf8');
                const polyfill = `const browser = typeof chrome !== "undefined" ? chrome : window.browser;\n`;
                if (!content.includes('const browser =')) {
                    content = polyfill + content;
                }
                fs.writeFileSync(dest, content);
            } else {
                fs.copyFileSync(src, dest);
            }
        }
    }

    const files = fs.readdirSync(sourceDir);
    const ignoreList = ['manifest.json', 'node_modules', 'dist_firefox', 'dist_safari', 'build_output', 'releases', '.git', '.gemini'];
    
    for (const file of files) {
        if (ignoreList.includes(file) || file.startsWith('.')) continue;
        const src = path.join(sourceDir, file);
        const dest = path.join(distDir, file);
        copyRecursive(src, dest);
    }

    console.log(`Successfully converted to ${targetBrowser}! Output: ${distDir}`);
}

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log("Usage: node converter.js <source_dir> <target_browser (firefox|safari)>");
} else {
    convertExtension(args[0], args[1]);
}
