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
    
    // Professional Context Capture (AI Optimized)
    safeListen('btn-context-snap', 'click', () => {
        getActiveTab().then(tab => {
            if (tab.restricted) return;
            chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw: false, tabId: tab.id }, (res) => {
                if (res?.success) alert("AI Context Snapshot copied to clipboard!");
            });
        });
    });

    // Environment Dump (Full Export)
    safeListen('btn-env-dump', 'click', () => {
        getActiveTab().then(tab => {
            if (tab.restricted) return;
            chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw: true, tabId: tab.id }, (res) => {
                if (res?.success) alert("Full Environment Dump copied to clipboard!");
            });
        });
    });

    // Element Metadata Inspector (X-Ray)
    safeListen('btn-xray', 'click', () => {
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
                box.innerText = `[ELEMENT INSPECTOR]\n\nTAG: ${data.tag}\nID: ${data.id || 'N/A'}\nCLASSES: ${data.classes || 'N/A'}\nSIZE: ${data.size}\n\nARIA:\n${data.aria.join('\n') || 'None'}`;
            });
        });
    });

    // Application State Inspector (JSON Hunter)
    safeListen('btn-state-inspect', 'click', () => {
        safeExecute(() => {
            const data = Array.from(document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]'))
                .map(s => {
                    try { return JSON.parse(s.textContent); } catch(e) { return s.textContent; }
                });
            console.log('%c [STATE INSPECTOR] Found Data Blobs: ', 'background:#d29922; color:white; font-weight:bold;', data);
            alert(`Detected ${data.length} Application State Blobs. Check Console.`);
        });
    });

    // PageSpeed Report
    safeListen('btn-pagespeed', 'click', async () => {
        const tab = await getActiveTab();
        if (tab?.url) window.open(`https://pagespeed.web.dev/report?url=${encodeURIComponent(tab.url)}`, '_blank');
    });

    // Stack Deep-Dive (Wappalyzer)
    safeListen('btn-wappalyzer', 'click', () => {
        safeExecute(() => {
            const stack = [];
            if (window.React || document.querySelector('[data-reactroot]')) stack.push('React');
            if (window.next) stack.push('Next.js');
            if (window.jQuery) stack.push('jQuery');
            if (window.Vue) stack.push('Vue');
            if (document.querySelector('script[src*="tailwind"]')) stack.push('Tailwind');
            alert(`Technology Stack Analysis: ${stack.join(', ') || 'Vanilla / Proprietary'}`);
        });
    });

    // AI Architecture Roast
    safeListen('btn-audit-ai', 'click', () => {
        safeExecute(() => {
            const divCount = document.querySelectorAll('div').length;
            const styleCount = document.querySelectorAll('style').length;
            const roasts = [];
            if (divCount > 1000) roasts.push(`Div overload detected (${divCount}). This DOM tree is a nightmare.`);
            if (styleCount > 20) roasts.push(`${styleCount} inline styles? Your architecture is basically held together by duct tape.`);
            if (window.jQuery) roasts.push("jQuery detected. Legacy debt is real.");
            
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
    
    // React Component Extraction
    safeListen('btn-react-rip', 'click', () => {
        safeExecute(() => {
            alert("Component Extraction Ready. Click any element to wrap into a React component.");
            const handler = (e) => {
                e.preventDefault(); e.stopPropagation();
                const el = e.target;
                const componentName = (el.id || el.className?.split(' ')[0] || 'ExtractedComponent').replace(/[^a-zA-Z]/g, '');
                const capitalized = componentName.charAt(0).toUpperCase() + componentName.slice(1);
                const code = `import React from 'react';\n\nexport const ${capitalized} = () => {\n  return (\n    <div dangerouslySetInnerHTML={{ __html: \`${el.outerHTML.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }} />\n  );\n};`;
                
                const tmp = document.createElement('textarea');
                tmp.value = code; document.body.appendChild(tmp);
                tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
                alert(`React Component <${capitalized} /> copied to clipboard!`);
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
        });
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
    function renderExtensions() {
        const unpackedList = document.getElementById('ext-list-unpacked');
        const storeList = document.getElementById('ext-list-store');
        if (!unpackedList || !storeList) return;

        chrome.management.getAll((extensions) => {
            const list = extensions.filter(e => e.id !== chrome.runtime.id);
            const filtered = list.filter(e => e.name.toLowerCase().includes(searchFilter.toLowerCase()) || e.id.includes(searchFilter));
            
            const unpacked = filtered.filter(e => e.installType === 'development');
            const store = filtered.filter(e => e.installType !== 'development');

            const renderCard = (ext) => `
                <div class="card" style="padding: 10px; flex-direction: row; align-items: center; justify-content: space-between;">
                    <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
                        <img src="${ext.icons?.[0]?.url || 'icon.png'}" style="width:28px; height:28px; border-radius:4px; background:var(--panel-header);">
                        <div style="min-width:0;">
                            <div class="card-title truncate">${ext.name}</div>
                            <div class="mono" style="font-size:0.55rem; opacity:0.6;">${ext.id}</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn" style="width:auto; padding:4px 8px; font-size:0.65rem; border-color:${ext.enabled ? 'var(--emerald)' : 'var(--border)'};" id="toggle-${ext.id}">
                            ${ext.enabled ? 'ACTIVE' : 'OFF'}
                        </button>
                        ${ext.installType === 'development' ? `
                            <button class="btn" style="width:auto; padding:4px 8px;" id="reload-${ext.id}">↻</button>
                        ` : ''}
                    </div>
                </div>
            `;

            unpackedList.innerHTML = unpacked.map(renderCard).join('') || '<div style="font-size:0.7rem; color:var(--text-muted); text-align:center;">No development extensions.</div>';
            storeList.innerHTML = store.map(renderCard).join('') || '<div style="font-size:0.7rem; color:var(--text-muted); text-align:center;">No production extensions.</div>';

            [...unpacked, ...store].forEach(ext => {
                safeListen(`toggle-${ext.id}`, 'click', () => {
                    chrome.management.setEnabled(ext.id, !ext.enabled, () => renderExtensions());
                });
                if (ext.installType === 'development') {
                    safeListen(`reload-${ext.id}`, 'click', () => {
                        chrome.runtime.sendMessage({ action: 'RELOAD_EXT_AND_TAB', id: ext.id });
                    });
                }
            });
        });
    }

    safeListen('ext-search', 'input', (e) => {
        searchFilter = e.target.value;
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

    // Action Flow Recorder (Vibe Recorder)
    safeListen('btn-flow-recorder', 'click', () => {
        getActiveTab().then(tab => {
            chrome.runtime.sendMessage({ action: 'PERFORM_MACRO', tabId: tab.id });
            alert("Action Flow Recorder Active. Interactions are being captured.");
        });
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

    // ── AGENT INTEL: Query Logging ──────────────────────────────────────────
    function renderAgentLogs() {
        const logEl = document.getElementById('agent-logs');
        if (!logEl) return;
        
        chrome.storage.local.get(['agent_queries'], (data) => {
            const queries = data.agent_queries || [];
            if (queries.length === 0) {
                logEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">No queries logged yet.</div>';
            } else {
                logEl.innerHTML = queries.reverse().map(q => `
                    <div class="log-item log-info" style="margin-bottom:8px;">
                        <div style="font-size:0.6rem; opacity:0.6; margin-bottom:2px;">${new Date(q.timestamp).toLocaleString()} @ ${q.domain}</div>
                        <div style="font-weight:600;">${q.query}</div>
                    </div>
                `).join('');
            }
        });
    }

    safeListen('btn-log-query', 'click', () => {
        const input = document.getElementById('agent-query-input');
        const query = input.value.trim();
        if (!query) return;

        getActiveTab().then(tab => {
            const domain = tab?.url ? new URL(tab.url).hostname : 'Unknown';
            chrome.storage.local.get(['agent_queries'], (data) => {
                const queries = data.agent_queries || [];
                queries.push({
                    query,
                    domain,
                    timestamp: Date.now(),
                    tabId: tab?.id
                });
                chrome.storage.local.set({ agent_queries: queries }, () => {
                    input.value = '';
                    renderAgentLogs();
                    showToast("Query logged for agent review.", 'success');
                });
            });
        });
    });

    safeListen('btn-export-queries', 'click', () => {
        chrome.storage.local.get(['agent_queries'], (data) => {
            const blob = new Blob([JSON.stringify(data.agent_queries || [], null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `agent-queries-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
        });
    });

    safeListen('btn-clear-queries', 'click', () => {
        if (confirm("Wipe all agent query history?")) {
            chrome.storage.local.set({ agent_queries: [] }, () => {
                renderAgentLogs();
                showToast("Agent logs cleared.", 'info');
            });
        }
    });

    // ── Boot ──────────────────────────────────────────────────────────────
    renderExtensions();
    renderAgentLogs();
});
