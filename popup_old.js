document.addEventListener('DOMContentLoaded', () => {
    // ── Navigation ────────────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById(`tab-${target}`);
            if (panel) panel.classList.add('active');

            if (target === 'errors') renderErrors();
            if (target === 'core') renderExtensions();
        });
    });

    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.sub;
            document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`sub-${target}`).classList.add('active');
            if (target === 'manager') renderExtensions();
        });
    });

    async function getActiveTab() {
        try {
            const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!t || !t.url) return t;
            if (t.url.startsWith('chrome://') || t.url.startsWith('arc://') || t.url.startsWith('edge://') || t.url.startsWith('about:')) {
                return { ...t, restricted: true };
            }
            return t;
        } catch (e) { return { restricted: true }; }
    }

    function safeListen(id, event, callback) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, callback);
    }

    function showPopupToast(msg, type = 'info') {
        let toast = document.createElement('div');
        const colors = { info: '#6366f1', success: '#10b981', error: '#ef4444', warning: '#f59e0b' };
        toast.style = `position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.95); backdrop-filter:blur(10px); border-left:4px solid ${colors[type]}; color:white; padding:12px 24px; border-radius:12px; font-size:12px; font-weight:600; z-index:10000; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity:0; box-shadow:0 10px 30px rgba(0,0,0,0.5); transform:translate(-50%, 20px);`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translate(-50%, 0)'; }, 10);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translate(-50%, 20px)'; setTimeout(() => toast.remove(), 400); }, 3000);
    }

    // ── GigaSnap Logic ───────────────────────────────────────────────────
    async function runSnap(raw) {
        const btnId = raw ? 'btn-gigasnap-header-raw' : 'btn-gigasnap-header';
        const btn = document.getElementById(btnId);
        const originalText = btn.textContent;
        btn.textContent = '...';
        try {
            const tab = await getActiveTab();
            if (tab.restricted) {
                showPopupToast("Restricted Page", "error");
                btn.textContent = 'ERR';
            } else {
                chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw, tabId: tab.id }, (response) => {
                    if (response?.success) {
                        btn.textContent = 'DONE!';
                        showPopupToast("Snapshot Copied!", "success");
                    } else {
                        btn.textContent = 'ERR';
                    }
                });
            }
        } catch (e) { btn.textContent = 'ERR'; }
        setTimeout(() => btn.textContent = originalText, 2000);
    }

    safeListen('btn-gigasnap-header', 'click', () => runSnap(false));
    safeListen('btn-gigasnap-header-raw', 'click', () => runSnap(true));

    // ── Extension Manager ─────────────────────────────────────────────────
    let allExtensions = [];
    async function renderExtensions() {
        if (!chrome.management) {
            console.warn('chrome.management not available');
            return;
        }
        chrome.management.getAll((exts) => {
            allExtensions = exts.filter(e => e.id !== chrome.runtime.id);
            filterExtensions();
        });
    }

    function filterExtensions() {
        const query = document.getElementById('ext-search')?.value.toLowerCase() || '';
        const unpackedList = document.getElementById('ext-list-unpacked');
        const storeList = document.getElementById('ext-list-store');
        if (!unpackedList || !storeList) return;

        unpackedList.innerHTML = '';
        storeList.innerHTML = '';

        allExtensions.forEach(ext => {
            if (query && !ext.name.toLowerCase().includes(query)) return;

            const card = document.createElement('div');
            card.className = 'ext-card';
            card.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <div style="flex:1;">
                        <div class="ext-name">${ext.name}</div>
                        <div class="ext-sub">${ext.version} | ${ext.installType}</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        ${ext.installType === 'development' ? `<button class="btn btn-secondary reload-btn" data-id="${ext.id}" style="padding:4px 8px;">🔄</button>` : ''}
                        <button class="btn ${ext.enabled ? 'btn-primary' : 'btn-secondary'} toggle-btn" data-id="${ext.id}" data-enabled="${ext.enabled}">${ext.enabled ? 'ON' : 'OFF'}</button>
                    </div>
                </div>
            `;
            
            if (ext.installType === 'development') unpackedList.appendChild(card);
            else storeList.appendChild(card);
        });

        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                const newState = btn.dataset.enabled === 'false';
                chrome.management.setEnabled(id, newState, () => renderExtensions());
            };
        });

        document.querySelectorAll('.reload-btn').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                chrome.runtime.sendMessage({ action: 'RELOAD_EXT_AND_TAB', id }, () => {
                    showPopupToast("Reloaded Extension", "success");
                    setTimeout(() => renderExtensions(), 500);
                });
            };
        });
    }

    safeListen('ext-search', 'input', filterExtensions);

    // ── Audit Handlers ────────────────────────────────────────────────────
    safeListen('btn-audit-contrast', 'click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
            console.log('%c [AUDIT] Contrast ', 'background:#6366f1; color:white;');
            const bad = [];
            document.querySelectorAll('*').forEach(el => {
                const s = getComputedStyle(el);
                if (s.color === s.backgroundColor && s.color !== 'rgba(0, 0, 0, 0)') bad.push(el);
            });
            alert('Contrast Audit: Found ' + bad.length + ' potential issues.');
        }});
        showPopupToast("Contrast Audit Complete", "success");
    });

    safeListen('btn-extract-fonts', 'click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
            const fonts = new Set();
            document.querySelectorAll('*').forEach(el => fonts.add(getComputedStyle(el).fontFamily));
            console.log('FONTS USED:', Array.from(fonts));
            alert('Typography Map: Found ' + fonts.size + ' unique font families.');
        }});
        showPopupToast("Font Map Extracted", "info");
    });

    safeListen('btn-toggle-grid', 'click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
            const id = 'webdev-grid';
            let g = document.getElementById(id);
            if (g) g.remove();
            else {
                g = document.createElement('div'); g.id = id;
                g.style = 'position:fixed; top:0; left:50%; transform:translateX(-50%); width:1200px; height:100vh; display:grid; grid-template-columns:repeat(12, 1fr); gap:20px; pointer-events:none; z-index:9999;';
                for(let i=0; i<12; i++) { const col = document.createElement('div'); col.style = 'background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.2)'; g.appendChild(col); }
                document.body.appendChild(g);
            }
        }});
        showPopupToast("Grid Toggled", "info");
    });

    // ── Benchmark Handlers ────────────────────────────────────────────────
    safeListen('btn-sniff-stack', 'click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
            const stack = [];
            if (window.React || document.querySelector('[data-reactroot]')) stack.push('React');
            if (window.next) stack.push('Next.js');
            if (window.Vue) stack.push('Vue');
            if (document.querySelector('script[src*="tailwind"]')) stack.push('Tailwind');
            alert('Stack Sniff: ' + (stack.length ? stack.join(', ') : 'Unknown Static'));
        }});
        showPopupToast("Stack Analysis Complete", "success");
    });

    safeListen('btn-speed-check', 'click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
            const perf = performance.getEntriesByType('navigation')[0];
            alert('Speed Check: DOM Loaded in ' + perf.domContentLoadedEventEnd.toFixed(0) + 'ms');
        }});
        showPopupToast("LCP Simulation Done", "info");
    });

    // ── Labs ──────────────────────────────────────────────────────────────
    safeListen('btn-privacy-shield', 'click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
            document.querySelectorAll('*').forEach(el => {
                if (el.children.length === 0 && el.innerText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)) el.innerText = '[REDACTED]';
            });
        }});
        showPopupToast("PII Shielded", "info");
    });

    safeListen('btn-cyber-vibe', 'click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
            document.documentElement.style.filter = 'hue-rotate(280deg) contrast(1.2)';
        }});
        showPopupToast("Cyber Vibe Active", "info");
    });

    safeListen('btn-gravity-mode', 'click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
            document.querySelectorAll('div, p, h1, button').forEach(el => {
                el.style.transition = 'transform 2s';
                el.style.transform = `translateY(${window.innerHeight}px) rotate(10deg)`;
            });
        }});
        showPopupToast("Gravity Activated", "error");
    });

    safeListen('btn-open-dashboard', 'click', () => {
        chrome.tabs.create({ url: 'dashboard.html' });
    });

    // ── Rendering ─────────────────────────────────────────────────────────
    async function renderErrors() {
        const consoleEl = document.getElementById('error-console');
        const countBadge = document.getElementById('error-count');
        chrome.runtime.sendMessage({ action: 'GET_ERRORS' }, (response) => {
            const errors = response?.errors || [];
            if (countBadge) countBadge.textContent = errors.length;
            if (consoleEl) {
                if (errors.length === 0) consoleEl.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">No errors caught.</div>';
                else consoleEl.innerHTML = errors.map(err => `<div style="padding:8px; border-bottom:1px solid rgba(255,255,255,0.05);"><span style="color:#ef4444; font-weight:bold;">[ERR]</span> ${err.message || err}</div>`).join('');
            }
        });
    }

    safeListen('btn-clear-errors', 'click', () => {
        chrome.runtime.sendMessage({ action: 'CLEAR_ERRORS' }, () => renderErrors());
        showPopupToast("Errors Cleared", "success");
    });

    // Initial state
    renderExtensions();
    renderErrors();
});
