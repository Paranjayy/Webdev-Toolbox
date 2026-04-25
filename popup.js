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
                    const prompt = `Antigravity, please consolidate extension "${ext.name}" (${ext.id}). I want to reverse engineer its features. You can find the source at: ~/Library/Application\\ Support/Arc/User\\ Data/Default/Extensions/${ext.id}/${ext.version}`;
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
    safeListen('btn-ghost-mode', 'click', async () => {
        const tab = await getActiveTab();
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
