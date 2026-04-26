// ── Auto-poll active tabs for DOM errors every 8s ───────────────────────────
let lastErrorCount = 0;

async function pollActiveTabErrors() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0] || tabs[0].url?.startsWith('chrome://')) return;

        const results = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => window.__DEV_VAULT_ERRORS || []
        });

        const domErrors = results?.[0]?.result || [];

        // Also read Vault storage errors
        chrome.storage.local.get(['extension_errors'], (res) => {
            const storageErrors = Array.isArray(res.extension_errors) ? res.extension_errors : [];
            const total = domErrors.length + storageErrors.length;

            // Badge the extension icon with error count
            if (total > 0) {
                chrome.action.setBadgeText({ text: String(total > 99 ? '99+' : total) });
                chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
            } else {
                chrome.action.setBadgeText({ text: '' });
            }

            // If new errors have appeared, send a notification (first time only)
            if (total > lastErrorCount && lastErrorCount === 0 && total > 0) {
                // Notify user new errors are present
                chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
            }
            lastErrorCount = total;
        });
    } catch (e) {
        // Tab may not be injectable (chrome://, new tabs, etc.) — silently ignore
    }
}

// Poll every 8 seconds
setInterval(pollActiveTabErrors, 8000);

// Also poll on tab activation / navigation
chrome.tabs.onActivated.addListener(() => setTimeout(pollActiveTabErrors, 1500));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') setTimeout(pollActiveTabErrors, 2000);
});

// ── Extension reload handler ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'RELOAD_EXT_AND_TAB') {
        const extId = request.id;

        // 1. Reset error badge
        chrome.action.setBadgeText({ text: '' });
        lastErrorCount = 0;

        // 2. Disable → Enable (triggers full extension reload)
        chrome.management.setEnabled(extId, false, () => {
            chrome.management.setEnabled(extId, true, () => {

                // 3. Reload active tab
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0] && !tabs[0].url.startsWith('chrome://')) {
                        chrome.tabs.reload(tabs[0].id, () => {
                            // 4. Inject global error catcher after reload settles
                            setTimeout(() => {
                                chrome.scripting.executeScript({
                                    target: { tabId: tabs[0].id },
                                    func: () => {
                                        window.__DEV_VAULT_ERRORS = window.__DEV_VAULT_ERRORS || [];
                                        // Don't double-add listeners if SocialHoardr already registered them
                                        if (!window.__DEV_VAULT_LISTENER_ADDED) {
                                            window.__DEV_VAULT_LISTENER_ADDED = true;
                                            window.addEventListener('error', (e) => {
                                                const entry = `[${new Date().toLocaleTimeString()}] ${e.message}\n${e.filename}:${e.lineno}`;
                                                window.__DEV_VAULT_ERRORS.push(entry);
                                                if (window.__DEV_VAULT_ERRORS.length > 300) window.__DEV_VAULT_ERRORS.shift();
                                            });
                                            window.addEventListener('unhandledrejection', (e) => {
                                                const entry = `[${new Date().toLocaleTimeString()}] Unhandled Promise: ${e.reason}`;
                                                window.__DEV_VAULT_ERRORS.push(entry);
                                                if (window.__DEV_VAULT_ERRORS.length > 300) window.__DEV_VAULT_ERRORS.shift();
                                            });
                                        }
                                    }
                                }).catch(() => {});
                            }, 1500);
                        });
                    }
                });

                sendResponse({ success: true });
            });
        });
        return true;
    }

    // ── Clear storage errors (called from popup) ────────────────────
    if (request.action === 'CLEAR_STORAGE_ERRORS') {
        chrome.storage.local.set({ extension_errors: [] }, () => {
            lastErrorCount = 0;
            chrome.action.setBadgeText({ text: '' });
            sendResponse({ ok: true });
        });
        return true;
    }

    // ── GigaSnap from popup button / right-click ────────────────────────
    if (request.action === 'PERFORM_SNAPSHOT') {
        handleGigaSnap(request.tabId, request.raw || false, sendResponse);
        return true;
    }
    // ── Toolkit from popup ────────────────────────────────────────────────
    if (request.action === 'RUN_ANNOTATOR') { injectAnnotator(request.tabId); return true; }
    if (request.action === 'RUN_VISUAL_EDIT') { injectVisualEdit(request.tabId); return true; }
    if (request.action === 'RUN_SPOTLIGHT') { injectSpotlight(request.tabId); return true; }
    if (request.action === 'RUN_COPY_SELECTOR') { injectCopySelector(request.tabId); return true; }
    if (request.action === 'RUN_NUKE_MODALS') { injectNukeModals(request.tabId); return true; }
    if (request.action === 'RUN_DOMAIN_WIPE') { injectDomainWipe(request.tabId); return true; }
});

// ── Context Menu Setup ────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: 'gigasnap', title: '📸 Snapshot: GigaSnap (Optimized)', contexts: ['all'] });
        chrome.contextMenus.create({ id: 'gigaraw',  title: '📋 Snapshot: Raw Full DOM', contexts: ['all'] });
        chrome.contextMenus.create({ id: 'annotator', title: '✏️ Design: AI Annotator', contexts: ['all'] });
        chrome.contextMenus.create({ id: 'visual_edit', title: '🎨 Design: Visual Edit Mode', contexts: ['all'] });
        chrome.contextMenus.create({ id: 'spotlight', title: '🔦 Design: Spotlight Mode', contexts: ['all'] });
        chrome.contextMenus.create({ id: 'copy_selector', title: '📐 Dev: Copy CSS Selector', contexts: ['all'] });
        chrome.contextMenus.create({ id: 'nuke_modals', title: '💣 Dev: Nuke Modals', contexts: ['all'] });
        chrome.contextMenus.create({ id: 'domain_wipe', title: '🧹 Session: Domain Wipe', contexts: ['all'] });
    });
});

// ── In-page toast helper for background ──────────────────────────────
function injectToast(tabId, msg, type = 'info') {
    const colors = { info: '#6366f1', success: '#10b981', error: '#ef4444', warning: '#f59e0b' };
    const col = colors[type] || colors.info;
    chrome.scripting.executeScript({
        target: { tabId },
        func: (m, c) => {
            let container = document.getElementById('wdt-toasts');
            if (!container) {
                container = document.createElement('div'); container.id = 'wdt-toasts';
                container.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
                document.body.appendChild(container);
            }
            const t = document.createElement('div');
            t.style = `background:rgba(15,23,42,0.97);backdrop-filter:blur(14px);border-left:4px solid ${c};color:#f9fafb;padding:11px 22px;border-radius:12px;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;box-shadow:0 20px 25px -5px rgba(0,0,0,.6);opacity:0;transform:translateY(-16px);transition:all .35s cubic-bezier(.175,.885,.32,1.275);pointer-events:none;`;
            t.textContent = m; container.appendChild(t);
            setTimeout(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; }, 10);
            setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-16px)'; setTimeout(() => t.remove(), 350); }, 3500);
        },
        args: [msg, col]
    }).catch(() => {});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'gigasnap') handleGigaSnap(tab.id, false);
    else if (info.menuItemId === 'gigaraw') handleGigaSnap(tab.id, true);
    else if (info.menuItemId === 'annotator') injectAnnotator(tab.id);
    else if (info.menuItemId === 'visual_edit') injectVisualEdit(tab.id);
    else if (info.menuItemId === 'spotlight') injectSpotlight(tab.id);
    else if (info.menuItemId === 'copy_selector') injectCopySelector(tab.id);
    else if (info.menuItemId === 'nuke_modals') injectNukeModals(tab.id);
    else if (info.menuItemId === 'domain_wipe') injectDomainWipe(tab.id);
});

// ── Context-menu tool handlers ────────────────────────────────────────

function handleGigaSnap(tabId, raw, sendResponse) {
    injectToast(tabId, '📸 Capturing snapshot...', 'info');
    chrome.scripting.executeScript({
        target: { tabId },
        args: [raw],
        func: (isRaw) => {
            const cleanDom = (docEl) => {
                const clone = docEl.cloneNode(true);
                ['script','style','noscript','iframe','img','video','canvas','link','meta','head','template']
                    .forEach(s => clone.querySelectorAll(s).forEach(el => el.remove()));
                clone.querySelectorAll('svg').forEach(s => { s.innerHTML = '<!-- SVG -->'; });
                clone.querySelectorAll('*').forEach(el => {
                    for (let i = el.attributes.length - 1; i >= 0; i--) {
                        const n = el.attributes[i].name;
                        if (!/^(data-|aria-|class|id|href|src|value|type|name|role|placeholder|title)/.test(n)) el.removeAttribute(n);
                    }
                });
                return clone.outerHTML;
            };
            const detectStack = () => {
                const s = [];
                if (window.React || document.querySelector('[data-reactroot]')) s.push('React');
                if (window.next || window.__NEXT_DATA__) s.push('Next.js');
                if (window.Vue) s.push('Vue');
                if (window.jQuery) s.push('jQuery');
                if (window.Angular || document.querySelector('[ng-version]')) s.push('Angular');
                if (document.querySelector('link[href*="tailwind"]') || document.querySelector('[class*=":"]')) s.push('Tailwind');
                return s;
            };
            const perf = window.performance.getEntriesByType('navigation')[0] || {};
            const snap = {
                metadata: { timestamp: new Date().toISOString(), url: location.href, title: document.title },
                stack: detectStack(),
                performance: { loadTime: Math.round(perf.loadEventEnd || 0), domReady: Math.round(perf.domContentLoadedEventEnd || 0) },
                storage: { local: Object.assign({}, localStorage), session: Object.assign({}, sessionStorage) },
                errors: window.__DEV_VAULT_ERRORS || [],
                dom: isRaw ? document.documentElement.outerHTML : cleanDom(document.documentElement)
            };
            const txt = `### WEBDEV TOOLBOX SNAPSHOT\n${JSON.stringify(snap, null, 2)}`;
            const t = document.createElement('textarea'); document.body.appendChild(t);
            t.value = txt; t.select(); document.execCommand('copy'); t.remove();
            // Toast
            const toast = document.createElement('div');
            toast.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.97);backdrop-filter:blur(14px);border-left:4px solid #10b981;color:#f9fafb;padding:11px 22px;border-radius:12px;font-family:system-ui;font-size:13px;font-weight:600;z-index:2147483647;box-shadow:0 20px 25px -5px rgba(0,0,0,.6);opacity:0;transition:all .3s;';
            toast.textContent = '✅ GigaSnap copied! (DOM + Stack + Storage)';
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '1'; }, 10);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
        }
    }).then(() => { if (sendResponse) sendResponse({ success: true }); })
      .catch(() => { if (sendResponse) sendResponse({ success: false }); });
}

function injectAnnotator(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (window.__ANNOTATOR_ACTIVE) {
                // Show toast to indicate it's already active
                const t = document.createElement('div');
                t.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.97);backdrop-filter:blur(14px);border-left:4px solid #f59e0b;color:#f9fafb;padding:11px 22px;border-radius:12px;font-family:system-ui;font-size:13px;font-weight:600;z-index:2147483647;';
                t.textContent = '⚠️ Annotator already active'; document.body.appendChild(t);
                setTimeout(() => t.remove(), 2500); return;
            }
            window.__ANNOTATOR_ACTIVE = true;
            const selections = [];
            const container = document.createElement('div');
            container.id = '__vibe_annotator_ui';
            container.style = 'position:fixed;top:10px;right:10px;width:320px;max-height:80vh;background:#0f172a;border:1px solid #334155;border-radius:12px;z-index:9999999;color:white;display:flex;flex-direction:column;font-family:sans-serif;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);overflow:hidden;';
            container.innerHTML = `
                <div style="padding:12px;background:#1e293b;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:700;font-size:13px;color:#6366f1;">AI TASK ANNOTATOR</span>
                    <button id="__annotator_close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:18px;">&times;</button>
                </div>
                <div id="__annotator_list" style="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;">
                    <div style="color:#94a3b8;font-size:11px;text-align:center;padding:20px;">Click elements on the page to annotate them for AI...</div>
                </div>
                <div style="padding:12px;border-top:1px solid #334155;background:#0f172a;">
                    <button id="__annotator_copy" style="width:100%;background:#6366f1;border:none;color:white;padding:8px;border-radius:6px;font-weight:700;cursor:pointer;">Finish &amp; Copy AI Prompt</button>
                </div>
            `;
            document.body.appendChild(container);
            const list = container.querySelector('#__annotator_list');
            const highlight = document.createElement('div');
            highlight.style = 'position:fixed;background:rgba(99,102,241,0.1);border:2px dashed #6366f1;z-index:9999998;pointer-events:none;transition:all 0.05s;';
            document.body.appendChild(highlight);
            const getSelector = (el) => { if (el.id) return `#${el.id}`; return el.tagName.toLowerCase() + (el.className ? '.' + [...el.classList].join('.') : ''); };
            const refreshList = () => {
                if (!selections.length) { list.innerHTML = '<div style="color:#94a3b8;font-size:11px;text-align:center;padding:20px;">Click elements...</div>'; return; }
                list.innerHTML = selections.map((s,i) => `<div style="background:#1e293b;padding:8px;border-radius:6px;border:1px solid #334155;"><div style="font-family:monospace;font-size:10px;color:#818cf8;margin-bottom:4px;">${s.selector}</div><textarea data-idx="${i}" placeholder="Describe task..." style="width:100%;background:#0f172a;border:1px solid #334155;color:white;font-size:11px;padding:6px;border-radius:4px;resize:vertical;min-height:40px;">${s.comment||''}</textarea></div>`).join('');
                list.querySelectorAll('textarea').forEach(tx => tx.addEventListener('input', e => { selections[e.target.dataset.idx].comment = e.target.value; }));
            };
            const onMove = (e) => { if (container.contains(e.target)) return; const r = e.target.getBoundingClientRect(); highlight.style.top=`${r.top}px`;highlight.style.left=`${r.left}px`;highlight.style.width=`${r.width}px`;highlight.style.height=`${r.height}px`; };
            const onClick = (e) => { if (container.contains(e.target)) return; e.preventDefault(); e.stopPropagation(); selections.push({ selector: getSelector(e.target), comment: '' }); refreshList(); };
            const cleanup = () => { document.removeEventListener('mouseover', onMove); document.removeEventListener('click', onClick, true); container.remove(); highlight.remove(); window.__ANNOTATOR_ACTIVE = false; };
            container.querySelector('#__annotator_close').onclick = cleanup;
            container.querySelector('#__annotator_copy').onclick = () => {
                const prompt = `### AI TASK ANNOTATIONS\n\n${selections.map(s => `- **ELEMENT**: \`${s.selector}\`\n  **TASK**: ${s.comment || 'No task described.'}`).join('\n\n')}`;
                const tmp = document.createElement('textarea'); document.body.appendChild(tmp); tmp.value = prompt; tmp.select(); document.execCommand('copy'); tmp.remove();
                // In-page toast
                const t = document.createElement('div');
                t.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.97);backdrop-filter:blur(14px);border-left:4px solid #10b981;color:#f9fafb;padding:11px 22px;border-radius:12px;font-family:system-ui;font-size:13px;font-weight:600;z-index:2147483647;';
                t.textContent = '✅ AI Annotations copied!'; document.body.appendChild(t);
                setTimeout(() => t.remove(), 2500);
                cleanup();
            };
            document.addEventListener('mouseover', onMove, { passive: true });
            document.addEventListener('click', onClick, true);
        }
    });
}

function injectVisualEdit(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            document.designMode = document.designMode === 'on' ? 'off' : 'on';
            const t = document.createElement('div');
            t.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.97);backdrop-filter:blur(14px);border-left:4px solid #6366f1;color:#f9fafb;padding:11px 22px;border-radius:12px;font-family:system-ui;font-size:13px;font-weight:600;z-index:2147483647;';
            t.textContent = `✏️ Visual Edit: ${document.designMode.toUpperCase()}`; document.body.appendChild(t);
            setTimeout(() => t.remove(), 2500);
        }
    });
}

function injectSpotlight(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const id = 'wdt-spotlight';
            if (document.getElementById(id)) { document.getElementById(id).remove(); document.removeEventListener('mousemove', window.__WDT_SPOT); return; }
            const mask = document.createElement('div'); mask.id = id;
            mask.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.9);z-index:999998;pointer-events:none;';
            document.body.appendChild(mask);
            window.__WDT_SPOT = (e) => { mask.style.background = `radial-gradient(circle at ${e.clientX}px ${e.clientY}px, transparent 150px, rgba(0,0,0,0.95) 200px)`; };
            document.addEventListener('mousemove', window.__WDT_SPOT);
            const t = document.createElement('div');
            t.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.97);backdrop-filter:blur(14px);border-left:4px solid #6366f1;color:#f9fafb;padding:11px 22px;border-radius:12px;font-family:system-ui;font-size:13px;font-weight:600;z-index:2147483647;';
            t.textContent = '🔦 Spotlight: ACTIVE'; document.body.appendChild(t);
            setTimeout(() => t.remove(), 2000);
        }
    });
}

function injectCopySelector(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const t = document.createElement('div');
            t.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.97);backdrop-filter:blur(14px);border-left:4px solid #f59e0b;color:#f9fafb;padding:11px 22px;border-radius:12px;font-family:system-ui;font-size:13px;font-weight:600;z-index:2147483647;';
            t.textContent = '📐 Click any element to copy its CSS selector'; document.body.appendChild(t);
            setTimeout(() => t.remove(), 3000);
            const h = (e) => {
                e.preventDefault(); e.stopPropagation();
                let el = e.target, p = [];
                while (el && el.nodeType === 1) { let s = el.tagName.toLowerCase(); if (el.id) { s += '#' + el.id; p.unshift(s); break; } p.unshift(s); el = el.parentNode; }
                const sel = p.join(' > ');
                const tmp = document.createElement('textarea'); document.body.appendChild(tmp); tmp.value = sel; tmp.select(); document.execCommand('copy'); tmp.remove();
                const t2 = document.createElement('div');
                t2.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.97);backdrop-filter:blur(14px);border-left:4px solid #10b981;color:#f9fafb;padding:11px 22px;border-radius:12px;font-family:system-ui;font-size:13px;font-weight:600;z-index:2147483647;';
                t2.textContent = `✅ Copied: ${sel.slice(0, 40)}`; document.body.appendChild(t2);
                setTimeout(() => t2.remove(), 2500);
                document.removeEventListener('click', h, true);
            };
            document.addEventListener('click', h, true);
        }
    });
}

function injectNukeModals(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const nuked = Array.from(document.querySelectorAll('*')).filter(el => {
                const s = getComputedStyle(el);
                return (s.position === 'fixed' || s.position === 'sticky') && (el.offsetWidth > window.innerWidth * 0.4 || el.offsetHeight > window.innerHeight * 0.4) && el.id !== 'wdt-toasts';
            });
            nuked.forEach(el => el.remove());
            document.body.style.overflow = 'auto';
            const t = document.createElement('div');
            t.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.97);backdrop-filter:blur(14px);border-left:4px solid #ef4444;color:#f9fafb;padding:11px 22px;border-radius:12px;font-family:system-ui;font-size:13px;font-weight:600;z-index:2147483647;';
            t.textContent = `💣 Nuked ${nuked.length} overlay(s)`; document.body.appendChild(t);
            setTimeout(() => t.remove(), 2500);
        }
    });
}

function injectDomainWipe(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            localStorage.clear(); sessionStorage.clear();
            document.cookie.split(';').forEach(c => { document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/'); });
            const t = document.createElement('div');
            t.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.97);backdrop-filter:blur(14px);border-left:4px solid #ef4444;color:#f9fafb;padding:11px 22px;border-radius:12px;font-family:system-ui;font-size:13px;font-weight:600;z-index:2147483647;';
            t.textContent = '🧹 Domain data wiped! Reloading...'; document.body.appendChild(t);
            setTimeout(() => { t.remove(); location.reload(); }, 1500);
        }
    });
}

