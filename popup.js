document.addEventListener('DOMContentLoaded', () => {
    // ── Navigation ────────────────────────────────────────────────────────
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            navButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${target}`).classList.add('active');

            if (target === 'extensions') renderExtensions();
            if (target === 'system') renderLogs();
            if (target === 'agent') renderAgentLogs();
            if (target === 'network') renderNetworkLog();
            if (target === 'forensics') renderForensics();
        });
    });

    renderAgentLogs();

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
                showToast("Restricted Page: Tools cannot run on system internal pages.", 'error');
                return;
            }
            return await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: func,
                args: args
            });
        } catch (err) {
            console.error("Execution Error:", err);
        }
    }

    function safeListen(id, event, callback) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, callback);
    }

    function showToast(msg, type = 'info') {
        // We'll use a clean console log for now, but in a real app we'd have a UI toast
        console.log(`[${type.toUpperCase()}] ${msg}`);
        // Optionally alert for high priority items
        if (type === 'error' || type === 'success') {
            // alert(msg);
        }
    }

    // ── Domain Context ───────────────────────────────────────────────────
    getActiveTab().then(tab => {
        const domainEl = document.getElementById('current-domain');
        if (tab?.url) {
            try {
                const url = new URL(tab.url);
                domainEl.textContent = url.hostname;
                domainEl.style.color = '#58a6ff';
            } catch(e) {
                domainEl.textContent = 'RESTRICTED HOST';
            }
        }
    });

    // ── INTELLIGENCE: Snapshots & Audits ─────────────────────────────────
    
    // AI Context Capture
    safeListen('btn-capture-ai', 'click', () => {
        getActiveTab().then(tab => {
            if (tab.restricted) return;
            chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw: false, tabId: tab.id }, (res) => {
                if (res?.success) alert("AI Context Capture copied to clipboard!");
            });
        });
    });

    // Raw Environment Dump
    safeListen('btn-export-raw', 'click', () => {
        getActiveTab().then(tab => {
            if (tab.restricted) return;
            chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw: true, tabId: tab.id }, (res) => {
                if (res?.success) alert("Raw Environment Dump copied to clipboard!");
            });
        });
    });

    // Metadata Inspector (X-Ray)
    safeListen('btn-inspect-metadata', 'click', () => {
        safeExecute(() => {
            if (window.__TOOLBOX_XRAY_ACTIVE) {
                window.__TOOLBOX_XRAY_ACTIVE = false;
                document.getElementById('toolbox-xray-box')?.remove();
                return;
            }
            window.__TOOLBOX_XRAY_ACTIVE = true;
            const box = document.createElement('div');
            box.id = 'toolbox-xray-box';
            box.style = 'position:fixed; bottom:20px; right:20px; background:rgba(1,4,9,0.9); color:#79c0ff; padding:15px; border-radius:8px; z-index:100000; font-family:monospace; font-size:11px; border:1px solid #30363d; pointer-events:none; max-width:320px; white-space:pre-wrap; box-shadow: 0 10px 30px rgba(0,0,0,0.5);';
            document.body.appendChild(box);

            document.addEventListener('mouseover', (e) => {
                if (!window.__TOOLBOX_XRAY_ACTIVE) return;
                const el = e.target;
                const data = {
                    tag: el.tagName,
                    id: el.id,
                    classes: el.className,
                    aria: Array.from(el.attributes).filter(a => a.name.startsWith('aria-')).map(a => `${a.name}=${a.value}`),
                    size: `${el.offsetWidth}x${el.offsetHeight}`
                };
                box.innerText = `[METADATA INSPECTOR]\n\nTAG: ${data.tag}\nID: ${data.id || 'N/A'}\nCLASSES: ${data.classes || 'N/A'}\nSIZE: ${data.size}\n\nARIA:\n${data.aria.join('\n') || 'None'}`;
            });
        });
    });

    // State Scanner (JSON Hunter)
    safeListen('btn-scan-state', 'click', () => {
        safeExecute(() => {
            const data = Array.from(document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]'))
                .map(s => {
                    try { return JSON.parse(s.textContent); } catch(e) { return s.textContent; }
                });
            console.log('%c [STATE SCANNER] Found Data Blobs: ', 'background:#d29922; color:white; font-weight:bold;', data);
            alert(`Detected ${data.length} Application State Blobs. Check Console.`);
        });
    });

    // PageSpeed Report
    safeListen('btn-pagespeed', 'click', async () => {
        const tab = await getActiveTab();
        if (tab?.url) window.open(`https://pagespeed.web.dev/report?url=${encodeURIComponent(tab.url)}`, '_blank');
    });

    // Stack Deep-Dive (Wappalyzer)
    safeListen('btn-stack-dive', 'click', () => {
        safeExecute(() => {
            const stack = [];
            if (window.React || document.querySelector('[data-reactroot]')) stack.push('React');
            if (window.next || window.__NEXT_DATA__) stack.push('Next.js');
            if (window.jQuery) stack.push('jQuery');
            if (window.Vue || document.querySelector('[data-v-root]')) stack.push('Vue.js');
            if (window.Angular || document.querySelector('[ng-version]')) stack.push('Angular');
            if (document.querySelector('script[src*="tailwind"]')) stack.push('Tailwind');
            alert(`Technology Stack Analysis: ${stack.join(', ') || 'Vanilla / Proprietary'}`);
        });
    });

    // AI Architecture Roast
    safeListen('btn-audit-arch', 'click', () => {
        safeExecute(() => {
            const divCount = document.querySelectorAll('div').length;
            const styleCount = document.querySelectorAll('style').length;
            const roasts = [];
            if (divCount > 1500) roasts.push(`Div overload detected (${divCount}). This DOM tree is a nightmare.`);
            if (styleCount > 30) roasts.push(`${styleCount} inline styles? Your architecture is basically held together by duct tape.`);
            if (window.jQuery) roasts.push("jQuery detected. Legacy debt is real.");
            if (document.querySelectorAll('[style*="important"]').length > 20) roasts.push("Overuse of !important detected. You are fighting yourself.");
            
            if (roasts.length === 0) {
                alert("AI Architecture Audit: No critical inefficiencies found. Professional build.");
            } else {
                alert("🔥 ARCHITECTURE ROAST 🔥\n\n" + roasts.join("\n\n"));
            }
        });
    });

    // Contrast Audit
    safeListen('btn-audit-contrast', 'click', () => {
        safeExecute(() => {
            const bad = [];
            document.querySelectorAll('*').forEach(el => {
                const s = getComputedStyle(el);
                if (s.color === s.backgroundColor && s.color !== 'rgba(0, 0, 0, 0)') bad.push(el);
            });
            alert(`Contrast Audit complete. Found ${bad.length} potential visibility issues.`);
        });
    });

    // ── NETWORK: Interceptors ────────────────────────────────────────────
    
    // Network Monitor (Fetch/XHR)
    safeListen('btn-hook-network', 'click', () => {
        safeExecute(() => {
            if (window.__NETWORK_HOOK_ACTIVE) {
                alert("Network Monitor is already active. Check Console.");
                return;
            }
            window.__NETWORK_HOOK_ACTIVE = true;
            const originalFetch = window.fetch;
            window.fetch = function() {
                console.log('%c [FETCH] ', 'background:#238636; color:white;', arguments[0]);
                return originalFetch.apply(this, arguments);
            };
            alert("Network Monitor Active. Capturing all Fetch/XHR requests to console.");
        });
    });

    // WebSocket Sniffer
    safeListen('btn-hook-ws', 'click', () => {
        safeExecute(() => {
            if (window.__WS_HOOK_ACTIVE) return alert("WS Sniffer already active.");
            window.__WS_HOOK_ACTIVE = true;
            const OriginalWS = window.WebSocket;
            window.WebSocket = function(url, protocols) {
                const ws = new OriginalWS(url, protocols);
                console.log('%c [WS CONNECT] ', 'background:#8b5cf6; color:white;', url);
                ws.addEventListener('message', (e) => console.log('%c [WS MESSAGE] ', 'background:#8b5cf6; color:white;', e.data));
                return ws;
            };
            alert("WebSocket Sniffer Enabled.");
        });
    });

    // Latency Delay (2s)
    safeListen('btn-toggle-latency', 'click', () => {
        safeExecute(() => {
            if (window.__LATENCY_HOOK_ACTIVE) {
                window.__LATENCY_HOOK_ACTIVE = false;
                alert("Latency Simulation Disabled.");
                return;
            }
            window.__LATENCY_HOOK_ACTIVE = true;
            const originalFetch = window.fetch;
            window.fetch = async function() {
                await new Promise(r => setTimeout(r, 2000));
                return originalFetch.apply(this, arguments);
            };
            alert("2-Second Network Latency Enabled.");
        });
    });

    // Console Overlay
    safeListen('btn-console-overlay', 'click', () => {
        safeExecute(() => {
            const id = 'toolbox-console-overlay';
            if (document.getElementById(id)) return;
            const overlay = document.createElement('div');
            overlay.id = id;
            overlay.style = 'position:fixed; bottom:10px; left:10px; width:360px; height:200px; background:rgba(1,4,9,0.95); color:#79c0ff; font-family:monospace; font-size:11px; padding:12px; border-radius:10px; z-index:100000; overflow-y:auto; border:1px solid #30363d; backdrop-filter:blur(10px); box-shadow: 0 10px 40px rgba(0,0,0,0.6);';
            overlay.innerHTML = '<div style="color:#8b949e; border-bottom:1px solid #30363d; margin-bottom:8px; padding-bottom:4px; font-weight:bold;">ENTERPRISE CONSOLE OVERLAY</div>';
            document.body.appendChild(overlay);

            const log = console.log;
            console.log = (...args) => {
                log(...args);
                const line = document.createElement('div');
                line.style.marginBottom = '4px';
                line.innerHTML = `<span style="color:#238636;">></span> ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
                overlay.appendChild(line);
                overlay.scrollTop = overlay.scrollHeight;
            };
        });
    });

    // ── DESIGN: Extractions & Editors ────────────────────────────────────
    
    // Component Extractor
    safeListen('btn-extract-component', 'click', () => {
        safeExecute(() => {
            alert("Component Extraction Ready. Click any element to replicate with full aesthetics.");
            const handler = (e) => {
                e.preventDefault(); e.stopPropagation();
                const el = e.target;
                const style = window.getComputedStyle(el);
                const aesthetics = {
                    color: style.color,
                    background: style.backgroundColor,
                    padding: style.padding,
                    margin: style.margin,
                    font: style.fontFamily,
                    shadow: style.boxShadow,
                    radius: style.borderRadius
                };

                const componentName = (el.id || el.className?.split(' ')[0] || 'ExtractedComponent').replace(/[^a-zA-Z]/g, '');
                const capitalized = componentName.charAt(0).toUpperCase() + componentName.slice(1);
                
                const code = `import React from 'react';\n\n// Aesthetic Metadata: ${JSON.stringify(aesthetics)}\nexport const ${capitalized} = () => {\n  return (\n    <div style={{ \n      color: '${aesthetics.color}', \n      backgroundColor: '${aesthetics.background}',\n      padding: '${aesthetics.padding}',\n      borderRadius: '${aesthetics.radius}',\n      boxShadow: '${aesthetics.shadow}',\n      fontFamily: '${aesthetics.font}'\n    }} dangerouslySetInnerHTML={{ __html: \`${el.innerHTML.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }} />\n  );\n};`;
                
                const tmp = document.createElement('textarea');
                tmp.value = code; document.body.appendChild(tmp);
                tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
                alert(`Professional React Component <${capitalized} /> with captured aesthetics copied to clipboard!`);
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
        });
    });

    // Vault Migration (Import/Export)
    safeListen('btn-export-vault', 'click', () => {
        chrome.storage.local.get(null, (data) => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vault-state-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            showToast("Vault UI state exported successfully.", 'success');
        });
    });

    safeListen('btn-import-vault', 'click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    chrome.storage.local.set(data, () => {
                        alert("Vault UI State Imported! Reloading...");
                        location.reload();
                    });
                } catch (err) {
                    showToast("Invalid vault state file.", 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    // CSS Token Exporter
    safeListen('btn-export-tokens', 'click', () => {
        safeExecute(() => {
            const tokens = {};
            for (let i = 0; i < document.styleSheets.length; i++) {
                try {
                    const rules = document.styleSheets[i].cssRules;
                    for (let j = 0; j < rules.length; j++) {
                        if (rules[j].style) {
                            for (let k = 0; k < rules[j].style.length; k++) {
                                const name = rules[j].style[k];
                                if (name.startsWith('--')) tokens[name] = rules[j].style.getPropertyValue(name).trim();
                            }
                        }
                    }
                } catch(e) {}
            }
            const blob = new Blob([JSON.stringify(tokens, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'design-tokens.json'; a.click();
            alert(`Exported ${Object.keys(tokens).length} Design Tokens as JSON.`);
        });
    });

    // CSS Variable Editor
    safeListen('btn-var-editor', 'click', () => {
        safeExecute(() => {
            const id = 'toolbox-var-editor';
            if (document.getElementById(id)) return document.getElementById(id).remove();
            
            const tokens = [];
            for (let i = 0; i < document.styleSheets.length; i++) {
                try {
                    const rules = document.styleSheets[i].cssRules;
                    for (let j = 0; j < rules.length; j++) {
                        if (rules[j].style) {
                            for (let k = 0; k < rules[j].style.length; k++) {
                                const name = rules[j].style[k];
                                if (name.startsWith('--')) tokens.push(name);
                            }
                        }
                    }
                } catch(e) {}
            }
            const unique = [...new Set(tokens)].slice(0, 40);
            
            const panel = document.createElement('div');
            panel.id = id;
            panel.style = 'position:fixed; top:20px; right:20px; width:280px; max-height:450px; background:#161b22; color:#c9d1d9; padding:16px; border-radius:10px; z-index:100000; border:1px solid #30363d; overflow-y:auto; box-shadow: 0 10px 40px rgba(0,0,0,0.5);';
            panel.innerHTML = '<div style="font-weight:700; font-size:12px; margin-bottom:12px; color:#f0f6fc; display:flex; justify-content:space-between;"><span>TOKEN EDITOR</span><span style="cursor:pointer;" onclick="this.parentElement.parentElement.remove()">×</span></div>';
            
            unique.forEach(v => {
                const row = document.createElement('div');
                row.style.marginBottom = '10px';
                const val = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
                row.innerHTML = `<label style="display:block; font-size:10px; color:#8b949e; margin-bottom:4px; word-break:break-all;">${v}</label><input type="text" value="${val}" style="width:100%; background:#0d1117; color:#c9d1d9; border:1px solid #30363d; padding:6px; border-radius:4px; font-family:monospace; font-size:11px;">`;
                row.querySelector('input').oninput = (e) => document.documentElement.style.setProperty(v, e.target.value);
                panel.appendChild(row);
            });
            document.body.appendChild(panel);
        });
    });

    // Shadow DOM Inspector
    safeListen('btn-shadow-pierce', 'click', () => {
        safeExecute(() => {
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
                const overlay = document.createElement('div');
                overlay.style = 'border:2px dashed #d29922; padding:10px; margin:5px; position:relative; min-height:20px;';
                overlay.innerHTML = `<div style="position:absolute; top:-10px; right:10px; background:#d29922; color:black; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:bold;">SHADOW DOM BOUNDARY</div>`;
                sr.prepend(overlay);
            });
            alert(`Pierced and Highlighted ${roots.length} Shadow DOM boundaries.`);
        });
    });

    // Pause/Toggle Pick Mode
    safeListen('btn-toggle-pick', 'click', () => {
        chrome.runtime.sendMessage({ action: 'TOGGLE_PICK_MODE' });
    });

    // Live Text Edit (Design Mode)
    safeListen('btn-live-edit', 'click', () => {
        safeExecute(() => {
            document.designMode = document.designMode === 'on' ? 'off' : 'on';
            return `Design Mode: ${document.designMode.toUpperCase()}`;
        }).then(res => {
            if (res?.[0]?.result) showToast(res[0].result, 'success');
        });
    });

    // Asset DNA Sniffer
    safeListen('btn-asset-sniffer', 'click', () => {
        const btn = document.getElementById('btn-scan-resources');
        if (btn) {
            const navBtn = document.querySelector('[data-tab="resources"]');
            if (navBtn) navBtn.click();
            btn.click();
        }
    });

    // Playwright Vibe Recorder
    safeListen('btn-toggle-macro', 'click', () => {
        chrome.runtime.sendMessage({ action: 'PERFORM_MACRO' });
        window.close(); // Close popup to allow interaction
    });

    // Toggle 12-Col Grid
    safeListen('btn-toggle-grid', 'click', () => {
        safeExecute(() => {
            const id = 'toolbox-layout-grid';
            let g = document.getElementById(id);
            if (g) g.remove();
            else {
                g = document.createElement('div'); g.id = id;
                g.style = 'position:fixed; top:0; left:50%; transform:translateX(-50%); width:100%; max-width:1200px; height:100vh; display:grid; grid-template-columns:repeat(12, 1fr); gap:20px; pointer-events:none; z-index:99999;';
                for(let i=0; i<12; i++) { const col = document.createElement('div'); col.style = 'background:rgba(59,130,246,0.05); border-left:1px solid rgba(59,130,246,0.1); border-right:1px solid rgba(59,130,246,0.1)'; g.appendChild(col); }
                document.body.appendChild(g);
            }
        });
    });

    // ── RESOURCES: Inventory Table ───────────────────────────────────────
    safeListen('btn-scan-resources', 'click', () => {
        safeExecute(() => {
            const inventory = [];
            document.querySelectorAll('script[src]').forEach(s => inventory.push({ type: 'Script', src: s.src }));
            document.querySelectorAll('link[rel="stylesheet"]').forEach(l => inventory.push({ type: 'Style', src: l.href }));
            document.querySelectorAll('img[src]').forEach(i => inventory.push({ type: 'Image', src: i.src }));
            return inventory;
        }).then(results => {
            const list = results?.[0]?.result || [];
            const container = document.getElementById('resource-list');
            if (list.length === 0) {
                container.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">No external resources found.</td></tr>';
                return;
            }
            container.innerHTML = list.map(item => `
                <tr>
                    <td><span class="badge" style="background:rgba(59,130,246,0.1); color:#58a6ff; border:1px solid #58a6ff;">${item.type}</span></td>
                    <td class="truncate mono">${new URL(item.src).pathname.split('/').pop() || item.src}</td>
                    <td class="truncate" style="color:var(--text-muted); font-size:0.6rem;">${item.src}</td>
                </tr>
            `).join('');
        });
    });

    // ── EXTENSIONS ────────────────────────────────────────────────────────
    let searchFilter = '';
    let sortType = 'name';

    function renderExtensions() {
        const unpackedList = document.getElementById('ext-list-unpacked');
        const storeList = document.getElementById('ext-list-store');
        if (!unpackedList || !storeList) return;

        chrome.management.getAll((extensions) => {
            const list = extensions.filter(e => e.id !== chrome.runtime.id);
            let filtered = list.filter(e => e.name.toLowerCase().includes(searchFilter.toLowerCase()) || e.id.includes(searchFilter));
            
            // Apply Sorting
            filtered.sort((a, b) => {
                if (sortType === 'name') return a.name.localeCompare(b.name);
                if (sortType === 'status') return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
                if (sortType === 'type') return a.installType.localeCompare(b.installType);
                return 0;
            });

            const unpacked = filtered.filter(e => e.installType === 'development');
            const store = filtered.filter(e => e.installType !== 'development');

            chrome.storage.local.get(['ext_notes'], (res) => {
                const extNotes = res.ext_notes || {};
                
                const renderCard = (ext) => {
                    const note = extNotes[ext.id] || '';
                    return `
                        <div class="card" style="padding: 10px; flex-direction: column; border-color: ${ext.enabled ? 'var(--border)' : 'rgba(239, 68, 68, 0.2)'};">
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px;">
                                <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                                    <img src="${ext.icons?.[0]?.url || 'icon.png'}" style="width:24px; height:24px; border-radius:4px; opacity: ${ext.enabled ? 1 : 0.5};">
                                    <div style="min-width:0;">
                                        <div class="card-title truncate" style="font-size:0.75rem; color: ${ext.enabled ? 'var(--text-header)' : 'var(--text-muted)'};">${ext.name}</div>
                                        <div class="mono" style="font-size:0.5rem; opacity:0.5;">${ext.id}</div>
                                    </div>
                                </div>
                                <div style="display:flex; gap:6px;">
                                    <button class="btn" style="width:auto; padding:2px 6px; font-size:0.6rem; border-color:${ext.enabled ? 'var(--emerald)' : 'var(--border)'}; color: ${ext.enabled ? 'var(--emerald)' : 'var(--text-muted)'};" id="toggle-${ext.id}">
                                        ${ext.enabled ? 'ON' : 'OFF'}
                                    </button>
                                    <button class="btn" style="width:auto; padding:2px 6px; font-size:0.6rem;" id="rip-${ext.id}" title="Rip Blueprint">🧬</button>
                                </div>
                            </div>
                            
                            <div id="note-container-${ext.id}" style="display: ${note ? 'block' : 'none'}; margin-bottom: 8px;">
                                <textarea id="note-input-${ext.id}" placeholder="Issues or notes for this tool..." style="width:100%; height:40px; background:var(--bg); border:1px solid var(--border); color:var(--text); font-size:0.65rem; padding:4px; border-radius:4px; resize:none;">${note}</textarea>
                            </div>
                            
                            <div style="display:flex; gap:6px; justify-content: flex-end;">
                                <button class="btn" style="width:auto; padding:2px 8px; font-size:0.6rem;" id="btn-note-${ext.id}">${note ? 'EDIT NOTE' : '+ NOTE'}</button>
                                ${ext.installType === 'development' ? `
                                    <button class="btn" style="width:auto; padding:2px 8px; font-size:0.6rem;" id="reload-${ext.id}">RELOAD</button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                };

                unpackedList.innerHTML = unpacked.map(ext => renderCard(ext)).join('') || '<div style="font-size:0.7rem; color:var(--text-muted); text-align:center;">No development extensions.</div>';
                storeList.innerHTML = store.map(ext => renderCard(ext)).join('') || '<div style="font-size:0.7rem; color:var(--text-muted); text-align:center;">No store extensions.</div>';

                [...unpacked, ...store].forEach(ext => {
                    // Toggle
                    document.getElementById(`toggle-${ext.id}`)?.addEventListener('click', () => {
                        chrome.management.setEnabled(ext.id, !ext.enabled, () => renderExtensions());
                    });
                    
                    // Note Toggle
                    document.getElementById(`btn-note-${ext.id}`)?.addEventListener('click', () => {
                        const container = document.getElementById(`note-container-${ext.id}`);
                        container.style.display = container.style.display === 'none' ? 'block' : 'none';
                    });
                    
                    // Note Save (on blur)
                    document.getElementById(`note-input-${ext.id}`)?.addEventListener('blur', (e) => {
                        const val = e.target.value.trim();
                        chrome.storage.local.get(['ext_notes'], (res) => {
                            const notes = res.ext_notes || {};
                            if (val) notes[ext.id] = val;
                            else delete notes[ext.id];
                            chrome.storage.local.set({ ext_notes: notes });
                        });
                    });

                    // Rip Blueprint
                    document.getElementById(`rip-${ext.id}`)?.addEventListener('click', () => {
                        chrome.commands.getAll((cmds) => {
                            const blueprint = {
                                metadata: {
                                    name: ext.name,
                                    shortName: ext.shortName,
                                    description: ext.description,
                                    version: ext.version,
                                    type: ext.installType,
                                    id: ext.id,
                                    enabled: ext.enabled,
                                    homepage: ext.homepageUrl,
                                    icons: ext.icons
                                },
                                architecture: {
                                    permissions: ext.permissions,
                                    hostPermissions: ext.hostPermissions,
                                    contentScripts: ext.contentScripts || 'Dynamic/Hidden',
                                    commands: cmds.filter(c => c.name !== '_execute_action'),
                                    offlineEnabled: ext.offlineEnabled,
                                    updateUrl: ext.updateUrl
                                },
                                blueprint_type: "Extension Replication Manifest (Deep Rip)",
                                extraction_date: new Date().toISOString()
                            };
                            const tmp = document.createElement('textarea');
                            tmp.value = JSON.stringify(blueprint, null, 2);
                            document.body.appendChild(tmp);
                            tmp.select();
                            document.execCommand('copy');
                            document.body.removeChild(tmp);
                            alert('Deep Extension Blueprint copied! (Manifest + Commands)');
                        });
                    });

                    if (ext.installType === 'development') {
                        document.getElementById(`reload-${ext.id}`)?.addEventListener('click', () => {
                            chrome.runtime.sendMessage({ action: 'RELOAD_EXT_AND_TAB', id: ext.id });
                        });
                    }
                });
            });
        });
    }

    safeListen('ext-search', 'input', (e) => {
        searchFilter = e.target.value;
        renderExtensions();
    });

    safeListen('ext-sort', 'change', (e) => {
        sortType = e.target.value;
        renderExtensions();
    });

    // ── EXPERIMENTAL: Vibe & Chaos ───────────────────────────────────────
    
    // Neon Interface Profile (Cyber Vibe)
    safeListen('btn-neon-profile', 'click', () => {
        safeExecute(() => {
            const id = 'toolbox-neon-profile';
            if (document.getElementById(id)) return document.getElementById(id).remove();
            const style = document.createElement('style');
            style.id = id;
            style.innerHTML = `* { border-color: #ff00ff !important; text-shadow: 0 0 5px #00ffff !important; } body { background: #050505 !important; color: #00ffff !important; }`;
            document.head.appendChild(style);
        });
    });

    // CRT Display Simulation (Vibe Mode)
    safeListen('btn-crt-sim', 'click', () => {
        safeExecute(() => {
            const id = 'toolbox-crt-simulation';
            if (document.getElementById(id)) return document.getElementById(id).remove();
            const style = document.createElement('style');
            style.id = id;
            style.innerHTML = `body::after { content:" "; position:fixed; top:0; left:0; width:100%; height:100%; background:linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.1) 50%), linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06)); background-size:100% 2px, 2px 100%; pointer-events:none; z-index:1000000; }`;
            document.head.appendChild(style);
        });
    });

    // Physics Engine (Gravity)
    safeListen('btn-gravity', 'click', () => {
        safeExecute(() => {
            document.querySelectorAll('div, p, h1, h2, h3, button, img').forEach(el => {
                el.style.transition = 'transform 2s cubic-bezier(0.47, 0, 0.745, 0.715)';
                el.style.transform = `translateY(${window.innerHeight}px) rotate(${Math.random() * 20 - 10}deg)`;
            });
        });
    });

    // Layout Stability Pulse (Mutation Pulse)
    safeListen('btn-mutation-pulse', 'click', () => {
        safeExecute(() => {
            if (window.__TOOLBOX_PULSE_ACTIVE) {
                window.__TOOLBOX_PULSE_ACTIVE = false;
                window.__TOOLBOX_OBSERVER?.disconnect();
                return alert("Mutation Pulse Disabled.");
            }
            window.__TOOLBOX_PULSE_ACTIVE = true;
            window.__TOOLBOX_OBSERVER = new MutationObserver((mutations) => {
                mutations.forEach(m => {
                    const el = m.target;
                    if (el.style) {
                        const original = el.style.boxShadow;
                        el.style.boxShadow = '0 0 10px #3b82f6';
                        setTimeout(() => el.style.boxShadow = original, 500);
                    }
                });
            });
            window.__TOOLBOX_OBSERVER.observe(document.body, { attributes: true, childList: true, subtree: true });
            alert("Mutation Pulse Active. DOM changes will flash blue.");
        });
    });

    // Style Randomizer (CSS Roulette)
    safeListen('btn-style-roulette', 'click', () => {
        safeExecute(() => {
            const root = document.documentElement;
            const variables = [];
            for (let i = 0; i < document.styleSheets.length; i++) {
                try {
                    const rules = document.styleSheets[i].cssRules;
                    for (let j = 0; j < rules.length; j++) {
                        if (rules[j].style) {
                            for (let k = 0; k < rules[j].style.length; k++) {
                                const name = rules[j].style[k];
                                if (name.startsWith('--')) variables.push(name);
                            }
                        }
                    }
                } catch(e) {}
            }
            const unique = [...new Set(variables)];
            unique.forEach(v => root.style.setProperty(v, `hsl(${Math.random() * 360}, 70%, 50%)`));
            alert(`Chaos! Shuffled ${unique.length} variables.`);
        });
    });

    // UI Spotlight
    safeListen('btn-spotlight', 'click', () => {
        safeExecute(() => {
            const id = 'toolbox-spotlight';
            if (document.getElementById(id)) return document.getElementById(id).remove();
            const overlay = document.createElement('div');
            overlay.id = id;
            overlay.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:1000000; pointer-events:none; mask-image:radial-gradient(circle 150px at 50% 50%, transparent 100%, black 100%); -webkit-mask-image:radial-gradient(circle 150px at 50% 50%, transparent 0%, black 100%);';
            document.body.appendChild(overlay);
            document.addEventListener('mousemove', (e) => {
                overlay.style.webkitMaskImage = `radial-gradient(circle 150px at ${e.clientX}px ${e.clientY}px, transparent 0%, black 100%)`;
            });
        });
    });

    // Element Isolation (Ghost)
    safeListen('btn-isolation', 'click', () => {
        safeExecute(() => {
            alert("Isolation Mode: Click an element to isolate it (dim everything else).");
            const handler = (e) => {
                e.preventDefault(); e.stopPropagation();
                const el = e.target;
                document.querySelectorAll('*').forEach(node => {
                    if (node !== el && !el.contains(node)) node.style.opacity = '0.1';
                });
                el.style.opacity = '1';
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
        });
    });

    // Performance Stress Timer (Speedrun)
    safeListen('btn-speedrun', 'click', () => {
        safeExecute(() => {
            const start = performance.now();
            const id = 'toolbox-speedrun-overlay';
            if (document.getElementById(id)) document.getElementById(id).remove();
            const overlay = document.createElement('div');
            overlay.id = id;
            overlay.style = 'position:fixed; top:10px; left:50%; transform:translateX(-50%); background:#2ea043; color:white; padding:5px 15px; border-radius:20px; z-index:1000000; font-family:monospace; font-weight:bold;';
            document.body.appendChild(overlay);
            const tick = () => {
                overlay.innerText = `RENDER TIME: ${(performance.now() - start).toFixed(2)}ms`;
                requestAnimationFrame(tick);
            };
            tick();
        });
    });

    // Structure Replicator (UI Cloner)
    safeListen('btn-ui-cloner', 'click', () => {
        safeExecute(() => {
            alert("UI Cloner: Click an element to clone its structure and styles.");
            const handler = (e) => {
                e.preventDefault(); e.stopPropagation();
                const el = e.target;
                const clone = el.cloneNode(true);
                const style = window.getComputedStyle(el);
                Array.from(style).forEach(key => clone.style.setProperty(key, style.getPropertyValue(key), style.getPropertyPriority(key)));
                console.log("Cloned Element:", clone);
                alert("Element structure and computed styles cloned to console.");
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
        });
    });

    // Action Flow Recorder (Vibe Recorder)
    safeListen('btn-flow-recorder', 'click', () => {
        getActiveTab().then(tab => {
            chrome.runtime.sendMessage({ action: 'PERFORM_MACRO', tabId: tab.id });
            alert("Action Flow Recorder Active. Interactions are being captured.");
        });
    });

    // Cross-Browser Hub
    safeListen('btn-convert-ff', 'click', () => {
        chrome.storage.local.get(null, () => {
            const ffManifest = {
                "manifest_version": 3,
                "name": "Webdev Toolbox (Nexus)",
                "version": "2.1.0",
                "browser_specific_settings": {
                    "gecko": { "id": "webdev-toolbox@paranjay.dev" }
                },
                "permissions": ["management", "tabs", "activeTab", "scripting", "storage", "notifications", "contextMenus", "webRequest"],
                "host_permissions": ["<all_urls>"],
                "background": { "scripts": ["background.js"] },
                "action": { "default_popup": "popup.html" }
            };
            const tmp = document.createElement('textarea');
            tmp.value = JSON.stringify(ffManifest, null, 2);
            document.body.appendChild(tmp);
            tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
            alert("Firefox-compatible manifest copied! Replace manifest.json with this to port.");
        });
    });

    safeListen('btn-universal-poly', 'click', () => {
        const poly = `const browser = typeof chrome !== "undefined" ? chrome : window.browser;\n// Use 'browser' instead of 'chrome' globally for cross-platform support.`;
        const tmp = document.createElement('textarea');
        tmp.value = poly; document.body.appendChild(tmp);
        tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
        alert("Universal Polyfill copied! Paste at the top of your background/popup scripts.");
    });

    // ── SYSTEM: Health & Logs ────────────────────────────────────────────
    function renderLogs() {
        const consoleEl = document.getElementById('error-console');
        getActiveTab().then(tab => {
            if (!tab || tab.restricted) return;
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => window.__DEV_VAULT_ERRORS || []
            }, (res) => {
                const logs = res?.[0]?.result || [];
                if (logs.length === 0) {
                    consoleEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">No system errors detected.</div>';
                } else {
                    consoleEl.innerHTML = logs.map(l => `<div class="log-item log-error">${l}</div>`).join('');
                }
            });
        });
    }

    safeListen('btn-refresh-logs', 'click', renderLogs);
    safeListen('btn-clear-logs', 'click', () => {
        safeExecute(() => window.__DEV_VAULT_ERRORS = []);
        renderLogs();
    });

    safeListen('btn-open-dashboard', 'click', () => chrome.tabs.create({ url: 'dashboard.html' }));
    
    safeListen('btn-wipe-site', 'click', () => {
        if (confirm("Wipe all local storage, session data, and cookies for this domain?")) {
            safeExecute(() => {
                localStorage.clear(); sessionStorage.clear();
                document.cookie.split(";").forEach(c => {
                    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                });
                location.reload();
            });
        }
    });

    safeListen('btn-generate-blueprint', 'click', () => {
        getActiveTab().then(tab => {
            if (tab.restricted) return;
            showToast("Synthesizing Master Blueprint...", 'info');
            chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw: false, tabId: tab.id }, (res) => {
                if (res?.success) {
                    const dom = res.snapshot;
                    // Try to get tech stack too
                    safeExecute(() => {
                        const stack = [];
                        if (window.React) stack.push('React');
                        if (window.next) stack.push('Next.js');
                        if (window.vue) stack.push('Vue');
                        if (window.jQuery) stack.push('jQuery');
                        if (document.querySelector('meta[name="generator"]')) stack.push(document.querySelector('meta[name="generator"]').content);
                        return stack;
                    }).then(stackRes => {
                        const detectedStack = stackRes?.[0]?.result || [];
                        const masterBlueprint = `
# REPLICATION MASTER BLUEPRINT
**Target**: ${tab.url}
**Title**: ${tab.title}
**Detected Stack**: ${detectedStack.join(', ') || 'Vanilla/Unknown'}

## TASK
Replicate this interface and functionality exactly using the provided DOM structure. Ensure high-fidelity design, responsive layout, and interactive elements are preserved.

## DOM CONTEXT
${dom}

## NOTES
- Use modern ESM and clean CSS.
- Prioritize performance and accessibility.
- Implement all detected interactive patterns.
                        `;
                        navigator.clipboard.writeText(masterBlueprint);
                        alert("MASTER BLUEPRINT GENERATED!\nFull replication prompt copied to clipboard.");
                    });
                }
            });
        });
    });

    // ── AGENT INTEL: Query Logging ──────────────────────────────────────────
    function renderAgentLogs() {
        const logEl = document.getElementById('agent-logs');
        if (!logEl) return;
        
        chrome.storage.local.get(['dev_notes'], (data) => {
            const notes = data.dev_notes || [];
            if (notes.length === 0) {
                logEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">No issues or notes logged yet.</div>';
            } else {
                logEl.innerHTML = notes.map(n => `
                    <div class="log-item log-info" style="margin-bottom:8px; display:flex; flex-direction:column; gap:2px;">
                        <div style="font-size:0.55rem; opacity:0.6; display:flex; justify-content:space-between;">
                            <span>${new Date(n.timestamp).toLocaleString()}</span>
                            <span class="mono">${n.url ? new URL(n.url).hostname : 'N/A'}</span>
                        </div>
                        <div style="font-weight:600; font-size:0.75rem;">${n.content}</div>
                        ${n.title ? `<div style="font-size:0.6rem; opacity:0.5; font-style:italic;">"${n.title}"</div>` : ''}
                    </div>
                `).join('');
            }
        });
    }

    safeListen('btn-log-query', 'click', () => {
        const input = document.getElementById('agent-query-input');
        const content = input.value.trim();
        if (!content) return;

        getActiveTab().then(tab => {
            chrome.storage.local.get(['dev_notes'], (data) => {
                const notes = data.dev_notes || [];
                notes.unshift({
                    id: Date.now(),
                    content,
                    url: tab?.url || 'N/A',
                    title: tab?.title || 'N/A',
                    timestamp: new Date().toISOString()
                });
                chrome.storage.local.set({ dev_notes: notes.slice(0, 100) }, () => {
                    input.value = '';
                    renderAgentLogs();
                    showToast("Issue noted for resolution.", 'success');
                });
            });
        });
    });

    safeListen('btn-export-queries', 'click', () => {
        chrome.storage.local.get(['dev_notes'], (data) => {
            const blob = new Blob([JSON.stringify(data.dev_notes || [], null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dev-notes-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
        });
    });

    safeListen('btn-clear-queries', 'click', () => {
        if (confirm("Wipe all dev log history?")) {
            chrome.storage.local.set({ dev_notes: [] }, () => {
                renderAgentLogs();
                showToast("Dev logs cleared.", 'info');
            });
        }
    });

    // Box Model Debugger
    safeListen('btn-visual-debugger', 'click', () => {
        safeExecute(() => {
            const id = 'toolbox-visual-debugger';
            if (document.getElementById(id)) return document.getElementById(id).remove();
            const style = document.createElement('style');
            style.id = id;
            style.innerHTML = `* { outline: 1px solid rgba(255, 0, 0, 0.3) !important; outline-offset: -1px !important; }`;
            document.head.appendChild(style);
        });
    });

    // Color Palette Extractor
    safeListen('btn-color-palette', 'click', () => {
        safeExecute(() => {
            const colors = new Set();
            document.querySelectorAll('*').forEach(el => {
                const s = getComputedStyle(el);
                if (s.color) colors.add(s.color);
                if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') colors.add(s.backgroundColor);
            });
            const list = [...colors].slice(0, 50);
            console.log('%c [COLOR PALETTE] ', 'background:#3b82f6; color:white; font-weight:bold;', list);
            
            const overlay = document.createElement('div');
            overlay.style = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#161b22; padding:20px; border-radius:12px; z-index:1000000; border:1px solid #30363d; display:grid; grid-template-columns:repeat(5, 1fr); gap:10px; box-shadow:0 20px 50px rgba(0,0,0,0.8);';
            list.forEach(c => {
                const swatch = document.createElement('div');
                swatch.style = `width:40px; height:40px; background:${c}; border-radius:4px; border:1px solid #30363d; cursor:pointer;`;
                swatch.title = c;
                swatch.onclick = () => { navigator.clipboard.writeText(c); alert(`Copied: ${c}`); };
                overlay.appendChild(swatch);
            });
            const close = document.createElement('button');
            close.innerText = 'Close';
            close.style = 'grid-column:span 5; margin-top:10px; background:#3b82f6; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer;';
            close.onclick = () => overlay.remove();
            overlay.appendChild(close);
            document.body.appendChild(overlay);
        });
    });

    // Tab Solo
    safeListen('btn-tab-solo', 'click', () => {
        if (confirm("Close all other tabs in this window?")) {
            chrome.tabs.query({ currentWindow: true, active: false }, (tabs) => {
                const ids = tabs.map(t => t.id);
                chrome.tabs.remove(ids);
            });
        }
    });

    // Mock Form Filler
    safeListen('btn-auto-fill', 'click', () => {
        safeExecute(() => {
            const mocks = {
                email: 'tester@vault.dev',
                name: 'Vault User',
                phone: '+1 555-0199',
                address: '123 Enterprise Way, Silicon Valley',
                city: 'Palo Alto',
                zip: '94301'
            };
            document.querySelectorAll('input, textarea').forEach(el => {
                if (el.type === 'email') el.value = mocks.email;
                else if (el.type === 'tel') el.value = mocks.phone;
                else if (el.name?.includes('name') || el.id?.includes('name')) el.value = mocks.name;
                else if (el.name?.includes('addr') || el.id?.includes('addr')) el.value = mocks.address;
                else el.value = 'Mock Data';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            return 'Form fields populated with mock data.';
        }).then(res => {
            if (res?.[0]?.result) alert(res[0].result);
        });
    });

    // ── SNAPSHOT HISTORY ────────────────────────────────────────────────
    function renderSnapHistory() {
         const list = document.getElementById('snap-history-list');
         if (!list) return;
         chrome.storage.local.get(['snap_history'], (res) => {
             const history = res.snap_history || [];
             if (history.length === 0) {
                 list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:10px; font-size:0.75rem;">No snapshots in vault.</div>';
                 return;
             }
             list.innerHTML = history.slice(0, 4).map((snap, i) => `
                 <div class="snap-card" onclick="viewSnap(${i})">
                     <img src="${snap.metadata.screenshot || 'icon.png'}" class="snap-thumb">
                     <span class="snap-badge">${snap.metadata.type === 'Raw-DOM' ? 'RAW' : 'CLEAN'}</span>
                     <div class="snap-info">
                         <div class="snap-title">${snap.metadata.title || 'Untitled'}</div>
                         <div class="snap-meta">${new Date(snap.metadata.timestamp).toLocaleTimeString()}</div>
                     </div>
                 </div>
             `).join('');
         });
     }

     function renderForensics() {
         const container = document.getElementById('forensic-gallery');
         if (!container) return;

         chrome.storage.local.get(['snap_history'], (res) => {
             const history = res.snap_history || [];
             if (history.length === 0) {
                 container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:40px;">No forensic data available. Take a snapshot to begin.</div>';
                 return;
             }

             container.innerHTML = history.map((snap, i) => `
                 <div class="snap-card-large">
                     <img src="${snap.metadata.screenshot || ''}" class="snap-thumb-large" onerror="this.style.display='none'">
                     <div class="snap-content-large">
                         <div class="snap-header-large">
                             <div>
                                 <h3 style="font-size:1rem; color:var(--text-header);">${snap.metadata.title || 'Untitled Page'}</h3>
                                 <p style="font-size:0.7rem; color:var(--primary); margin-top:4px;">${snap.metadata.url}</p>
                             </div>
                             <span class="badge" style="background:var(--primary-glow); color:var(--primary); border-color:var(--primary);">${snap.metadata.type}</span>
                         </div>
                         
                         <div class="snap-details-large">
                             <div class="detail-item">
                                 <div class="detail-label">Captured</div>
                                 <div class="detail-value">${new Date(snap.metadata.timestamp).toLocaleString()}</div>
                             </div>
                             <div class="detail-item">
                                 <div class="detail-label">Tech Stack</div>
                                 <div class="detail-value">${snap.stack.join(', ') || 'Vanilla'}</div>
                             </div>
                             <div class="detail-item">
                                 <div class="detail-label">DOM Size</div>
                                 <div class="detail-value">${(snap.dom_content.length / 1024).toFixed(1)} KB</div>
                             </div>
                             <div class="detail-item">
                                 <div class="detail-label">Network</div>
                                 <div class="detail-value">${snap.metadata.network_vault?.length || 0} reqs captured</div>
                             </div>
                         </div>

                         <div style="display:flex; gap:8px; margin-top:8px;">
                             <button class="btn btn-primary" style="flex:1;" onclick="viewSnap(${i})">INSPECT</button>
                             <button class="btn" style="flex:1;" onclick="copySnap(${i})">COPY DATA</button>
                             <button class="btn" style="flex:1;" onclick="diffSnap(${i})">COMPARE</button>
                             <button class="btn btn-danger" style="width:auto; padding:8px 12px;" onclick="deleteSnap(${i})">🗑</button>
                         </div>
                     </div>
                 </div>
             `).join('');
         });
     }

     window.deleteSnap = (idx) => {
         if (!confirm('Delete this forensic record?')) return;
         chrome.storage.local.get(['snap_history'], (res) => {
             const history = res.snap_history || [];
             history.splice(idx, 1);
             chrome.storage.local.set({ snap_history: history }, () => {
                 renderSnapHistory();
                 renderForensics();
             });
         });
     };

     safeListen('btn-open-vault', 'click', () => {
         const navBtn = document.querySelector('[data-tab="forensics"]');
         if (navBtn) navBtn.click();
     });

    // Visual DOM Diff (Active Tab)
    safeListen('btn-visual-diff', 'click', () => {
        chrome.runtime.sendMessage({ action: 'visual_diff' });
    });

     window.viewSnap = (idx) => {
         chrome.storage.local.get(['snap_history'], (res) => {
             const snap = res.snap_history[idx];
             const overlay = document.createElement('div');
             overlay.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:100000; display:flex; align-items:center; justify-content:center; padding:20px;';
             overlay.innerHTML = `
                 <div style="background:var(--panel); border:1px solid var(--border); border-radius:16px; width:100%; max-height:100%; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.8);">
                     <div style="padding:16px; background:var(--panel-header); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                         <div style="font-weight:700; color:var(--text-header); font-size:0.9rem;">FORENSIC INSPECTOR</div>
                         <button class="btn" style="width:auto; padding:4px 10px;" id="close-inspector">CLOSE</button>
                     </div>
                     <div style="padding:20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:16px;">
                         <img src="${snap.metadata.screenshot || ''}" style="width:100%; border-radius:8px; border:1px solid var(--border);">
                         
                         <div class="section-title">Visual DNA (Palette & Type)</div>
                         <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                             ${snap.metadata.visual_dna?.palette?.map(c => `
                                 <div style="width:40px; height:40px; background:${c}; border-radius:8px; border:1px solid var(--border); position:relative;" title="${c}">
                                     <div style="position:absolute; bottom:-12px; left:0; width:100%; text-align:center; font-size:0.4rem; color:var(--text-muted);">${c}</div>
                                 </div>
                             `).join('') || 'No palette captured'}
                         </div>
                         <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:12px;">
                             ${snap.metadata.visual_dna?.typography?.map(f => `
                                 <span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-header); border-color:var(--border);">${f}</span>
                             `).join('') || 'No fonts captured'}
                         </div>

                         <div class="section-title">Telemetry & Context</div>
                         <pre style="font-family:'JetBrains Mono', monospace; font-size:0.65rem; background:#010409; padding:12px; border-radius:8px; border:1px solid var(--border); color:#79c0ff; white-space:pre-wrap;">${JSON.stringify(snap.metadata, (k,v) => (k === 'screenshot' || k === 'visual_dna') ? '[HIDDEN]' : v, 2)}</pre>
                         
                         <div class="section-title">Tech Stack</div>
                         <div style="display:flex; gap:8px;">${snap.stack.map(s => `<span class="badge" style="background:var(--primary-glow); color:var(--primary); border-color:var(--primary);">${s}</span>`).join('') || 'Vanilla'}</div>
                         
                         <div class="section-title">DOM Blueprint (${(snap.dom_content.length / 1024).toFixed(1)} KB)</div>
                         <pre style="font-family:'JetBrains Mono', monospace; font-size:0.6rem; background:#010409; padding:12px; border-radius:8px; border:1px solid var(--border); color:var(--text-muted); max-height:200px; overflow:auto;">${snap.dom_content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                     </div>
                 </div>
             `;
             document.body.appendChild(overlay);
             document.getElementById('close-inspector').onclick = () => overlay.remove();
         });
     };

    window.copySnap = (idx) => {
        chrome.storage.local.get(['snap_history'], (res) => {
            const snap = res.snap_history[idx];
            const tmp = document.createElement('textarea');
            tmp.value = JSON.stringify(snap, null, 2);
            document.body.appendChild(tmp);
            tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
            alert('Snapshot copied to clipboard!');
        });
    };

    window.diffSnap = (idx) => {
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = res.snap_history;
            if (history.length < 2) return alert('Need at least 2 snapshots to compare.');
            
            // Trigger the visual diff in the active tab using background service
            chrome.runtime.sendMessage({ action: 'visual_diff' });
            showToast("Visual Diff triggered on active tab. Switch to page to view.", 'info');
        });
    };

    safeListen('btn-clear-history', 'click', () => {
        if (confirm('Wipe all snapshots?')) {
            chrome.storage.local.set({ snap_history: [] }, renderSnapHistory);
        }
    });

    // ── NETWORK MONITOR: Forensics ───────────────────────────────────────
    function renderNetworkLog() {
        const consoleEl = document.getElementById('network-console');
        if (!consoleEl) return;

        chrome.runtime.sendMessage({ action: 'GET_TRAFFIC_BUFFER' }, (res) => {
            const buffer = res?.buffer || [];
            if (buffer.length === 0) {
                consoleEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">No traffic captured yet.</div>';
                return;
            }
            consoleEl.innerHTML = buffer.reverse().map(l => `
                <div class="log-item ${l.status >= 400 ? 'log-error' : 'log-info'}" style="margin-bottom:4px; padding:4px 8px; border-bottom: 1px solid var(--border);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                        <span style="font-weight:700; color:${l.status >= 400 ? 'var(--red)' : 'var(--emerald)'};">[${l.status || '???'}] ${l.type || 'REQ'}</span>
                        <span style="opacity:0.5; font-size:0.55rem;">${l.method} • ${l.time ? new Date(l.time).toLocaleTimeString() : 'NOW'}</span>
                    </div>
                    <div class="truncate mono" style="font-size:0.6rem; opacity:0.8;">${l.url}</div>
                </div>
            `).join('');
        });
    }

    safeListen('btn-refresh-network', 'click', renderNetworkLog);

    safeListen('btn-toggle-latency', 'click', () => {
        chrome.runtime.sendMessage({ action: 'TOGGLE_LATENCY' });
        showToast("Latency Simulator Toggled (2s delay).", 'info');
    });

    // Listen for real-time updates while popup is open
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'VAULT_TRAFFIC_LOG' || msg.fromBackground) {
            renderNetworkLog();
        }
    });

    // ── Boot ──────────────────────────────────────────────────────────────
    renderExtensions();
    renderAgentLogs();
    renderSnapHistory();
});
