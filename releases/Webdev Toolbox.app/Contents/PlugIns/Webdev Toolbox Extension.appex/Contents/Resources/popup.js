const browser = typeof chrome !== "undefined" ? chrome : window.browser;
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
            const targetTab = document.getElementById(`tab-${target}`);
            if (targetTab) targetTab.classList.add('active');

            if (target === 'extensions') renderExtensions();
            if (target === 'system') renderLogs();
            if (target === 'agent') renderAgentLogs();
            if (target === 'network') renderNetworkLog();
            if (target === 'forensics') renderForensics();
        });
    });

    async function getActiveTab() {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!t || !t.url) return t;
        const restrictedProtocols = ['chrome:', 'arc:', 'edge:', 'about:', 'safari-web-extension:'];
        if (restrictedProtocols.some(p => t.url.startsWith(p))) {
            return { ...t, restricted: true };
        }
        return t;
    }

    async function safeExecute(func, args = []) {
        try {
            const tab = await getActiveTab();
            if (!tab || tab.restricted) {
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
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: ${type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(10, 12, 16, 0.9)'};
            color: white;
            padding: 10px 20px;
            border-radius: 50px;
            font-size: 0.75rem;
            font-weight: 600;
            z-index: 1000000;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        toast.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
        document.body.appendChild(toast);
        
        // Animate in
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });
        
        // Remove after 3s
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(100px)';
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    // ── Domain Context ───────────────────────────────────────────────────
    getActiveTab().then(tab => {
        const domainEl = document.getElementById('current-domain');
        if (domainEl && tab?.url) {
            try {
                const url = new URL(tab.url);
                domainEl.textContent = url.hostname;
                domainEl.style.color = '#3b82f6';
            } catch(e) {
                domainEl.textContent = 'RESTRICTED HOST';
            }
        }
    });

    // ── INTELLIGENCE: Snapshots & Audits ─────────────────────────────────
    safeListen('btn-capture-ai', 'click', () => {
        getActiveTab().then(tab => {
            if (!tab || tab.restricted) return;
            chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw: false, tabId: tab.id }, (res) => {
                if (res?.success) alert("AI Context Capture copied to clipboard!");
            });
        });
    });

    safeListen('btn-export-raw', 'click', () => {
        getActiveTab().then(tab => {
            if (!tab || tab.restricted) return;
            chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw: true, tabId: tab.id }, (res) => {
                if (res?.success) alert("Raw Environment Dump copied to clipboard!");
            });
        });
    });

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
            box.style = 'position:fixed; bottom:20px; right:20px; background:rgba(10,12,16,0.9); color:#3b82f6; padding:15px; border-radius:8px; z-index:100000; font-family:monospace; font-size:11px; border:1px solid #30363d; pointer-events:none; max-width:320px; white-space:pre-wrap; box-shadow: 0 10px 30px rgba(0,0,0,0.5); backdrop-filter:blur(10px);';
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
            }, { passive: true });
        });
    });

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

    safeListen('btn-pagespeed', 'click', async () => {
        const tab = await getActiveTab();
        if (tab?.url) window.open(`https://pagespeed.web.dev/report?url=${encodeURIComponent(tab.url)}`, '_blank');
    });

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

    safeListen('btn-audit-arch', 'click', () => {
        safeExecute(() => {
            const divCount = document.querySelectorAll('div').length;
            const styleCount = document.querySelectorAll('style').length;
            const roasts = [];
            if (divCount > 1500) roasts.push(`Div overload detected (${divCount}). This DOM tree is a nightmare.`);
            if (styleCount > 30) roasts.push(`${styleCount} inline styles? Your architecture is basically held together by duct tape.`);
            if (window.jQuery) roasts.push("Legacy alert: jQuery detected. Tech debt accumulating.");
            if (document.querySelectorAll('[style*="important"]').length > 20) roasts.push("Overuse of !important detected. You are fighting CSS specificity wars.");
            
            alert(roasts.length === 0 ? "Architecture Audit: Professional build. No critical inefficiencies." : "🔥 ARCHITECTURE ROAST 🔥\n\n" + roasts.join("\n\n"));
        });
    });

    // ── NETWORK: Interceptors ────────────────────────────────────────────
    safeListen('btn-hook-network', 'click', () => {
        safeExecute(() => {
            if (window.__NETWORK_HOOK_ACTIVE) return alert("Network Monitor already active.");
            window.__NETWORK_HOOK_ACTIVE = true;
            const originalFetch = window.fetch;
            window.fetch = function() {
                console.log('%c [FETCH] ', 'background:#10b981; color:white;', arguments[0]);
                return originalFetch.apply(this, arguments);
            };
            alert("Network Monitor Active. Check Console.");
        });
    });

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

    safeListen('btn-console-overlay', 'click', () => {
        safeExecute(() => {
            const id = 'toolbox-console-overlay';
            if (document.getElementById(id)) return;
            const overlay = document.createElement('div');
            overlay.id = id;
            overlay.style = 'position:fixed; bottom:10px; left:10px; width:360px; height:200px; background:rgba(10,12,16,0.95); color:#3b82f6; font-family:monospace; font-size:11px; padding:12px; border-radius:10px; z-index:100000; overflow-y:auto; border:1px solid #30363d; backdrop-filter:blur(10px); box-shadow: 0 10px 40px rgba(0,0,0,0.6);';
            overlay.innerHTML = '<div style="color:#8b949e; border-bottom:1px solid #30363d; margin-bottom:8px; padding-bottom:4px; font-weight:bold;">ENTERPRISE CONSOLE OVERLAY</div>';
            document.body.appendChild(overlay);

            const log = console.log;
            console.log = (...args) => {
                log(...args);
                const line = document.createElement('div');
                line.style.marginBottom = '4px';
                line.innerHTML = `<span style="color:#10b981;">></span> ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
                overlay.appendChild(line);
                overlay.scrollTop = overlay.scrollHeight;
            };
        });
    });

    // ── DESIGN: Extractions & Editors ────────────────────────────────────
    safeListen('btn-extract-component', 'click', () => {
        safeExecute(() => {
            alert("Component Extraction Ready. Click any element to replicate.");
            const handler = (e) => {
                e.preventDefault(); e.stopPropagation();
                const el = e.target;
                const style = window.getComputedStyle(el);
                const aesthetics = {
                    color: style.color,
                    background: style.backgroundColor,
                    padding: style.padding,
                    radius: style.borderRadius,
                    shadow: style.boxShadow,
                    font: style.fontFamily
                };
                const componentName = (el.id || el.className?.split(' ')[0] || 'ExtractedComponent').replace(/[^a-zA-Z]/g, '');
                const capitalized = componentName.charAt(0).toUpperCase() + componentName.slice(1);
                const code = `import React from 'react';\n\nexport const ${capitalized} = () => (\n  <div style={{ \n    color: '${aesthetics.color}', \n    backgroundColor: '${aesthetics.background}',\n    padding: '${aesthetics.padding}',\n    borderRadius: '${aesthetics.radius}',\n    boxShadow: '${aesthetics.shadow}',\n    fontFamily: '${aesthetics.font}'\n  }} dangerouslySetInnerHTML={{ __html: \`${el.innerHTML.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }} />\n);`;
                navigator.clipboard.writeText(code).then(() => alert(`React Component <${capitalized} /> copied!`));
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
        });
    });

    safeListen('btn-annotate', 'click', () => {
        getActiveTab().then(tab => {
            if (!tab || tab.restricted) return;
            chrome.runtime.sendMessage({ action: 'START_ANNOTATOR', tabId: tab.id });
            showToast("Annotator Mode Active. Click elements to label.", 'success');
        });
    });

    safeListen('btn-live-edit', 'click', () => {
        safeExecute(() => {
            document.designMode = document.designMode === 'on' ? 'off' : 'on';
            return `Design Mode: ${document.designMode.toUpperCase()}`;
        }).then(res => {
            if (res?.[0]?.result) showToast(res[0].result, 'success');
        });
    });

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

    // ── RESOURCES ────────────────────────────────────────────────────────
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
            if (!container) return;
            if (list.length === 0) {
                container.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">No external resources found.</td></tr>';
                return;
            }
            container.innerHTML = list.map(item => `
                <tr>
                    <td><span class="badge" style="background:rgba(59,130,246,0.1); color:#3b82f6; border:1px solid #3b82f6;">${item.type}</span></td>
                    <td class="truncate mono">${new URL(item.src).pathname.split('/').pop() || item.src}</td>
                    <td class="truncate" style="color:var(--text-muted); font-size:0.6rem;">${item.src}</td>
                </tr>
            `).join('');
        });
    });

    // ── EXTENSIONS ────────────────────────────────────────────────────────
    function renderExtensions() {
        const unpackedList = document.getElementById('ext-list-unpacked');
        const storeList = document.getElementById('ext-list-store');
        const searchInput = document.getElementById('ext-search');
        if (!unpackedList || !storeList) return;

        if (!chrome.management) {
            unpackedList.innerHTML = `
                <div style="padding: 20px; text-align: center; background: rgba(59, 130, 246, 0.05); border: 1px dashed #3b82f6; border-radius: 8px;">
                    <div style="font-size: 1.2rem; margin-bottom: 8px;">🧭</div>
                    <div style="font-size: 0.75rem; font-weight: 700; color: #3b82f6; margin-bottom: 4px;">WEBKIT SANDBOX ACTIVE</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); line-height: 1.4;">
                        Safari does not allow extensions to track sibling extensions for security. 
                        Use Safari Preferences to manage other tools.
                    </div>
                </div>
            `;
            storeList.innerHTML = '';
            return;
        }

        chrome.management.getAll((extensions) => {
            const searchVal = searchInput?.value.toLowerCase() || '';
            const filtered = extensions.filter(e => e.id !== chrome.runtime.id && (e.name.toLowerCase().includes(searchVal) || e.id.includes(searchVal)));
            
            const renderCard = (ext) => `
                <div class="card" style="padding: 10px; border-color: ${ext.enabled ? 'var(--border)' : 'rgba(239, 68, 68, 0.2)'};">
                    <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                            <img src="${ext.icons?.[0]?.url || 'icon.png'}" style="width:24px; height:24px; border-radius:4px; opacity: ${ext.enabled ? 1 : 0.5};">
                            <div style="min-width:0;">
                                <div class="card-title truncate" style="font-size:0.75rem;">${ext.name}</div>
                                <div class="mono" style="font-size:0.5rem; opacity:0.5;">${ext.id}</div>
                            </div>
                        </div>
                        <button class="btn" style="width:auto; padding:4px 8px; font-size:0.6rem; color: ${ext.enabled ? '#10b981' : 'var(--text-muted)'};" onclick="chrome.management.setEnabled('${ext.id}', ${!ext.enabled}, () => renderExtensions())">
                            ${ext.enabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>
            `;

            unpackedList.innerHTML = filtered.filter(e => e.installType === 'development').map(renderCard).join('') || '<div class="card-desc">No unpacked extensions.</div>';
            storeList.innerHTML = filtered.filter(e => e.installType !== 'development').map(renderCard).join('') || '<div class="card-desc">No store extensions.</div>';
        });
    }

    safeListen('ext-search', 'input', renderExtensions);

    // ── SYSTEM & FORENSICS ──────────────────────────────────────────────
    function renderLogs() {
        const consoleEl = document.getElementById('error-console');
        safeExecute(() => window.__DEV_VAULT_ERRORS || []).then(res => {
            const logs = res?.[0]?.result || [];
            if (!consoleEl) return;
            consoleEl.innerHTML = logs.length ? logs.map(l => `<div class="log-item log-error">${l}</div>`).join('') : '<div style="color:var(--text-muted); text-align:center; padding:20px;">No system errors.</div>';
        });
    }

    function renderForensics() {
        const container = document.getElementById('forensic-gallery');
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = res.snap_history || [];
            if (!container) return;
            container.innerHTML = history.length ? history.reverse().map((snap, i) => `
                <div class="snap-card-large">
                    <img src="${snap.metadata.screenshot || ''}" class="snap-thumb-large">
                    <div class="snap-content-large">
                        <div class="snap-header-large">
                            <h3 style="font-size:0.9rem;">${snap.metadata.title || 'Untitled Page'}</h3>
                            <span class="badge">${snap.metadata.type}</span>
                        </div>
                        <div class="snap-details-large">
                            <div class="detail-item"><div class="detail-label">Captured</div><div class="detail-value">${new Date(snap.metadata.timestamp).toLocaleTimeString()}</div></div>
                            <div class="detail-item"><div class="detail-label">Tech</div><div class="detail-value">${snap.stack[0] || 'Vanilla'}</div></div>
                        </div>
                        <button class="btn btn-primary" style="margin-top:12px;" onclick="window.open('dashboard.html?snap=${history.length-1-i}', '_blank')">OPEN IN VAULT</button>
                    </div>
                </div>
            `).join('') : '<div style="color:var(--text-muted); text-align:center; padding:40px;">No forensic history.</div>';
        });
    }

    safeListen('btn-clear-logs', 'click', () => {
        safeExecute(() => window.__DEV_VAULT_ERRORS = []).then(renderLogs);
    });

    safeListen('btn-open-dashboard', 'click', () => chrome.tabs.create({ url: 'dashboard.html' }));
    safeListen('btn-open-vault', 'click', () => chrome.tabs.create({ url: 'dashboard.html' }));

    // ── BOOT ──────────────────────────────────────────────────────────────
    renderExtensions();
});
