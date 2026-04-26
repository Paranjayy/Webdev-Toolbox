document.addEventListener('DOMContentLoaded', () => {
    let tab;

    // ── Navigation ────────────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${target}`).classList.add('active');

            if (target === 'storage') renderStorage();
            if (target === 'errors') renderErrors();
            if (target === 'sentinel') renderSentinelErrors();
        });
    });

    async function getActiveTab() {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!t || !t.url) return t;
        if (t.url.startsWith('chrome://') || t.url.startsWith('arc://') || t.url.startsWith('edge://') || t.url.startsWith('about:')) {
            return { ...t, restricted: true };
        }
        return t;
    }

    async function safeExecute(func, args = []) {
        try {
            const tab = await getActiveTab();
            if (tab.restricted) {
                alert("Restricted Page: Tools cannot be run on internal browser pages.");
                return;
            }
            return await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: func,
                args: args
            });
        } catch (err) {
            console.error("SafeExecute Error:", err);
        }
    }

    function safeListen(id, event, callback) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, callback);
    }

    const copyToClipboard = (text) => {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    };

    // ── Storage Logic ─────────────────────────────────────────────────────
    async function renderStorage() {
        const container = document.getElementById('vault-storage-list');
        if (!container) return;
        chrome.storage.local.get(null, (data) => {
            container.innerHTML = '';
            Object.keys(data).forEach(key => {
                const item = document.createElement('div');
                item.className = 'storage-item';
                const val = typeof data[key] === 'object' ? JSON.stringify(data[key]).slice(0, 50) + '...' : data[key];
                item.innerHTML = `<div><div class="storage-key">${key}</div><div style="font-size:0.65rem; color:var(--text-dim)">${val}</div></div>`;
                container.appendChild(item);
            });
        });
    }

    // ── Error Logic ───────────────────────────────────────────────────────
    async function getDomErrors() {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) return [];
        const res = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => window.__domErrors || []
        });
        return res[0]?.result || [];
    }

    async function getStorageErrors() {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) return [];
        const res = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                try { return JSON.parse(localStorage.getItem('__storageErrors') || '[]'); } catch(e) { return []; }
            }
        });
        return res[0]?.result || [];
    }

    async function renderErrors() {
        const consoleEl = document.getElementById('error-console');
        const noErrorsEl = document.getElementById('no-errors');
        const countBadge = document.getElementById('error-count');
        const countBanner = document.getElementById('error-count-badge');
        
        const [dom, storage] = await Promise.all([getDomErrors(), getStorageErrors()]);
        const all = [...dom, ...storage];
        
        countBadge.textContent = all.length;
        countBanner.textContent = all.length;

        if (all.length === 0) {
            consoleEl.innerHTML = '';
            noErrorsEl.style.display = 'block';
        } else {
            noErrorsEl.style.display = 'none';
            consoleEl.innerHTML = all.map(err => `
                <div class="err-entry">
                    <span class="err-time">[${new Date(err.timestamp).toLocaleTimeString()}]</span>
                    <span class="err-msg">${err.message}</span>
                    ${err.stack ? `<div style="font-size:0.6rem; color:rgba(255,255,255,0.4); margin-top:4px;">${err.stack.split('\n')[1]}</div>` : ''}
                </div>
            `).join('');
        }
    }

    // ── Sentinel Logic ────────────────────────────────────────────────────
    async function renderSentinelErrors() {
        const consoleEl = document.getElementById('sentinel-console');
        const countBadge = document.getElementById('sentinel-count');
        const badgeLabel = document.getElementById('sentinel-count-badge');
        
        chrome.storage.local.get(['sentinelErrors'], (data) => {
            const errors = data.sentinelErrors || [];
            countBadge.textContent = errors.length;
            badgeLabel.textContent = `${errors.length} errors`;
            
            if (errors.length === 0) {
                consoleEl.innerHTML = '';
                document.getElementById('no-sentinel').style.display = 'block';
            } else {
                document.getElementById('no-sentinel').style.display = 'none';
                consoleEl.innerHTML = errors.map(err => `
                    <div class="sentinel-err-entry">
                        <span class="sentinel-label">ERR</span> ${err.message}
                        <div style="opacity:0.5; font-size:0.6rem">${new Date(err.timestamp).toLocaleString()}</div>
                    </div>
                `).join('');
            }
        });
    }

    // ── Extensions Logic ──────────────────────────────────────────────────
    let searchFilter = '';
    let currentSubTab = 'local';

    function renderExtensions() {
        const unpackedList = document.getElementById('ext-list-unpacked');
        const storeList = document.getElementById('ext-list-store');
        if (!unpackedList || !storeList) return;

        chrome.management.getAll((extensions) => {
            const list = extensions.filter(e => e.id !== chrome.runtime.id);
            const filtered = list.filter(e => e.name.toLowerCase().includes(searchFilter.toLowerCase()) || e.id.includes(searchFilter));
            
            const unpacked = filtered.filter(e => e.installType === 'development');
            const store = filtered.filter(e => e.installType !== 'development');

            document.getElementById('unpacked-count').textContent = unpacked.length;
            document.getElementById('store-count').textContent = store.length;

            const renderCard = (ext) => `
                <div class="ext-card">
                    <div class="ext-header">
                        <img src="${ext.icons?.[0]?.url || 'icon/icon-16.png'}" style="width:16px;height:16px;border-radius:2px;">
                        <div style="min-width:0; flex:1">
                            <div class="ext-name">${ext.name}</div>
                            <div class="ext-sub">${ext.id}</div>
                        </div>
                        <div class="status-badge ${ext.enabled ? '' : 'disabled'}">${ext.enabled ? 'ON' : 'OFF'}</div>
                    </div>
                    <div class="btn-row">
                        ${ext.installType === 'development' ? `<button class="btn btn-primary" id="reload-${ext.id}">Reload</button>` : `<button class="btn btn-secondary" id="consolidate-${ext.id}">Consolidate</button>`}
                        <button class="btn btn-secondary" id="toggle-${ext.id}">${ext.enabled ? 'Disable' : 'Enable'}</button>
                    </div>
                </div>
            `;

            unpackedList.innerHTML = unpacked.map(renderCard).join('');
            storeList.innerHTML = store.map(renderCard).join('');

            // Listeners
            unpacked.forEach(ext => {
                safeListen(`reload-${ext.id}`, 'click', () => {
                    chrome.runtime.sendMessage({ action: 'RELOAD_EXT_AND_TAB', id: ext.id });
                    window.close();
                });
                safeListen(`toggle-${ext.id}`, 'click', () => {
                    chrome.management.setEnabled(ext.id, !ext.enabled, () => renderExtensions());
                });
            });

            store.forEach(ext => {
                safeListen(`consolidate-${ext.id}`, 'click', async () => {
                    const prompt = `Vault, please consolidate extension "${ext.name}" (${ext.id}). I want to reverse engineer its features. You can find the source at: ~/Library/Application\\ Support/Arc/User\\ Data/Default/Extensions/${ext.id}/${ext.version}`;
                    copyToClipboard(prompt);
                    const btn = document.getElementById(`consolidate-${ext.id}`);
                    btn.textContent = 'COPIED!';
                    setTimeout(() => btn.textContent = 'Consolidate', 2000);
                });
                safeListen(`toggle-${ext.id}`, 'click', () => {
                    chrome.management.setEnabled(ext.id, !ext.enabled, () => renderExtensions());
                });
            });
        });
    }

    // ── Search & Filter Listeners ──────────────────────────────────────────
    safeListen('btn-open-dashboard', 'click', () => {
        chrome.tabs.create({ url: 'dashboard.html' });
    });

    safeListen('ext-search', 'input', (e) => {
        searchFilter = e.target.value;
        renderExtensions();
    });

    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentSubTab = btn.dataset.sub;
            document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`sub-ext-${currentSubTab}`).classList.add('active');
        });
    });

    // ── Toolkit Listeners ─────────────────────────────────────────────────
    safeListen('btn-gigasnap', 'click', () => runSnap(false));
    safeListen('btn-gigaraw', 'click', () => runSnap(true));

    async function runSnap(raw) {
        const btn = document.getElementById(raw ? 'btn-gigaraw' : 'btn-gigasnap');
        const originalText = btn.textContent;
        btn.textContent = '...';
        try {
            const tab = await getActiveTab();
            if (tab.restricted) throw new Error("Restricted Page");
            chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw, tabId: tab.id }, (response) => {
                if (response?.success) {
                    btn.textContent = 'DONE!';
                } else {
                    btn.textContent = 'ERR';
                }
            });
        } catch (e) {
            btn.textContent = 'ERR';
        }
        setTimeout(() => btn.textContent = originalText, 2000);
    }

    safeListen('btn-pagespeed', 'click', async () => {
        const tab = await getActiveTab();
        if (tab?.url) window.open(`https://pagespeed.web.dev/report?url=${encodeURIComponent(tab.url)}`, '_blank');
    });

    safeListen('btn-wappalyzer', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const frameworks = [];
                if (window.React || document.querySelector('[data-reactroot]')) frameworks.push('React');
                if (window.next) frameworks.push('Next.js');
                if (window.Vue) frameworks.push('Vue');
                if (window.jQuery) frameworks.push('jQuery');
                alert(`Detected: ${frameworks.join(', ') || 'Vanilla/Unknown'}`);
            }
        });
    });

    // ... (rest of the listeners unified below)
    safeListen('btn-extract-theme', 'click', async () => {
        const tab = await getActiveTab();
        const btn = document.getElementById('btn-extract-theme');
        const originalText = btn.textContent;
        btn.textContent = '...';
        
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                let cssVars = {};
                for (let i = 0; i < document.styleSheets.length; i++) {
                    const sheet = document.styleSheets[i];
                    try {
                        if (!sheet.href || sheet.href.indexOf(window.location.origin) === 0) {
                            for (let j = 0; j < sheet.cssRules.length; j++) {
                                const rule = sheet.cssRules[j];
                                if (rule.type === 1 && (rule.selectorText === ':root' || rule.selectorText === 'html' || rule.selectorText === 'body')) {
                                    for (let k = 0; k < rule.style.length; k++) {
                                        const name = rule.style[k];
                                        if (name.startsWith('--') && rule.style.getPropertyValue(name).trim() !== '') {
                                            cssVars[name] = rule.style.getPropertyValue(name).trim();
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("CORS/Access error on stylesheet", e);
                    }
                }
                
                if (Object.keys(cssVars).length === 0) {
                    alert('No root CSS tokens found. Site might use pure Tailwind utility classes without tokens.');
                    return false;
                }

                const varString = JSON.stringify(cssVars, null, 2);
                const textArea = document.createElement('textarea');
                textArea.value = varString;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                alert(`🔥 Copied ${Object.keys(cssVars).length} CSS tokens to clipboard!\n\n` + varString.slice(0, 100) + '...');
                return true;
            }
        }, (results) => {
            if (results && results[0] && results[0].result) {
                btn.textContent = 'COPIED!';
            } else {
                btn.textContent = 'NONE';
            }
            setTimeout(() => btn.textContent = originalText, 2000);
        });
    });

    safeListen('btn-ghost-mode', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const id = 'dev-vault-ghost-mode';
                let style = document.getElementById(id);
                if (style) {
                    style.remove();
                } else {
                    style = document.createElement('style');
                    style.id = id;
                    style.innerHTML = `img, video, .avatar, [class*="avatar"] { filter: blur(20px) grayscale(1) !important; opacity: 0.3 !important; }`;
                    document.head.appendChild(style);
                }
            }
        });
    });

    safeListen('btn-redact-pii', 'click', async () => {
        const tab = await getActiveTab();
        const { customRedactions } = await chrome.storage.local.get(['customRedactions']);
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [customRedactions || []],
            func: (customList) => {
                const walk = (node) => {
                    if (node.nodeType === 3) {
                        node.nodeValue = node.nodeValue.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED]');
                    } else if (node.nodeType === 1 && !['SCRIPT', 'STYLE'].includes(node.tagName)) {
                        node.childNodes.forEach(walk);
                    }
                };
                walk(document.body);
            }
        });
    });

    // ── Labs / Experimental ───────────────────────────────────────────────
    safeListen('btn-ui-cloner', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                alert('UI Cloner activated! Hover over any element and click to rip its structure to your clipboard.');
                const handler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const clone = e.target.cloneNode(true);
                    // Minimal cleanup
                    clone.querySelectorAll('script, style, path, svg').forEach(el => el.remove());
                    const textArea = document.createElement('textarea');
                    textArea.value = clone.outerHTML;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    
                    document.removeEventListener('click', handler, true);
                    alert('Copied high-fidelity UI node to clipboard!');
                };
                document.addEventListener('click', handler, true);
            }
        });
    });

    safeListen('btn-css-roulette', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const randomColor = () => '#' + Math.floor(Math.random()*16777215).toString(16);
                for (let i = 0; i < document.styleSheets.length; i++) {
                    try {
                        const sheet = document.styleSheets[i];
                        for (let j = 0; j < sheet.cssRules.length; j++) {
                            const rule = sheet.cssRules[j];
                            if (rule.type === 1 && (rule.selectorText === ':root' || rule.selectorText === 'html' || rule.selectorText === 'body')) {
                                for (let k = 0; k < rule.style.length; k++) {
                                    const name = rule.style[k];
                                    if (name.startsWith('--') && (name.includes('color') || name.includes('bg') || name.includes('text'))) {
                                        rule.style.setProperty(name, randomColor());
                                    }
                                }
                            }
                        }
                    } catch(e) {}
                }
            }
        });
    });

    safeListen('btn-knip-vis', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Highly experimental heuristic for dead/empty structural elements
                document.querySelectorAll('div, span, section').forEach(el => {
                    if (el.innerHTML.trim() === '' && !el.className.includes('icon') && !el.style.backgroundImage) {
                        el.style.outline = '2px dashed red';
                        el.style.boxShadow = '0 0 10px red';
                    }
                });
            }
        });
    });

    safeListen('btn-global-wpm', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__wpmTrackerActive) return;
                window.__wpmTrackerActive = true;
                
                let chars = 0;
                let startTime = Date.now();
                
                const widget = document.createElement('div');
                widget.style.cssText = 'position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.8); color:#19FFD6; padding:10px 20px; border-radius:10px; font-family:monospace; z-index:999999; border:1px solid #334155; font-size:16px; font-weight:bold; backdrop-filter:blur(10px); pointer-events:none;';
                widget.textContent = 'WPM: 0';
                document.body.appendChild(widget);

                document.addEventListener('keydown', (e) => {
                    if (e.key.length === 1) {
                        chars++;
                        const elapsedMins = (Date.now() - startTime) / 60000;
                        const wpm = Math.round((chars / 5) / (elapsedMins || 0.01));
                        widget.textContent = `WPM: ${wpm} | Keystrokes: ${chars}`;
                    }
                });
            }
        });
    });

    safeListen('btn-audit-contrast', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const fails = [];
                document.querySelectorAll('*').forEach(el => {
                    const style = window.getComputedStyle(el);
                    const bg = style.backgroundColor;
                    const fg = style.color;
                    if (style.opacity === '0' || style.display === 'none' || style.visibility === 'hidden') return;
                    if (bg === fg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                        fails.push(el);
                    }
                });
                if (fails.length > 0) {
                    fails.forEach(f => f.style.outline = '2px solid orange');
                    alert(`Found ${fails.length} elements with matching background/foreground! Highlighted in orange.`);
                } else {
                    alert('No obvious contrast issues found (Simple Check).');
                }
            }
        });
    });

    safeListen('btn-audit-type', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const fonts = new Set();
                document.querySelectorAll('*').forEach(el => {
                    const family = window.getComputedStyle(el).fontFamily;
                    if (family) fonts.add(family.split(',')[0].replace(/['"]/g, '').trim());
                });
                alert('Fonts found on page:\n' + Array.from(fonts).join('\n'));
            }
        });
    });

    safeListen('btn-toggle-grid', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const id = 'dev-vault-grid-overlay';
                let grid = document.getElementById(id);
                if (grid) {
                    grid.remove();
                } else {
                    grid = document.createElement('div');
                    grid.id = id;
                    grid.style.cssText = `
                        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                        pointer-events: none; z-index: 999999;
                        display: grid; grid-template-columns: repeat(12, 1fr);
                        gap: 20px; padding: 0 20px; box-sizing: border-box;
                    `;
                    for (let i = 0; i < 12; i++) {
                        const col = document.createElement('div');
                        col.style.background = 'rgba(255, 0, 0, 0.05)';
                        col.style.borderLeft = col.style.borderRight = '1px solid rgba(255, 0, 0, 0.1)';
                        grid.appendChild(col);
                    }
                    document.body.appendChild(grid);
                }
            }
        });
    });

    safeListen('btn-font-swap', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const id = 'dev-vault-font-swap';
                let style = document.getElementById(id);
                if (style) {
                    style.remove();
                } else {
                    style = document.createElement('style');
                    style.id = id;
                    style.innerHTML = `
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                        * { font-family: 'Inter', system-ui, -apple-system, sans-serif !important; }
                    `;
                    document.head.appendChild(style);
                }
            }
        });
    });

    safeListen('btn-measure', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                alert('Measure Tool activated! Click two points on the screen to measure distance.');
                let point1 = null;
                const handler = (e) => {
                    if (!point1) {
                        point1 = { x: e.clientX, y: e.clientY };
                        const dot = document.createElement('div');
                        dot.className = 'dev-vault-measure-dot';
                        dot.style.cssText = `position:fixed; left:${e.clientX-5}px; top:${e.clientY-5}px; width:10px; height:10px; background:red; border-radius:50%; z-index:999999;`;
                        document.body.appendChild(dot);
                    } else {
                        const dx = Math.abs(e.clientX - point1.x);
                        const dy = Math.abs(e.clientY - point1.y);
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        alert(`Distance: ${Math.round(dist)}px (Horizontal: ${dx}px, Vertical: ${dy}px)`);
                        document.querySelectorAll('.dev-vault-measure-dot').forEach(d => d.remove());
                        document.removeEventListener('click', handler, true);
                    }
                };
                document.addEventListener('click', handler, true);
            }
        });
    });

    safeListen('btn-vibe-mode', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const id = 'dev-vault-vibe-filter';
                let style = document.getElementById(id);
                if (style) {
                    style.remove();
                    document.querySelectorAll('.crt-overlay, .crt-scanline').forEach(el => el.remove());
                    document.documentElement.style.filter = '';
                } else {
                    style = document.createElement('style');
                    style.id = id;
                    style.innerHTML = `
                        @keyframes scanline {
                            0% { transform: translateY(-100%); }
                            100% { transform: translateY(100%); }
                        }
                        .crt-overlay {
                            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                            background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), 
                                        linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03));
                            background-size: 100% 3px, 3px 100%;
                            pointer-events: none; z-index: 9999999;
                        }
                        .crt-scanline {
                            position: fixed; top: 0; left: 0; width: 100vw; height: 100px;
                            background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.05), transparent);
                            animation: scanline 8s linear infinite;
                            pointer-events: none; z-index: 9999999;
                        }
                    `;
                    document.head.appendChild(style);
                    const overlay = document.createElement('div');
                    overlay.className = 'crt-overlay';
                    const scanline = document.createElement('div');
                    scanline.className = 'crt-scanline';
                    document.body.appendChild(overlay);
                    document.body.appendChild(scanline);
                    document.documentElement.style.filter = 'contrast(1.2) brightness(1.1) saturate(1.2) sepia(0.1)';
                }
            }
        });
    });

    safeListen('btn-deep-fried', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const currentFilter = document.documentElement.style.filter;
                if (currentFilter.includes('saturate(500%)')) {
                    document.documentElement.style.filter = '';
                } else {
                    document.documentElement.style.filter = 'saturate(500%) contrast(200%) brightness(150%) hue-rotate(45deg)';
                }
            }
        });
    });

    safeListen('btn-z-map', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__Z_MAP_ACTIVE) {
                    document.querySelectorAll('.z-map-label').forEach(el => el.remove());
                    document.querySelectorAll('*').forEach(el => el.style.outline = '');
                    window.__Z_MAP_ACTIVE = false;
                    return;
                }
                window.__Z_MAP_ACTIVE = true;
                document.querySelectorAll('*').forEach(el => {
                    const style = window.getComputedStyle(el);
                    const z = style.zIndex;
                    if (z !== 'auto') {
                        const zVal = parseInt(z);
                        if (isNaN(zVal)) return;
                        el.style.outline = `2px solid hsl(${Math.min(Math.abs(zVal) * 10, 360)}, 100%, 50%)`;
                        const label = document.createElement('div');
                        label.className = 'z-map-label';
                        const rect = el.getBoundingClientRect();
                        label.style.cssText = `
                            position: fixed; left: ${rect.left}px; top: ${rect.top}px;
                            background: black; color: white; font-size: 10px; padding: 2px 4px;
                            z-index: 10000000; pointer-events: none; border-radius: 4px;
                            white-space: nowrap;
                        `;
                        label.textContent = `z: ${z}`;
                        document.body.appendChild(label);
                    }
                });
            }
        });
    });

    safeListen('btn-console-overlay', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__CONSOLE_OVERLAY_ACTIVE) return;
                window.__CONSOLE_OVERLAY_ACTIVE = true;
                const widget = document.createElement('div');
                widget.style.cssText = 'position:fixed; bottom:20px; left:20px; width:350px; height:200px; background:rgba(15, 23, 42, 0.9); color:#10b981; font-family:monospace; font-size:11px; padding:12px; overflow-y:auto; z-index:9999999; border-radius:12px; border:1px solid #334155; backdrop-filter:blur(10px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); pointer-events:none;';
                widget.id = '__vibe_console_overlay';
                document.body.appendChild(widget);
                
                const logToOverlay = (type, ...args) => {
                    const line = document.createElement('div');
                    line.style.marginBottom = '4px';
                    line.style.borderLeft = `2px solid ${type === 'error' ? '#ef4444' : '#10b981'}`;
                    line.style.paddingLeft = '6px';
                    line.textContent = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
                    widget.appendChild(line);
                    widget.scrollTop = widget.scrollHeight;
                };

                const originalLog = console.log;
                const originalError = console.error;
                const originalWarn = console.warn;

                console.log = (...args) => { originalLog(...args); logToOverlay('log', ...args); };
                console.error = (...args) => { originalError(...args); logToOverlay('error', ...args); };
                console.warn = (...args) => { originalWarn(...args); logToOverlay('warn', ...args); };
                
                logToOverlay('log', 'Dev Vault Console Proxy Active...');
            }
        });
    });

    safeListen('btn-dom-heat', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__DOM_HEAT_ACTIVE) {
                    document.querySelectorAll('*').forEach(el => { el.style.boxShadow = ''; el.style.outline = ''; });
                    window.__DOM_HEAT_ACTIVE = false;
                    return;
                }
                window.__DOM_HEAT_ACTIVE = true;
                document.querySelectorAll('*').forEach(el => {
                    const childCount = el.children.length;
                    if (childCount > 20) {
                        el.style.outline = '3px solid #ef4444';
                        el.style.boxShadow = '0 0 15px #ef4444';
                    } else if (childCount > 10) {
                        el.style.outline = '2px solid #f59e0b';
                    }
                });
                alert('DOM Heatmap: Elements with >10 children highlighted in Yellow, >20 in Red.');
            }
        });
    });

    safeListen('btn-outline-components', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const id = 'dev-vault-component-outline';
                let style = document.getElementById(id);
                if (style) {
                    style.remove();
                } else {
                    style = document.createElement('style');
                    style.id = id;
                    style.innerHTML = `
                        [class*="card"], [class*="btn"], [class*="nav"], [class*="header"], [class*="footer"], [class*="modal"], [class*="menu"], [class*="section"] {
                            outline: 2px dashed #6366f1 !important;
                            outline-offset: 4px !important;
                            position: relative !important;
                        }
                        [class*="card"]::after, [class*="btn"]::after, [class*="nav"]::after, [class*="section"]::after {
                            content: "." attr(class);
                            position: absolute;
                            top: -12px; left: 0;
                            background: #6366f1; color: white;
                            font-size: 8px; padding: 1px 4px;
                            border-radius: 2px;
                            z-index: 999999;
                            white-space: nowrap;
                            pointer-events: none;
                            font-family: monospace;
                        }
                    `;
                    document.head.appendChild(style);
                }
            }
        });
    });

    safeListen('btn-font-palace', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const fonts = ['Space Grotesk', 'Playfair Display', 'Outfit', 'Inter', 'Roboto Mono'];
                const current = window.__VAULT_FONT_INDEX || 0;
                const nextFont = fonts[current % fonts.length];
                window.__VAULT_FONT_INDEX = current + 1;
                
                const id = 'dev-vault-font-palace';
                let style = document.getElementById(id);
                if (!style) {
                    style = document.createElement('style');
                    style.id = id;
                    document.head.appendChild(style);
                }
                
                style.innerHTML = `
                    @import url('https://fonts.googleapis.com/css2?family=${nextFont.replace(/ /g, '+')}:wght@400;700&display=swap');
                    * { font-family: '${nextFont}', sans-serif !important; }
                `;
                console.log(`Font Palace: Swapped to ${nextFont}`);
            }
        });
    });

    safeListen('btn-var-editor', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const id = 'dev-vault-var-editor-ui';
                if (document.getElementById(id)) {
                    document.getElementById(id).remove();
                    return;
                }
                
                const variables = [];
                for (let i = 0; i < document.styleSheets.length; i++) {
                    try {
                        const sheet = document.styleSheets[i];
                        for (let j = 0; j < sheet.cssRules.length; j++) {
                            const rule = sheet.cssRules[j];
                            if (rule.style) {
                                for (let k = 0; k < rule.style.length; k++) {
                                    const name = rule.style[k];
                                    if (name.startsWith('--')) variables.push(name);
                                }
                            }
                        }
                    } catch (e) {}
                }
                const uniqueVars = [...new Set(variables)].slice(0, 50);

                const container = document.createElement('div');
                container.id = id;
                container.style.cssText = `
                    position: fixed; top: 20px; right: 20px; width: 300px; max-height: 400px;
                    background: #0f172a; border: 1px solid #334155; border-radius: 12px;
                    z-index: 10000000; color: white; padding: 12px; font-family: sans-serif;
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); overflow-y: auto;
                `;
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; position:sticky; top:0; background:#0f172a; padding-bottom:8px;">
                        <span style="font-weight:bold; color:#6366f1;">Variable Editor</span>
                        <button id="close-var-editor" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:18px;">&times;</button>
                    </div>
                    <div id="var-list" style="display:flex; flex-direction:column; gap:8px;"></div>
                `;
                document.body.appendChild(container);
                container.querySelector('#close-var-editor').onclick = () => container.remove();
                
                const list = container.querySelector('#var-list');
                uniqueVars.forEach(v => {
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.flexDirection = 'column';
                    const val = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
                    row.innerHTML = `
                        <label style="font-size:10px; color:#94a3b8; word-break:break-all;">${v}</label>
                        <input type="text" value="${val}" style="background:#1e293b; border:1px solid #334155; color:white; font-size:11px; padding:4px; border-radius:4px;">
                    `;
                    const input = row.querySelector('input');
                    input.addEventListener('input', (e) => {
                        document.documentElement.style.setProperty(v, e.target.value);
                    });
                    list.appendChild(row);
                });
            }
        });
    });

    safeListen('btn-mutation-pulse', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__MUTATION_PULSE_ACTIVE) {
                    if (window.__MUTATION_PULSE_OBSERVER) window.__MUTATION_PULSE_OBSERVER.disconnect();
                    document.querySelectorAll('.mutation-flash').forEach(el => el.remove());
                    window.__MUTATION_PULSE_ACTIVE = false;
                    return;
                }
                window.__MUTATION_PULSE_ACTIVE = true;
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach(m => {
                        const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
                        if (!target || !target.getBoundingClientRect) return;
                        const rect = target.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) return;
                        const flash = document.createElement('div');
                        flash.className = 'mutation-flash';
                        flash.style.cssText = `
                            position: fixed; left: ${rect.left}px; top: ${rect.top}px;
                            width: ${rect.width}px; height: ${rect.height}px;
                            background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444;
                            pointer-events: none; z-index: 9999999;
                            transition: opacity 0.4s;
                        `;
                        document.body.appendChild(flash);
                        setTimeout(() => {
                            flash.style.opacity = '0';
                            setTimeout(() => flash.remove(), 400);
                        }, 100);
                    });
                });
                observer.observe(document.body, { attributes: true, childList: true, subtree: true });
                window.__MUTATION_PULSE_OBSERVER = observer;
                alert('Mutation Pulse Active! Changing elements will flash red.');
            }
        });
    });

    safeListen('btn-roast-ui', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const roasts = [];
                const divCount = document.querySelectorAll('div').length;
                const importantCount = Array.from(document.styleSheets).reduce((acc, s) => {
                    try { 
                        return acc + Array.from(s.cssRules).filter(r => r.style && r.style.cssText.includes('!important')).length; 
                    } catch(e) { return acc; }
                }, 0);
                const hasAria = document.querySelectorAll('[aria-label], [aria-hidden], [role]').length > 0;
                const imagesNoAlt = document.querySelectorAll('img:not([alt])').length;
                
                if (divCount > 800) roasts.push(`Found ${divCount} divs. This is a div-nesting emergency. Seek help.`);
                if (importantCount > 15) roasts.push(`${importantCount} !important tags? Your CSS is basically a series of desperate ultimatums.`);
                if (!hasAria) roasts.push("Zero accessibility attributes. Screen readers just see a blank void when they look at your site.");
                if (imagesNoAlt > 0) roasts.push(`${imagesNoAlt} images without alt text. Even my robot brain is disappointed.`);
                if (window.jQuery) roasts.push("jQuery detected. Grandpa, is that you?");
                if (document.querySelectorAll('style').length > 5) roasts.push("Multiple inline <style> tags. Did you lose your CSS file or just give up?");
                
                if (roasts.length === 0) {
                    alert("Professional Build Detected. No major sloppiness found. I am bored.");
                } else {
                    alert("🔥 DEV VAULT: UI ROAST 🔥\n\n" + roasts.join("\n\n"));
                }
            }
        });
    });

    safeListen('btn-theme-export', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const variables = {};
                const colors = new Set();
                
                for (let i = 0; i < document.styleSheets.length; i++) {
                    try {
                        const sheet = document.styleSheets[i];
                        for (let j = 0; j < sheet.cssRules.length; j++) {
                            const rule = sheet.cssRules[j];
                            if (rule.style) {
                                for (let k = 0; k < rule.style.length; k++) {
                                    const name = rule.style[k];
                                    if (name.startsWith('--')) {
                                        variables[name] = rule.style.getPropertyValue(name).trim();
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                }
                
                document.querySelectorAll('*').forEach((el, i) => {
                    if (i > 500) return;
                    const style = window.getComputedStyle(el);
                    if (style.color) colors.add(style.color);
                    if (style.backgroundColor) colors.add(style.backgroundColor);
                });

                const theme = {
                    metadata: { url: window.location.href, date: new Date().toISOString() },
                    variables,
                    palette: Array.from(colors).filter(c => !c.includes('rgba(0, 0, 0, 0)') && c !== 'transparent')
                };
                
                const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `theme-${new URL(window.location.href).hostname}.json`;
                a.click();
                alert('Theme exported as JSON!');
            }
        });
    });

    safeListen('btn-image-crawl', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const images = Array.from(document.querySelectorAll('img')).map(img => img.src);
                const svgs = Array.from(document.querySelectorAll('svg')).map((s, i) => `[SVG ${i}]`);
                const backgrounds = Array.from(document.querySelectorAll('*'))
                    .map(el => window.getComputedStyle(el).backgroundImage)
                    .filter(bg => bg && bg !== 'none' && bg.includes('url('))
                    .map(bg => {
                        const match = bg.match(/url\(["']?(.*?)["']?\)/);
                        return match ? match[1] : bg;
                    });
                
                const all = [...new Set([...images, ...backgrounds])].filter(Boolean);
                console.log('%c 🕸️ VAULT IMAGE CRAWL ', 'background: #10b981; color: white; font-weight: bold;');
                console.log('Images Found:', all.length);
                all.forEach(src => console.log(src));
                alert(`Crawled ${all.length} images and ${svgs.length} SVGs. Check console for links.`);
            }
        });
    });

    safeListen('btn-palace-export', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__PALACE_EXPORT_ACTIVE) return;
                window.__PALACE_EXPORT_ACTIVE = true;
                
                const overlay = document.createElement('div');
                overlay.style = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.9); color:white; padding:12px 20px; border-radius:30px; z-index:100000; border:1px solid #334155; font-family:Inter,system-ui; font-size:12px; pointer-events:none; box-shadow:0 10px 25px rgba(0,0,0,0.5); backdrop-filter:blur(8px);';
                overlay.innerText = '✨ Palace Export: Click an element to wrap as React component...';
                document.body.appendChild(overlay);

                const highlight = document.createElement('div');
                highlight.style = 'position:fixed; border:2px solid #818cf8; background:rgba(129,140,248,0.1); pointer-events:none; z-index:99999; transition:all 0.1s ease;';
                document.body.appendChild(highlight);

                const onMove = (e) => {
                    const rect = e.target.getBoundingClientRect();
                    highlight.style.top = `${rect.top}px`;
                    highlight.style.left = `${rect.left}px`;
                    highlight.style.width = `${rect.width}px`;
                    highlight.style.height = `${rect.height}px`;
                };

                const onClick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const el = e.target;
                    
                    const cleanHtml = (node) => {
                        const clone = node.cloneNode(true);
                        clone.querySelectorAll('script, style').forEach(s => s.remove());
                        return clone.outerHTML;
                    };

                    const componentName = (el.id || (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : '') || 'Component').replace(/[^a-zA-Z]/g, '');
                    const capitalized = (componentName.charAt(0).toUpperCase() + componentName.slice(1)) || 'ExportedComponent';
                    
                    const code = `import React from 'react';\n\n/**\n * Palace Exported Component\n * Source: ${window.location.href}\n */\nexport const ${capitalized} = () => {\n  return (\n    <div dangerouslySetInnerHTML={{ __html: \`${cleanHtml(el).replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }} />\n  );\n};`;

                    const tmp = document.createElement('textarea');
                    tmp.value = code; document.body.appendChild(tmp);
                    tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
                    
                    alert(`React Component <${capitalized} /> copied to clipboard!`);
                    cleanup();
                };

                const cleanup = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('click', onClick, true);
                    overlay.remove(); highlight.remove();
                    window.__PALACE_EXPORT_ACTIVE = false;
                };

                document.addEventListener('mousemove', onMove);
                document.addEventListener('click', onClick, true);
                setTimeout(() => { if (window.__PALACE_EXPORT_ACTIVE) cleanup(); }, 15000);
            }
        });
    });

    safeListen('btn-shadow-pierce', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const roots = [];
                const findShadows = (root) => {
                    root.querySelectorAll('*').forEach(el => {
                        if (el.shadowRoot) {
                            roots.push(el.shadowRoot);
                            findShadows(el.shadowRoot);
                        }
                    });
                };
                findShadows(document);
                
                roots.forEach(sr => {
                    const debug = document.createElement('div');
                    debug.style = 'border:2px dashed #f59e0b; padding:10px; margin:5px; position:relative; min-height:20px;';
                    debug.innerHTML = `<div style="position:absolute; top:-10px; right:10px; background:#f59e0b; color:black; font-size:9px; padding:2px 5px; border-radius:4px; font-weight:bold; z-index:10000;">SHADOW ROOT</div>`;
                    sr.prepend(debug);
                });
                alert(`Pierced and highlighted ${roots.length} Shadow Roots.`);
            }
        });
    });

    safeListen('btn-cyber-vibe', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const styleId = 'vault-cyberpunk-style';
                if (document.getElementById(styleId)) {
                    document.getElementById(styleId).remove();
                    return;
                }
                const style = document.createElement('style');
                style.id = styleId;
                style.innerHTML = `
                    * {
                        border-color: #ff00ff !important;
                        text-shadow: 0 0 5px #00ffff, 0 0 10px #00ffff !important;
                        box-shadow: none !important;
                    }
                    body {
                        background-color: #050505 !important;
                        color: #00ffff !important;
                    }
                    a, button {
                        color: #ff00ff !important;
                        background: rgba(255, 0, 255, 0.1) !important;
                        border: 1px solid #ff00ff !important;
                    }
                    img { filter: hue-rotate(270deg) brightness(1.2) contrast(1.2) !important; }
                `;
                document.head.appendChild(style);
            }
        });
    });

    safeListen('btn-xray', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__XRAY_ACTIVE) {
                    window.__XRAY_ACTIVE = false;
                    document.getElementById('vault-xray-box')?.remove();
                    return;
                }
                window.__XRAY_ACTIVE = true;
                const box = document.createElement('div');
                box.id = 'vault-xray-box';
                box.style = 'position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.9); color:#10b981; padding:15px; border-radius:8px; z-index:100000; font-family:monospace; font-size:10px; border:1px solid #10b981; pointer-events:none; max-width:300px; white-space:pre-wrap; box-shadow: 0 0 20px rgba(16,185,129,0.3);';
                document.body.appendChild(box);

                document.addEventListener('mouseover', (e) => {
                    if (!window.__XRAY_ACTIVE) return;
                    const el = e.target;
                    const data = {
                        tag: el.tagName,
                        id: el.id,
                        classes: el.className,
                        aria: Array.from(el.attributes).filter(a => a.name.startsWith('aria-')).map(a => `${a.name}=${a.value}`),
                        data: Array.from(el.attributes).filter(a => a.name.startsWith('data-')).map(a => `${a.name}=${a.value}`),
                        size: `${el.offsetWidth}x${el.offsetHeight}`
                    };
                    box.innerText = `[X-RAY VISION]\n\nTAG: ${data.tag}\nID: ${data.id || 'N/A'}\nCLASSES: ${data.classes || 'N/A'}\nSIZE: ${data.size}\n\nARIA:\n${data.aria.join('\n') || 'None'}\n\nDATA:\n${data.data.join('\n') || 'None'}`;
                });
            }
        });
    });

    safeListen('btn-macro-record', 'click', async () => {
        const tab = await getActiveTab();
        chrome.runtime.sendMessage({ action: 'PERFORM_MACRO', tabId: tab.id });
    });

    safeListen('btn-focus-spotlight', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const id = 'vault-spotlight-mask';
                if (document.getElementById(id)) {
                    document.getElementById(id).remove();
                    document.removeEventListener('mousemove', window.__SPOTLIGHT_MOVE);
                    return;
                }
                const mask = document.createElement('div');
                mask.id = id;
                mask.style = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.8); z-index:999999; pointer-events:none; -webkit-mask-image: radial-gradient(circle 100px at 50% 50%, transparent 100%, black 100%); mask-image: radial-gradient(circle 100px at 50% 50%, transparent 100%, black 100%);';
                document.body.appendChild(mask);

                window.__SPOTLIGHT_MOVE = (e) => {
                    mask.style.maskImage = `radial-gradient(circle 150px at ${e.clientX}px ${e.clientY}px, transparent 0%, black 100%)`;
                    mask.style.webkitMaskImage = `radial-gradient(circle 150px at ${e.clientX}px ${e.clientY}px, transparent 0%, black 100%)`;
                };
                document.addEventListener('mousemove', window.__SPOTLIGHT_MOVE);
            }
        });
    });

    safeListen('btn-ghost-mode', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__GHOST_ACTIVE) {
                    window.__GHOST_ACTIVE = false;
                    document.querySelectorAll('*').forEach(el => el.style.opacity = '');
                    return;
                }
                window.__GHOST_ACTIVE = true;
                window.__GHOST_LISTEN = (e) => {
                    if (!window.__GHOST_ACTIVE) return;
                    document.querySelectorAll('*').forEach(el => {
                        if (el.style) el.style.opacity = '0.2';
                    });
                    if (e.target.style) e.target.style.opacity = '1';
                };
                document.addEventListener('mouseover', window.__GHOST_LISTEN);
            }
        });
    });

    safeListen('btn-speedrun', 'click', async () => {
        const tab = await getActiveTab();
        if (!tab || tab.restricted) { alert("Cannot run on restricted pages."); return; }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const id = 'vault-speedrun-timer';
                if (document.getElementById(id)) {
                    document.getElementById(id).remove();
                    clearInterval(window.__SPEEDRUN_INT);
                    return;
                }
                const timer = document.createElement('div');
                timer.id = id;
                timer.style = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(0,0,0,0.9); color:#facc15; padding:40px; border-radius:100px; z-index:1000000; font-family:monospace; font-size:48px; border:4px solid #facc15; pointer-events:none; box-shadow: 0 0 50px rgba(250,204,21,0.5); text-align:center;';
                timer.innerHTML = '00.000<div style="font-size:12px; margin-top:10px;">LIGHTHOUSE SPEEDRUN</div>';
                document.body.appendChild(timer);

                const start = performance.now();
                window.__SPEEDRUN_INT = setInterval(() => {
                    const diff = (performance.now() - start) / 1000;
                    timer.innerHTML = `${diff.toFixed(3)}<div style="font-size:12px; margin-top:10px;">LIGHTHOUSE SPEEDRUN</div>`;
                }, 10);
            }
        });
    });

    // ── Boot ──────────────────────────────────────────────────────────────
    renderExtensions();
    renderErrors();
    renderSentinelErrors();
    
    setInterval(() => {
        renderErrors();
        renderSentinelErrors();
        renderExtensions();
    }, 15000);
});
