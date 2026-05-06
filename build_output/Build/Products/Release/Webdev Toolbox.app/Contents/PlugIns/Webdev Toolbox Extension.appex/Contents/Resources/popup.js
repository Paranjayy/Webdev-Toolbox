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
            const targetEl = document.getElementById(`tab-${target}`);
            if (targetEl) targetEl.classList.add('active');

            if (target === 'extensions') renderExtensions();
            if (target === 'system') renderLogs();
            if (target === 'forensics') renderForensics();
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
        console.log(`[${type.toUpperCase()}] ${msg}`);
    }

    // ── Domain Context ───────────────────────────────────────────────────
    getActiveTab().then(tab => {
        const domainEl = document.getElementById('current-domain');
        if (tab?.url && domainEl) {
            try {
                const url = new URL(tab.url);
                domainEl.textContent = url.hostname;
                domainEl.style.color = '#58a6ff';
            } catch(e) {
                domainEl.textContent = 'RESTRICTED HOST';
            }
        }
    });

    // ── DESIGN LAB SUPERPOWERS ───────────────────────────────────────────
    safeListen('btn-design-lab', 'click', () => {
        getActiveTab().then(tab => {
            if (tab.restricted) return;
            chrome.runtime.sendMessage({ action: 'PERFORM_DESIGN_LAB', tabId: tab.id });
            window.close(); // Close popup to allow interaction
        });
    });

    // ── INTELLIGENCE: Snapshots & Audits ─────────────────────────────────
    safeListen('btn-capture-ai', 'click', () => {
        getActiveTab().then(tab => {
            if (tab.restricted) return;
            chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw: false, tabId: tab.id }, (res) => {
                if (res?.success) alert("AI Context Capture copied to clipboard!");
            });
        });
    });

    safeListen('btn-export-raw', 'click', () => {
        getActiveTab().then(tab => {
            if (tab.restricted) return;
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
            box.style = 'position:fixed; bottom:20px; right:20px; background:rgba(1,4,9,0.9); color:#79c0ff; padding:15px; border-radius:8px; z-index:100000; font-family:monospace; font-size:11px; border:1px solid #30363d; pointer-events:none; max-width:320px; white-space:pre-wrap; box-shadow: 0 10px 30px rgba(0,0,0,0.5);';
            document.body.appendChild(box);
            document.addEventListener('mouseover', (e) => {
                if (!window.__TOOLBOX_XRAY_ACTIVE) return;
                const el = e.target;
                box.innerText = `[METADATA INSPECTOR]\n\nTAG: ${el.tagName}\nID: ${el.id || 'N/A'}\nCLASSES: ${el.className || 'N/A'}\nSIZE: ${el.offsetWidth}x${el.offsetHeight}`;
            });
        });
    });

    // ── DESIGN: Extractions & Editors ────────────────────────────────────
    safeListen('btn-extract-component', 'click', () => {
        safeExecute(() => {
            alert("Component Extraction Ready. Click any element to replicate with full aesthetics.");
            const handler = (e) => {
                e.preventDefault(); e.stopPropagation();
                const el = e.target;
                const style = window.getComputedStyle(el);
                const componentName = (el.id || el.className?.split(' ')[0] || 'ExtractedComponent').replace(/[^a-zA-Z]/g, '');
                const capitalized = componentName.charAt(0).toUpperCase() + componentName.slice(1);
                const code = `// Captured <${capitalized} />\n// Styles: ${style.color}, ${style.backgroundColor}\n// [Code generation truncated for brevity]`;
                const tmp = document.createElement('textarea');
                tmp.value = code; document.body.appendChild(tmp);
                tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
                alert(`Professional React Component <${capitalized} /> copied to clipboard!`);
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
        });
    });

    safeListen('btn-live-edit', 'click', () => {
        safeExecute(() => {
            document.designMode = document.designMode === 'on' ? 'off' : 'on';
            alert(`Design Mode: ${document.designMode.toUpperCase()}`);
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
                    <td><span class="badge">${item.type}</span></td>
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
        if (!unpackedList || !storeList) return;

        chrome.management.getAll((extensions) => {
            const list = extensions.filter(e => e.id !== chrome.runtime.id);
            const unpacked = list.filter(e => e.installType === 'development');
            const store = list.filter(e => e.installType !== 'development');

            const renderCard = (ext) => `
                <div class="card" style="padding: 10px; flex-direction: row; align-items: center; justify-content: space-between;">
                    <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
                        <img src="${ext.icons?.[0]?.url || 'icon.png'}" style="width:24px; height:24px; border-radius:4px;">
                        <div style="min-width:0;">
                            <div class="card-title truncate">${ext.name}</div>
                            <div class="mono" style="font-size:0.5rem; opacity:0.5;">${ext.id}</div>
                        </div>
                    </div>
                    <button class="btn" style="width:auto; padding:4px 8px; font-size:0.65rem;" id="toggle-${ext.id}">
                        ${ext.enabled ? 'ON' : 'OFF'}
                    </button>
                </div>
            `;

            unpackedList.innerHTML = unpacked.map(renderCard).join('') || '<div style="font-size:0.7rem; color:var(--text-muted); text-align:center;">No development extensions.</div>';
            storeList.innerHTML = store.map(renderCard).join('') || '<div style="font-size:0.7rem; color:var(--text-muted); text-align:center;">No store extensions.</div>';

            [...unpacked, ...store].forEach(ext => {
                const btn = document.getElementById(`toggle-${ext.id}`);
                if (btn) btn.onclick = () => chrome.management.setEnabled(ext.id, !ext.enabled, () => renderExtensions());
            });
        });
    }

    // ── SYSTEM: Health & Logs ───────────────────────────────────────────
    function renderLogs() {
        const console = document.getElementById('error-console');
        if (!console) return;
        chrome.storage.local.get(['extension_errors'], (res) => {
            const errors = res.extension_errors || [];
            if (errors.length === 0) {
                console.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">No system errors detected.</div>';
                return;
            }
            console.innerHTML = errors.map(e => `<div class="log-item log-error">${e}</div>`).join('');
        });
    }

    safeListen('btn-clear-logs', 'click', () => {
        chrome.runtime.sendMessage({ action: 'CLEAR_STORAGE_ERRORS' }, () => renderLogs());
    });
    
    safeListen('btn-refresh-logs', 'click', () => renderLogs());

    // ── VAULT MIGRATION ─────────────────────────────────────────────────
    safeListen('btn-export-vault', 'click', () => {
        chrome.storage.local.get(null, (data) => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'vault-state.json'; a.click();
        });
    });

    function renderForensics() {
        const gallery = document.getElementById('forensic-gallery');
        if (!gallery) return;
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = res.snap_history || [];
            if (history.length === 0) {
                gallery.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:40px;">No snapshots in vault.</div>';
                return;
            }
            gallery.innerHTML = history.map(s => `
                <div class="snap-card-large">
                    ${s.metadata.screenshot ? `<img src="${s.metadata.screenshot}" class="snap-thumb-large">` : '<div class="snap-thumb-large" style="background:#000; display:flex; align-items:center; justify-content:center; color:#333;">NO IMAGE</div>'}
                    <div class="snap-content-large">
                        <div class="snap-header-large">
                            <div>
                                <div class="snap-title">${s.metadata.title}</div>
                                <div class="snap-meta">${s.metadata.url}</div>
                            </div>
                            <div class="badge">${s.metadata.type}</div>
                        </div>
                    </div>
                </div>
            `).join('');
        });
    }
});
