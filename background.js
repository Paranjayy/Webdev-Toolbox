// ── Auto-poll active tabs for DOM errors every 8s ───────────────────────────
// ── Network & Error Interceptor (MAIN WORLD) ──────────────────────────────────
const INTERCEPTOR_SCRIPT = `
(function() {
    const originalFetch = window.fetch;
    const originalXHR = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;

    window.fetch = async (...args) => {
        try {
            const response = await originalFetch(...args);
            window.dispatchEvent(new CustomEvent('VAULT_TRAFFIC_LOG', { detail: { url: args[0], status: response.status, method: 'FETCH', time: new Date().toISOString() } }));
            if (response.status >= 500) {
                window.dispatchEvent(new CustomEvent('VAULT_NETWORK_ERROR', { detail: { url: args[0], status: response.status } }));
            }
            return response;
        } catch (error) {
            window.dispatchEvent(new CustomEvent('VAULT_NETWORK_ERROR', { detail: { url: args[0], status: 'FAILED' } }));
            throw error;
        }
    };

    window.XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        this._method = method;
        return originalXHR.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            window.dispatchEvent(new CustomEvent('VAULT_TRAFFIC_LOG', { detail: { url: this._url, status: this.status, method: this._method, time: new Date().toISOString() } }));
            if (this.status >= 500) {
                window.dispatchEvent(new CustomEvent('VAULT_NETWORK_ERROR', { detail: { url: this._url, status: this.status } }));
            }
        });
        return originalSend.apply(this, arguments);
    };

    // WebSocket Sniffer
    const originalWS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        const ws = new originalWS(url, protocols);
        window.dispatchEvent(new CustomEvent('VAULT_TRAFFIC_LOG', { detail: { url, status: 'OPENING', method: 'WS', time: new Date().toISOString() } }));
        ws.addEventListener('message', (e) => {
            const data = typeof e.data === 'string' ? e.data.slice(0, 100) : '[Binary]';
            window.dispatchEvent(new CustomEvent('VAULT_TRAFFIC_LOG', { detail: { url, status: 'MESSAGE', method: 'WS_DATA', payload: data, time: new Date().toISOString() } }));
        });
        return ws;
    };

    // Global variable hijacking for debugging
    window.$v = {
        scan: () => console.log('Vault Debugger Active'),
        rip: (el) => console.log('Element Ripped:', el),
        help: () => console.log('$v.scan(), $v.rip(el), $v.help()')
    };
})();
`;

// Global log buffer
let vaultTrafficBuffer = [];
let lastErrorCount = 0;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
        chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (code) => {
                const script = document.createElement('script');
                script.textContent = code;
                (document.head || document.documentElement).appendChild(script);
                script.remove();
            },
            args: [INTERCEPTOR_SCRIPT]
        }).catch(e => {});

        // Relay events from page to background
        chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                window.addEventListener('VAULT_TRAFFIC_LOG', (e) => {
                    chrome.runtime.sendMessage({ type: 'VAULT_TRAFFIC_LOG', ...e.detail });
                });
                window.addEventListener('VAULT_NETWORK_ERROR', (e) => {
                    chrome.runtime.sendMessage({ type: 'VAULT_NETWORK_ERROR', ...e.detail });
                });
            }
        }).catch(e => {});
    }
});

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
    const traffic = [...vaultTrafficBuffer];
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (isRaw, netBuffer) => {
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
                const resources = performance.getEntriesByType('resource');
                return resources.map(r => ({
                    name: r.name,
                    type: r.initiatorType,
                    size: r.transferSize,
                    duration: Math.round(r.duration) + 'ms'
                })).slice(-20); // Last 20 requests for context
            };

            const getStorageSummary = () => {
                try {
                    return {
                        local: Object.keys(localStorage).slice(0, 10),
                        session: Object.keys(sessionStorage).slice(0, 10)
                    };
                } catch(e) { return 'Storage Access Denied'; }
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
                    storage_keys: getStorageSummary(),
                    referrer: document.referrer
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
        args: [raw, traffic]
    });

    if (results?.[0]?.result) {
        const snap = results[0].result;
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = Array.isArray(res.snap_history) ? res.snap_history : [];
            history.unshift(snap);
            chrome.storage.local.set({ snap_history: history.slice(0, 5) });
        });
        showContentToast(tabId, `${snap.metadata.type} copied to clipboard!`, 'success');
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
                
                window.__MACRO_ACTIVE = false;
                document.getElementById('macro-indicator')?.remove();
                
                // Cleanup listeners
                document.removeEventListener('click', window.__MACRO_CLICK, true);
                document.removeEventListener('input', window.__MACRO_INPUT, true);
                return `Macro Exported! Copied ${events.length} steps.`;
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
            return 'Macro recording started...';
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function showContentToast(tabId, message, type = 'success') {
    chrome.scripting.executeScript({
        target: { tabId },
        func: (msg, t) => {
            const id = '__toolbox_toast';
            if (document.getElementById(id)) document.getElementById(id).remove();
            const toast = document.createElement('div');
            toast.id = id;
            const colors = { success: '#2ea043', error: '#f85149', info: '#3b82f6' };
            toast.style = `position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#161b22; color:white; padding:12px 24px; border-radius:12px; z-index:10000000; font-family:sans-serif; font-size:14px; font-weight:600; border:1px solid ${colors[t] || colors.info}; box-shadow:0 10px 40px rgba(0,0,0,0.8); animation: toastIn 0.3s ease forwards;`;
            toast.innerText = msg;
            document.body.appendChild(toast);
            const style = document.createElement('style');
            style.innerHTML = `@keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
            document.head.appendChild(style);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = '0.5s';
                setTimeout(() => toast.remove(), 500);
            }, 3000);
        },
        args: [message, type]
    }).catch(() => {});
}

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
        id: "design_lab",
        parentId: "webdev_toolbox",
        title: "✨ AI: Design Superpowers (Lab)",
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
    chrome.contextMenus.create({
        id: "anti_slop_detect",
        parentId: "webdev_toolbox",
        title: "🚫 AI Slop Detector (Impeccable)",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "floating_nexus",
        parentId: "webdev_toolbox",
        title: "🌐 Toggle Floating Nexus Toolbar",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "visual_diff",
        parentId: "webdev_toolbox",
        title: "🔬 Visual DOM Diff (Last 2 Snaps)",
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
                return `Design Mode: ${document.designMode.toUpperCase()}`;
            }
        }, (res) => {
            if (res?.[0]?.result) showContentToast(tab.id, res[0].result, 'info');
        });
    } else if (info.menuItemId === "inspect_style") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // We use a small hack to get the element under context menu click
                // since 'all' context doesn't pass the element directly in MV3 background script
                // we'll use the last right-clicked element if we tracked it, 
                // or just ask the user to click again for simplicity in this lab tool.
                return 'Click an element to see its core styles in the console.';
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
                return 'Click an element to copy its unique CSS selector.';
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
                return 'Click any element to delete it from the DOM.';
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
                return `Chaos Unleashed! Shuffled ${uniqueVars.length} CSS Variables.`;
            }
        }, (res) => {
            if (res?.[0]?.result) showContentToast(tab.id, res[0].result, 'info');
        });
    } else if (info.menuItemId === "color_tweak") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                return 'Click an element to cycle its colors.';
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
    } else if (info.menuItemId === "design_lab") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__DESIGN_LAB_ACTIVE) return;
                window.__DESIGN_LAB_ACTIVE = true;

                // Create the floating lab UI
                const container = document.createElement('div');
                container.id = '__design_lab';
                container.style = `
                    position: fixed; top: 20px; right: 20px; width: 340px;
                    background: rgba(13, 17, 23, 0.95); backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 0, 255, 0.4); border-radius: 16px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 30px rgba(255, 0, 255, 0.15);
                    z-index: 10000000; font-family: 'Inter', sans-serif; color: white;
                    display: flex; flex-direction: column; overflow: hidden;
                    animation: labIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                    user-select: none;
                `;

                container.innerHTML = `
                    <style>
                        @keyframes labIn { from { transform: translateX(120%) scale(0.9); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
                        .__lab-header { padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); }
                        .__lab-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #ff00ff; text-shadow: 0 0 10px rgba(255,0,255,0.3); }
                        .__lab-close { cursor: pointer; opacity: 0.5; transition: 0.2s; font-size: 14px; font-weight: bold; }
                        .__lab-close:hover { opacity: 1; color: #ff00ff; }
                        .__lab-input-group { padding: 14px; display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2); }
                        .__lab-input { flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: white; padding: 8px 12px; font-size: 12px; outline: none; transition: 0.2s; }
                        .__lab-input:focus { border-color: #ff00ff; background: rgba(255,255,255,0.06); }
                        .__lab-go { background: #ff00ff; color: white; border: none; border-radius: 10px; padding: 0 14px; font-weight: 800; font-size: 11px; cursor: pointer; transition: 0.2s; }
                        .__lab-go:hover { transform: translateY(-1px); box-shadow: 0 5px 15px rgba(255,0,255,0.4); }
                        .__lab-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(255,255,255,0.1); }
                        .__lab-btn { background: #0d1117; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border: none; cursor: pointer; transition: 0.2s; position: relative; overflow: hidden; }
                        .__lab-btn:hover { background: rgba(255, 0, 255, 0.05); }
                        .__lab-btn span { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.6); }
                        .__lab-btn.active { background: rgba(255, 0, 255, 0.1); }
                        .__lab-btn.active span { color: #ff00ff; }
                        .__lab-btn::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 2px; background: #ff00ff; transform: scaleX(0); transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                        .__lab-btn.active::after { transform: scaleX(1); }
                        .__lab-footer { padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); }
                        .__lab-counter { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.4); }
                        .__lab-export { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: white; border-radius: 8px; padding: 6px 12px; font-size: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; }
                        .__lab-export:hover { border-color: #ff00ff; color: #ff00ff; background: rgba(255,0,255,0.05); }
                    </style>
                    <div class="__lab-header">
                        <div class="__lab-title">Superpowers Lab</div>
                        <div class="__lab-close">✕</div>
                    </div>
                    <div class="__lab-input-group">
                        <input type="text" class="__lab-input" placeholder="Freeform Instruction (e.g. 'Make it modern')">
                        <button class="__lab-go">Go →</button>
                    </div>
                    <div class="__lab-grid">
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
                        <button class="__lab-btn" data-skill="frontend-design"><span>Design</span></button>
                    </div>
                    <div class="__lab-footer">
                        <div class="__lab-counter">0 targets locked</div>
                        <button class="__lab-export">Capture Context</button>
                    </div>
                `;

                document.body.appendChild(container);

                const highlight = document.createElement('div');
                highlight.id = '__lab_highlight';
                highlight.style = 'position:fixed; border:2px solid #ff00ff; box-shadow: 0 0 20px rgba(255,0,255,0.4), inset 0 0 10px rgba(255,0,255,0.2); z-index: 9999999; pointer-events:none; transition: all 0.1s cubic-bezier(0.16, 1, 0.3, 1); opacity: 0;';
                document.body.appendChild(highlight);

                let selections = [];
                let activeSkills = new Set();

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

                const onMouseOver = (e) => {
                    if (container.contains(e.target)) return;
                    const rect = e.target.getBoundingClientRect();
                    highlight.style.opacity = '1';
                    highlight.style.top = `${rect.top}px`;
                    highlight.style.left = `${rect.left}px`;
                    highlight.style.width = `${rect.width}px`;
                    highlight.style.height = `${rect.height}px`;
                };

                const onClick = (e) => {
                    if (container.contains(e.target)) return;
                    e.preventDefault(); e.stopPropagation();
                    
                    const sel = getSelector(e.target);
                    const rect = e.target.getBoundingClientRect();
                    
                    // Permanent Selection Anchor
                    const anchor = document.createElement('div');
                    anchor.className = '__lab-anchor';
                    anchor.style = `position:fixed; top:${rect.top}px; left:${rect.left}px; width:${rect.width}px; height:${rect.height}px; border:1px solid #ff00ff; background:rgba(255,0,255,0.1); z-index:9999998; pointer-events:none; box-shadow: 0 0 15px rgba(255,0,255,0.2);`;
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
                        anchor,
                        html: e.target.outerHTML.slice(0, 1500),
                        text: e.target.innerText.slice(0, 300),
                        styles: JSON.stringify(coreStyles)
                    });
                    
                    container.querySelector('.__lab-counter').innerText = `${selections.length} targets locked`;
                };

                const cleanup = () => {
                    document.removeEventListener('mouseover', onMouseOver);
                    document.removeEventListener('click', onClick, true);
                    container.remove();
                    highlight.remove();
                    document.querySelectorAll('.__lab-anchor').forEach(a => a.remove());
                    window.__DESIGN_LAB_ACTIVE = false;
                };

                container.querySelector('.__lab-close').onclick = cleanup;

                container.querySelectorAll('.__lab-btn').forEach(btn => {
                    btn.onclick = () => {
                        const skill = btn.dataset.skill;
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
                        alert("Select targets or input instructions first.");
                        return;
                    }

                    const prompt = `### SUPERPOWERS DESIGN LAB CAPTURE\n\n**FRAMEWORK**: Frontend Design / Impeccable\n**PRIMARY SKILLS**: ${skills.join(', ') || 'General Enhancement'}\n**FREEFORM INSTRUCTION**: ${freeform || 'Apply chosen skills.'}\n\n**TARGET ELEMENTS**:\n${selections.map(s => `- **SELECTOR**: \`${s.selector}\`\n  **HTML**: \n\`\`\`html\n${s.html}\n\`\`\`\n  **CORE STYLES**: \`${s.styles}\``).join('\n\n')}\n\n**SYSTEM**: Perform a high-fidelity design transformation on the locked targets based on the requested skills. Output the CSS/HTML code needed to upgrade the design.`;
                    
                    const tmp = document.createElement('textarea');
                    tmp.value = prompt; document.body.appendChild(tmp);
                    tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
                    
                    alert('Superpowers Context Captured! Forward to AI Agent.');
                    cleanup();
                };

                document.querySelector('.__lab-export').onclick = triggerExport;
                document.querySelector('.__lab-go').onclick = triggerExport;

                document.addEventListener('mouseover', onMouseOver, { passive: true });
                document.addEventListener('click', onClick, true);
            }
        });
    } else if (info.menuItemId === "anti_slop_detect") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Impeccable's 25-Rule AI Slop Detector
                const findings = [];
                const body = document.body;
                const styles = [...document.styleSheets];

                // Rule 1: Purple gradients (most common AI slop)
                const allEls = body.querySelectorAll('*');
                allEls.forEach(el => {
                    const cs = window.getComputedStyle(el);
                    const bg = cs.backgroundImage;
                    if (bg && bg.includes('gradient') && (bg.includes('purple') || bg.includes('#8b5cf6') || bg.includes('#6366f1') || bg.includes('#a855f7') || bg.includes('violet'))) {
                        findings.push({ rule: 'Purple Gradient', severity: 'high', selector: el.tagName + (el.id ? '#' + el.id : ''), detail: bg.slice(0, 80) });
                    }
                    // Rule 2: Gradient text
                    if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') {
                        findings.push({ rule: 'Gradient Text', severity: 'high', selector: el.tagName + (el.id ? '#' + el.id : ''), detail: 'webkit-background-clip: text' });
                    }
                    // Rule 3: Overused fonts
                    const font = cs.fontFamily;
                    ['Inter', 'Roboto', 'Space Grotesk', 'Plus Jakarta Sans', 'Geist', 'Fraunces', 'Instrument Sans', 'Recoleta'].forEach(f => {
                        if (font && font.includes(f)) {
                            findings.push({ rule: 'Overused Font', severity: 'medium', selector: el.tagName + (el.id ? '#' + el.id : ''), detail: f });
                        }
                    });
                    // Rule 4: Low contrast (naive check)
                    const color = cs.color;
                    const bgColor = cs.backgroundColor;
                    if (color === bgColor && color !== 'rgba(0, 0, 0, 0)') {
                        findings.push({ rule: 'Zero Contrast', severity: 'critical', selector: el.tagName + (el.id ? '#' + el.id : ''), detail: color });
                    }
                    // Rule 5: Cardocalypse — excessive nested cards
                    if ((el.className || '').toLowerCase().includes('card')) {
                        const parentCard = el.parentElement?.closest('[class*="card"]');
                        if (parentCard) {
                            findings.push({ rule: 'Cardocalypse (Nested Cards)', severity: 'medium', selector: el.tagName + '.' + (el.className.split(' ')[0] || ''), detail: 'Card nested inside card' });
                        }
                    }
                    // Rule 6: Too-round pill buttons
                    if ((el.tagName === 'BUTTON' || el.tagName === 'A') && parseInt(cs.borderRadius) > 50) {
                        findings.push({ rule: 'Pill Button Overuse', severity: 'low', selector: el.tagName, detail: 'border-radius: ' + cs.borderRadius });
                    }
                    // Rule 7: Thin border side-tab cards
                    if ((el.className || '').toLowerCase().includes('card') && (cs.borderLeft || '').includes('4px') && !cs.border) {
                        findings.push({ rule: 'Side-Tab Card', severity: 'medium', selector: el.tagName + '.' + (el.className.split(' ')[0] || ''), detail: 'Thick left border only' });
                    }
                });

                // Render Results
                const existing = document.getElementById('__slop_panel');
                if (existing) { existing.remove(); return; }

                const panel = document.createElement('div');
                panel.id = '__slop_panel';
                panel.style = `position:fixed; top:20px; right:20px; width:380px; max-height:70vh; background:#0d1117; border:1px solid #ef4444; border-radius:16px; z-index:10000000; font-family:monospace; color:white; overflow:hidden; display:flex; flex-direction:column; box-shadow: 0 20px 50px rgba(239,68,68,0.3), 0 0 20px rgba(239,68,68,0.1);`;
                
                const severityColor = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#6b7280' };
                panel.innerHTML = `
                    <div style="padding:14px 18px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; background:rgba(239,68,68,0.1);">
                        <div style="font-size:11px; font-weight:900; letter-spacing:2px; color:#ef4444;">⚠ AI SLOP DETECTOR</div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <span style="font-size:10px; color:#ef4444; font-weight:700;">${findings.length} Issues Found</span>
                            <span id="__slop_close" style="cursor:pointer; opacity:0.5;">✕</span>
                        </div>
                    </div>
                    <div style="overflow-y:auto; flex:1; padding:12px; display:flex; flex-direction:column; gap:8px;">
                        ${findings.length === 0 
                            ? '<div style="color:#10b981; text-align:center; padding:30px; font-size:13px; font-weight:700;">✓ No AI Slop Detected! Clean design.</div>'
                            : findings.map(f => `
                                <div style="background:#1a1f2e; border:1px solid rgba(255,255,255,0.05); border-left:3px solid ${severityColor[f.severity]}; border-radius:8px; padding:10px;">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                        <span style="font-size:11px; font-weight:700; color:${severityColor[f.severity]};">${f.rule}</span>
                                        <span style="font-size:9px; text-transform:uppercase; color:${severityColor[f.severity]}; opacity:0.7; border:1px solid currentColor; padding:1px 5px; border-radius:4px;">${f.severity}</span>
                                    </div>
                                    <div style="font-size:10px; color:#8b949e; margin-bottom:2px;">@ <code>${f.selector}</code></div>
                                    <div style="font-size:10px; color:#6b7280; word-break:break-all;">${f.detail}</div>
                                </div>
                            `).join('')
                        }
                    </div>
                    <div style="padding:10px; border-top:1px solid rgba(255,255,255,0.05); background:rgba(0,0,0,0.3);">
                        <button id="__slop_copy" style="width:100%; background:rgba(239,68,68,0.2); border:1px solid rgba(239,68,68,0.3); color:white; padding:8px; border-radius:8px; font-family:monospace; font-size:10px; font-weight:700; cursor:pointer;">COPY REPORT AS AI PROMPT</button>
                    </div>
                `;
                document.body.appendChild(panel);
                
                document.getElementById('__slop_close').onclick = () => panel.remove();
                document.getElementById('__slop_copy').onclick = () => {
                    const report = `### AI SLOP AUDIT REPORT (Impeccable Framework)\n\n**Rules Checked**: 7 (Purple Gradients, Gradient Text, Overused Fonts, Zero Contrast, Cardocalypse, Pill Buttons, Side-Tab Cards)\n**Issues Found**: ${findings.length}\n\n${findings.map(f => `- [${f.severity.toUpperCase()}] **${f.rule}** @ \`${f.selector}\`\n  Detail: ${f.detail}`).join('\n')}\n\n**Task**: Fix the above AI slop issues following Impeccable's design guidelines. Avoid purple gradients, overused fonts, and generic patterns.`;
                    const tmp = document.createElement('textarea');
                    tmp.value = report; document.body.appendChild(tmp);
                    tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
                    alert('Slop report copied as AI prompt!');
                };
            }
        });
    } else if (info.menuItemId === "floating_nexus") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const existing = document.getElementById('__nexus_bar');
                if (existing) { existing.remove(); return; }

                const bar = document.createElement('div');
                bar.id = '__nexus_bar';
                bar.style = `position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:4px; padding:8px 12px; background:rgba(13,17,23,0.95); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.1); border-radius:50px; z-index:10000000; box-shadow:0 10px 40px rgba(0,0,0,0.5), 0 0 20px rgba(99,102,241,0.2); font-family:sans-serif;`;
                
                const tools = [
                    { label: '🧹', title: 'AI Context Capture', fn: () => { document.getElementById('__nexus_bar')?.remove(); chrome.runtime.sendMessage({ action: 'TRIGGER_DOM_CLEAN' }); } },
                    { label: '✏️', title: 'Edit Mode', fn: () => { document.designMode = document.designMode === 'on' ? 'off' : 'on'; } },
                    { label: '🔍', title: 'Inspect Styles', fn: () => {
                        const h = document.createElement('div');
                        h.style = 'position:fixed; border:2px solid #6366f1; z-index:9999999; pointer-events:none;';
                        document.body.appendChild(h);
                        document.addEventListener('mousemove', (e) => {
                            const r = e.target.getBoundingClientRect();
                            h.style.cssText = `position:fixed; border:2px solid #6366f1; z-index:9999999; pointer-events:none; top:${r.top}px; left:${r.left}px; width:${r.width}px; height:${r.height}px;`;
                        });
                    }},
                    { label: '💀', title: 'Nuke Element', fn: () => {
                        document.addEventListener('click', (e) => { e.preventDefault(); e.target.remove(); }, { once: true, capture: true });
                    }},
                    { label: '📋', title: 'Copy Selector', fn: () => {
                        document.addEventListener('click', (e) => {
                            e.preventDefault();
                            const sel = e.target.id ? '#'+e.target.id : e.target.tagName.toLowerCase();
                            navigator.clipboard.writeText(sel);
                            alert('Selector: ' + sel);
                        }, { once: true, capture: true });
                    }},
                    { label: '🎬', title: 'Vibe Recorder', fn: () => { chrome.runtime.sendMessage({ action: 'PERFORM_MACRO' }); } },
                    { label: '🚫', title: 'AI Slop Detect', fn: () => { chrome.runtime.sendMessage({ action: 'TRIGGER_SLOP_DETECT' }); } },
                    { label: '✕', title: 'Close', fn: () => bar.remove(), danger: true },
                ];

                tools.forEach(t => {
                    const btn = document.createElement('button');
                    btn.title = t.title;
                    btn.textContent = t.label;
                    btn.style = `background:${t.danger ? 'rgba(239,68,68,0.15)' : 'transparent'}; border:none; color:white; width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; transition:0.2s;`;
                    btn.onmouseover = () => btn.style.background = t.danger ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)';
                    btn.onmouseout = () => btn.style.background = t.danger ? 'rgba(239,68,68,0.15)' : 'transparent';
                    btn.onclick = t.fn;
                    bar.appendChild(btn);
                });

                document.body.appendChild(bar);
            }
        });
    } else if (info.menuItemId === "visual_diff") {
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = res.snap_history || [];
            if (history.length < 2) {
                showContentToast(tab.id, '⚠ Need at least 2 snapshots for diff. Take 2 snapshots first.', 'error');
                return;
            }
            const a = history[0];
            const b = history[1];
            const diffResult = {
                url_changed: a.metadata.url !== b.metadata.url,
                title_changed: a.metadata.title !== b.metadata.title,
                stack_diff: JSON.stringify(a.stack) !== JSON.stringify(b.stack) ? { from: b.stack, to: a.stack } : null,
                dom_growth: a.dom_content.length - b.dom_content.length,
                network_requests: (a.metadata.network_recent?.length || 0) - (b.metadata.network_recent?.length || 0),
                time_delta_ms: new Date(a.metadata.timestamp) - new Date(b.metadata.timestamp)
            };
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (diff, snapA, snapB) => {
                    const panel = document.createElement('div');
                    panel.style = `position:fixed; top:20px; left:20px; width:380px; background:#0d1117; border:1px solid #f59e0b; border-radius:16px; z-index:10000000; color:white; font-family:monospace; overflow:hidden; box-shadow:0 20px 50px rgba(245,158,11,0.2);`;
                    panel.innerHTML = `
                        <div style="padding:14px 18px; background:rgba(245,158,11,0.1); border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between;">
                            <span style="font-size:11px; font-weight:900; letter-spacing:2px; color:#f59e0b;">🔬 DOM VISUAL DIFF</span>
                            <span id="__diff_close" style="cursor:pointer; opacity:0.5;">✕</span>
                        </div>
                        <div style="padding:16px; display:flex; flex-direction:column; gap:8px; font-size:11px;">
                            <div style="color:#8b949e;">Comparing: <span style="color:#f59e0b;">${new Date(snapA.metadata.timestamp).toLocaleTimeString()}</span> → <span style="color:#6366f1;">${new Date(snapB.metadata.timestamp).toLocaleTimeString()}</span></div>
                            ${[
                                { label: 'URL Changed', value: diff.url_changed, type: diff.url_changed ? 'warn' : 'ok' },
                                { label: 'Title Changed', value: diff.title_changed, type: diff.title_changed ? 'warn' : 'ok' },
                                { label: 'Tech Stack Diff', value: diff.stack_diff ? JSON.stringify(diff.stack_diff) : 'Identical', type: diff.stack_diff ? 'warn' : 'ok' },
                                { label: 'DOM Growth', value: (diff.dom_growth > 0 ? '+' : '') + diff.dom_growth + ' chars', type: diff.dom_growth > 0 ? 'grow' : diff.dom_growth < 0 ? 'shrink' : 'ok' },
                                { label: 'Network Δ', value: (diff.network_requests > 0 ? '+' : '') + diff.network_requests + ' requests', type: 'info' },
                                { label: 'Time Between', value: Math.round(diff.time_delta_ms / 1000) + 's', type: 'info' },
                            ].map(r => `
                                <div style="display:flex; justify-content:space-between; padding:8px; background:#1a1f2e; border-radius:8px; border-left:3px solid ${{ warn:'#f59e0b', ok:'#10b981', info:'#3b82f6', grow:'#8b5cf6', shrink:'#ef4444' }[r.type]};">
                                    <span style="color:#8b949e;">${r.label}</span>
                                    <span style="color:white; font-weight:700; word-break:break-all; max-width:60%; text-align:right;">${r.value}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div style="padding:10px; border-top:1px solid rgba(255,255,255,0.05);">
                            <button id="__diff_copy" style="width:100%; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:white; padding:8px; border-radius:8px; font-family:monospace; font-size:10px; font-weight:700; cursor:pointer;">COPY DIFF AS AI CONTEXT</button>
                        </div>
                    `;
                    document.body.appendChild(panel);
                    document.getElementById('__diff_close').onclick = () => panel.remove();
                    document.getElementById('__diff_copy').onclick = () => {
                        const txt = `### VISUAL DOM DIFF\n\n${Object.entries(diff).map(([k,v]) => `- **${k}**: ${JSON.stringify(v)}`).join('\n')}\n\nSnap A (${snapA.metadata.timestamp}): ${snapA.metadata.url}\nSnap B (${snapB.metadata.timestamp}): ${snapB.metadata.url}`;
                        const tmp = document.createElement('textarea'); tmp.value = txt; document.body.appendChild(tmp); tmp.select(); document.execCommand('copy'); tmp.remove();
                        alert('Diff copied!');
                    };
                },
                args: [diffResult, a, b]
            });
        });
    }
});
