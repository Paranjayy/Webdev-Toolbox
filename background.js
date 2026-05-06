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

    // ── Clear storage errors (called from popup) ────────────────────────
    if (request.action === 'CLEAR_STORAGE_ERRORS') {
        chrome.storage.local.set({ extension_errors: [] }, () => {
            lastErrorCount = 0;
            chrome.action.setBadgeText({ text: '' });
            sendResponse({ ok: true });
        });
        return true;
    }

    if (request.action === 'PERFORM_SNAPSHOT') {
        handleDOMCleaner(sender.tab?.id || request.tabId, request.raw || false);
        sendResponse({ success: true });
    } else if (request.action === 'PERFORM_MACRO') {
        handleVibeRecorder(sender.tab?.id || request.tabId);
        sendResponse({ success: true });
    } else if (request.action === 'PERFORM_DESIGN_LAB') {
        handleDesignLab(sender.tab?.id || request.tabId);
        sendResponse({ success: true });
    }
    return true;
});

// Network buffer to catch the "last few requests" for forensic context
let vaultTrafficBuffer = [];
chrome.webRequest?.onBeforeRequest.addListener(
    (details) => {
        if (details.tabId === -1) return;
        vaultTrafficBuffer.push({
            url: details.url,
            method: details.method,
            timestamp: new Date().toISOString()
        });
        if (vaultTrafficBuffer.length > 50) vaultTrafficBuffer.shift();
    },
    { urls: ["<all_urls>"] }
);

async function handleDOMCleaner(tabId, raw = false) {
    const traffic = [...vaultTrafficBuffer];
    
    // Capture screenshot first
    let screenshot = null;
    try {
        screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 50 });
    } catch (e) {
        console.warn("Screenshot capture failed:", e);
    }

    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (isRaw, netBuffer, ss) => {
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
                            if (!/^(data-|aria-|class|id|href|src|value|type|name|role|placeholder|title)/.test(n)) el.removeAttribute(n);
                        }
                        if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && el.innerHTML.trim() === '' && el.attributes.length === 0) el.remove();
                    });
                    return cloned.outerHTML;
                };
                return traverse(docEl);
            };

            const extractVisualDNA = () => {
                const colors = new Set();
                const fonts = new Set();
                
                const samples = document.querySelectorAll('h1, h2, h3, p, button, a, div[class*="hero"], div[class*="nav"]');
                samples.forEach(el => {
                    const style = window.getComputedStyle(el);
                    if (style.color && !style.color.includes('rgba(0, 0, 0, 0)')) colors.add(style.color);
                    if (style.backgroundColor && !style.backgroundColor.includes('rgba(0, 0, 0, 0)')) colors.add(style.backgroundColor);
                    if (style.fontFamily) fonts.add(style.fontFamily.split(',')[0].replace(/['"]/g, ''));
                });

                return {
                    palette: [...colors].slice(0, 8),
                    typography: [...fonts].slice(0, 4)
                };
            };

            const detectStack = () => {
                const stack = [];
                if (window.React || document.querySelector('[data-reactroot]')) stack.push('React');
                if (window.next || window.__NEXT_DATA__) stack.push('Next.js');
                if (window.Vue || document.querySelector('[data-v-root]')) stack.push('Vue.js');
                if (window.jQuery) stack.push('jQuery');
                if (window.Angular || document.querySelector('[ng-app], [ng-version]')) stack.push('Angular');
                if (window.Svelte || document.querySelector('[class*="svelte-"]')) stack.push('Svelte');
                if (document.documentElement.classList.contains('tw-') || document.querySelector('[class*=":"]') || document.querySelector('link[href*="tailwind"]')) stack.push('Tailwind');
                return stack;
            };

            const agent_intel = {
                ua: navigator.userAgent,
                lang: navigator.language,
                screen: `${window.innerWidth}x${window.innerHeight}`,
                cookies_enabled: navigator.cookieEnabled,
                do_not_track: navigator.doNotTrack
            };

            const getNetworkSummary = () => {
                const perf = performance.getEntriesByType('resource');
                return perf.slice(-10).map(p => ({ url: p.name, type: p.initiatorType, duration: Math.round(p.duration) }));
            };

            const getStorageSummary = () => {
                return {
                    local: Object.keys(localStorage).length,
                    session: Object.keys(sessionStorage).length
                };
            };

            const snapshot = {
                metadata: { 
                    timestamp: new Date().toISOString(), 
                    url: window.location.href, 
                    title: document.title,
                    type: isRaw ? 'Raw-DOM' : 'Clean-DOM',
                    agent_intel,
                    performance: performance.getEntriesByType('navigation')[0] || {},
                    network_recent: getNetworkSummary(),
                    network_vault: netBuffer,
                    console_logs: window.__VAULT_CONSOLE_LOGS || [],
                    storage_keys: getStorageSummary(),
                    referrer: document.referrer,
                    screenshot: ss,
                    visual_dna: extractVisualDNA()
                },
                stack: detectStack(),
                dom_content: isRaw ? document.documentElement.outerHTML : cleanDomForTokens(document.documentElement)
            };

            const prompt = `### DOM CLEANER SNAPSHOT\n${JSON.stringify(snapshot, null, 2)}`;
            const tmp = document.createElement('textarea');
            tmp.value = prompt; document.body.appendChild(tmp);
            tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
            return snapshot;
        },
        args: [raw, traffic, screenshot]
    });

    if (results?.[0]?.result) {
        const snap = results[0].result;
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = Array.isArray(res.snap_history) ? res.snap_history : [];
            history.unshift(snap);
            chrome.storage.local.set({ snap_history: history.slice(0, 10) });
        });
        showContentToast(tabId, `${snap.metadata.type} captured with visual context!`, 'success');
    }
}

async function handleVibeRecorder(tabId) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
            if (window.__MACRO_ACTIVE) {
                const events = window.__MACRO_EVENTS || [];
                const script = `const { test, expect } = require('@playwright/test');\n\ntest('recorded session', async ({ page }) => {\n  await page.goto('${window.location.href}');\n  ${events.map(e => {
                    if (e.type === 'click') return `  await page.click('${e.selector}');`;
                    if (e.type === 'input') return `  await page.fill('${e.selector}', '${e.value}');`;
                    return '';
                }).filter(Boolean).join('\n')}\n});`;
                
                const tmp = document.createElement('textarea');
                tmp.value = script; document.body.appendChild(tmp);
                tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
                
                alert(`Macro Exported! Copied ${events.length} steps as Playwright script.`);
                window.__MACRO_ACTIVE = false;
                document.getElementById('macro-indicator')?.remove();
                
                document.removeEventListener('click', window.__MACRO_CLICK, true);
                document.removeEventListener('input', window.__MACRO_INPUT, true);
                return;
            }

            window.__MACRO_ACTIVE = true;
            window.__MACRO_EVENTS = [];
            const indicator = document.createElement('div');
            indicator.id = 'macro-indicator';
            indicator.style = 'position:fixed; top:20px; right:20px; background:#ef4444; color:white; padding:8px 15px; border-radius:20px; z-index:1000000; font-family:sans-serif; font-size:12px; font-weight:bold; animation: pulse 1s infinite; border: 2px solid white; pointer-events:none;';
            indicator.innerText = '🔴 RECORDING MACRO...';
            document.body.appendChild(indicator);

            const getSelector = (el) => {
                if (el.id) return `#${el.id}`;
                if (el.className && typeof el.className === 'string') return `.${el.className.split(' ')[0]}`;
                return el.tagName.toLowerCase();
            };

            window.__MACRO_CLICK = (e) => {
                if (!window.__MACRO_ACTIVE) return;
                window.__MACRO_EVENTS.push({ type: 'click', selector: getSelector(e.target) });
            };

            window.__MACRO_INPUT = (e) => {
                if (!window.__MACRO_ACTIVE) return;
                window.__MACRO_EVENTS.push({ type: 'input', selector: getSelector(e.target), value: e.target.value });
            };

            document.addEventListener('click', window.__MACRO_CLICK, true);
            document.addEventListener('input', window.__MACRO_INPUT, true);
        }
    });
}

async function showContentToast(tabId, message, type = 'success') {
    chrome.scripting.executeScript({
        target: { tabId },
        func: (msg, t) => {
            const id = '__toolbox_toast';
            const styleId = '__toolbox_toast_style';
            
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.innerHTML = `
                    @keyframes toolboxToastIn { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
                    .__toolbox-toast { position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#161b22; color:white; padding:12px 24px; border-radius:12px; z-index:2147483647; font-family:sans-serif; font-size:14px; font-weight:600; box-shadow:0 10px 40px rgba(0,0,0,0.8); animation: toolboxToastIn 0.3s ease forwards; pointer-events:none; }
                `;
                (document.head || document.documentElement).appendChild(style);
            }

            if (document.getElementById(id)) document.getElementById(id).remove();
            const toast = document.createElement('div');
            toast.id = id;
            toast.className = '__toolbox-toast';
            const colors = { success: '#2ea043', error: '#f85149', info: '#3b82f6' };
            toast.style.border = `1px solid ${colors[t] || colors.info}`;
            toast.innerText = msg;
            
            (document.body || document.documentElement).appendChild(toast);
            
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.5s ease';
                setTimeout(() => toast.remove(), 500);
            }, 3000);
        },
        args: [message, type]
    }).catch(() => {});
}

async function handleDesignLab(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (window.__LAB_ACTIVE) return;
            window.__LAB_ACTIVE = true;
            let selections = [];
            let isPicking = true;

            const container = document.createElement('div');
            container.id = '__lab_ui';
            container.style = `
                position: fixed; top: 10px; right: 10px; width: 340px; max-height: 90vh;
                background: #0d1117; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
                z-index: 9999999; color: white; display: flex; flex-direction: column;
                font-family: sans-serif; box-shadow: 0 30px 60px rgba(0,0,0,0.6);
                overflow: hidden; animation: labIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
            `;
            container.innerHTML = `
                <style>
                    @keyframes labIn { from { transform: translateX(120%) scale(0.9); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
                    .__lab-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); }
                    .__lab-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2.5px; color: #ff00ff; text-shadow: 0 0 15px rgba(255,0,255,0.4); }
                    .__lab-close { cursor: pointer; opacity: 0.6; transition: 0.2s; font-size: 16px; font-weight: bold; }
                    .__lab-close:hover { opacity: 1; color: #ff00ff; transform: rotate(90deg); }
                    
                    .__lab-toolbar { padding: 12px 20px; display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.05); }
                    .__lab-pick-btn { 
                        background: rgba(255, 0, 255, 0.1); border: 1px solid rgba(255, 0, 255, 0.3); 
                        color: #ff00ff; border-radius: 8px; padding: 6px 12px; font-size: 10px; font-weight: 800; 
                        cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;
                    }
                    .__lab-pick-btn.active { background: #ff00ff; color: white; box-shadow: 0 0 15px rgba(255,0,255,0.4); }
                    
                    .__lab-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(255,255,255,0.08); transition: max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden; }
                    .__lab-grid.collapsed { max-height: 0; }
                    .__lab-btn { background: #0d1117; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: none; cursor: pointer; transition: 0.3s; position: relative; overflow: hidden; }
                    .__lab-btn:hover { background: rgba(255, 0, 255, 0.05); }
                    .__lab-btn span { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: rgba(255,255,255,0.5); }
                    .__lab-btn.active { background: rgba(255, 0, 255, 0.15); }
                    .__lab-btn.active span { color: #ff00ff; }

                    .__lab-selections { max-height: 250px; overflow-y: auto; background: rgba(0,0,0,0.2); }
                    .__selection-item { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 10px; }
                    .__selection-tag { font-size: 9px; font-weight: 900; color: #ff00ff; text-transform: uppercase; }
                    .__selection-desc { font-size: 10px; color: rgba(255,255,255,0.5); font-family: monospace; }
                    .__selection-prompt { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: white; padding: 6px 10px; font-size: 10px; outline: none; }
                    .__selection-prompt:focus { border-color: #ff00ff; }

                    .__lab-footer { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border-top: 1px solid rgba(255,255,255,0.05); }
                    .__lab-stats { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.3); }
                    .__lab-export { background: linear-gradient(135deg, #ff00ff, #8b5cf6); color: white; border: none; border-radius: 12px; padding: 10px 20px; font-size: 11px; font-weight: 900; cursor: pointer; box-shadow: 0 4px 15px rgba(255,0,255,0.3); }
                </style>
                <div class="__lab-header">
                    <div class="__lab-title">Superpowers Design Lab</div>
                    <span class="__lab-close">✕</span>
                </div>
                <div class="__lab-toolbar">
                    <button class="__lab-pick-btn active" id="__lab_pick_toggle">PICK MODE</button>
                    <div style="flex:1"></div>
                    <button id="__lab_grid_toggle" style="background:none; border:none; color:#ff00ff; font-size:9px; font-weight:900; cursor:pointer;">HIDE GRID</button>
                </div>
                <div class="__lab-main">
                    <div class="__lab-grid" id="__lab_grid_panel">
                        <button class="__lab-btn"><span>Bolder</span></button>
                        <button class="__lab-btn"><span>Quieter</span></button>
                        <button class="__lab-btn"><span>Distill</span></button>
                        <button class="__lab-btn"><span>Polish</span></button>
                        <button class="__lab-btn"><span>Typeset</span></button>
                        <button class="__lab-btn"><span>Colorize</span></button>
                        <button class="__lab-btn"><span>Layout</span></button>
                        <button class="__lab-btn"><span>Adapt</span></button>
                    </div>
                    <div class="__lab-selections" id="__lab_selections_list"></div>
                </div>
                <div class="__lab-footer">
                    <div class="__lab-stats" id="__lab_counter">0 ELEMENTS</div>
                    <button class="__lab-export">CAPTURE DATA</button>
                </div>
            `;
            document.body.appendChild(container);

            const highlight = document.createElement('div');
            highlight.style = 'position:fixed; background:rgba(255,0,255,0.1); border:2px solid #ff00ff; z-index:9999998; pointer-events:none; transition: all 0.1s;';
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

            const updateUI = () => {
                const list = container.querySelector('#__lab_selections_list');
                const counter = container.querySelector('#__lab_counter');
                counter.innerText = `${selections.length} ELEMENTS LOCKED`;
                
                list.innerHTML = selections.map((s, i) => `
                    <div class="__selection-item">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div class="__selection-tag">${s.tagName}</div>
                            <span class="__selection-remove" style="cursor:pointer; opacity:0.5" data-idx="${i}">✕</span>
                        </div>
                        <div class="__selection-desc">${s.preview}</div>
                        <input type="text" class="__selection-prompt" data-idx="${i}" placeholder="Specific prompt for this element..." value="${s.prompt || ''}">
                    </div>
                `).join('');

                list.querySelectorAll('.__selection-remove').forEach(btn => {
                    btn.onclick = () => {
                        const idx = parseInt(btn.dataset.idx);
                        selections[idx].anchor.remove();
                        selections.splice(idx, 1);
                        updateUI();
                    };
                });

                list.querySelectorAll('.__selection-prompt').forEach(input => {
                    input.oninput = (e) => {
                        selections[parseInt(e.target.dataset.idx)].prompt = e.target.value;
                    };
                });
            };

            const onMouseOver = (e) => {
                if (!isPicking || container.contains(e.target)) return;
                const rect = e.target.getBoundingClientRect();
                highlight.style.top = `${rect.top}px`;
                highlight.style.left = `${rect.left}px`;
                highlight.style.width = `${rect.width}px`;
                highlight.style.height = `${rect.height}px`;
                highlight.style.opacity = '1';
                
                const cs = window.getComputedStyle(e.target);
                highlight.innerHTML = `<div style="position:absolute; bottom:100%; left:0; background:#ff00ff; color:white; font-size:8px; font-weight:900; padding:2px 6px; border-radius:4px 4px 0 0;">${e.target.tagName}</div>`;
            };

            const onClick = (e) => {
                if (!isPicking || container.contains(e.target)) return;
                e.preventDefault(); e.stopPropagation();
                
                const sel = getSelector(e.target);
                const rect = e.target.getBoundingClientRect();
                
                const anchor = document.createElement('div');
                anchor.style = `position:fixed; top:${rect.top}px; left:${rect.left}px; width:${rect.width}px; height:${rect.height}px; border:2px solid #ff00ff; background:rgba(255,0,255,0.15); z-index:9999998; pointer-events:none; border-radius:4px;`;
                document.body.appendChild(anchor);

                selections.push({
                    selector: sel,
                    tagName: e.target.tagName,
                    preview: (e.target.innerText || e.target.placeholder || '').slice(0, 30).trim() || 'No Content',
                    anchor,
                    prompt: '',
                    html: e.target.outerHTML.slice(0, 1000)
                });
                updateUI();
            };

            document.addEventListener('mouseover', onMouseOver);
            document.addEventListener('click', onClick, true);

            container.querySelector('.__lab-close').onclick = () => {
                document.removeEventListener('mouseover', onMouseOver);
                document.removeEventListener('click', onClick, true);
                selections.forEach(s => s.anchor.remove());
                container.remove();
                highlight.remove();
                window.__LAB_ACTIVE = false;
            };

            container.querySelector('#__lab_pick_toggle').onclick = (e) => {
                isPicking = !isPicking;
                e.target.classList.toggle('active', isPicking);
                highlight.style.opacity = isPicking ? '1' : '0';
            };

            container.querySelector('#__lab_grid_toggle').onclick = (e) => {
                const panel = container.querySelector('#__lab_grid_panel');
                panel.classList.toggle('collapsed');
                e.target.innerText = panel.classList.contains('collapsed') ? 'SHOW GRID' : 'HIDE GRID';
            };

            container.querySelector('.__lab-export').onclick = () => {
                const data = {
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    selections: selections.map(s => ({ selector: s.selector, prompt: s.prompt, html: s.html }))
                };
                const prompt = `### DESIGN LAB CAPTURE\n\n${JSON.stringify(data, null, 2)}`;
                const tmp = document.createElement('textarea');
                tmp.value = prompt; document.body.appendChild(tmp);
                tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
                alert("Sovereign Design Context Captured & Copied to Clipboard!");
            };
        }
    });
}

// ── Context Menu Setup ───────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "webdev_toolbox",
        title: "🛠 Webdev Toolbox",
        contexts: ["all"]
    });

    chrome.contextMenus.create({
        id: "ai_context_capture",
        parentId: "webdev_toolbox",
        title: "🧹 AI: Context Capture",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "design_lab",
        parentId: "webdev_toolbox",
        title: "🧪 AI: Design Lab Superpowers",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "visual_edit",
        parentId: "webdev_toolbox",
        title: "🎨 Design: Toggle Edit Mode",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "vibe_recorder",
        parentId: "webdev_toolbox",
        title: "🎬 Macro: Vibe Recorder",
        contexts: ["all"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "ai_context_capture") {
        handleDOMCleaner(tab.id, false);
    } else if (info.menuItemId === "vibe_recorder") {
        handleVibeRecorder(tab.id);
    } else if (info.menuItemId === "design_lab") {
        handleDesignLab(tab.id);
    } else if (info.menuItemId === "visual_edit") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                document.designMode = document.designMode === 'on' ? 'off' : 'on';
                alert(`Design Mode: ${document.designMode.toUpperCase()}`);
            }
        });
    }
});
