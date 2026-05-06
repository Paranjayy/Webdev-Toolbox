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
    }
    return true;
});

async function handleDOMCleaner(tabId, raw = false) {
<<<<<<< Updated upstream
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (isRaw) => {
=======
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
>>>>>>> Stashed changes
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
                
                // Sample some elements for colors and fonts
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

            const snapshot = {
                metadata: { 
                    timestamp: new Date().toISOString(), 
                    url: window.location.href, 
                    title: document.title,
                    type: isRaw ? 'Raw-DOM' : 'Clean-DOM',
                    agent_intel,
<<<<<<< Updated upstream
                    performance: performance.getEntriesByType('navigation')[0] || {}
=======
                    performance: performance.getEntriesByType('navigation')[0] || {},
                    network_recent: getNetworkSummary(),
                    network_vault: netBuffer,
                    console_logs: window.__VAULT_CONSOLE_LOGS || [],
                    storage_keys: getStorageSummary(),
                    referrer: document.referrer,
                    screenshot: ss,
                    visual_dna: extractVisualDNA()
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        args: [raw]
=======
        args: [raw, traffic, screenshot]
>>>>>>> Stashed changes
    });

    if (results?.[0]?.result) {
        const snap = results[0].result;
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = Array.isArray(res.snap_history) ? res.snap_history : [];
            history.unshift(snap);
            // Keep up to 10 snapshots for a better gallery experience
            chrome.storage.local.set({ snap_history: history.slice(0, 10) });
        });
<<<<<<< Updated upstream
=======
        showContentToast(tabId, `${snap.metadata.type} captured with visual context!`, 'success');
>>>>>>> Stashed changes
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
                
                // Cleanup listeners
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

<<<<<<< Updated upstream
=======
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

>>>>>>> Stashed changes
// ── Context Menu Setup ───────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    // Parent Menu
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
        id: "element_tagger",
        parentId: "webdev_toolbox",
        title: "📝 AI: Element Tagger",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "visual_edit",
        parentId: "webdev_toolbox",
        title: "🎨 Design: Toggle Edit Mode",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "inspect_style",
        parentId: "webdev_toolbox",
        title: "🔍 Design: Inspect Style",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "copy_selector",
        parentId: "webdev_toolbox",
        title: "📋 Dev: Copy Selector",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "nuke_element",
        parentId: "webdev_toolbox",
        title: "💀 Dev: Nuke Element",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "css_roulette",
        parentId: "webdev_toolbox",
        title: "🎲 Chaos: CSS Roulette",
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
    } else if (info.menuItemId === "visual_edit") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                document.designMode = document.designMode === 'on' ? 'off' : 'on';
                alert(`Design Mode: ${document.designMode.toUpperCase()}`);
            }
        });
    } else if (info.menuItemId === "inspect_style") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // We use a small hack to get the element under context menu click
                // since 'all' context doesn't pass the element directly in MV3 background script
                // we'll use the last right-clicked element if we tracked it, 
                // or just ask the user to click again for simplicity in this lab tool.
                alert('Click an element to see its core styles in the console.');
                const handler = (e) => {
                    e.preventDefault();
                    const style = window.getComputedStyle(e.target);
                    console.log(`%c [VAULT INSPECT] ${e.target.tagName} `, 'background: #6366f1; color: white; font-weight: bold;');
                    console.log('Font:', style.fontFamily, style.fontSize, style.fontWeight);
                    console.log('Colors:', { color: style.color, background: style.backgroundColor });
                    console.log('Spacing:', { margin: style.margin, padding: style.padding });
                    console.log('Element:', e.target);
                    document.removeEventListener('click', handler, true);
                };
                document.addEventListener('click', handler, true);
            }
        });
    } else if (info.menuItemId === "copy_selector") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                alert('Click an element to copy its unique CSS selector.');
                const handler = (e) => {
                    e.preventDefault();
                    const getSelector = (el) => {
                        if (el.id) return `#${el.id}`;
                        let path = [];
                        while (el && el.nodeType === Node.ELEMENT_NODE) {
                            let selector = el.nodeName.toLowerCase();
                            if (el.id) {
                                selector += '#' + el.id;
                                path.unshift(selector);
                                break;
                            } else {
                                let sibling = el, nth = 1;
                                while (sibling = sibling.previousElementSibling) if (sibling.nodeName === el.nodeName) nth++;
                                if (nth !== 1) selector += `:nth-of-type(${nth})`;
                            }
                            path.unshift(selector);
                            el = el.parentNode;
                        }
                        return path.join(' > ');
                    };
                    const selector = getSelector(e.target);
                    const tmp = document.createElement('textarea');
                    tmp.value = selector;
                    document.body.appendChild(tmp);
                    tmp.select();
                    document.execCommand('copy');
                    document.body.removeChild(tmp);
                    console.log('Copied Selector:', selector);
                    document.removeEventListener('click', handler, true);
                };
                document.addEventListener('click', handler, true);
            }
        });
    } else if (info.menuItemId === "nuke_element") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                alert('Click any element to delete it from the DOM.');
                const handler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.target.remove();
                    document.removeEventListener('click', handler, true);
                };
                document.addEventListener('click', handler, true);
            }
        });
    } else if (info.menuItemId === "css_roulette") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const root = document.documentElement;
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
                const uniqueVars = [...new Set(variables)];
                uniqueVars.forEach(v => {
                    const randomColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
                    root.style.setProperty(v, randomColor);
                });
                alert(`Chaos Unleashed! Shuffled ${uniqueVars.length} CSS Variables.`);
            }
        });
    } else if (info.menuItemId === "color_tweak") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                alert('Click an element to cycle its colors.');
                const handler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const colors = ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
                    const current = e.target.style.color;
                    const next = colors[(colors.indexOf(current) + 1) % colors.length];
                    e.target.style.color = next;
                    e.target.style.borderColor = next;
                    // If it has a background-color that isn't transparent, maybe tweak that too
                    const bg = window.getComputedStyle(e.target).backgroundColor;
                    if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                        e.target.style.backgroundColor = `${next}22`; // 20% opacity
                    }
                    console.log('Tweaked Color to:', next);
                    // Don't remove listener yet, allow multiple clicks. 
                    // Add a way to stop? Maybe a keypress or just leave it for the session.
                    // For now, let's just make it a one-off or limited.
                    // Actually, let's just stop after 10 seconds.
                    setTimeout(() => document.removeEventListener('click', handler, true), 10000);
                };
                document.addEventListener('click', handler, true);
            }
        });
    } else if (info.menuItemId === "element_tagger") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__TAGGER_ACTIVE) return;
                window.__TAGGER_ACTIVE = true;
                const selections = [];

                const container = document.createElement('div');
                container.id = '__toolbox_tagger_ui';
                container.style = `
                    position: fixed; top: 10px; right: 10px; width: 320px; max-height: 80vh;
                    background: #0f172a; border: 1px solid #334155; border-radius: 12px;
                    z-index: 9999999; color: white; display: flex; flex-direction: column;
                    font-family: sans-serif; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
                    overflow: hidden;
                `;
                container.innerHTML = `
<<<<<<< Updated upstream
                    <div style="padding:12px; background:#1e293b; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:700; font-size:13px; color:#6366f1;">AI ELEMENT TAGGER</span>
                        <button id="__tagger_close" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:18px;">&times;</button>
=======
                    <style>
                        @keyframes labIn { from { transform: translateX(120%) scale(0.9); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
                        .__lab-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); }
                        .__lab-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2.5px; color: #ff00ff; text-shadow: 0 0 15px rgba(255,0,255,0.4); }
                        .__lab-controls { display: flex; gap: 12px; align-items: center; }
                        .__lab-close { cursor: pointer; opacity: 0.6; transition: 0.2s; font-size: 16px; font-weight: bold; }
                        .__lab-close:hover { opacity: 1; color: #ff00ff; transform: rotate(90deg); }
                        
                        .__lab-toolbar { padding: 12px 20px; display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.05); }
                        .__lab-pick-btn { 
                            background: rgba(255, 0, 255, 0.1); border: 1px solid rgba(255, 0, 255, 0.3); 
                            color: #ff00ff; border-radius: 8px; padding: 6px 12px; font-size: 10px; font-weight: 800; 
                            cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;
                        }
                        .__lab-pick-btn.active { background: #ff00ff; color: white; box-shadow: 0 0 15px rgba(255,0,255,0.4); }
                        .__lab-pick-indicator { width: 6px; height: 6px; background: currentColor; border-radius: 50%; animation: pulse 1.5s infinite; }
                        @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }

                        .__lab-input-wrapper { flex: 1; position: relative; }
                        .__lab-input { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: white; padding: 8px 14px; font-size: 12px; outline: none; transition: 0.2s; }
                        .__lab-input:focus { border-color: #ff00ff; background: rgba(255,255,255,0.08); }
                        
                        .__lab-main { display: flex; flex-direction: column; }
                        .__lab-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(255,255,255,0.08); transition: max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden; }
                        .__lab-grid.collapsed { max-height: 0; }
                        .__lab-btn { background: #0d1117; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: none; cursor: pointer; transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1); position: relative; overflow: hidden; }
                        .__lab-btn:hover { background: rgba(255, 0, 255, 0.05); }
                        .__lab-btn i { font-size: 18px; margin-bottom: 2px; }
                        .__lab-btn span { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: rgba(255,255,255,0.5); }
                        .__lab-btn.active { background: rgba(255, 0, 255, 0.15); }
                        .__lab-btn.active span { color: #ff00ff; }
                        .__lab-btn::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 2px; background: #ff00ff; transform: scaleX(0); transition: 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                        .__lab-btn.active::after { transform: scaleX(1); }

                        .__lab-selections { max-height: 250px; overflow-y: auto; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.05); }
                        .__selection-item { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 10px; transition: 0.2s; }
                        .__selection-item:hover { background: rgba(255,255,255,0.02); }
                        .__selection-top { display: flex; justify-content: space-between; align-items: center; }
                        .__selection-info { display: flex; flex-direction: column; gap: 2px; }
                        .__selection-tag { font-size: 9px; font-weight: 900; color: #ff00ff; text-transform: uppercase; }
                        .__selection-desc { font-size: 10px; color: rgba(255,255,255,0.5); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; }
                        .__selection-prompt { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: white; padding: 6px 10px; font-size: 10px; outline: none; transition: 0.2s; }
                        .__selection-prompt:focus { border-color: #ff00ff; background: rgba(255,255,255,0.05); }
                        .__selection-remove { font-size: 14px; opacity: 0.4; cursor: pointer; transition: 0.2s; }
                        .__selection-remove:hover { opacity: 1; color: #ff00ff; }

                        .__lab-footer { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border-top: 1px solid rgba(255,255,255,0.05); }
                        .__lab-stats { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 1px; }
                        .__lab-export { background: linear-gradient(135deg, #ff00ff, #8b5cf6); color: white; border: none; border-radius: 12px; padding: 10px 20px; font-size: 11px; font-weight: 900; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 15px rgba(255,0,255,0.3); }
                        .__lab-export:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(255,0,255,0.5); }
                        .__lab-export:active { transform: translateY(0); }
                    </style>
                    <div class="__lab-header">
                        <div class="__lab-title">Design Lab Superpowers</div>
                        <div class="__lab-controls">
                            <span class="__lab-close">✕</span>
                        </div>
>>>>>>> Stashed changes
                    </div>
                    <div id="__tagger_list" style="flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px;">
                        <div style="color:#94a3b8; font-size:11px; text-align:center; padding:20px;">Click elements on the page to tag them for the AI...</div>
                    </div>
<<<<<<< Updated upstream
                    <div style="padding:12px; border-top:1px solid #334155; background:#0f172a;">
                        <button id="__tagger_copy" style="width:100%; background:#6366f1; border:none; color:white; padding:8px; border-radius:6px; font-weight:700; cursor:pointer;">Finish & Copy AI Prompt</button>
=======
                    <div class="__lab-main">
                        <div class="__lab-grid-header" id="__lab_grid_toggle" style="padding: 10px 16px; background: rgba(0,0,0,0.2); border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                            <span style="font-size: 9px; font-weight: 900; color: rgba(255,255,255,0.4); text-transform: uppercase;">Abilities & Skills</span>
                            <span id="__lab_grid_status" style="font-size: 9px; font-weight: 900; color: #ff00ff; text-transform: uppercase;">Hide</span>
                        </div>
                        <div class="__lab-grid" id="__lab_grid_panel">
                            <button class="__lab-btn" data-skill="bolder"><span>Bolder</span></button>
                            <button class="__lab-btn" data-skill="quieter"><span>Quieter</span></button>
                            <button class="__lab-btn" data-skill="distill"><span>Distill</span></button>
                            <button class="__lab-btn" data-skill="polish"><span>Polish</span></button>
                            <button class="__lab-btn" data-skill="typeset"><span>Typeset</span></button>
                            <button class="__lab-btn" data-skill="colorize"><span>Colorize</span></button>
                            <button class="__lab-btn" data-skill="layout"><span>Layout</span></button>
                            <button class="__lab-btn" data-skill="adapt"><span>Adapt</span></button>
                            <button class="__lab-btn" data-skill="animate"><span>Animate</span></button>
                            <button class="__lab-btn" data-skill="delight"><span>Delight</span></button>
                            <button class="__lab-btn" data-skill="overdrive"><span>Overdrive</span></button>
                            <button class="__lab-btn" data-skill="live-edit"><span>Live Edit</span></button>
                            <button class="__lab-btn" data-skill="frontend-design"><span>Design</span></button>
                            <button class="__lab-btn" data-skill="inspect"><span>Inspect</span></button>
                        </div>
                        <div class="__lab-selections-header" style="padding: 10px 16px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 9px; font-weight: 900; color: rgba(255,255,255,0.4); text-transform: uppercase;">Locked Targets</span>
                            <span id="__lab_clear_all" style="font-size: 9px; font-weight: 900; color: #ff00ff; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">Clear All</span>
                        </div>
                        <div class="__lab-selections" id="__lab_selections_list">
                            <!-- Selected elements go here -->
                        </div>
                    </div>
                    <div class="__lab-footer">
                        <div class="__lab-stats" id="__lab_counter">0 ELEMENTS LOCKED</div>
                        <button class="__lab-export">CAPTURE DATA</button>
>>>>>>> Stashed changes
                    </div>
                `;
                document.body.appendChild(container);

                const list = container.querySelector('#__tagger_list');
                const copyBtn = container.querySelector('#__tagger_copy');
                const closeBtn = container.querySelector('#__tagger_close');

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
                        list.innerHTML = '<div style="color:#94a3b8; font-size:11px; text-align:center; padding:20px;">Click elements on the page to tag them for the AI...</div>';
                        return;
                    }
                    list.innerHTML = selections.map((s, i) => `
<<<<<<< Updated upstream
                        <div style="background:#1e293b; padding:8px; border-radius:6px; border:1px solid #334155;">
                            <div style="font-family:monospace; font-size:10px; color:#818cf8; margin-bottom:4px; word-break:break-all;">${s.selector}</div>
                            <textarea data-idx="${i}" placeholder="Describe the task or issue here..." style="width:100%; background:#0f172a; border:1px solid #334155; color:white; font-size:11px; padding:6px; border-radius:4px; resize:vertical; min-height:40px;">${s.comment || ''}</textarea>
=======
                        <div class="__selection-item">
                            <div class="__selection-top">
                                <div class="__selection-info">
                                    <div class="__selection-tag">${s.tagName}</div>
                                    <div class="__selection-desc">${s.preview}</div>
                                </div>
                                <span class="__selection-remove" data-idx="${i}">✕</span>
                            </div>
                            <input type="text" class="__selection-prompt" data-idx="${i}" placeholder="Specific brief for this element..." value="${s.prompt || ''}">
>>>>>>> Stashed changes
                        </div>
                    `).join('');
                    list.querySelectorAll('textarea').forEach(tx => {
                        tx.addEventListener('input', (e) => { selections[e.target.dataset.idx].comment = e.target.value; });
                    });

                    list.querySelectorAll('.__selection-prompt').forEach(input => {
                        input.oninput = (e) => {
                            const idx = parseInt(e.target.dataset.idx);
                            selections[idx].prompt = e.target.value;
                        };
                    });
                };

                const onMouseOver = (e) => {
                    if (container.contains(e.target)) return;
                    const rect = e.target.getBoundingClientRect();
                    highlight.style.top = `${rect.top}px`;
                    highlight.style.left = `${rect.left}px`;
                    highlight.style.width = `${rect.width}px`;
                    highlight.style.height = `${rect.height}px`;
<<<<<<< Updated upstream
=======

                    // Color Palette Sniffer
                    const cs = window.getComputedStyle(e.target);
                    const colors = [cs.backgroundColor, cs.color];
                    const paletteHtml = colors.filter(c => c !== 'rgba(0, 0, 0, 0)').map(c => `
                        <div style="width:10px; height:10px; background:${c}; border:1px solid rgba(255,255,255,0.2); border-radius:50%;"></div>
                    `).join('');

                    // Asset & Image Preview
                    let assetHtml = '';
                    if (e.target.tagName === 'IMG') {
                        assetHtml = `<img src="${e.target.src}" style="width:16px; height:16px; border-radius:2px; object-fit:cover;">`;
                    } else {
                        const bgImg = cs.backgroundImage;
                        if (bgImg && bgImg !== 'none') {
                            const url = bgImg.match(/url\(["']?([^"']+)["']?\)/);
                            if (url) assetHtml = `<div style="width:16px; height:16px; border-radius:2px; background-image:url(${url[1]}); background-size:cover;"></div>`;
                        }
                    }
                    
                    highlight.innerHTML = `
                        <div style="position:absolute; bottom:100%; left:0; background:#ff00ff; color:white; font-size:8px; font-weight:900; padding:2px 6px; border-radius:4px 4px 0 0; display:flex; align-items:center; gap:4px; transform:translateY(-2px); white-space:nowrap; box-shadow:0 -4px 10px rgba(255,0,255,0.3);">
                            ${assetHtml} ${e.target.tagName} ${paletteHtml}
                        </div>
                    `;
>>>>>>> Stashed changes
                };

                const onClick = (e) => {
                    if (container.contains(e.target)) return;
                    e.preventDefault(); e.stopPropagation();
                    const sel = getSelector(e.target);
<<<<<<< Updated upstream
                    selections.push({ selector: sel, comment: '' });
                    refreshList();
=======
                    const rect = e.target.getBoundingClientRect();
                    
                    // Permanent Selection Anchor
                    const anchor = document.createElement('div');
                    anchor.className = '__lab-anchor';
                    anchor.style = `position:fixed; top:${rect.top}px; left:${rect.left}px; width:${rect.width}px; height:${rect.height}px; border:2px solid #ff00ff; background:rgba(255,0,255,0.15); z-index:9999998; pointer-events:none; box-shadow: 0 0 20px rgba(255,0,255,0.3); border-radius: 4px;`;
                    document.body.appendChild(anchor);

                    // Grab style context
                    const computed = window.getComputedStyle(e.target);
                    const coreStyles = {
                        display: computed.display,
                        margin: computed.margin,
                        padding: computed.padding,
                        color: computed.color,
                        background: computed.backgroundColor,
                        fontFamily: computed.fontFamily,
                        fontSize: computed.fontSize,
                        border: computed.border
                    };

                    selections.push({ 
                        selector: sel, 
                        tagName: e.target.tagName,
                        preview: (e.target.innerText || e.target.placeholder || e.target.value || '').slice(0, 40).trim() || 'No Content',
                        anchor,
                        prompt: '',
                        html: e.target.outerHTML.slice(0, 1500),
                        text: e.target.innerText.slice(0, 300),
                        styles: JSON.stringify(coreStyles)
                    });
                    
                    updateUI();
>>>>>>> Stashed changes
                };

                const cleanup = () => {
                    document.removeEventListener('mouseover', onMouseOver);
                    document.removeEventListener('click', onClick, true);
                    container.remove();
                    highlight.remove();
                    window.__TAGGER_ACTIVE = false;
                };

<<<<<<< Updated upstream
                closeBtn.onclick = cleanup;
                copyBtn.onclick = () => {
                    const prompt = `### AI TASK ANNOTATIONS\n\n${selections.map(s => `- **ELEMENT**: \`${s.selector}\`\n  **TASK**: ${s.comment || 'No specific task described.'}`).join('\n\n')}`;
=======
                // Event Listeners
                container.querySelector('.__lab-close').onclick = cleanup;
                
                container.querySelector('#__lab_clear_all').onclick = () => {
                    document.querySelectorAll('.__lab-anchor').forEach(a => a.remove());
                    selections = [];
                    updateUI();
                };

                const pickToggle = container.querySelector('#__lab_pick_toggle');
                pickToggle.onclick = () => {
                    isPicking = !isPicking;
                    pickToggle.classList.toggle('active', isPicking);
                    highlight.style.opacity = '0';
                    if (isPicking) {
                        pickToggle.innerHTML = '<div class="__lab-pick-indicator"></div> PICK MODE';
                        document.body.style.cursor = 'crosshair';
                    } else {
                        pickToggle.innerHTML = 'PAUSED (Selection Off)';
                        document.body.style.cursor = 'default';
                    }
                };

                const gridToggle = container.querySelector('#__lab_grid_toggle');
                const gridPanel = container.querySelector('#__lab_grid_panel');
                const gridStatus = container.querySelector('#__lab_grid_status');
                gridToggle.onclick = () => {
                    gridPanel.classList.toggle('collapsed');
                    gridStatus.innerText = gridPanel.classList.contains('collapsed') ? 'Show' : 'Hide';
                };

                // Remote Control
                const messageHandler = (req) => {
                    if (req.action === 'TOGGLE_PICK_MODE') pickToggle.click();
                };
                chrome.runtime.onMessage.addListener(messageHandler);

                // Keyboard Shortcuts
                window.addEventListener('keydown', (e) => {
                    if (e.key === 'p' && e.altKey && e.shiftKey) {
                        e.preventDefault();
                        pickToggle.click();
                    }
                });

                container.querySelectorAll('.__lab-btn').forEach(btn => {
                    btn.onclick = () => {
                        const skill = btn.dataset.skill;
                        
                        // Special Skill Actions
                        if (skill === 'live-edit') {
                            selections.forEach(s => {
                                const el = document.querySelector(s.selector);
                                if (el) {
                                    el.contentEditable = el.contentEditable === 'true' ? 'false' : 'true';
                                    el.style.outline = el.contentEditable === 'true' ? '2px dashed #ff00ff' : 'none';
                                }
                            });
                        }
                        
                        if (skill === 'inspect') {
                            if (selections.length > 0) {
                                console.log('%c [DESIGN LAB INSPECT] ', 'background: #ff00ff; color: white; font-weight: bold;');
                                selections.forEach(s => {
                                    console.log(`Tag: ${s.tagName} | Selector: ${s.selector}`);
                                    console.log('Styles:', JSON.parse(s.styles));
                                    console.log('---');
                                });
                            }
                        }

                        if (activeSkills.has(skill)) {
                            activeSkills.delete(skill);
                            btn.classList.remove('active');
                        } else {
                            activeSkills.add(skill);
                            btn.classList.add('active');
                        }
                    };
                });

                const triggerExport = () => {
                    const freeform = container.querySelector('.__lab-input').value;
                    const skills = Array.from(activeSkills);
                    
                    if (selections.length === 0 && skills.length === 0 && !freeform) {
                        alert("Select targets or choose skills first.");
                        return;
                    }

                    const prompt = `### SUPERPOWERS DESIGN LAB EXPORT\n\n**PRIMARY SKILLS**: ${skills.join(', ') || 'General Polish'}\n**GLOBAL INSTRUCTIONS**: ${freeform || 'Apply selected transformations.'}\n\n**LOCKED TARGETS**:\n${selections.map(s => `- **${s.tagName}** [\`${s.selector}\`]:\n  **CONTENT**: "${s.preview}"\n  **SPECIFIC BRIEF**: ${s.prompt || 'Apply global instructions'}\n  **HTML**: \n\`\`\`html\n${s.html}\n\`\`\`\n  **STYLES**: \`${s.styles}\``).join('\n\n')}\n\n**MISSION**: Perform a high-fidelity design upgrade. Maintain brand identity while maximizing visual impact and interactive delight.`;
                    
>>>>>>> Stashed changes
                    const tmp = document.createElement('textarea');
                    tmp.value = prompt; document.body.appendChild(tmp);
                    tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
                    alert('AI Task Annotations copied to clipboard!');
                    cleanup();
                };

                document.addEventListener('mouseover', onMouseOver, { passive: true });
                document.addEventListener('click', onClick, true);
            }
        });
    }
});
