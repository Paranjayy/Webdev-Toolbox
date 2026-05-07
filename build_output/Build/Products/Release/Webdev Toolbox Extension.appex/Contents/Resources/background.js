// ── Auto-poll active tabs for DOM errors every 8s ───────────────────────────
// ── Network & Error Interceptor (MAIN WORLD) ──────────────────────────────────
const INTERCEPTOR_SCRIPT = `
(function() {
    const originalFetch = window.fetch;
    const originalXHR = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;

    window.fetch = async (...args) => {
        const url = args[0];
        const options = args[1] || {};
        const method = options.method || 'GET';
        const headers = options.headers ? (options.headers instanceof Headers ? Object.fromEntries(options.headers) : options.headers) : {};

        try {
            const response = await originalFetch(...args);
            window.dispatchEvent(new CustomEvent('VAULT_TRAFFIC_LOG', { 
                detail: { url, status: response.status, method, headers, time: new Date().toISOString(), type: 'FETCH' } 
            }));
            if (response.status >= 500) {
                window.dispatchEvent(new CustomEvent('VAULT_NETWORK_ERROR', { detail: { url, status: response.status } }));
            }
            return response;
        } catch (error) {
            window.dispatchEvent(new CustomEvent('VAULT_NETWORK_ERROR', { detail: { url, status: 'FAILED' } }));
            throw error;
        }
    };

    window.XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        this._method = method;
        this._reqHeaders = {};
        return originalXHR.apply(this, arguments);
    };

    const originalSetHeader = window.XMLHttpRequest.prototype.setRequestHeader;
    window.XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        this._reqHeaders[header] = value;
        return originalSetHeader.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            window.dispatchEvent(new CustomEvent('VAULT_TRAFFIC_LOG', { 
                detail: { 
                    url: this._url, 
                    status: this.status, 
                    method: this._method, 
                    headers: this._reqHeaders,
                    time: new Date().toISOString(),
                    type: 'XHR'
                } 
            }));
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

    // Console Sniffer
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    window.__VAULT_CONSOLE_LOGS = [];
    const hookConsole = (type, original) => {
        return (...args) => {
            try {
                const msg = args.map(a => {
                    if (typeof a === 'object') return '[Object]';
                    return String(a);
                }).join(' ');
                window.__VAULT_CONSOLE_LOGS.push({ type, msg, time: new Date().toISOString() });
                if (window.__VAULT_CONSOLE_LOGS.length > 50) window.__VAULT_CONSOLE_LOGS.shift();
            } catch(e) {}
            return original.apply(console, args);
        };
    };
    console.log = hookConsole('LOG', originalLog);
    console.warn = hookConsole('WARN', originalWarn);
    console.error = hookConsole('ERROR', originalError);

    // Global variable hijacking for debugging
    window.$v = {
        scan: () => console.log('Vault Debugger Active'),
        rip: (el) => {
            console.log('Element Ripped:', el);
            const s = window.getComputedStyle(el);
            console.table({
                width: s.width,
                height: s.height,
                margin: s.margin,
                padding: s.padding,
                display: s.display,
                position: s.position
            });
        },
        edit: (el) => {
            if (!el) return;
            el.contentEditable = el.contentEditable === 'true' ? 'false' : 'true';
            el.style.outline = el.contentEditable === 'true' ? '2px dashed #ff00ff' : 'none';
            console.log('Edit Mode:', el.contentEditable === 'true' ? 'ON' : 'OFF');
        },
        help: () => console.log('$v.scan(), $v.rip(el), $v.edit(el), $v.help()')
    };
})();
`;

// Global log buffer
let vaultTrafficBuffer = [];
let lastErrorCount = 0;

// Global Traffic Capture (Everything: Scripts, Styles, Images, etc.)
chrome.webRequest.onCompleted.addListener(
    (details) => {
        // Avoid internal browser requests
        if (!details.url.startsWith('http')) return;
        
        const log = {
            url: details.url,
            status: details.statusCode,
            method: details.method,
            type: details.type.toUpperCase(),
            time: new Date().toISOString(),
            fromBackground: true
        };
        
        vaultTrafficBuffer.push(log);
        if (vaultTrafficBuffer.length > 200) vaultTrafficBuffer.shift();
    },
    { urls: ["<all_urls>"] }
);

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

    if (request.type === 'VAULT_TRAFFIC_LOG') {
        vaultTrafficBuffer.push(request);
        if (vaultTrafficBuffer.length > 200) vaultTrafficBuffer.shift();
        return true;
    }

    if (request.type === 'VAULT_NETWORK_ERROR') {
        // Auto-snap on critical 5xx errors if enabled (default true)
        chrome.storage.local.get(['auto_snap_enabled'], (res) => {
            if (res.auto_snap_enabled !== false && request.status >= 500) {
                handleDOMCleaner(sender.tab?.id, false);
            }
        });
        return true;
    }

    if (request.action === 'PERFORM_SNAPSHOT') {
        handleDOMCleaner(sender.tab?.id || request.tabId, request.raw || false);
        sendResponse({ success: true });
    } else if (request.action === 'PERFORM_MACRO') {
        handleVibeRecorder(sender.tab?.id || request.tabId);
        sendResponse({ success: true });
    } else if (request.action === 'TRIGGER_DESIGN_LAB') {
        handleDesignLab(request.tabId || sender.tab.id);
    } else if (request.action === 'TRIGGER_DOM_CLEAN') {
        handleDOMCleaner(sender.tab.id);
    } else if (request.action === 'TOGGLE_PICK_MODE') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_PICK_MODE' });
        });
        sendResponse({ success: true });
    } else if (request.action === 'SAVE_DEV_NOTE') {
        chrome.storage.local.get(['dev_notes'], (res) => {
            const notes = Array.isArray(res.dev_notes) ? res.dev_notes : [];
            notes.unshift({
                id: Date.now(),
                content: request.note,
                url: request.url,
                title: request.title,
                timestamp: new Date().toISOString()
            });
            chrome.storage.local.set({ dev_notes: notes.slice(0, 100) }, () => {
                showContentToast(sender.tab.id, '🚀 Issue noted for future resolution!', 'info');
            });
        });
        return true;
    } else if (request.action === 'GET_TRAFFIC_BUFFER') {
        sendResponse({ buffer: vaultTrafficBuffer });
    }
    return true;
});

async function handleDOMCleaner(tabId, raw = false) {
    const traffic = [...vaultTrafficBuffer];
    
    // Capture screenshot first
    let screenshot = null;
    try {
        // Safari fix: Use lastFocusedWindow or a specific ID
        const currentWindow = await chrome.windows.getLastFocused();
        screenshot = await chrome.tabs.captureVisibleTab(currentWindow.id, { format: 'jpeg', quality: 50 });
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
            // Keep up to 10 snapshots for a better gallery experience
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
                    if (e.type === 'press') return `  await page.press('${e.selector}', '${e.key}');`;
                    if (e.type === 'change') {
                        if (e.checked !== undefined) return `  await page.setChecked('${e.selector}', ${e.checked});`;
                        return `  await page.selectOption('${e.selector}', '${e.value}');`;
                    }
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
                document.removeEventListener('keydown', window.__MACRO_KEYDOWN, true);
                document.removeEventListener('change', window.__MACRO_CHANGE, true);
                return `Macro Exported! Copied ${events.length} steps to clipboard.`;
            }

            window.__MACRO_ACTIVE = true;
            window.__MACRO_EVENTS = [];
            const indicator = document.createElement('div');
            indicator.id = 'macro-indicator';
            indicator.style = 'position:fixed; top:20px; right:20px; background:#ef4444; color:white; padding:8px 15px; border-radius:20px; z-index:1000000; font-family:sans-serif; font-size:12px; font-weight:bold; animation: pulse 1s infinite; border: 2px solid white; pointer-events:none;';
            indicator.innerText = '🔴 RECORDING MACRO...';
            document.body.appendChild(indicator);

            const getSelector = (el) => {
                if (!el || el.nodeType !== 1) return '';
                if (el.id) return `#${el.id}`;
                
                // Prioritize stable attributes
                const name = el.getAttribute('name');
                if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
                
                const placeholder = el.getAttribute('placeholder');
                if (placeholder) return `${el.tagName.toLowerCase()}[placeholder="${placeholder}"]`;
                
                const ariaLabel = el.getAttribute('aria-label');
                if (ariaLabel) return `${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`;

                // Robust pathing fallback
                let path = [];
                let curr = el;
                while (curr && curr.parentElement) {
                    let nth = 1, sib = curr;
                    while (sib.previousElementSibling) { 
                        sib = sib.previousElementSibling; 
                        if (sib.tagName === curr.tagName) nth++; 
                    }
                    path.unshift(`${curr.tagName.toLowerCase()}${nth > 1 ? `:nth-of-type(${nth})` : ''}`);
                    curr = curr.parentElement;
                    if (curr.id) { path.unshift(`#${curr.id}`); break; }
                    if (curr === document.body) break;
                }
                return path.join(' > ');
            };

            window.__MACRO_CLICK = (e) => {
                if (!window.__MACRO_ACTIVE) return;
                const selector = getSelector(e.target);
                if (selector) window.__MACRO_EVENTS.push({ type: 'click', selector });
            };

            window.__MACRO_INPUT = (e) => {
                if (!window.__MACRO_ACTIVE) return;
                const selector = getSelector(e.target);
                if (selector) window.__MACRO_EVENTS.push({ type: 'input', selector, value: e.target.value });
            };

            window.__MACRO_KEYDOWN = (e) => {
                if (!window.__MACRO_ACTIVE) return;
                if (e.key === 'Enter') {
                    const selector = getSelector(e.target);
                    if (selector) window.__MACRO_EVENTS.push({ type: 'press', selector, key: 'Enter' });
                }
            };

            window.__MACRO_CHANGE = (e) => {
                if (!window.__MACRO_ACTIVE) return;
                const selector = getSelector(e.target);
                if (selector && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'radio')) {
                    window.__MACRO_EVENTS.push({ type: 'change', selector, value: e.target.value, checked: e.target.checked });
                }
            };

            document.addEventListener('click', window.__MACRO_CLICK, true);
            document.addEventListener('input', window.__MACRO_INPUT, true);
            document.addEventListener('keydown', window.__MACRO_KEYDOWN, true);
            document.addEventListener('change', window.__MACRO_CHANGE, true);
            return 'Macro recording started... (Capturing clicks, inputs, enters, and changes)';
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
            style.innerHTML = `
                @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
                @-webkit-keyframes toastIn { from { opacity:0; -webkit-transform:translateX(-50%) translateY(20px); } to { opacity:1; -webkit-transform:translateX(-50%) translateY(0); } }
            `;
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


async function handleDesignLab(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (window.__DESIGN_LAB_ACTIVE) return;
            window.__DESIGN_LAB_ACTIVE = true;
            let selections = [];
            let activeSkills = new Set();
            let isPicking = true;
            let gridVisible = true;

            const container = document.createElement('div');
            container.id = '__design_lab';
            container.style = `
                position: fixed; top: 20px; right: 20px; width: 380px;
                background: rgba(13, 17, 23, 0.98); backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 0, 255, 0.4); border-radius: 20px;
                box-shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(255, 0, 255, 0.2);
                z-index: 10000000; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: white;
                display: flex; flex-direction: column; overflow: hidden;
                animation: labIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                user-select: none; border-bottom: 4px solid #ff00ff;
                transition: transform 0.3s, opacity 0.3s, width 0.3s, height 0.3s;
            `;

            container.innerHTML = `
                <style>
                    @keyframes labIn { from { transform: translateX(120%) scale(0.9); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
                    .__lab-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); cursor: move; }
                    .__lab-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2.5px; color: #ff00ff; text-shadow: 0 0 15px rgba(255,0,255,0.4); }
                    .__lab-controls { display: flex; align-items: center; gap: 12px; }
                    .__lab-control-btn { cursor: pointer; opacity: 0.6; transition: 0.2s; font-size: 16px; font-weight: bold; }
                    .__lab-control-btn:hover { opacity: 1; color: #ff00ff; }
                    .__lab-toolbar { padding: 12px 20px; display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.05); }
                    .__lab-pick-btn { 
                        background: rgba(255, 0, 255, 0.1); border: 1px solid rgba(255, 0, 255, 0.3); 
                        color: #ff00ff; border-radius: 8px; padding: 6px 12px; font-size: 10px; font-weight: 800; 
                        cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;
                    }
                    .__lab-pick-btn.active { background: #ff00ff; color: white; box-shadow: 0 0 15px rgba(255,0,255,0.4); }
                    .__lab-grid-toggle {
                        background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
                        color: rgba(255, 255, 255, 0.6); border-radius: 8px; padding: 6px 10px; font-size: 10px; font-weight: 800;
                        cursor: pointer; transition: 0.2s;
                    }
                    .__lab-grid-toggle.active { color: #ff00ff; border-color: rgba(255, 0, 255, 0.4); background: rgba(255, 0, 255, 0.1); }
                    .__lab-pick-indicator { width: 6px; height: 6px; background: currentColor; border-radius: 50%; animation: pulse 1.5s infinite; }
                    @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }
                    .__lab-input { flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: white; padding: 8px 14px; font-size: 12px; outline: none; }
                    .__lab-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(255,255,255,0.08); transition: max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s; max-height: 500px; overflow: hidden; }
                    .__lab-grid.hidden { max-height: 0; opacity: 0; border: none; }
                    .__lab-btn { background: #0d1117; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: none; cursor: pointer; transition: 0.3s; }
                    .__lab-btn span { font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: rgba(255,255,255,0.4); }
                    .__lab-btn:hover { background: rgba(255,255,255,0.05); }
                    .__lab-btn.active { background: rgba(255, 0, 255, 0.1); }
                    .__lab-btn.active span { color: #ff00ff; font-weight: 900; }
                    .__lab-selections { max-height: 240px; overflow-y: auto; background: rgba(0,0,0,0.2); scrollbar-width: thin; }
                    .__selection-item { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.03); display: flex; flex-direction: column; gap: 6px; }
                    .__selection-top { display: flex; justify-content: space-between; align-items: center; }
                    .__selection-tag { font-size: 9px; font-weight: 900; color: #ff00ff; text-transform: uppercase; opacity: 0.8; }
                    .__selection-remove { font-size: 14px; opacity: 0.4; cursor: pointer; transition: 0.2s; }
                    .__selection-remove:hover { opacity: 1; color: #ff4444; }
                    .__selection-prompt { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: white; padding: 6px 10px; font-size: 11px; outline: none; }
                    .__lab-footer { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); }
                    .__lab-export { background: linear-gradient(135deg, #ff00ff, #8b5cf6); color: white; border: none; border-radius: 12px; padding: 10px 22px; font-size: 11px; font-weight: 900; cursor: pointer; box-shadow: 0 4px 15px rgba(255,0,255,0.3); }
                    .__lab-export:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(255,0,255,0.4); }
                    .__lab-minimized { height: 50px !important; width: 280px !important; }
                    .__lab-minimized .__lab-toolbar, .__lab-minimized .__lab-main, .__lab-minimized .__lab-footer { display: none !important; }
                </style>
                <div class="__lab-header" id="__lab_header">
                    <div class="__lab-title">Design Lab Superpowers</div>
                    <div class="__lab-controls">
                        <span class="__lab-control-btn" id="__lab_min_btn">_</span>
                        <span class="__lab-control-btn" id="__lab_close_btn">✕</span>
                    </div>
                </div>
                <div class="__lab-toolbar">
                    <button class="__lab-pick-btn active" id="__lab_pick_toggle"><div class="__lab-pick-indicator"></div> PICK</button>
                    <button class="__lab-grid-toggle active" id="__lab_grid_toggle">SKILLS</button>
                    <input type="text" class="__lab-input" id="__lab_global_prompt" placeholder="Global Mission...">
                </div>
                <div class="__lab-main">
                    <div class="__lab-grid" id="__lab_skill_grid">
                        ${['bolder', 'quieter', 'distill', 'polish', 'typeset', 'colorize', 'layout', 'adapt', 'animate', 'delight', 'overdrive', 'live-edit', 'design', 'inspect'].map(s => `
                            <button class="__lab-btn" data-skill="${s}"><span>${s}</span></button>
                        `).join('')}
                    </div>
                    <div class="__lab-selections" id="__lab_selections_list"></div>
                </div>
                <div class="__lab-footer">
                    <div id="__lab_counter" style="font-size:10px; opacity:0.5; font-weight: 700;">0 ELEMENTS</div>
                    <button class="__lab-export">CAPTURE DATA</button>
                </div>
            `;

            document.body.appendChild(container);
            const highlight = document.createElement('div');
            highlight.style = 'position:fixed; border:3px solid #ff00ff; z-index: 9999999; pointer-events:none; opacity: 0; transition: 0.1s; border-radius: 4px; box-shadow: 0 0 20px rgba(255,0,255,0.4);';
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
                container.querySelector('#__lab_counter').innerText = `${selections.length} ELEMENTS`;
                list.innerHTML = selections.map((s, i) => `
                    <div class="__selection-item">
                        <div class="__selection-top">
                            <div class="__selection-tag">${s.tagName}</div>
                            <span class="__selection-remove" data-idx="${i}">✕</span>
                        </div>
                        <input type="text" class="__selection-prompt" data-idx="${i}" placeholder="Specific instructions for this element..." value="${s.prompt || ''}">
                    </div>
                `).join('');
                list.querySelectorAll('.__selection-remove').forEach(btn => {
                    btn.onclick = (e) => {
                        const idx = parseInt(e.target.dataset.idx);
                        selections[idx].anchor.remove();
                        selections.splice(idx, 1);
                        updateUI();
                    };
                });
                list.querySelectorAll('.__selection-prompt').forEach(input => {
                    input.oninput = (e) => selections[parseInt(e.target.dataset.idx)].prompt = e.target.value;
                });
            };

            const onMouseOver = (e) => {
                if (!isPicking || container.contains(e.target)) { highlight.style.opacity = '0'; return; }
                const r = e.target.getBoundingClientRect();
                highlight.style.opacity = '1';
                highlight.style.top = r.top + 'px'; highlight.style.left = r.left + 'px';
                highlight.style.width = r.width + 'px'; highlight.style.height = r.height + 'px';
            };

            const onClick = (e) => {
                if (!isPicking || container.contains(e.target)) return;
                e.preventDefault(); e.stopPropagation();
                const r = e.target.getBoundingClientRect();
                const anchor = document.createElement('div');
                anchor.style = `position:fixed; top:${r.top}px; left:${r.left}px; width:${r.width}px; height:${r.height}px; border:2px solid #ff00ff; background:rgba(255,0,255,0.1); z-index:9999998; pointer-events:none; box-shadow: 0 0 10px rgba(255,0,255,0.2);`;
                document.body.appendChild(anchor);
                selections.push({ selector: getSelector(e.target), tagName: e.target.tagName, anchor, prompt: '', html: e.target.outerHTML.slice(0, 500) });
                updateUI();
            };

            container.querySelector('#__lab_close_btn').onclick = () => {
                document.removeEventListener('mouseover', onMouseOver);
                document.removeEventListener('click', onClick, true);
                selections.forEach(s => s.anchor.remove());
                container.remove(); highlight.remove();
                window.__DESIGN_LAB_ACTIVE = false;
            };

            container.querySelector('#__lab_min_btn').onclick = () => {
                container.classList.toggle('__lab-minimized');
                container.querySelector('#__lab_min_btn').innerText = container.classList.contains('__lab-minimized') ? '+' : '_';
            };

            container.querySelector('#__lab_grid_toggle').onclick = () => {
                gridVisible = !gridVisible;
                const grid = container.querySelector('#__lab_skill_grid');
                grid.classList.toggle('hidden', !gridVisible);
                container.querySelector('#__lab_grid_toggle').classList.toggle('active', gridVisible);
            };

            // Enhanced Drag Logic
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;
            const header = container.querySelector('#__lab_header');
            header.onmousedown = (e) => {
                if (e.target.closest('.__lab-control-btn')) return;
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = container.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                container.style.transition = 'none';
                e.preventDefault();
            };
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                container.style.left = (initialLeft + deltaX) + 'px';
                container.style.top = (initialTop + deltaY) + 'px';
                container.style.right = 'auto'; // Break the fixed right positioning
            });
            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    container.style.transition = '0.3s cubic-bezier(0.16, 1, 0.3, 1)';
                }
            });

            container.querySelector('#__lab_pick_toggle').onclick = () => {
                isPicking = !isPicking;
                container.querySelector('#__lab_pick_toggle').classList.toggle('active', isPicking);
                highlight.style.opacity = '0';
            };

            container.querySelectorAll('.__lab-btn').forEach(btn => {
                btn.onclick = () => {
                    const s = btn.dataset.skill;
                    if (activeSkills.has(s)) { activeSkills.delete(s); btn.classList.remove('active'); }
                    else { activeSkills.add(s); btn.classList.add('active'); }
                };
            });

            container.querySelector('.__lab-export').onclick = () => {
                const data = {
                    mission: container.querySelector('#__lab_global_prompt').value,
                    skills: Array.from(activeSkills),
                    targets: selections.map(s => ({ selector: s.selector, prompt: s.prompt, html: s.html }))
                };
                const prompt = `### DESIGN LAB SUPERPOWERS\n${JSON.stringify(data, null, 2)}`;
                const tmp = document.createElement('textarea'); tmp.value = prompt; document.body.appendChild(tmp);
                tmp.select(); document.execCommand('copy'); tmp.remove();
                alert('DESIGN LAB CONTEXT COPIED!');
            };

            document.addEventListener('mouseover', onMouseOver);
            document.addEventListener('click', onClick, { capture: true, passive: false });
        }
    });
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
                return `✍ LIVE EDIT: ${document.designMode === 'on' ? 'ENABLED (Type anywhere!)' : 'DISABLED'}`;
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
                return 'Click an element to see its core styles in the console.';
            }
        });
    } else if (info.menuItemId === "copy_selector") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
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
                return 'Click an element to copy its unique CSS selector.';
            }
        });
    } else if (info.menuItemId === "nuke_element") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const handler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.target.remove();
                    document.removeEventListener('click', handler, true);
                };
                document.addEventListener('click', handler, true);
                return 'Click any element to delete it from the DOM.';
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
                const handler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const colors = ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
                    const current = e.target.style.color;
                    const next = colors[(colors.indexOf(current) + 1) % colors.length];
                    e.target.style.color = next;
                    e.target.style.borderColor = next;
                    const bg = window.getComputedStyle(e.target).backgroundColor;
                    if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                        e.target.style.backgroundColor = `${next}22`;
                    }
                    console.log('Tweaked Color to:', next);
                };
                document.addEventListener('click', handler, { once: true, capture: true });
                return 'Click an element to tweak its color.';
            }
        }, (res) => {
            if (res?.[0]?.result) showContentToast(tab.id, res[0].result, 'info');
        });
    } else if (info.menuItemId === "design_lab") {
        handleDesignLab(tab.id);
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
                
                // High-fidelity selector engine (same as recorder/lab)
                const getSelector = (el) => {
                    if (!el || el.nodeType !== 1) return '';
                    if (el.id) return `#${el.id}`;
                    const name = el.getAttribute('name');
                    if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
                    const placeholder = el.getAttribute('placeholder');
                    if (placeholder) return `${el.tagName.toLowerCase()}[placeholder="${placeholder}"]`;
                    let path = [];
                    let curr = el;
                    while (curr && curr.parentElement) {
                        let nth = 1, sib = curr;
                        while (sib.previousElementSibling) { 
                            sib = sib.previousElementSibling; 
                            if (sib.tagName === curr.tagName) nth++; 
                        }
                        path.unshift(`${curr.tagName.toLowerCase()}${nth > 1 ? `:nth-of-type(${nth})` : ''}`);
                        curr = curr.parentElement;
                        if (curr.id) { path.unshift(`#${curr.id}`); break; }
                        if (curr === document.body) break;
                    }
                    return path.join(' > ');
                };

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
                            const sel = getSelector(e.target);
                            navigator.clipboard.writeText(sel);
                            alert('Copied Robust Selector: ' + sel);
                        }, { once: true, capture: true });
                    }},
                    { label: '🎬', title: 'Vibe Recorder', fn: () => { chrome.runtime.sendMessage({ action: 'PERFORM_MACRO' }); } },
                    { label: '🚫', title: 'AI Slop Detect', fn: () => { chrome.runtime.sendMessage({ action: 'TRIGGER_SLOP_DETECT' }); } },
                    { label: '🧬', title: 'Rip Master Blueprint', fn: () => {
                        chrome.runtime.sendMessage({ action: 'PERFORM_SNAPSHOT', raw: false }, (res) => {
                            if (res?.success) {
                                const blueprint = `# REPLICATION BLUEPRINT\nTarget: ${window.location.href}\n\n## DOM\n${res.snapshot}`;
                                navigator.clipboard.writeText(blueprint);
                                alert("Master Blueprint ripped to clipboard!");
                            }
                        });
                    }},
                    { label: '📝', title: 'Dev Log / Issue Note', fn: () => {
                        const noteId = '__nexus_note_input';
                        if (document.getElementById(noteId)) return;
                        const div = document.createElement('div');
                        div.id = noteId;
                        div.style = 'position:fixed; bottom:70px; left:50%; transform:translateX(-50%); background:#0d1117; border:1px solid #ff00ff; border-radius:12px; padding:12px; z-index:10000001; box-shadow:0 10px 40px rgba(0,0,0,0.8); display:flex; flex-direction:column; gap:8px; width:300px;';
                        div.innerHTML = `
                            <div style="font-size:10px; font-weight:900; color:#ff00ff; text-transform:uppercase;">Note Issue/Idea</div>
                            <textarea id="__note_text" style="background:#161b22; color:white; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px; font-family:sans-serif; font-size:12px; resize:none; height:60px;" placeholder="What's broken or needed?"></textarea>
                            <div style="display:flex; justify-content:flex-end; gap:8px;">
                                <button id="__note_cancel" style="background:transparent; border:none; color:rgba(255,255,255,0.5); cursor:pointer; font-size:10px; font-weight:700;">CANCEL</button>
                                <button id="__note_save" style="background:#ff00ff; border:none; color:white; border-radius:6px; padding:4px 12px; cursor:pointer; font-size:10px; font-weight:900;">SAVE</button>
                            </div>
                        `;
                        document.body.appendChild(div);
                        const txt = div.querySelector('#__note_text');
                        txt.focus();
                        div.querySelector('#__note_cancel').onclick = () => div.remove();
                        div.querySelector('#__note_save').onclick = () => {
                            const note = txt.value.trim();
                            if (note) chrome.runtime.sendMessage({ action: 'SAVE_DEV_NOTE', note, url: window.location.href, title: document.title });
                            div.remove();
                        };
                    }},
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

                // Drag Logic
                let isDragging = false;
                let offsetX, offsetY;
                bar.onmousedown = (e) => {
                    if (e.target.tagName === 'BUTTON') return;
                    isDragging = true;
                    const r = bar.getBoundingClientRect();
                    offsetX = e.clientX - r.left;
                    offsetY = e.clientY - r.top;
                    bar.style.transition = 'none';
                    bar.style.cursor = 'grabbing';
                };
                document.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    bar.style.left = (e.clientX - offsetX + bar.offsetWidth/2) + 'px';
                    bar.style.top = (e.clientY - offsetY) + 'px';
                    bar.style.bottom = 'auto';
                });
                document.addEventListener('mouseup', () => {
                    isDragging = false;
                    bar.style.transition = '0.3s cubic-bezier(0.16, 1, 0.3, 1)';
                    bar.style.cursor = 'default';
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
