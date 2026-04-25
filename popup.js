document.addEventListener('DOMContentLoaded', () => {
    let tab = null;
    chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => { tab = t; });

    // ── Tab switching ────────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById(`tab-${target}`);
            if (panel) panel.classList.add('active');
            
            if (target === 'storage') renderStorage();
            if (target === 'errors') renderErrors();
            if (target === 'sentinel') renderSentinelErrors();
        });
    });

    async function getActiveTab() {
        if (tab) return tab;
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        tab = t;
        return t;
    }

    // Auto-switch to errors tab if there are any errors
    async function checkAutoSwitch() {
        const [domErrors, storageErrors] = await Promise.all([getDomErrors(), getStorageErrors()]);
        if ((domErrors?.length || 0) + (storageErrors?.length || 0) > 0) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            const errTab = document.querySelector('[data-tab="errors"]');
            const errPanel = document.getElementById('tab-errors');
            if (errTab) errTab.classList.add('active');
            if (errPanel) errPanel.classList.add('active');
            renderErrors();
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    function escHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    async function copyToClipboard(text) {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        console.log('Copied to clipboard.');
    }

    async function getDomErrors() {
        const t = await getActiveTab();
        if (!t || t.url?.startsWith('chrome://')) return [];
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: t.id },
                func: () => window.__DEV_VAULT_ERRORS || []
            });
            return results?.[0]?.result || [];
        } catch { return []; }
    }

    function getStorageErrors() {
        return new Promise(resolve => {
            chrome.storage.local.get(['extension_errors'], res => {
                resolve(Array.isArray(res.extension_errors) ? res.extension_errors : []);
            });
        });
    }

    // ── Render errors ─────────────────────────────────────────────────────
    async function renderErrors() {
        const [domErrors, storageErrors] = await Promise.all([getDomErrors(), getStorageErrors()]);
        const total = domErrors.length + storageErrors.length;        
        document.getElementById('error-count').textContent = total;
        document.getElementById('error-count-badge').textContent = total;

        const errConsole = document.getElementById('error-console');
        const noErrors = document.getElementById('no-errors');

        if (total === 0) {
            errConsole.innerHTML = '';
            errConsole.style.display = 'none';
            noErrors.style.display = 'block';
            return;
        }

        noErrors.style.display = 'none';
        errConsole.style.display = 'block';

        let html = '';
        if (domErrors.length > 0) {
            html += `<div class="err-section-label">📍 Live DOM Errors (${domErrors.length})</div>`;
            domErrors.slice(-20).reverse().forEach(e => {
                html += `<div class="err-entry">${escHtml(typeof e === 'string' ? e : JSON.stringify(e))}</div>`;
            });
        }
        if (storageErrors.length > 0) {
            html += `<div class="err-section-label" style="margin-top:${domErrors.length ? 0 : -1}px">💾 Vault Logged (${storageErrors.length})</div>`;
            storageErrors.slice(-40).reverse().forEach(e => {
                const src = String(e.source || 'unknown');
                const msg = String(e.message || '');
                const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '';
                const colors = { youtube: '#f87171', twitter: '#60a5fa', instagram: '#f472b6', instagram_posts: '#f472b6', reddit: '#fb923c', twitch: '#a78bfa', github: '#6ee7b7' };
                const clr = Object.entries(colors).find(([k]) => src.includes(k))?.[1] || '#94a3b8';
                html += `<div class="err-entry"><span style="color:${clr};font-weight:700">[${src}]</span> <span style="color:#475569;font-size:0.65rem">${ts}</span><br>${escHtml(msg)}</div>`;
            });
        }
        errConsole.innerHTML = html;
    }

    // ── Sentinel errors (Boot.dev Sentinel prefix) ─────────────────────────
    async function getSentinelErrors() {
        const t = await getActiveTab();
        if (!t || t.url?.startsWith('chrome://')) return [];
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: t.id },
                func: () => (window.__DEV_VAULT_ERRORS || []).filter(e => String(e).includes('[Sentinel]'))
            });
            return results?.[0]?.result || [];
        } catch { return []; }
    }

    async function renderSentinelErrors() {
        const errors = await getSentinelErrors();
        const n = errors.length;
        const sentinelCount = document.getElementById('sentinel-count');
        const sentinelCountBadge = document.getElementById('sentinel-count-badge');
        const sentinelConsole = document.getElementById('sentinel-console');
        const noSentinel = document.getElementById('no-sentinel');
        if (sentinelCount) sentinelCount.textContent = n;
        if (sentinelCountBadge) sentinelCountBadge.textContent = `${n} error${n !== 1 ? 's' : ''}`;

        if (n === 0) {
            sentinelConsole.innerHTML = '';
            noSentinel.style.display = 'block';
            return;
        }
        noSentinel.style.display = 'none';
        sentinelConsole.innerHTML = errors.slice(-30).reverse().map(e => {
            const text = typeof e === 'string' ? e : JSON.stringify(e);
            // separate timestamp from message
            const m = text.match(/^(\[.+?\])\s*(.*)$/);
            const ts = m ? m[1] : '';
            const msg = m ? m[2] : text;
            return `<div class="sentinel-err-entry"><span style="color:#6b7280;font-size:0.65rem">${escHtml(ts)} </span><span class="sentinel-label">${escHtml(msg.replace('[Sentinel] ', ''))}</span></div>`;
        }).join('');
    }

    // ── Render storage ────────────────────────────────────────────────────
    function renderStorage() {
        const grid = document.getElementById('storage-grid');
        grid.innerHTML = '<div class="section-label" style="margin-top:0">Loading...</div>';
        chrome.storage.local.get(null, (all) => {
            const SH_KEYS = ['tweets','instagram_posts','instagram_profiles','youtube_videos','reddit_posts','twitch_live','github_items','twitter_trends','captured_texts','live_sessions','extension_errors'];
            const SENTINEL_KEYS = ['history', 'latestScrape'];
            let html = '<div class="section-label">Boot.dev Sentinel</div>';
            SENTINEL_KEYS.forEach(key => {
                const val = all[key];
                let count = 0;
                let label = '';
                if (Array.isArray(val)) {
                    count = val.length;
                    label = `${count} lessons`;
                } else if (val && typeof val === 'object') {
                    count = 1;
                    label = val.lesson?.title ? `Latest: "${val.lesson.title.slice(0, 28)}"` : '1 item';
                }
                const color = count === 0 ? '#475569' : '#E5AE3C';
                html += `<div class="storage-item"><span class="storage-key">${key}</span><span class="storage-count" style="color:${color}">${label || count + ' items'}</span></div>`;
            });
            html += '<div class="section-label" style="margin-top: 12px">SocialHoardr</div>';
            SH_KEYS.forEach(key => {
                const val = all[key];
                let count = 0;
                if (Array.isArray(val)) count = val.length;
                else if (val && typeof val === 'object') count = Object.keys(val).length;
                const color = count === 0 ? '#475569' : count > 1000 ? '#f87171' : count > 200 ? '#fbbf24' : '#6ee7b7';
                html += `<div class="storage-item"><span class="storage-key">${key}</span><span class="storage-count" style="color:${color}">${count} items</span></div>`;
            });
            // Time & opens keys
            const timeKeys = Object.keys(all).filter(k => k.startsWith('time_') || k.startsWith('opens_'));
            if (timeKeys.length) {
                html += `<div class="section-label" style="margin-top:12px">Daily Sessions (${timeKeys.length} days)</div>`;
                timeKeys.slice(-3).reverse().forEach(k => {
                    const v = all[k];
                    const summary = Object.entries(v || {}).map(([p, n]) => `${p}:${n}`).join(' ');
                    html += `<div class="storage-item"><span class="storage-key" style="font-size:0.72rem">${k.replace('time_','⏱ ').replace('opens_','🚀 ')}</span><span class="storage-count" style="font-size:0.65rem;color:#94a3b8">${summary}</span></div>`;
                });
            }
            grid.innerHTML = html || '<div class="empty-state">No SocialHoardr data found.</div>';
        });
    }

    // ── Extension cards ───────────────────────────────────────────────────
    const listUnpacked = document.getElementById('ext-list-unpacked');
    const listStore = document.getElementById('ext-list-store');

    function getExtIcon(ext) {
        if (!ext.icons || ext.icons.length === 0) return 'icon.png';
        // Prefer 32 or 48, otherwise largest
        const preferred = ext.icons.find(i => i.size === 32 || i.size === 48);
        if (preferred) return preferred.url;
        return ext.icons.sort((a, b) => b.size - a.size)[0].url;
    }

    function renderExtensionCard(ext, container) {
        const card = document.createElement('div');
        card.className = 'ext-card';
        const isEnabled = ext.enabled;
        const iconUrl = getExtIcon(ext);
        const isUnpacked = ext.installType === 'development';

        card.innerHTML = `
            <div class="ext-header">
                <img src="${iconUrl}" class="ext-icon" onerror="this.src='icon.png'">
                <div class="ext-info">
                    <div class="ext-name">${ext.name}</div>
                    <div class="ext-sub">v${ext.version} • ${ext.id.slice(0, 8)}...</div>
                </div>
                <div class="${isEnabled ? 'status-badge' : 'status-badge disabled'}">${isEnabled ? 'ACTIVE' : 'DISABLED'}</div>
            </div>
            <div class="btn-row" style="margin-top: 4px;">
                ${isUnpacked ? `
                    <button class="btn btn-primary" id="reload-${ext.id}" title="Reload extension and current tab">Reload & Refresh</button>
                ` : `
                    <button class="btn btn-primary" id="consolidate-${ext.id}" title="Reverse engineer and consolidate features">Consolidate</button>
                `}
                <button class="btn btn-secondary" id="toggle-${ext.id}">${isEnabled ? 'Disable' : 'Enable'}</button>
            </div>
        `;
        container.appendChild(card);

        if (isUnpacked) {
            document.getElementById(`reload-${ext.id}`).addEventListener('click', () => {
                const btn = document.getElementById(`reload-${ext.id}`);
                btn.textContent = 'Reloading…';
                btn.disabled = true;
                chrome.runtime.sendMessage({ action: 'RELOAD_EXT_AND_TAB', id: ext.id }, () => {
                    setTimeout(() => window.close(), 350);
                });
            });
        } else {
            document.getElementById(`consolidate-${ext.id}`).addEventListener('click', async () => {
                const btn = document.getElementById(`consolidate-${ext.id}`);
                const originalText = btn.textContent;
                const path = `~/Library/Application\\ Support/Google/Chrome/Default/Extensions/${ext.id}/${ext.version}`;
                const prompt = `Antigravity, please consolidate extension "${ext.name}" (ID: ${ext.id}).\n\nI want to reverse engineer its features. You can find the source at: ${path}\n\nPlease copy it to my workspace and analyze how it works so we can integrate its features into our toolkit.`;
                await copyToClipboard(prompt);
                btn.textContent = 'Copied Request!';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            });
        }

        document.getElementById(`toggle-${ext.id}`).addEventListener('click', () => {
            chrome.management.setEnabled(ext.id, !isEnabled, () => location.reload());
        });
    }

    // ── Extension Search & Filtering ─────────────────────────────────────
    const searchInput = document.getElementById('ext-search');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.ext-card').forEach(card => {
            const name = card.querySelector('.ext-name').textContent.toLowerCase();
            const id = card.querySelector('.ext-sub').textContent.toLowerCase();
            if (name.includes(query) || id.includes(query)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    });

    // ── Copy Entire Extension List ────────────────────────────────────────
    document.getElementById('btn-copy-ext-list').addEventListener('click', () => {
        chrome.management.getAll((extensions) => {
            const list = extensions
                .filter(e => e.type === 'extension')
                .map(e => `- **${e.name}**\n  - ID: \`${e.id}\`\n  - Version: ${e.version}\n  - Type: ${e.installType}\n  - Status: ${e.enabled ? 'Enabled' : 'Disabled'}`)
                .join('\n\n');
            const header = `### CHROME EXTENSIONS LIST (${new Date().toLocaleDateString()})\n\n`;
            copyToClipboard(header + list);
            const originalText = document.getElementById('btn-copy-ext-list').textContent;
            document.getElementById('btn-copy-ext-list').textContent = '✅';
            setTimeout(() => { document.getElementById('btn-copy-ext-list').textContent = '📋'; }, 2000);
        });
    });

    // ── Export/Import Vault ──────────────────────────────────────────────
    document.getElementById('btn-export-vault').addEventListener('click', () => {
        chrome.storage.local.get(null, (data) => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `antigravity-vault-backup-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    });

    document.getElementById('btn-import-vault').addEventListener('click', () => {
        document.getElementById('vault-import-file').click();
    });

    document.getElementById('vault-import-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                chrome.storage.local.clear(() => {
                    chrome.storage.local.set(data, () => {
                        alert('Vault Import Successful! Reloading...');
                        location.reload();
                    });
                });
            } catch (err) {
                alert('Invalid JSON file.');
            }
        };
        reader.readAsText(file);
    });

    chrome.management.getAll((extensions) => {
        // Clear containers
        listUnpacked.innerHTML = '';
        listStore.innerHTML = '';

        const selfId = chrome.runtime.id;
        const devExts = extensions.filter(e => e.installType === 'development' && e.id !== selfId);
        const storeExts = extensions.filter(e => e.installType !== 'development' && e.type === 'extension' && e.id !== selfId);

        document.getElementById('unpacked-count').textContent = devExts.length;
        document.getElementById('store-count').textContent = storeExts.length;

        if (devExts.length === 0) {
            listUnpacked.innerHTML = `<div class="empty-state" style="padding:15px">No unpacked extensions.</div>`;
        } else {
            devExts.forEach(ext => renderExtensionCard(ext, listUnpacked));
        }

        if (storeExts.length === 0) {
            listStore.innerHTML = `<div class="empty-state" style="padding:15px">No third-party extensions found.</div>`;
        } else {
            // Sort by enabled first, then name
            storeExts.sort((a, b) => (b.enabled - a.enabled) || a.name.localeCompare(b.name));
            storeExts.forEach(ext => renderExtensionCard(ext, listStore));
        }
    });

    // ── Clear handlers ────────────────────────────────────────────────────
    document.getElementById('clear-dom-errors').addEventListener('click', async () => {
        const tab = await getActiveTab();
        if (tab && !tab.url?.startsWith('chrome://')) {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => { window.__DEV_VAULT_ERRORS = []; }
            }).catch(() => {});
        }
        renderErrors();
    });

    document.getElementById('clear-storage-errors').addEventListener('click', () => {
        // Use background so badge clears too
        chrome.runtime.sendMessage({ action: 'CLEAR_STORAGE_ERRORS' }, renderErrors);
    });

    document.getElementById('refresh-errors').addEventListener('click', renderErrors);

    // ── Sentinel controls ──────────────────────────────────────────────────
    const clearSentinelBtn = document.getElementById('clear-sentinel-errors');
    if (clearSentinelBtn) {
        clearSentinelBtn.addEventListener('click', async () => {
            if (tab && !tab.url?.startsWith('chrome://')) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => { window.__DEV_VAULT_ERRORS = (window.__DEV_VAULT_ERRORS || []).filter(e => !String(e).includes('[Sentinel]')); }
                }).catch(() => {});
            }
            renderSentinelErrors();
        });
    }
    const refreshSentinelBtn = document.getElementById('refresh-sentinel');
    if (refreshSentinelBtn) refreshSentinelBtn.addEventListener('click', renderSentinelErrors);

    // "Open Sentinel Panel" — sends a message to the boot.dev tab content script
    const openSentinelBtn = document.getElementById('open-sentinel-panel');
    if (openSentinelBtn) {
        openSentinelBtn.addEventListener('click', () => {
            if (!tab || !tab.url?.includes('boot.dev')) {
                alert('Navigate to boot.dev first!');
                return;
            }
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const host = document.getElementById('sentinel-host');
                    if (!host) return;
                    const shadow = host.shadowRoot;
                    const fab = shadow?.getElementById('fab');
                    const panel = shadow?.getElementById('panel');
                    if (panel?.classList.contains('hidden')) {
                        fab?.classList.add('hidden');
                        panel?.classList.remove('hidden');
                    }
                }
            }).catch(() => {});
            window.close();
        });
    }

    // ── Toolkit controls ───────────────────────────────────────────────────
    const btnCleanDom = document.getElementById('btn-copy-dom');
    if (btnCleanDom) {
        btnCleanDom.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            const originalText = btnCleanDom.textContent;
            btnCleanDom.textContent = 'Copying...';
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        let cloned = document.documentElement.cloneNode(true);
                        const removeSelectors = ['script', 'style', 'noscript', 'iframe', 'svg', 'img', 'video', 'canvas', 'link', 'meta', 'head'];
                        removeSelectors.forEach(sel => {
                            cloned.querySelectorAll(sel).forEach(el => el.remove());
                        });
                        const allElements = cloned.querySelectorAll('*');
                        allElements.forEach(el => {
                            const attrs = el.attributes;
                            for (let i = attrs.length - 1; i >= 0; i--) {
                                const name = attrs[i].name;
                                if (name.startsWith('data-') || name.startsWith('aria-') || name === 'class' || name === 'id' || name === 'href' || name === 'src') {
                                    // keep
                                } else {
                                    el.removeAttribute(name);
                                }
                            }
                        });
                        const textData = cloned.outerHTML;
                        const el = document.createElement('textarea');
                        el.value = textData;
                        document.body.appendChild(el);
                        el.select();
                        document.execCommand('copy');
                        document.body.removeChild(el);
                        console.log('DOM Copied! (Simplified for LLMs)');
                    }
                });
                btnCleanDom.textContent = 'Copied!';
            } catch (err) {
                console.error(err);
                btnCleanDom.textContent = 'Error!';
            }
            setTimeout(() => { btnCleanDom.textContent = originalText; }, 2000);
        });
    }

    const btnInjectConsole = document.getElementById('btn-inject-console');
    if (btnInjectConsole) {
        btnInjectConsole.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                world: 'MAIN',
                func: () => {
                    if (window.__DEV_CONSOLE_HOOKED) return;
                    window.__DEV_CONSOLE_HOOKED = true;
                    const logTypes = ['log', 'warn', 'error', 'info', 'debug'];
                    logTypes.forEach(type => {
                        const original = console[type];
                        console[type] = (...args) => {
                            const icon = { log: '📝', warn: '⚠️', error: '❌', info: 'ℹ️', debug: '🐛' }[type];
                            original.apply(console, [`%c${icon} [VIBE CONSOLE]`, 'font-weight:bold; color:#6366f1; background:#1e1b4b; padding:2px 4px; border-radius:3px;', ...args]);
                        };
                    });
                    console.log('Console Hooked! Logs are now tagged for easier vibecoding filtering.');
                    alert('Console Hooked! Check DevTools for styled [VIBE CONSOLE] output.');
                }
            });
            window.close();
        });
    }

    const btnVibeSnapshot = document.getElementById('btn-vibe-snapshot');
    if (btnVibeSnapshot) {
        btnVibeSnapshot.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            const originalText = btnVibeSnapshot.textContent;
            btnVibeSnapshot.textContent = 'Snapping...';
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        // 1. Get Clean DOM (logic from before)
                        let cloned = document.documentElement.cloneNode(true);
                        const removeSelectors = ['script', 'style', 'noscript', 'iframe', 'svg', 'img', 'video', 'canvas', 'link', 'meta', 'head'];
                        removeSelectors.forEach(sel => cloned.querySelectorAll(sel).forEach(el => el.remove()));
                        const allElements = cloned.querySelectorAll('*');
                        allElements.forEach(el => {
                            const attrs = el.attributes;
                            for (let i = attrs.length - 1; i >= 0; i--) {
                                const n = attrs[i].name;
                                if (!/^(data-|aria-|class|id|href|src|value|type|name)/.test(n)) el.removeAttribute(n);
                            }
                        });
                        const cleanDom = cloned.outerHTML;

                        // 2. Get Storage Snapshots
                        const localS = JSON.stringify(window.localStorage, null, 2);
                        const sessionS = JSON.stringify(window.sessionStorage, null, 2);
                        
                        // 3. Build Markdown
                        return `
# VIBE SNAPSHOT: ${document.title}
- URL: ${window.location.href}
- Time: ${new Date().toLocaleString()}

## Local Storage
\`\`\`json
${localS}
\`\`\`

## Clean DOM
\`\`\`html
${cleanDom}
\`\`\`
`.trim();
                    }
                });

                const mdContent = results?.[0]?.result;
                const el = document.createElement('textarea');
                el.value = mdContent;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);

                btnVibeSnapshot.textContent = 'Copied MD!';
            } catch (err) {
                console.error(err);
                btnVibeSnapshot.textContent = 'Error!';
            }
            setTimeout(() => { btnVibeSnapshot.textContent = originalText; }, 2000);
        });
    }

    const btnToggleOutline = document.getElementById('btn-toggle-outline');
    if (btnToggleOutline) {
        btnToggleOutline.addEventListener('click', async () => {
             if (!tab || tab.url?.startsWith('chrome://')) return;
             await chrome.scripting.executeScript({
                 target: { tabId: tab.id },
                 func: () => {
                     let style = document.getElementById('__vibe_outliner_style');
                     if (style) {
                         style.remove();
                         return;
                     }
                     style = document.createElement('style');
                     style.id = '__vibe_outliner_style';
                     style.textContent = `
                        a, button, [role="button"], input, select, textarea {
                            outline: 2px dashed #6366f1 !important;
                            outline-offset: 2px !important;
                            background-color: rgba(99, 102, 241, 0.05) !important;
                        }
                     `;
                     document.head.appendChild(style);
                 }
             });
             window.close();
        });
    }

    const btnHuntJson = document.getElementById('btn-hunt-json');
    if (btnHuntJson) {
        btnHuntJson.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            const res = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    let results = [];
                    // 1. Hunt in scripts
                    document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]').forEach(s => {
                        try {
                            const data = JSON.parse(s.textContent);
                            results.push({ source: 'Script Tag', data });
                        } catch(e) {}
                    });
                    // 2. Hunt in window (common framework vars)
                    ['__NEXT_DATA__', '__PRELOADED_STATE__', 'ytInitialData', 'initialState', '__INITIAL_STATE__'].forEach(key => {
                        if (window[key]) results.push({ source: `window.${key}`, data: window[key] });
                    });
                    return results;
                }
            });
            const data = res?.[0]?.result || [];
            if (data.length === 0) {
                alert('No obvious JSON blobs found.');
            } else {
                console.log('JSON Hunter found:', data);
                const el = document.createElement('textarea');
                el.value = JSON.stringify(data, null, 2);
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                alert(`Found ${data.length} JSON blobs! Copied to clipboard and logged to console.`);
            }
        });
    }

    const btnFreeze = document.getElementById('btn-freeze-page');
    if (btnFreeze) {
        btnFreeze.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    console.log('%c❄️ FREEZING PAGE IN 3 SECONDS...', 'color: #ef4444; font-weight: bold; font-size: 16px;');
                    setTimeout(() => {
                        debugger;
                    }, 3000);
                }
            });
            window.close();
        });
    }

    const btnExtractTheme = document.getElementById('btn-extract-theme');
    if (btnExtractTheme) {
        btnExtractTheme.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            const res = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const vars = {};
                    const computed = getComputedStyle(document.documentElement);
                    // Extract common CSS variables
                    const patterns = ['color', 'bg', 'background', 'primary', 'secondary', 'font-family'];
                    // Note: accessing all variables is hard, but we can try to find them in stylesheets
                    try {
                        for (let i = 0 ; i < document.styleSheets.length ; i++) {
                            const sheet = document.styleSheets[i];
                            const rules = sheet.cssRules || sheet.rules;
                            for (let j = 0 ; j < rules.length ; j++) {
                                const rule = rules[j];
                                if (rule.style) {
                                    for (let k = 0 ; k < rule.style.length ; k++) {
                                        const name = rule.style[k];
                                        if (name.startsWith('--')) {
                                            vars[name] = computed.getPropertyValue(name).trim();
                                        }
                                    }
                                }
                            }
                        }
                    } catch(e) {}
                    return vars;
                }
            });
            const vars = res?.[0]?.result || {};
            const el = document.createElement('textarea');
            el.value = JSON.stringify(vars, null, 2);
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            alert(`Extracted ${Object.keys(vars).length} CSS variables to clipboard!`);
        });
    }

    const btnPickSelector = document.getElementById('btn-pick-selector');
    if (btnPickSelector) {
        btnPickSelector.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                   if (window.__SELECTOR_PICKER_ACTIVE) return;
                   window.__SELECTOR_PICKER_ACTIVE = true;

                   const overlay = document.createElement('div');
                   overlay.id = '__selector_picker_overlay';
                   overlay.style = 'position:fixed; top:10px; right:10px; background:#6366f1; color:white; padding:8px 12px; border-radius:8px; z-index:999999; font-family:sans-serif; font-size:12px; pointer-events:none; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
                   overlay.textContent = 'Selector Picker: Hover over elements, Click to Copy';
                   document.body.appendChild(overlay);

                   const highlight = document.createElement('div');
                   highlight.style = 'position:fixed; background:rgba(99,102,241,0.2); border:2px solid #6366f1; z-index:999998; pointer-events:none; transition: all 0.1s;';
                   document.body.appendChild(highlight);

                   const getSelector = (el) => {
                       if (el.id) return `#${el.id}`;
                       if (el === document.body) return 'body';
                       let path = [];
                       while (el.parentElement) {
                           let sibling = el;
                           let nth = 1;
                           while (sibling.previousElementSibling) {
                               sibling = sibling.previousElementSibling;
                               if (sibling.tagName === el.tagName) nth++;
                           }
                           path.unshift(`${el.tagName.toLowerCase()}:nth-of-type(${nth})`);
                           el = el.parentElement;
                       }
                       return path.join(' > ');
                   };

                   const onMouseOver = (e) => {
                       const rect = e.target.getBoundingClientRect();
                       highlight.style.top = `${rect.top}px`;
                       highlight.style.left = `${rect.left}px`;
                       highlight.style.width = `${rect.width}px`;
                       highlight.style.height = `${rect.height}px`;
                       overlay.textContent = getSelector(e.target);
                   };

                   const onClick = (e) => {
                       e.preventDefault();
                       e.stopPropagation();
                       const sel = getSelector(e.target);
                       const tmp = document.createElement('textarea');
                       tmp.value = sel;
                       document.body.appendChild(tmp);
                       tmp.select();
                       document.execCommand('copy');
                       document.body.removeChild(tmp);
                       
                       cleanup();
                       alert(`Copied: ${sel}`);
                   };

                   const cleanup = () => {
                       document.removeEventListener('mouseover', onMouseOver);
                       document.removeEventListener('click', onClick, true);
                       overlay.remove();
                       highlight.remove();
                       window.__SELECTOR_PICKER_ACTIVE = false;
                   };

                   document.addEventListener('mouseover', onMouseOver);
                   document.addEventListener('click', onClick, true);
                }
            });
            window.close();
        });
    }

    const btnAutoScroll = document.getElementById('btn-auto-scroll');
    if (btnAutoScroll) {
        btnAutoScroll.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                }
            });
            window.close();
        });
    }

    const btnToggleVibe = document.getElementById('btn-toggle-vibe');
    if (btnToggleVibe) {
        btnToggleVibe.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    let style = document.getElementById('__cyber_vibe_style');
                    if (style) {
                        style.remove();
                        document.body.style.filter = 'none';
                        return;
                    }
                    style = document.createElement('style');
                    style.id = '__cyber_vibe_style';
                    style.textContent = `
                        * { 
                            background-color: #030712 !important; 
                            color: #d946ef !important; 
                            border-color: #d946ef !important; 
                            font-family: 'SF Mono', monospace !important;
                            text-shadow: 0 0 5px #d946ef !important;
                        }
                        a, button { color: #22d3ee !important; text-shadow: 0 0 5px #22d3ee !important; }
                        img, video, iframe { filter: grayscale(1) invert(1) brightness(0.6) sepia(1) hue-rotate(270deg) !important; opacity: 0.5; }
                        div, section, nav { border: 1px solid #d946ef33 !important; }
                    `;
                    document.head.appendChild(style);
                    document.body.style.filter = 'contrast(1.2) brightness(0.8)';
                }
            });
            window.close();
        });
    }

    const btnStartAnnotator = document.getElementById('btn-start-annotator');
    if (btnStartAnnotator) {
        btnStartAnnotator.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                   if (window.__ANNOTATOR_ACTIVE) return;
                   window.__ANNOTATOR_ACTIVE = true;

                   const selections = [];

                   // 1. Create Floating UI
                   const container = document.createElement('div');
                   container.id = '__vibe_annotator_ui';
                   container.style = `
                       position: fixed; top: 10px; right: 10px; width: 320px; max-height: 80vh;
                       background: #0f172a; border: 1px solid #334155; border-radius: 12px;
                       z-index: 9999999; color: white; display: flex; flex-direction: column;
                       font-family: 'Outfit', sans-serif; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
                       overflow: hidden;
                   `;
                   container.innerHTML = `
                       <div style="padding:12px; background:#1e293b; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
                           <span style="font-weight:700; font-size:13px; color:#6366f1;">AI TASK ANNOTATOR</span>
                           <button id="__annotator_close" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:18px;">&times;</button>
                       </div>
                       <div id="__annotator_list" style="flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px;">
                           <div style="color:#94a3b8; font-size:11px; text-align:center; padding:20px;">Click elements on the page to annotate them for the AI...</div>
                       </div>
                       <div style="padding:12px; border-top:1px solid #334155; background:#0f172a;">
                           <button id="__annotator_copy" style="width:100%; background:#6366f1; border:none; color:white; padding:8px; border-radius:6px; font-weight:700; cursor:pointer;">Finish & Copy AI Prompt</button>
                       </div>
                   `;
                   document.body.appendChild(container);

                   const list = container.querySelector('#__annotator_list');
                   const copyBtn = container.querySelector('#__annotator_copy');
                   const closeBtn = container.querySelector('#__annotator_close');

                   const highlight = document.createElement('div');
                   highlight.style = 'position:fixed; background:rgba(99,102,241,0.1); border:2px dashed #6366f1; z-index:9999998; pointer-events:none; transition: all 0.05s;';
                   document.body.appendChild(highlight);

                   const getSelector = (el) => {
                       if (el.id) return `#${el.id}`;
                       let path = [];
                       let curr = el;
                       while (curr && curr.parentElement) {
                           let nth = 1, sib = curr;
                           while (sib.previousElementSibling) { sib = sib.previousElementSibling; if (sib.tagName === curr.tagName) nth++; }
                           path.unshift(`${curr.tagName.toLowerCase()}${nth > 1 ? `:nth-of-type(${nth})` : ''}`);
                           curr = curr.parentElement;
                           if (curr.id) { path.unshift(`#${curr.id}`); break; }
                       }
                       return path.join(' > ');
                   };

                   const refreshList = () => {
                       if (selections.length === 0) {
                           list.innerHTML = '<div style="color:#94a3b8; font-size:11px; text-align:center; padding:20px;">Click elements on the page to annotate them for the AI...</div>';
                           return;
                       }
                       list.innerHTML = selections.map((s, i) => `
                           <div style="background:#1e293b; padding:8px; border-radius:6px; border:1px solid #334155;">
                               <div style="font-family:monospace; font-size:10px; color:#818cf8; margin-bottom:4px; word-break:break-all;">${s.selector}</div>
                               <textarea data-idx="${i}" placeholder="Describe the task or issue here..." style="width:100%; background:#0f172a; border:1px solid #334155; color:white; font-size:11px; padding:6px; border-radius:4px; resize:vertical; min-height:40px;"></textarea>
                           </div>
                       `).join('');
                       list.querySelectorAll('textarea').forEach(tx => {
                           tx.addEventListener('input', (e) => { selections[e.target.dataset.idx].comment = e.target.value; });
                       });
                   };

                   const onMouseOver = (e) => {
                       if (container.contains(e.target)) return;
                       const rect = e.target.getBoundingClientRect();
                       highlight.style.top = `${rect.top}px`;
                       highlight.style.left = `${rect.left}px`;
                       highlight.style.width = `${rect.width}px`;
                       highlight.style.height = `${rect.height}px`;
                   };

                   const onClick = (e) => {
                       if (container.contains(e.target)) return;
                       e.preventDefault(); e.stopPropagation();
                       const sel = getSelector(e.target);
                       selections.push({ selector: sel, comment: '' });
                       refreshList();
                   };

                   const cleanup = () => {
                       document.removeEventListener('mouseover', onMouseOver);
                       document.removeEventListener('click', onClick, true);
                       container.remove();
                       highlight.remove();
                       window.__ANNOTATOR_ACTIVE = false;
                   };

                   closeBtn.onclick = cleanup;

                   copyBtn.onclick = () => {
                       const prompt = `
### AI TASK ANNOTATIONS
I have identified the following elements on this page for specific tasks:

${selections.map(s => `- **ELEMENT**: \`${s.selector}\`\n  **TASK**: ${s.comment || 'No specific task described.'}`).join('\n\n')}

Please use this mapping to help build the feature.
                       `.trim();
                       const tmp = document.createElement('textarea');
                       tmp.value = prompt;
                       document.body.appendChild(tmp);
                       tmp.select();
                       document.execCommand('copy');
                       document.body.removeChild(tmp);
                       alert('AI Task Annotations copied to clipboard!');
                       cleanup();
                   };

                   document.addEventListener('mouseover', onMouseOver, { passive: true });
                   document.addEventListener('click', onClick, true);
                }
            });
            window.close();
        });
    }

    const btnInjectNetwork = document.getElementById('btn-inject-network');
    if (btnInjectNetwork) {
        btnInjectNetwork.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                 target: { tabId: tab.id, allFrames: true },
                 world: 'MAIN',
                 func: () => {
                     if (window.__DEV_TOOLKIT_HOOKED) return;
                     window.__DEV_TOOLKIT_HOOKED = true;
                     window.__DEV_VAULT_NET_LOG = []; // Cache for GIGASNAP

                     const logNet = (type, url, method, reqBody, resData) => {
                        window.__DEV_VAULT_NET_LOG.push({
                            type, url, method, reqBody, resData,
                            timestamp: new Date().toISOString()
                        });
                        if (window.__DEV_VAULT_NET_LOG.length > 50) window.__DEV_VAULT_NET_LOG.shift();
                     };

                     const origFetch = window.fetch;
                     window.fetch = async function(...args) {
                         const start = performance.now();
                         try {
                             const response = await origFetch.apply(this, args);
                             const clone = response.clone();
                             const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'unknown');
                             const method = args[1]?.method || 'GET';
                             
                             clone.text().then(text => {
                                 let data = text;
                                 try { data = JSON.parse(text); } catch(e){}
                                 logNet('FETCH', url, method, args[1]?.body, data);
                                 console.groupCollapsed(`%c[Network Fetch Hook] %c${url}`, 'color: #38bdf8; font-weight: bold;', 'color: #94a3b8');
                                 console.log('Response:', data);
                                 console.groupEnd();
                             }).catch(() => {});
                             return response;
                         } catch (err) {
                             throw err;
                         }
                     };

                     const XHR = XMLHttpRequest.prototype;
                     const origOpen = XHR.open;
                     const origSend = XHR.send;
                     XHR.open = function(m, u) { this._url = u; this._method = m; return origOpen.apply(this, arguments); };
                     XHR.send = function(body) {
                         this.addEventListener('load', function() {
                             let res = this.responseText;
                             try { res = JSON.parse(this.responseText); } catch(e){}
                             logNet('XHR', this._url, this._method, body, res);
                             console.groupCollapsed(`%c[Network XHR Hook] %c${this._url}`, 'color: #f472b6; font-weight: bold;', 'color: #94a3b8');
                             console.log('Response:', res);
                             console.groupEnd();
                         });
                         return origSend.apply(this, arguments);
                     };
                     console.log("%c🚀 Network Interceptor Active & Logging for GIGASNAP!", "color: #10b981; font-weight: bold;");
                     alert("Network Interceptor Active! I am now caching requests for your next GIGASNAP.");
                 }
            });
            window.close();
        });
    }

    const btnInjectWS = document.getElementById('btn-inject-ws');
    if (btnInjectWS) {
        btnInjectWS.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                world: 'MAIN',
                func: () => {
                    if (window.__DEV_WS_HOOKED) return;
                    window.__DEV_WS_HOOKED = true;
                    window.__DEV_VAULT_WS_LOG = [];

                    const OriginalWebSocket = window.WebSocket;
                    window.WebSocket = function(url, protocols) {
                        const ws = new OriginalWebSocket(url, protocols);
                        const wsUrl = typeof url === 'string' ? url : url.href;

                        const logWS = (dir, data) => {
                            window.__DEV_VAULT_WS_LOG.push({
                                url: wsUrl, direction: dir, data, timestamp: new Date().toISOString()
                            });
                            if (window.__DEV_VAULT_WS_LOG.length > 100) window.__DEV_VAULT_WS_LOG.shift();
                        };

                        ws.addEventListener('message', (e) => {
                            logWS('INCOMING', e.data);
                            console.groupCollapsed(`%c[WS INCOMING] %c${wsUrl}`, 'color: #a78bfa; font-weight: bold;', 'color: #94a3b8');
                            console.log('Data:', e.data);
                            console.groupEnd();
                        });

                        const origSend = ws.send;
                        ws.send = function(data) {
                            logWS('OUTGOING', data);
                            console.groupCollapsed(`%c[WS OUTGOING] %c${wsUrl}`, 'color: #fbbf24; font-weight: bold;', 'color: #94a3b8');
                            console.log('Data:', data);
                            console.groupEnd();
                            return origSend.apply(this, arguments);
                        };

                        return ws;
                    };
                    window.WebSocket.prototype = OriginalWebSocket.prototype;
                    console.log("%c📡 WebSocket Sniffer Active & Logging for GIGASNAP!", "color: #a78bfa; font-weight: bold;");
                    alert("WebSocket Sniffer Active! Caching stream data for your next GIGASNAP.");
                }
            });
            window.close();
        });
    }

    const btnStartMagnifier = document.getElementById('btn-start-magnifier');
    if (btnStartMagnifier) {
        btnStartMagnifier.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    if (window.__MAGNIFIER_ACTIVE) return;
                    window.__MAGNIFIER_ACTIVE = true;

                    const tip = document.createElement('div');
                    tip.style = 'position:fixed; background:rgba(15,23,42,0.9); color:#818cf8; border:1px solid #6366f1; padding:4px 8px; border-radius:6px; font-size:10px; font-family:monospace; z-index:9999999; pointer-events:none; white-space:nowrap; box-shadow:0 4px 12px rgba(0,0,0,0.5); display:none;';
                    document.body.appendChild(tip);

                    const onMove = (e) => {
                        const el = e.target;
                        if (el === tip) return;
                        const selector = (el.id ? `#${el.id}` : '') + (el.className ? `.${Array.from(el.classList).join('.')}` : '');
                        tip.textContent = `${el.tagName.toLowerCase()} ${selector}`.slice(0, 80);
                        tip.style.left = `${e.clientX + 15}px`;
                        tip.style.top = `${e.clientY + 15}px`;
                        tip.style.display = 'block';
                    };

                    const onClick = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('click', onClick, true);
                        tip.remove();
                        window.__MAGNIFIER_ACTIVE = false;
                    };

                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('click', onClick, true);
                }
            });
            window.close();
        });
    }

    const btnWipeDomain = document.getElementById('btn-wipe-domain');
    if (btnWipeDomain) {
        btnWipeDomain.addEventListener('click', async () => {
            if (!tab || !confirm('Wipe all local storage and cookies for this site?')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    window.localStorage.clear();
                    window.sessionStorage.clear();
                    document.cookie.split(";").forEach(c => {
                       document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                    });
                    location.reload();
                }
            });
            window.close();
        });
    }

    const btnToggleEdit = document.getElementById('btn-toggle-edit');
    if (btnToggleEdit) {
        btnToggleEdit.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const active = document.body.contentEditable === 'true';
                    document.body.contentEditable = active ? 'false' : 'true';
                    alert(active ? "Visual Edit: DISABLED" : "Visual Edit: ENABLED. You can now click and edit any text on the page!");
                }
            });
            window.close();
        });
    }

    const btnToggleLatency = document.getElementById('btn-toggle-latency');
    if (btnToggleLatency) {
        btnToggleLatency.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                world: 'MAIN',
                func: () => {
                    if (window.__LATENCY_ACTIVE) {
                        window.__LATENCY_ACTIVE = false;
                        alert("Network Latency: DISABLED. Connection speed restored.");
                        return;
                    }
                    window.__LATENCY_ACTIVE = true;
                    if (window.__LATENCY_HOOKED) {
                        alert("Network Latency: ENABLED (2s delay).");
                        return;
                    }
                    window.__LATENCY_HOOKED = true;

                    const sleep = ms => new Promise(r => setTimeout(r, ms));

                    const origFetch = window.fetch;
                    window.fetch = async function(...args) {
                        if (window.__LATENCY_ACTIVE) await sleep(2000);
                        return origFetch.apply(this, args);
                    };

                    const XHR = XMLHttpRequest.prototype;
                    const origSend = XHR.send;
                    XHR.send = function() {
                        if (window.__LATENCY_ACTIVE) {
                            setTimeout(() => origSend.apply(this, arguments), 2000);
                        } else {
                            origSend.apply(this, arguments);
                        }
                    };
                    alert("Network Latency: ENABLED (2s delay). Connected Fetch/XHR hooks.");
                }
            });
            window.close();
        });
    }

    const btnNukeOverlays = document.getElementById('btn-nuke-overlays');
    if (btnNukeOverlays) {
        btnNukeOverlays.addEventListener('click', async () => {
            if (!tab || tab.url?.startsWith('chrome://')) return;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const findAndNuke = () => {
                        let nuked = 0;
                        const all = document.querySelectorAll('*');
                        all.forEach(el => {
                            const style = window.getComputedStyle(el);
                            const z = parseInt(style.zIndex) || 0;
                            const isFixed = style.position === 'fixed' || style.position === 'absolute';
                            const isModalMatch = /modal|popup|overlay|dialog|dimmer/i.test(el.className + el.id);
                            
                            if ((isFixed && z > 100) || isModalMatch) {
                                if (el !== document.body && el !== document.documentElement) {
                                    el.remove();
                                    nuked++;
                                }
                            }
                        });
                        // Remove overflow:hidden from body if it's trapped
                        document.body.style.overflow = 'auto';
                        document.documentElement.style.overflow = 'auto';
                        return nuked;
                    };
                    const count = findAndNuke();
                    alert(`Nuked ${count} potential overlays/modals! Scroll restored.`);
                }
            });
            window.close();
        });
    }

    const btnGodSearch = document.getElementById('btn-god-search');
    const godSearchInput = document.getElementById('god-search-input');
    if (btnGodSearch && godSearchInput) {
        btnGodSearch.addEventListener('click', async () => {
            const query = godSearchInput.value.trim().toLowerCase();
            if (!query || !tab || tab.url?.startsWith('chrome://')) return;
            
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (q) => {
                    const hits = [];
                    // 1. Search DOM
                    if (document.body.innerText.toLowerCase().includes(q)) hits.push('Found in Page Text');
                    // 2. Search Storage
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k.toLowerCase().includes(q) || localStorage.getItem(k).toLowerCase().includes(q)) hits.push(`Storage: ${k}`);
                    }
                    // 3. Search Cookies
                    if (document.cookie.toLowerCase().includes(q)) hits.push('Found in Cookies');
                    return hits;
                },
                args: [query]
            });
            const matches = results?.[0]?.result || [];
            alert(matches.length > 0 ? `GOD SEARCH RESULTS:\n- ${matches.join('\n- ')}` : "No matches found in DOM, Storage, or Cookies.");
        });
    }

    const btnReloadDomain = document.getElementById('btn-reload-domain');
    if (btnReloadDomain) {
        btnReloadDomain.addEventListener('click', async () => {
            if (!tab) return;
            const domain = new URL(tab.url).hostname;
            const tabs = await chrome.tabs.query({});
            const targetTabs = tabs.filter(t => t.url && t.url.includes(domain));
            targetTabs.forEach(t => chrome.tabs.reload(t.id));
            window.close();
        });
    }

    // ── GIGASNAP & GIGA-RAW ─────────────────────────────────────────────
    const runSnap = async (isRaw = false) => {
        const tab = await getActiveTab();
        if (!tab) return;
        const btnId = isRaw ? 'btn-gigaraw' : 'btn-gigasnap';
        const btn = document.getElementById(btnId);
        const originalText = btn.textContent;
        btn.textContent = 'SNAPPING...';
        
        try {
            const contentRes = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const cleanDomForTokens = (docEl) => {
                        const traverse = (node) => {
                            let cloned = node.cloneNode(true);
                            
                            // 1. Remove comments
                            const iterator = document.createNodeIterator(cloned, NodeFilter.SHOW_COMMENT, null, false);
                            let comment;
                            while (comment = iterator.nextNode()) comment.parentNode.removeChild(comment);
                            
                            // 2. Handle Shadow DOM recursion (on original node, not clone)
                            const allOriginal = node.querySelectorAll('*');
                            const allCloned = cloned.querySelectorAll('*');
                            allOriginal.forEach((orig, i) => {
                                if (orig.shadowRoot) {
                                    const shadowContent = traverse(orig.shadowRoot);
                                    const wrapper = document.createElement('shadow-root');
                                    wrapper.innerHTML = shadowContent;
                                    if (allCloned[i]) allCloned[i].appendChild(wrapper);
                                }
                            });

                            // 3. Remove bloat elements
                            const removeSelectors = ['script', 'style', 'noscript', 'iframe', 'img', 'video', 'canvas', 'link', 'meta', 'head', 'template'];
                            removeSelectors.forEach(sel => cloned.querySelectorAll(sel).forEach(el => el.remove()));
                            
                            // 4. Refine SVGs (Keep tag for context, strip path data)
                            cloned.querySelectorAll('svg').forEach(s => { s.innerHTML = '<!-- [SVG CONTENT STRIPPED] -->'; });

                            // 5. Strip non-essential attributes
                            const allElements = cloned.querySelectorAll('*');
                            allElements.forEach(el => {
                                const attrs = el.attributes;
                                for (let i = attrs.length - 1; i >= 0; i--) {
                                    const n = attrs[i].name;
                                    if (!/^(data-|aria-|class|id|href|src|value|type|name|role|placeholder|title)/.test(n)) el.removeAttribute(n);
                                }
                                // Collapse empty divs/spans with no attrs
                                if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && el.innerHTML.trim() === '' && el.attributes.length === 0) el.remove();
                            });
                            return cloned.outerHTML;
                        };
                        return traverse(docEl);
                    };

                    const getRawDom = (docEl) => {
                        const traverseRaw = (node) => {
                            let cloned = node.cloneNode(true);
                            const allOriginal = node.querySelectorAll('*');
                            const allCloned = cloned.querySelectorAll('*');
                            allOriginal.forEach((orig, i) => {
                                if (orig.shadowRoot) {
                                    const shadowContent = traverseRaw(orig.shadowRoot);
                                    const wrapper = document.createElement('shadow-root');
                                    wrapper.innerHTML = shadowContent;
                                    if (allCloned[i]) allCloned[i].appendChild(wrapper);
                                }
                            });
                            return cloned.outerHTML;
                        };
                        return traverseRaw(docEl);
                    };

                    const detectStack = () => {
                        const stack = [];
                        if (window.React || document.querySelector('[data-reactroot]')) stack.push('React');
                        if (window.__NEXT_DATA__) stack.push('Next.js');
                        if (window.Vue || document.querySelector('[data-v-root]')) stack.push('Vue.js');
                        if (window.jQuery) stack.push('jQuery');
                        if (window.Angular || document.querySelector('[ng-app], [ng-version]')) stack.push('Angular');
                        if (window.Svelte || document.querySelector('[class*="svelte-"]')) stack.push('Svelte');
                        if (document.querySelector('meta[name="next-head-count"]')) stack.push('Next.js (Static)');
                        if (document.documentElement.classList.contains('tw-') || document.querySelector('[class*=":"]')) stack.push('Tailwind');
                        if (window.bootstrap) stack.push('Bootstrap');
                        if (window.LottieInteractive) stack.push('Lottie');
                        if (window.THREE) stack.push('Three.js');
                        if (window.gsap) stack.push('GSAP');
                        return stack;
                    };

                    const getPerformance = () => {
                        const t = window.performance.timing;
                        const nav = window.performance.getEntriesByType('navigation')[0] || {};
                        return {
                            loadTime: t.loadEventEnd - t.navigationStart,
                            domReady: t.domContentLoadedEventEnd - t.navigationStart,
                            ttfb: t.responseStart - t.navigationStart,
                            transferSize: nav.transferSize,
                            decodedBodySize: nav.decodedBodySize,
                            protocol: nav.nextHopProtocol,
                            memory: window.performance.memory ? {
                                limit: Math.round(window.performance.memory.jsHeapSizeLimit / 1048576) + 'MB',
                                used: Math.round(window.performance.memory.usedJSHeapSize / 1048576) + 'MB'
                            } : 'N/A'
                        };
                    };

                    const huntGlobalVars = () => {
                        const globals = {};
                        const skip = ['window', 'self', 'document', 'location', 'history', 'chrome', 'navigator', 'screen'];
                        Object.keys(window).forEach(k => {
                            if (skip.includes(k) || k.startsWith('__DEV_')) return;
                            try {
                                const val = window[k];
                                if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 3) {
                                    globals[k] = '(Object with ' + Object.keys(val).length + ' keys)';
                                    // If it looks like a config/data object, grab some keys
                                    if (k.toLowerCase().includes('config') || k.toLowerCase().includes('data') || k.toLowerCase().includes('initial')) {
                                        globals[k] = val;
                                    }
                                }
                            } catch(e){}
                        });
                        return globals;
                    };

                    return {
                        url: window.location.href,
                        title: document.title,
                        localStorage: Object.assign({}, window.localStorage),
                        sessionStorage: Object.assign({}, window.sessionStorage),
                        cookies: document.cookie,
                        clean_dom: cleanDomForTokens(document.documentElement),
                        raw_dom: getRawDom(document.documentElement),
                        stack: detectStack(),
                        performance: getPerformance(),
                        network_history: window.__DEV_VAULT_NET_LOG || [],
                        ws_history: window.__DEV_VAULT_WS_LOG || [],
                        global_vars: huntGlobalVars(),
                        hidden_fields: Array.from(document.querySelectorAll('input[type="hidden"]')).map(i => ({ name: i.name, id: i.id, value: i.value })),
                        system: {
                            userAgent: navigator.userAgent,
                            viewport: `${window.innerWidth}x${window.innerHeight}`,
                            language: navigator.language,
                            deviceMemory: navigator.deviceMemory,
                            hardwareConcurrency: navigator.hardwareConcurrency,
                            screen: { w: screen.width, h: screen.height, colorDepth: screen.colorDepth }
                        }
                    };
                }
            });
            const pageData = contentRes?.[0]?.result || {};
            const chromeStorage = await new Promise(r => chrome.storage.local.get(null, r));
            const [domErrors, storageErrors] = await Promise.all([getDomErrors(), getStorageErrors()]);

            const megasnapshot = {
                metadata: { timestamp: new Date().toISOString(), url: pageData.url, title: pageData.title },
                stack: pageData.stack,
                performance: pageData.performance,
                network_activity: pageData.network_history,
                websocket_activity: pageData.ws_history,
                global_variables: pageData.global_vars,
                hidden_fields: pageData.hidden_fields,
                errors: { dom: domErrors, vault_logs: storageErrors },
                storage: { 
                    page: { local: pageData.localStorage, session: pageData.sessionStorage }, 
                    extension: chromeStorage,
                    cookies: pageData.cookies 
                },
                system: pageData.system,
                content: isRaw ? { raw_dom: pageData.raw_dom } : { cleaned_dom_for_ai: pageData.clean_dom }
            };

            const type = isRaw ? 'RAW-GIGASNAP' : 'TOKEN-OPTIMIZED GIGASNAP';
            const netStatus = pageData.network_history.length > 0 ? '✅ ACTIVE' : '⚠️ NOT INJECTED (Click "Inject Network Hook")';
            const wsStatus = pageData.ws_history.length > 0 ? '✅ ACTIVE' : '⚠️ NOT INJECTED (Click "Inject WS Sniffer")';

            const godPrompt = `
I am working on this project. Here is a ${type}:

### 🧩 ANALYZED CONTEXT
- **STACK**: ${megasnapshot.stack.join(', ') || 'Unknown'}
- **PERFORMANCE**: ${megasnapshot.performance.loadTime}ms (Load), ${megasnapshot.performance.ttfb}ms (TTFB)
- **SYSTEM**: ${megasnapshot.system.viewport} | ${megasnapshot.system.userAgent.split(' ').slice(-1)}
- **NETWORK LOG**: ${netStatus} (${pageData.network_history.length} entries)
- **WS LOG**: ${wsStatus} (${pageData.ws_history.length} entries)

### 🛠️ DEBUGGING INSTRUCTIONS
1. **Network Activity**: Review \`network_activity\` for API endpoints, payload structures, and hidden backend signals.
2. **WebSockets**: Review \`websocket_activity\` for live stream data (useful for real-time reverse engineering).
3. **Storage**: Check \`storage.page.local\` for auth tokens, cached preferences, or persistence logic.
4. **Clean DOM**: The \`content.cleaned_dom_for_ai\` is token-optimized. Focus on \`data-\` and \`aria-\` attributes to understand the state management.

### 📦 FULL SNAPSHOT (JSON)
\`\`\`json
${JSON.stringify(megasnapshot, null, 2)}
\`\`\`

---
Please review this state and help me.
`.trim();

            await copyToClipboard(godPrompt);
            btn.textContent = 'SNAPPED!';
        } catch (e) {
            btn.textContent = 'ERR';
            console.error(e);
        }
        setTimeout(() => btn.textContent = originalText, 2000);
    };

    document.getElementById('btn-gigasnap').addEventListener('click', () => runSnap(false));
    const btnGigaRaw = document.getElementById('btn-gigaraw');
    if (btnGigaRaw) btnGigaRaw.addEventListener('click', () => runSnap(true));

    // ── External Tools ────────────────────────────────────────────────────
    const btnPageSpeed = document.getElementById('btn-pagespeed');
    if (btnPageSpeed) {
        btnPageSpeed.addEventListener('click', async () => {
            const tab = await getActiveTab();
            if (tab?.url) window.open(`https://pagespeed.web.dev/report?url=${encodeURIComponent(tab.url)}`, '_blank');
        });
    }
    const btnWappalyzer = document.getElementById('btn-wappalyzer');
    if (btnWappalyzer) {
        btnWappalyzer.addEventListener('click', async () => {
            const tab = await getActiveTab();
            if (tab?.url) window.open(`https://www.wappalyzer.com/lookup/${new URL(tab.url).hostname}`, '_blank');
        });
    }

    document.getElementById('copy-errors').addEventListener('click', async () => {
        const [domErrors, storageErrors] = await Promise.all([getDomErrors(), getStorageErrors()]);
        copyToClipboard(JSON.stringify({ dom: domErrors, storage: storageErrors }, null, 2));
    });

    document.getElementById('copy-storage').addEventListener('click', () => {
        chrome.storage.local.get(null, all => {
            copyToClipboard(JSON.stringify(all, null, 2));
        });
    });

    document.getElementById('copy-page-storage').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.url?.startsWith('chrome://')) return;
        const res = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => JSON.stringify(window.localStorage, null, 2)
        });
        copyToClipboard(res[0].result);
    });

    document.getElementById('copy-page-cookies').addEventListener('click', () => {
        copyToClipboard(document.cookie);
    });

    async function renderPageStorage() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.url?.startsWith('chrome://')) return;
        
        const res = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({ storage: Object.assign({}, window.localStorage), cookies: document.cookie })
        });
        const { storage, cookies } = res[0].result;
        
        const storageGrid = document.getElementById('page-storage-grid');
        storageGrid.innerHTML = '';
        Object.keys(storage).forEach(k => {
            const item = document.createElement('div');
            item.className = 'storage-item';
            item.innerHTML = `<span class="storage-key">${k}</span><span class="storage-val">${storage[k].slice(0, 50)}...</span>`;
            storageGrid.appendChild(item);
        });

        const cookieGrid = document.getElementById('page-cookies-grid');
        cookieGrid.innerHTML = '';
        cookies.split(';').forEach(c => {
            if (!c.trim()) return;
            const [k, v] = c.split('=');
            const item = document.createElement('div');
            item.className = 'storage-item';
            item.innerHTML = `<span class="storage-key">${k.trim()}</span><span class="storage-val">${(v||'').slice(0, 50)}...</span>`;
            cookieGrid.appendChild(item);
        });
    }

    // Call renderPageStorage when storage tab is clicked
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.tab === 'storage') renderPageStorage();
        });
    });

    // ── Privacy & Scrambling ───────────────────────────────────────────
    document.getElementById('btn-redact-pii').addEventListener('click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const regexes = {
                    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
                    phone: /(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g
                };
                const walk = (node) => {
                    if (node.nodeType === 3) {
                        let text = node.nodeValue;
                        text = text.replace(regexes.email, '[EMAIL REDACTED]');
                        text = text.replace(regexes.phone, '[PHONE REDACTED]');
                        node.nodeValue = text;
                    } else if (node.nodeType === 1 && !['SCRIPT', 'STYLE'].includes(node.tagName)) {
                        node.childNodes.forEach(walk);
                    }
                };
                walk(document.body);
                alert("Privacy Shield Active: Emails and Phones redacted.");
            }
        });
    });

    document.getElementById('btn-ghost-mode').addEventListener('click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const id = 'dev-vault-ghost-mode';
                let style = document.getElementById(id);
                if (style) {
                    style.remove();
                    alert("Ghost Mode Disabled.");
                } else {
                    style = document.createElement('style');
                    style.id = id;
                    style.innerHTML = `
                        img, video, [style*="background-image"], .avatar, [class*="avatar"] { 
                            filter: blur(20px) grayscale(1) !important; 
                            opacity: 0.3 !important;
                            transition: filter 0.5s ease !important;
                        }
                    `;
                    document.head.appendChild(style);
                    alert("Ghost Mode Enabled: Images and avatars blurred.");
                }
            }
        });
    });

    document.getElementById('btn-scramble-manual').addEventListener('click', async () => {
        const findText = document.getElementById('scramble-find').value;
        const replaceText = document.getElementById('scramble-replace').value;
        if (!findText) return alert("Please enter text to find.");
        
        const tab = await getActiveTab();
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [findText, replaceText],
            func: (f, r) => {
                const regex = new RegExp(f, 'gi');
                const walk = (node) => {
                    if (node.nodeType === 3) {
                        node.nodeValue = node.nodeValue.replace(regex, r || '[REDACTED]');
                    } else if (node.nodeType === 1 && !['SCRIPT', 'STYLE'].includes(node.tagName)) {
                        node.childNodes.forEach(walk);
                    }
                };
                walk(document.body);
            }
        });
    });

    document.getElementById('btn-gravity-mode').addEventListener('click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const els = document.querySelectorAll('body *:not(script):not(style)');
                els.forEach(el => {
                    if (el.children.length > 0) return;
                    el.style.transition = 'transform 1.5s cubic-bezier(0.47, 0, 0.745, 0.715)';
                    el.style.transform = `translateY(${window.innerHeight}px) rotate(${Math.random() * 30 - 15}deg)`;
                });
                alert("Gravity constant modified. Everything is falling.");
            }
        });
    });

    document.getElementById('btn-explode-text').addEventListener('click', async () => {
        const tab = await getActiveTab();
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const walk = (node) => {
                    if (node.nodeType === 3 && node.nodeValue.trim()) {
                        const words = node.nodeValue.split(/\s+/);
                        const frag = document.createDocumentFragment();
                        words.forEach(word => {
                            const span = document.createElement('span');
                            span.textContent = word + ' ';
                            span.style.display = 'inline-block';
                            span.style.transition = 'all 2s ease-out';
                            span.style.transform = `translate(${Math.random()*1000-500}px, ${Math.random()*1000-500}px) rotate(${Math.random()*360}deg)`;
                            span.style.opacity = '0';
                            frag.appendChild(span);
                        });
                        node.parentNode.replaceChild(frag, node);
                    } else if (node.nodeType === 1 && !['SCRIPT', 'STYLE'].includes(node.tagName)) {
                        Array.from(node.childNodes).forEach(walk);
                    }
                };
                walk(document.body);
            }
        });
    });

    // ── Build Extensions List ─────────────────────────────────────────────
    function renderExtensions() {
        const list = document.getElementById('ext-list');
        if (!list) return;
        chrome.management.getAll((extensions) => {
                    const devExts = extensions.filter(e => e.installType === 'development' && e.name !== 'Webdev Toolbox');
            if (devExts.length === 0) {
                list.innerHTML = `<div class="empty-state"><span>📭</span>No unpacked extensions found.</div>`;
                return;
            }
            list.innerHTML = '';
            devExts.forEach(ext => {
                const card = document.createElement('div');
                card.className = 'ext-card';
                const isEnabled = ext.enabled;
                card.innerHTML = `
                    <div class="ext-header">
                        <div style="min-width:0">
                            <div class="ext-name">${ext.name}</div>
                            <div class="ext-sub">ID: ${ext.id}</div>
                        </div>
                        <div class="${isEnabled ? 'status-badge' : 'status-badge disabled'}">${isEnabled ? 'ACTIVE' : 'DISABLED'}</div>
                    </div>
                    <div class="btn-row">
                        <button class="btn btn-primary" id="reload-${ext.id}">Reload</button>
                        <button class="btn btn-secondary" id="toggle-${ext.id}">${isEnabled ? 'Disable' : 'Enable'}</button>
                    </div>
                `;
                list.appendChild(card);
                document.getElementById(`reload-${ext.id}`).onclick = () => {
                    chrome.runtime.sendMessage({ action: 'RELOAD_EXT_AND_TAB', id: ext.id });
                    window.close();
                };
                document.getElementById(`toggle-${ext.id}`).onclick = () => {
                    chrome.management.setEnabled(ext.id, !isEnabled, () => location.reload());
                };
            });
        });
    }

    // ── Boot ──────────────────────────────────────────────────────────────
    renderExtensions();
    renderErrors();
    renderSentinelErrors();
    checkAutoSwitch();
    setInterval(() => { 
        renderErrors(); 
        renderSentinelErrors(); 
        if (document.querySelector('[data-tab="extensions"]').classList.contains('active')) renderExtensions();
    }, 10000);
    document.body.focus();
});
