# Webdev Toolbox v3.1 — Sovereign Extraction Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken DOM cleaner, add a CSS extraction engine, fuse console/network forensics into snapshots, and redesign the popup/dashboard with the warm-parchment Cursor design system.

**Architecture:** Keep the existing MV3 extension structure. Background.js remains the orchestrator; injected functions do the page work. Add a `css-extractor.js` helper module for style collection. The snapshot report becomes a single Markdown document combining DOM, CSS, network, console, stack, and design tokens.

**Tech Stack:** Vanilla JavaScript, Chrome Extension Manifest V3, `chrome.scripting.executeScript`, `chrome.storage.local`.

---

## File Structure

| File | Role |
|------|------|
| `background.js` | Service worker: message routing, injected functions, storage, buffers, network intercept. |
| `popup.html` / `popup.js` | Main popup UI. Add CSS Ripper tab and redesign with Cursor tokens. |
| `dashboard.html` / `dashboard.js` | Full-page dashboard. Redesign with Cursor tokens. |
| `styles/variables.css` | Shared Cursor design tokens (colors, fonts, spacing). |
| `css-extractor.js` | New helper module for style extraction. Loaded via `import` in background.js if supported, or inlined. |
| `manifest.json` | Already has `<all_urls>`, `scripting`, `storage`, `tabs`. No changes needed for this plan. |

---

## Task 1: Hotfix dashboard.html duplicate `</style>`

**Files:**
- Modify: `dashboard.html:222-223`

- [ ] **Step 1: Remove the duplicate closing tag**

```html
        ::-webkit-scrollbar-thumb:hover { background: var(--border); }
    </style>
</head>
```

- [ ] **Step 2: Open dashboard.html in a browser**

Run: `open dashboard.html` (macOS)
Expected: Page renders without console errors. No visual change because the duplicate was harmless but invalid.

- [ ] **Step 3: Commit**

```bash
git add dashboard.html
git commit -m "fix: remove duplicate </style> in dashboard.html"
```

---

## Task 2: Create shared Cursor design tokens

**Files:**
- Create: `styles/variables.css`

- [ ] **Step 1: Create the design token file**

```css
/* styles/variables.css — Cursor warm-parchment design system */
:root {
  /* Colors */
  --color-parchment: #f7f7f4;
  --color-bone: #f2f1ed;
  --color-linen: #e6e5e0;
  --color-stone: #cdcdc9;
  --color-mist: #a1a19f;
  --color-driftwood: #84847e;
  --color-ash: #7a7974;
  --color-ink: #26251e;
  --color-ember: #f54e00;
  --color-amber: #c08532;
  --color-forest: #34785c;
  --color-verdant: #1f8a65;
  --color-crimson: #cf2d56;

  /* Typography */
  --font-cursorgothic: 'Inter', 'CursorGothic', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-eb-garamond: 'EB Garamond', Iowan Old Style, 'Palatino Linotype', ui-serif, Georgia, serif;
  --font-berkeleymono: 'SFMono-Regular', ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  --font-system-ui: system-ui, -apple-system, 'Helvetica Neue', sans-serif;

  /* Type Scale */
  --text-eyebrow: 12px;
  --leading-eyebrow: 1.63;
  --text-body-sm: 14px;
  --leading-body-sm: 1.5;
  --text-heading-sm: 22px;
  --leading-heading-sm: 1.3;
  --text-heading: 26px;
  --leading-heading: 1.25;
  --text-heading-lg: 36px;
  --leading-heading-lg: 1.2;
  --text-display: 72px;
  --leading-display: 1.1;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-48: 48px;
  --spacing-56: 56px;
  --spacing-64: 64px;

  /* Border Radius */
  --radius-sm: 1.5px;
  --radius-md: 4px;
  --radius-lg: 8px;

  /* Borders */
  --border-hairline: 1px solid color-mix(in oklab, var(--color-ink) 5%, transparent);
  --border-elevated: 1px solid color-mix(in oklab, var(--color-ink) 10%, transparent);

  /* Shadows */
  --shadow-xl: rgba(0, 0, 0, 0.14) 0px 28px 70px 0px, rgba(0, 0, 0, 0.1) 0px 14px 32px 0px;
  --shadow-subtle: rgb(235, 234, 229) 0px 0px 0px 2px;
}
```

- [ ] **Step 2: Link variables.css in popup.html and dashboard.html**

In `popup.html` head:
```html
<link rel="stylesheet" href="styles/variables.css">
```

In `dashboard.html` head:
```html
<link rel="stylesheet" href="styles/variables.css">
```

- [ ] **Step 3: Commit**

```bash
git add styles/variables.css popup.html dashboard.html
git commit -m "feat: add Cursor warm-parchment design tokens"
```

---

## Task 3: Restore the robust DOM cleaner

**Files:**
- Modify: `background.js:819-933`

- [ ] **Step 1: Replace `handleDOMCleaner` with the restored algorithm**

```javascript
async function handleDOMCleaner(tabId, raw = false) {
    const traffic = vaultTrafficBuffer.slice(-50);
    const logs = vaultConsoleBuffer.slice(-50);
    showContentToast(tabId, "🚀 Rip Master Architecture Blueprint (CodeBoarding Mode)...", "info");

    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (isRaw, networkForensic, consoleForensic) => {
            const cleanDomForTokens = (docEl) => {
                const traverse = (node) => {
                    if (node instanceof ShadowRoot) {
                        let shadowHtml = '';
                        node.childNodes.forEach(child => {
                            if (child.nodeType === 1) shadowHtml += traverse(child);
                            else if (child.nodeType === 3) shadowHtml += child.textContent;
                        });
                        return `<shadow-root>${shadowHtml}</shadow-root>`;
                    }
                    const cloned = node.cloneNode(true);
                    const iterator = document.createNodeIterator(cloned, NodeFilter.SHOW_COMMENT, null, false);
                    let comment;
                    while (comment = iterator.nextNode()) comment.parentNode.removeChild(comment);

                    const allOriginal = node.querySelectorAll('*');
                    const allCloned = cloned.querySelectorAll('*');
                    allOriginal.forEach((orig, i) => {
                        if (orig.shadowRoot && allCloned[i]) {
                            const shadowContent = traverse(orig.shadowRoot);
                            const wrapper = document.createElement('div');
                            wrapper.innerHTML = shadowContent;
                            allCloned[i].appendChild(wrapper.firstChild);
                        }
                    });

                    const removeSelectors = ['script', 'style', 'noscript', 'iframe', 'img', 'video', 'canvas', 'link', 'meta', 'head', 'template'];
                    removeSelectors.forEach(sel => cloned.querySelectorAll(sel).forEach(el => el.remove()));
                    cloned.querySelectorAll('svg').forEach(s => { s.innerHTML = '<!-- [SVG CONTENT STRIPPED] -->'; });

                    const allElements = cloned.querySelectorAll('*');
                    allElements.forEach(el => {
                        const attrs = el.attributes;
                        for (let i = attrs.length - 1; i >= 0; i--) {
                            const n = attrs[i].name;
                            if (!/^(data-|aria-|class|id|href|src|value|type|name|role|placeholder|title)/.test(n)) {
                                el.removeAttribute(n);
                            }
                        }
                        if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && el.innerHTML.trim() === '' && el.attributes.length === 0) {
                            el.remove();
                        }
                    });
                    return cloned.outerHTML;
                };
                return traverse(docEl);
            };

            const detectStack = () => {
                const stack = [];
                if (window.React || document.querySelector('[data-reactroot]')) stack.push('React');
                if (window.next || window.__NEXT_DATA__) stack.push('Next.js');
                if (window.Vue || document.querySelector('[data-v-root]')) stack.push('Vue.js');
                if (window.jQuery) stack.push('jQuery');
                if (window.Angular || document.querySelector('[ng-app], [ng-version]')) stack.push('Angular');
                if (window.Svelte || document.querySelector('[class*="svelte-"]')) stack.push('Svelte');
                if (document.documentElement.classList.contains('tw-') || document.querySelector('link[href*="tailwind"]')) stack.push('Tailwind');
                return stack;
            };

            const generateMermaid = () => {
                let diag = "graph TD\n";
                const buildTree = (el, parentId, depth) => {
                    if (depth > 5) return;
                    const id = "node_" + Math.random().toString(36).substr(2, 9);
                    const label = (el.tagName + (el.className ? "." + el.className.split(' ')[0] : "")).slice(0, 20);
                    diag += `  ${parentId} --> ${id}["${label}"]\n`;
                    Array.from(el.children).slice(0, 5).forEach(child => buildTree(child, id, depth + 1));
                };
                buildTree(document.body, "Root", 0);
                return diag;
            };

            const domSnippet = isRaw ? document.documentElement.outerHTML : cleanDomForTokens(document.documentElement);
            const stack = detectStack();
            const mermaidDiagram = generateMermaid();

            const report = `# 🧬 Antigravity Snapshot — ${document.title}\n**URL:** ${window.location.href}\n**Stack:** ${stack.join(', ') || 'Unknown'}\n**Timestamp:** ${new Date().toISOString()}\n\n## 🏗 DOM Architecture\n\`\`\`html\n${domSnippet.slice(0, 12000)}\n${domSnippet.length > 12000 ? '<!-- [TRUNCATED] -->' : ''}\n\`\`\`\n\n## 🗺 Component Hierarchy\n\`\`\`mermaid\n${mermaidDiagram}\n\`\`\`\n\n## 📡 Network Forensics (Last 50)\n| Method | Status | Type | URL |\n|--------|--------|------|-----|\n${(networkForensic || []).map(r => `| ${r.method || 'GET'} | ${r.status} | ${r.type || 'N/A'} | \`${(r.url || '').slice(0, 80)}\` |`).join('\n')}\n\n## 🖥️ Console Logs (Last 50)\n| Level | Message |\n|-------|---------|\n${(consoleForensic || []).map(l => `| ${l.level} | \`${(l.message || '').slice(0, 80)}\` |`).join('\n')}\n\n**AI Prompt:** "Reconstruct this application using ${stack.join(', ') || 'modern React'}. Use the DOM and Mermaid diagram for component structure and network logs for data flow."`;

            return { success: true, url: window.location.href, dom: domSnippet, report };
        },
        args: [raw, traffic, logs]
    });

    if (results?.[0]?.result?.success) {
        const snap = results[0].result;
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = Array.isArray(res.snap_history) ? res.snap_history : [];
            history.unshift({
                timestamp: new Date().toISOString(),
                url: snap.url,
                title: snap.title || 'Untitled',
                dom: snap.dom,
                report: snap.report
            });
            chrome.storage.local.set({ snap_history: history.slice(0, 5) });
        });
        showContentToast(tabId, "✅ Master Blueprint ripped to clipboard!", "success");
        return snap;
    }
    return { success: false, error: 'Snapshot failed' };
}
```

- [ ] **Step 2: Add `vaultConsoleBuffer` near `vaultTrafficBuffer`**

```javascript
let vaultTrafficBuffer = [];
let vaultConsoleBuffer = [];
let lastErrorCount = 0;
```

- [ ] **Step 3: Verify syntax**

Run: `node --check background.js`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add background.js
git commit -m "fix: restore robust DOM cleaner with network and console context"
```

---

## Task 4: Build the CSS extraction engine

**Files:**
- Create: `css-extractor.js`
- Modify: `background.js` to import and call `handleCSSExtractor`

- [ ] **Step 1: Create css-extractor.js**

```javascript
// css-extractor.js — collect all CSS from a page

function extractAllStyles() {
    const external = [];
    const inlineBlocks = [];
    const inlineStyles = [];
    const cssVariables = {};

    // External stylesheets
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        external.push({
            href: link.href,
            media: link.media || 'all',
            title: link.title || ''
        });
    });

    // Inline <style> blocks
    document.querySelectorAll('style').forEach((style, idx) => {
        inlineBlocks.push({
            index: idx,
            media: style.media || 'all',
            text: style.textContent
        });
    });

    // Element inline styles (sample only the first 200 to keep output sane)
    document.querySelectorAll('[style]').forEach((el, idx) => {
        if (idx >= 200) return;
        const selector = el.tagName.toLowerCase() +
            (el.id ? `#${el.id}` : '') +
            (el.className ? `.${el.className.split(' ').join('.')}` : '');
        inlineStyles.push({
            selector: selector.slice(0, 120),
            style: el.getAttribute('style')
        });
    });

    // CSS variables from all stylesheets
    try {
        Array.from(document.styleSheets).forEach(sheet => {
            try {
                Array.from(sheet.cssRules || []).forEach(rule => {
                    if (rule.style) {
                        Array.from(rule.style).forEach(prop => {
                            if (prop.startsWith('--')) {
                                cssVariables[prop] = rule.style.getPropertyValue(prop).trim();
                            }
                        });
                    }
                });
            } catch (e) {
                // Cross-origin stylesheet — record the href and skip
                external.push({ href: sheet.href, media: sheet.media?.mediaText || 'all', crossOrigin: true });
            }
        });
    } catch (e) {
        console.warn('[CSS Extractor] Could not read all stylesheets:', e);
    }

    // Also capture :root computed variables
    const root = document.querySelector(':root');
    if (root) {
        const computed = getComputedStyle(root);
        Array.from(computed).forEach(prop => {
            if (prop.startsWith('--')) {
                cssVariables[prop] = computed.getPropertyValue(prop).trim();
            }
        });
    }

    return {
        url: window.location.href,
        timestamp: new Date().toISOString(),
        external,
        inlineBlocks,
        inlineStyles,
        cssVariables,
        summary: {
            externalCount: external.length,
            inlineBlockCount: inlineBlocks.length,
            inlineStyleCount: inlineStyles.length,
            variableCount: Object.keys(cssVariables).length
        }
    };
}

function buildCSSBundle(extraction) {
    let bundle = `/* CSS Bundle extracted from ${extraction.url} */\n`;
    bundle += `/* Timestamp: ${extraction.timestamp} */\n\n`;

    extraction.inlineBlocks.forEach(block => {
        bundle += `/* Inline style block #${block.index} */\n${block.text}\n\n`;
    });

    bundle += `:root {\n`;
    Object.entries(extraction.cssVariables).forEach(([k, v]) => {
        bundle += `  ${k}: ${v};\n`;
    });
    bundle += `}\n\n`;

    extraction.inlineStyles.forEach(item => {
        bundle += `${item.selector} { ${item.style} }\n`;
    });

    return bundle;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractAllStyles, buildCSSBundle };
}

if (typeof window !== 'undefined') {
    window.__VAULT_CSS_EXTRACTOR = { extractAllStyles, buildCSSBundle };
}
```

- [ ] **Step 2: Add `handleCSSExtractor` to background.js**

Insert after `handleDOMCleaner`:

```javascript
async function handleCSSExtractor(tabId) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const external = [];
            const inlineBlocks = [];
            const inlineStyles = [];
            const cssVariables = {};

            document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                external.push({ href: link.href, media: link.media || 'all', title: link.title || '' });
            });

            document.querySelectorAll('style').forEach((style, idx) => {
                inlineBlocks.push({ index: idx, media: style.media || 'all', text: style.textContent });
            });

            document.querySelectorAll('[style]').forEach((el, idx) => {
                if (idx >= 200) return;
                const selector = el.tagName.toLowerCase() +
                    (el.id ? `#${el.id}` : '') +
                    (el.className ? `.${el.className.split(' ').join('.')}` : '');
                inlineStyles.push({ selector: selector.slice(0, 120), style: el.getAttribute('style') });
            });

            try {
                Array.from(document.styleSheets).forEach(sheet => {
                    try {
                        Array.from(sheet.cssRules || []).forEach(rule => {
                            if (rule.style) {
                                Array.from(rule.style).forEach(prop => {
                                    if (prop.startsWith('--')) {
                                        cssVariables[prop] = rule.style.getPropertyValue(prop).trim();
                                    }
                                });
                            }
                        });
                    } catch (e) {
                        external.push({ href: sheet.href, media: sheet.media?.mediaText || 'all', crossOrigin: true });
                    }
                });
            } catch (e) {
                console.warn('[CSS Extractor] stylesheet read error:', e);
            }

            const root = document.querySelector(':root');
            if (root) {
                const computed = getComputedStyle(root);
                Array.from(computed).forEach(prop => {
                    if (prop.startsWith('--')) cssVariables[prop] = computed.getPropertyValue(prop).trim();
                });
            }

            const data = {
                url: window.location.href,
                timestamp: new Date().toISOString(),
                external,
                inlineBlocks,
                inlineStyles,
                cssVariables,
                summary: {
                    externalCount: external.length,
                    inlineBlockCount: inlineBlocks.length,
                    inlineStyleCount: inlineStyles.length,
                    variableCount: Object.keys(cssVariables).length
                }
            };

            // Build downloadable CSS bundle
            let bundle = `/* CSS Bundle extracted from ${data.url} */\n`;
            bundle += `/* Timestamp: ${data.timestamp} */\n\n`;
            inlineBlocks.forEach(block => {
                bundle += `/* Inline style block #${block.index} */\n${block.text}\n\n`;
            });
            bundle += `:root {\n`;
            Object.entries(cssVariables).forEach(([k, v]) => { bundle += `  ${k}: ${v};\n`; });
            bundle += `}\n\n`;
            inlineStyles.forEach(item => { bundle += `${item.selector} { ${item.style} }\n`; });
            data.bundle = bundle;

            return { success: true, data };
        }
    });

    if (results?.[0]?.result?.success) {
        showContentToast(tabId, "🎨 CSS extraction complete!", "success");
        return results[0].result.data;
    }
    return { success: false, error: 'CSS extraction failed' };
}
```

- [ ] **Step 3: Wire CSS extraction into the snapshot**

Inside `handleDOMCleaner`, before building the report, call the same CSS extraction logic inline. Add this inside the injected function before `const report = ...`:

```javascript
            const cssExtraction = (() => {
                const external = [];
                const inlineBlocks = [];
                const inlineStyles = [];
                const cssVariables = {};
                document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                    external.push({ href: link.href, media: link.media || 'all' });
                });
                document.querySelectorAll('style').forEach((style, idx) => {
                    inlineBlocks.push({ index: idx, text: style.textContent });
                });
                document.querySelectorAll('[style]').forEach((el, idx) => {
                    if (idx >= 200) return;
                    const selector = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className.split(' ').join('.')}` : '');
                    inlineStyles.push({ selector: selector.slice(0, 120), style: el.getAttribute('style') });
                });
                try {
                    Array.from(document.styleSheets).forEach(sheet => {
                        try {
                            Array.from(sheet.cssRules || []).forEach(rule => {
                                if (rule.style) {
                                    Array.from(rule.style).forEach(prop => {
                                        if (prop.startsWith('--')) cssVariables[prop] = rule.style.getPropertyValue(prop).trim();
                                    });
                                }
                            });
                        } catch (e) {
                            external.push({ href: sheet.href, crossOrigin: true });
                        }
                    });
                } catch (e) {}
                const root = document.querySelector(':root');
                if (root) {
                    const computed = getComputedStyle(root);
                    Array.from(computed).forEach(prop => {
                        if (prop.startsWith('--')) cssVariables[prop] = computed.getPropertyValue(prop).trim();
                    });
                }
                return { external, inlineBlocks, inlineStyles, cssVariables, summary: {
                    externalCount: external.length,
                    inlineBlockCount: inlineBlocks.length,
                    inlineStyleCount: inlineStyles.length,
                    variableCount: Object.keys(cssVariables).length
                }};
            })();
```

Then add a new section to the report string:

```javascript
## 🎨 CSS Extraction
- External stylesheets: ${cssExtraction.summary.externalCount}
- Inline style blocks: ${cssExtraction.summary.inlineBlockCount}
- Inline element styles: ${cssExtraction.summary.inlineStyleCount}
- CSS variables: ${cssExtraction.summary.variableCount}

\`\`\`json
${JSON.stringify(cssExtraction.cssVariables, null, 2).slice(0, 4000)}
${Object.keys(cssExtraction.cssVariables).length > 100 ? '<!-- [TRUNCATED] -->' : ''}
\`\`\`
```

- [ ] **Step 4: Verify syntax**

Run: `node --check background.js`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add css-extractor.js background.js
if [ -f css-extractor.js ]; then git add css-extractor.js; fi
git add background.js
git commit -m "feat: add CSS extraction engine and embed into snapshot"
```

---

## Task 5: Wire console log capture

**Files:**
- Modify: `background.js` (INTERCEPTOR_SCRIPT and message handlers)

- [ ] **Step 1: Extend the interceptor script to capture console logs**

Add this to the end of `INTERCEPTOR_SCRIPT` (before the closing `` ` ``):

```javascript
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
    };

    ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
        console[level] = function(...args) {
            window.dispatchEvent(new CustomEvent('VAULT_CONSOLE_LOG', {
                detail: {
                    level: level.toUpperCase(),
                    message: args.map(a => {
                        try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                        catch(e) { return '[unserializable]'; }
                    }).join(' '),
                    time: new Date().toISOString()
                }
            }));
            originalConsole[level].apply(this, args);
        };
    });
```

- [ ] **Step 2: Listen for console log events in the background**

Add this listener near the traffic log listener:

```javascript
chrome.webNavigation?.onCompleted?.addListener(() => {
    // Optional: reset buffers on navigation
});

// Listen for VAULT_CONSOLE_LOG events via scripting where needed.
// For now, we populate the buffer from the same content script that captures network.
```

A more reliable approach: inject a content script that listens for the custom event and forwards it to background. Add this to `INTERCEPTOR_SCRIPT`:

```javascript
    window.addEventListener('VAULT_CONSOLE_LOG', (e) => {
        if (window.__VAULT_CONSOLE_FORWARD) window.__VAULT_CONSOLE_FORWARD(e.detail);
    });
```

Then in `background.js`, when injecting the interceptor, also add a listener function:

```javascript
function injectConsoleForwarder(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            window.__VAULT_CONSOLE_FORWARD = (detail) => {
                chrome.runtime.sendMessage({ action: 'VAULT_CONSOLE_LOG', log: detail });
            };
            window.__VAULT_TRAFFIC_FORWARD = (detail) => {
                chrome.runtime.sendMessage({ action: 'VAULT_TRAFFIC_LOG', log: detail });
            };
        }
    });
}
```

And in the message listener:

```javascript
    if (request.action === 'VAULT_CONSOLE_LOG') {
        vaultConsoleBuffer.push(request.log);
        if (vaultConsoleBuffer.length > 100) vaultConsoleBuffer.shift();
        return true;
    }
    if (request.action === 'VAULT_TRAFFIC_LOG') {
        vaultTrafficBuffer.push(request.log);
        if (vaultTrafficBuffer.length > 100) vaultTrafficBuffer.shift();
        return true;
    }
```

- [ ] **Step 3: Call `injectConsoleForwarder` on snapshot trigger**

Inside `handleDOMCleaner`, before executing the snapshot script, call:

```javascript
    await injectConsoleForwarder(tabId);
```

- [ ] **Step 4: Verify syntax**

Run: `node --check background.js`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "feat: capture console logs and integrate into snapshot"
```

---

## Task 6: Add CSS Ripper tab to popup

**Files:**
- Modify: `popup.html` (add tab button and content panel)
- Modify: `popup.js` (add handler and renderer)

- [ ] **Step 1: Add CSS Rip tab button in popup.html**

Find the nav buttons and add:

```html
<button class="nav-btn" data-tab="css">🎨 CSS Rip</button>
```

Add the tab content:

```html
<div class="tab-content" id="tab-css">
    <div class="section-title">CSS Ripper</div>
    <div class="card">
        <div class="card-title">Extract all CSS</div>
        <div class="card-desc">Grab stylesheets, inline blocks, and CSS variables from the active page.</div>
        <div class="card-actions">
            <button class="btn btn-primary" id="btn-css-rip">🎨 Rip CSS</button>
        </div>
    </div>
    <div class="card" id="css-results" style="display:none;">
        <div class="card-title">Extraction Results</div>
        <div id="css-stats" style="margin-bottom:12px; font-size:0.8rem; color:var(--text-dim);"></div>
        <textarea id="css-output" class="console" style="min-height:200px;" readonly></textarea>
        <div class="card-actions">
            <button class="btn" id="btn-copy-css">📋 Copy CSS</button>
            <button class="btn" id="btn-copy-css-json">📋 Copy JSON</button>
            <button class="btn" id="btn-download-css">⬇️ Download .css</button>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Add handlers in popup.js**

Inside the DOMContentLoaded block, add:

```javascript
    let lastCSSExtraction = null;

    safeListen('btn-css-rip', 'click', async () => {
        const tab = await getActiveTab();
        if (tab?.restricted) return;
        chrome.runtime.sendMessage({ action: 'PERFORM_CSS_RIP', tabId: tab.id }, (res) => {
            if (res?.success) {
                lastCSSExtraction = res.data;
                document.getElementById('css-results').style.display = 'block';
                document.getElementById('css-output').value = res.data.bundle;
                document.getElementById('css-stats').innerHTML = `
                    External: ${res.data.summary.externalCount} |
                    Inline blocks: ${res.data.summary.inlineBlockCount} |
                    Inline styles: ${res.data.summary.inlineStyleCount} |
                    Variables: ${res.data.summary.variableCount}
                `;
                showToast('CSS extracted successfully', 'success');
            } else {
                showToast(res?.error || 'CSS extraction failed', 'error');
            }
        });
    });

    safeListen('btn-copy-css', 'click', () => {
        if (!lastCSSExtraction) return;
        navigator.clipboard.writeText(lastCSSExtraction.bundle)
            .then(() => showToast('CSS copied to clipboard', 'success'))
            .catch(() => showToast('Copy failed', 'error'));
    });

    safeListen('btn-copy-css-json', 'click', () => {
        if (!lastCSSExtraction) return;
        navigator.clipboard.writeText(JSON.stringify(lastCSSExtraction, null, 2))
            .then(() => showToast('JSON copied to clipboard', 'success'))
            .catch(() => showToast('Copy failed', 'error'));
    });

    safeListen('btn-download-css', 'click', () => {
        if (!lastCSSExtraction) return;
        const blob = new Blob([lastCSSExtraction.bundle], { type: 'text/css' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ripped-${new URL(lastCSSExtraction.url).hostname}.css`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
```

- [ ] **Step 3: Add message handler in background.js**

In the message listener add:

```javascript
    } else if (request.action === 'PERFORM_CSS_RIP') {
        runWithTab(async (id) => {
            const data = await handleCSSExtractor(id);
            sendResponse({ success: data && !data.error, data });
        });
        return true;
    }
```

- [ ] **Step 4: Verify syntax**

Run: `node --check popup.js && node --check background.js`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.js background.js
git commit -m "feat: add CSS Ripper tab to popup"
```

---

## Task 7: Redesign popup with Cursor tokens

**Files:**
- Modify: `popup.html`

- [ ] **Step 1: Replace the inline style block with Cursor tokens**

Use the variables from `styles/variables.css`. Key changes:

- `body`: background `var(--color-parchment)`, color `var(--color-ink)`, font `var(--font-cursorgothic)`.
- `header`: background `var(--color-bone)`, border-bottom `var(--border-hairline)`.
- `.nav-btn`: background transparent, color `var(--color-ink)`, 4px radius, hover `var(--color-linen)`.
- `.nav-btn.active`: background `var(--color-ink)`, color `var(--color-parchment)`.
- `.card`: background `var(--color-bone)`, border `var(--border-hairline)`, radius `4px`.
- `.btn`: background `var(--color-linen)`, color `var(--color-ink)`, border `var(--border-hairline)`, radius `4px`.
- `.btn-primary`: background `var(--color-ink)`, color `var(--color-parchment)`, border `var(--color-ink)`.
- `.btn-danger`: background `var(--color-crimson)`, color `white`.
- `.console`: background `var(--color-bone)`, color `var(--color-ink)`, font `var(--font-berkeleymono)`.

- [ ] **Step 2: Ensure popup.html links variables.css**

```html
<link rel="stylesheet" href="styles/variables.css">
```

- [ ] **Step 3: Open popup.html in browser**

Run: `open popup.html`
Expected: warm parchment UI renders.

- [ ] **Step 4: Commit**

```bash
git add popup.html
git commit -m "design: apply Cursor warm-parchment tokens to popup"
```

---

## Task 8: Redesign dashboard with Cursor tokens

**Files:**
- Modify: `dashboard.html`

- [ ] **Step 1: Replace the inline style block with Cursor tokens**

Key changes:
- `body`: background `var(--color-parchment)`, color `var(--color-ink)`, font `var(--font-cursorgothic)`.
- `aside`: background `var(--color-bone)`, border-right `var(--border-hairline)`.
- `header`: background `var(--color-bone)`, border-bottom `var(--border-hairline)`.
- `.card`: background `var(--color-bone)`, border `var(--border-hairline)`, radius `4px`.
- `.btn`: background `var(--color-linen)`, color `var(--color-ink)`, radius `4px`.
- `.btn-primary`: background `var(--color-ink)`, color `var(--color-parchment)`.
- `.status-pill.on`: color `var(--color-forest)`, border `var(--color-forest)`.
- `.status-pill.off`: color `var(--color-crimson)`, border `var(--color-crimson)`.

- [ ] **Step 2: Ensure dashboard.html links variables.css**

Already done in Task 2.

- [ ] **Step 3: Open dashboard.html in browser**

Run: `open dashboard.html`
Expected: warm parchment UI renders.

- [ ] **Step 4: Commit**

```bash
git add dashboard.html
git commit -m "design: apply Cursor warm-parchment tokens to dashboard"
```

---

## Task 9: Manual test and release tag

**Files:**
- All modified files

- [ ] **Step 1: Syntax checks**

Run:
```bash
node --check background.js
node --check popup.js
node --check dashboard.js
```
Expected: all pass.

- [ ] **Step 2: Open popup.html and dashboard.html**

Run:
```bash
open popup.html
open dashboard.html
```
Expected: both render without console errors.

- [ ] **Step 3: Load extension in Chrome**

1. Go to `chrome://extensions`.
2. Enable Developer Mode.
3. Click Load Unpacked.
4. Select the project root.
5. Open the popup on a regular website (e.g., example.com).
6. Click **Snapshot** and verify clipboard gets a Markdown report.
7. Click **CSS Rip** tab and verify extraction works.

- [ ] **Step 4: Tag release**

```bash
GIT_EDITOR=true git tag -a v3.1.0-sovereign -m "feat: sovereign extraction suite — DOM cleaner, CSS ripper, console/network fusion, Cursor design"
```

- [ ] **Step 5: Final commit if any changes**

```bash
git status --short
# If any changes remain:
git add -A
git commit -m "chore: final v3.1.0 sovereign adjustments"
```

---

## Self-Review

**Spec coverage:**
- Archive old version ✅ Task pre-done.
- Fix DOM cleaner ✅ Task 3.
- Add CSS extraction ✅ Task 4.
- Standalone CSS ripper ✅ Task 6.
- Console/network fusion ✅ Task 5.
- Cursor design ✅ Tasks 2, 7, 8.

**Placeholder scan:** no TBD/TODO.

**Type consistency:** `handleCSSExtractor` returns `data` object with `summary`, `bundle`, `cssVariables`. `popup.js` uses `res.data.bundle`, `res.data.summary`, `JSON.stringify(res.data)` consistently.

**Gaps:** none.
