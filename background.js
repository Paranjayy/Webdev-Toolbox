// ── Auto-poll active tabs for DOM errors every 8s ───────────────────────────
// ── Network & Error Interceptor (MAIN WORLD) ──────────────────────────────────
const INTERCEPTOR_SCRIPT = `
(function() {
    if (window.__VAULT_INTERCEPTOR_INJECTED) return;
    window.__VAULT_INTERCEPTOR_INJECTED = true;
    const originalFetch = window.fetch;
    const originalXHR = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;

    window.fetch = async (...args) => {
        const url = args[0];
        const options = args[1] || {};
        const method = options.method || 'GET';
        const reqBody = options.body ? (typeof options.body === 'string' ? options.body : '[Binary/Multipart]') : null;
        const reqHeaders = options.headers ? (options.headers instanceof Headers ? Object.fromEntries(options.headers) : options.headers) : {};

        try {
            const response = await originalFetch(...args);
            const resClone = response.clone();
            let resBody = '[Pending]';
            try { 
                const contentType = resClone.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    resBody = await resClone.json();
                } else {
                    resBody = (await resClone.text()).slice(0, 500);
                }
            } catch(e) { resBody = '[Unreadable]'; }

            window.dispatchEvent(new CustomEvent('VAULT_TRAFFIC_LOG', { 
                detail: { 
                    url, status: response.status, method, 
                    reqHeaders, reqBody,
                    resHeaders: Object.fromEntries(response.headers.entries()),
                    resBody,
                    time: new Date().toISOString(), type: 'FETCH' 
                } 
            }));
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

    window.XMLHttpRequest.prototype.send = function(body) {
        this._reqBody = body;
        this.addEventListener('load', function() {
            let resBody = '[Pending]';
            try { resBody = JSON.parse(this.responseText); } catch(e) { resBody = this.responseText.slice(0, 500); }
            
            window.dispatchEvent(new CustomEvent('VAULT_TRAFFIC_LOG', { 
                detail: { 
                    url: this._url, 
                    status: this.status, 
                    method: this._method, 
                    reqHeaders: this._reqHeaders,
                    reqBody: this._reqBody,
                    resHeaders: this.getAllResponseHeaders(),
                    resBody: resBody,
                    time: new Date().toISOString(),
                    type: 'XHR'
                } 
            }));
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
    const originalInfo = console.info;
    const originalDebug = console.debug;
    window.__VAULT_CONSOLE_LOGS = [];
    const hookConsole = (type, original) => {
        return (...args) => {
            try {
                const msg = args.map(a => {
                    try {
                        if (typeof a === 'object') return JSON.stringify(a);
                        return String(a);
                    } catch(e) { return '[unserializable]'; }
                }).join(' ');
                const entry = { level: type, message: msg, time: new Date().toISOString() };
                window.__VAULT_CONSOLE_LOGS.push(entry);
                if (window.__VAULT_CONSOLE_LOGS.length > 100) window.__VAULT_CONSOLE_LOGS.shift();
                window.dispatchEvent(new CustomEvent('VAULT_CONSOLE_LOG', { detail: entry }));
            } catch(e) {}
            return original.apply(console, args);
        };
    };
    console.log = hookConsole('LOG', originalLog);
    console.warn = hookConsole('WARN', originalWarn);
    console.error = hookConsole('ERROR', originalError);
    console.info = hookConsole('INFO', originalInfo);
    console.debug = hookConsole('DEBUG', originalDebug);

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
const VERSION = "3.0.0";
console.log(`%c 🧬 ANTIGRAVITY SOVEREIGNTY v${VERSION} ACTIVE `, 'background: #f2f1ed; color: #f54e00; font-weight: bold; border: 1px solid #f54e00; padding: 4px;');

// Persistent Heartbeat for Safari/Chrome background lifecycle
setInterval(() => {
    console.debug(`[Heartbeat] Antigravity v${VERSION} is synchronized and sovereign.`);
}, 5000);

let vaultTrafficBuffer = [];
let lastErrorCount = 0;

// Global Traffic Capture (Everything: Scripts, Styles, Images, etc.)
try {
    chrome.webRequest.onCompleted.addListener(
        (details) => {
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
} catch (e) {
    console.warn('[VAULT] webRequest not available:', e.message);
}

async function ensureInterceptorInjected(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (code) => {
                if (window.__VAULT_INTERCEPTOR_ACTIVE) return;
                window.__VAULT_INTERCEPTOR_ACTIVE = true;
                const script = document.createElement('script');
                script.textContent = code;
                (document.head || document.documentElement).appendChild(script);
                script.remove();
            },
            args: [INTERCEPTOR_SCRIPT]
        });
    } catch (e) {
        console.warn('[VAULT] Interceptor injection failed:', e);
    }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
        ensureInterceptorInjected(tabId).catch(e => {});
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
            try {
            if (total > 0) {
                chrome.action.setBadgeText({ text: String(total > 99 ? '99+' : total) });
                chrome.action.setBadgeBackgroundColor({ color: '#f85149' });
            } else {
                chrome.action.setBadgeText({ text: '' });
            }

            // If new errors have appeared, send a notification (first time only)
            if (total > lastErrorCount && lastErrorCount === 0 && total > 0) {
                // Notify user new errors are present
                chrome.action.setBadgeBackgroundColor({ color: '#f85149' });
            }
            } catch (e) { /* action API not available */ }
            lastErrorCount = total;
        });
    } catch (e) {
        // Tab may not be injectable (chrome://, new tabs, etc.) — silently ignore
    }
}

// Poll every 8 seconds
setInterval(pollActiveTabErrors, 8000);

// Also poll on tab activation / navigation
try {
    chrome.tabs.onActivated.addListener(() => setTimeout(pollActiveTabErrors, 1500));
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'complete') setTimeout(pollActiveTabErrors, 2000);
    });
} catch (e) {
    console.warn('[VAULT] tabs polling not available:', e.message);
}

// ── Extension reload handler ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Helper to resolve active tab ID safely without throwing TypeError on sender.tab
    const runWithTab = (actionFn) => {
        const id = request.tabId || sender.tab?.id;
        if (id) {
            actionFn(id);
        } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0]) {
                    actionFn(tabs[0].id);
                } else {
                    console.error("[VAULT LOG] No active tab found for action");
                }
            });
        }
    };

    if (request.action === 'RELOAD_EXT_AND_TAB') {
        const extId = request.id;

        // 1. Reset error badge
        try { chrome.action.setBadgeText({ text: '' }); } catch (e) {}
        lastErrorCount = 0;

        if (typeof chrome.management === 'undefined') {
            console.warn("chrome.management is not supported in this browser.");
            sendResponse({ success: false, error: "Management API not supported" });
            return true;
        }

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
            try { chrome.action.setBadgeText({ text: '' }); } catch (e) {}
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
                const id = sender.tab?.id;
                if (id) handleDOMCleaner(id, false);
            }
        });
        return true;
    } else if (request.action === 'TRIGGER_FORENSIC_PROFILER') {
        runWithTab(id => handleForensicProfiler(id));
    } else if (request.action === 'TRIGGER_GHOST_MODE') {
        runWithTab(id => handleGhostMode(id));
    } else if (request.action === 'TRIGGER_DOM_HEATMAP') {
        runWithTab(id => handleDOMHeatmap(id));
    } else if (request.action === 'TRIGGER_UI_AUTOPSY') {
        runWithTab(id => handleUIAutopsy(id));
    } else if (request.action === 'PERFORM_SNAPSHOT') {
        runWithTab(id => {
            handleDOMCleaner(id, request.raw || false)
                .then(result => {
                    sendResponse({ success: true, snapshot: result.dom, report: result.report });
                })
                .catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
        });
        return true;
    } else if (request.action === 'PERFORM_MACRO') {
        runWithTab(id => {
            handleVibeRecorder(id);
            sendResponse({ success: true });
        });
    } else if (request.action === 'TRIGGER_DESIGN_LAB') {
        runWithTab(id => handleDesignLab(id));
    } else if (request.action === 'TRIGGER_DOM_CLEAN') {
        runWithTab(id => handleDOMCleaner(id));
    } else if (request.action === 'TOGGLE_PICK_MODE') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_PICK_MODE' });
        });
        sendResponse({ success: true });
    } else if (request.action === 'SAVE_DEV_NOTE') {
        runWithTab(id => {
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
                    showContentToast(id, '🚀 Issue noted for future resolution!', 'info');
                });
            });
        });
        return true;
    } else if (request.action === 'GET_TRAFFIC_BUFFER') {
        sendResponse({ buffer: vaultTrafficBuffer });
    } else if (request.action === 'PERFORM_CSS_RIP') {
        runWithTab(async (id) => {
            const data = await handleCSSExtractor(id);
            sendResponse({ success: data && !data.error, data });
        });
        return true;
    } else if (request.action === 'TRIGGER_SHADOW_PIERCE') {
        runWithTab(id => handleShadowPierce(id));
    } else if (request.action === 'RECORD_VIBE') {
        runWithTab(id => handleRecordVibe(id));
    } else if (request.action === 'APPLY_VIBE') {
        runWithTab(id => handleApplyVibe(id));
    } else if (request.action === 'TRIGGER_REFERO_LENS') {
        runWithTab(id => handleReferoLens(id));
    } else if (request.action === 'TRIGGER_QUANTUM_PHYSICS') {
        runWithTab(id => handleQuantumPhysics(id));
    } else if (request.action === 'TRIGGER_THERMAL_MAP') {
        runWithTab(id => handleThermalMap(id));
    } else if (request.action === 'TRIGGER_VIBE_SLIDER') {
        runWithTab(id => handleVibeSlider(id));
    } else if (request.action === 'TRIGGER_HYDRATION_FORENSIC') {
        runWithTab(id => handleHydrationForensic(id));
    } else if (request.action === 'TRIGGER_SLOP_FIXER') {
        runWithTab(id => handleSlopFixer(id));
    } else if (request.action === 'TOGGLE_LATENCY') {
        runWithTab(id => {
            chrome.scripting.executeScript({
                target: { tabId: id },
                func: () => {
                    if (window.__VAULT_LATENCY_ACTIVE) {
                        window.__VAULT_LATENCY_ACTIVE = false;
                        window.fetch = window.__VAULT_ORIGINAL_FETCH;
                        return 'Latency Simulation Disabled.';
                    }
                    window.__VAULT_LATENCY_ACTIVE = true;
                    window.__VAULT_ORIGINAL_FETCH = window.fetch;
                    window.fetch = async function() {
                        await new Promise(r => setTimeout(r, 2000));
                        return window.__VAULT_ORIGINAL_FETCH.apply(this, arguments);
                    };
                    return '2-Second Network Latency Enabled.';
                }
            }, (res) => {
                if (res?.[0]?.result) showContentToast(id, res[0].result, 'info');
            });
        });
    } else if (request.action === 'visual_diff') {
        runWithTab(id => handleVisualDiff(id));
    }
    return true;
});

async function readMainWorldLogs(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                const logs = window.__VAULT_CONSOLE_LOGS || [];
                return logs.slice(-50);
            }
        });
        return results?.[0]?.result || [];
    } catch (e) {
        console.warn('[VAULT] Could not read main world logs:', e);
        return [];
    }
}

async function handleForensicProfiler(tabId) {
    const traffic = vaultTrafficBuffer.slice(-20); // Last 20 requests for context
    
    chrome.scripting.executeScript({
        target: { tabId },
        func: (recentTraffic) => {
            const getStyles = () => {
                const tokens = {};
                const r = document.querySelector(':root');
                const styles = getComputedStyle(r);
                for (let i = 0; i < styles.length; i++) {
                    const prop = styles[i];
                    if (prop.startsWith('--')) tokens[prop] = styles.getPropertyValue(prop);
                }

                const typography = [];
                document.querySelectorAll('h1, h2, h3, p, button').forEach(el => {
                    const s = getComputedStyle(el);
                    typography.push({
                        tag: el.tagName,
                        font: s.fontFamily,
                        size: s.fontSize,
                        weight: s.fontWeight,
                        color: s.color
                    });
                });

                return { tokens, typography: typography.slice(0, 20) };
            };

            const profile = {
                url: window.location.href,
                title: document.title,
                timestamp: new Date().toISOString(),
                design: getStyles(),
                traffic: recentTraffic,
                screen: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    pixelRatio: window.devicePixelRatio
                }
            };

            // Generate Refero-style Markdown
            const md = `
# UI FORENSIC PROFILE: ${profile.title}
> Captured at ${new Date(profile.timestamp).toLocaleString()}

## 🎨 Design Tokens (Root)
${Object.entries(profile.design.tokens).map(([k,v]) => `- \`${k}\`: ${v}`).join('\n')}

## 🔡 Typography Hierarchy
| Tag | Font Family | Size | Weight | Color |
|-----|-------------|------|--------|-------|
${profile.design.typography.map(t => `| ${t.tag} | ${t.font.slice(0,30)} | ${t.size} | ${t.weight} | ${t.color} |`).join('\n')}

## 📡 Network Context (Recent 20)
| Method | Status | Type | URL |
|--------|--------|------|-----|
${profile.traffic.map(l => `| ${l.method} | ${l.status} | ${l.type} | ${l.url.slice(0, 50)}... |`).join('\n')}

## 🖥️ Viewport
- Dimensions: ${profile.screen.width}x${profile.screen.height}
- Pixel Ratio: ${profile.screen.pixelRatio}
            `;

            navigator.clipboard.writeText(md);
            return { success: true, profile };
        },
        args: [traffic]
    }).then(res => {
        if (res?.[0]?.result?.success) {
            showContentToast(tabId, "Forensic UI Profile Copied (Refero Mode)!", 'success');
        }
    });
}

async function handleGravityMode(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const els = Array.from(document.querySelectorAll('div, section, article, h1, h2, h3, p, img, button')).slice(0, 500);
            els.forEach(el => {
                const rect = el.getBoundingClientRect();
                el.style.position = 'fixed';
                el.style.left = rect.left + 'px';
                el.style.top = rect.top + 'px';
                el.style.width = rect.width + 'px';
                el.style.transition = 'top 2s cubic-bezier(0.17, 0.67, 0.83, 0.67), transform 2s ease-in';
                el.style.zIndex = '100000';
            });
            setTimeout(() => {
                els.forEach(el => {
                    el.style.top = (window.innerHeight - 50) + 'px';
                    el.style.transform = `rotate(${Math.random() * 20 - 10}deg)`;
                });
            }, 100);
        }
    });
}

async function handleGhostMode(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (window.__GHOST_MODE_ACTIVE) {
                window.__GHOST_MODE_ACTIVE = false;
                document.querySelectorAll('.__ghost-hidden').forEach(el => el.style.pointerEvents = '');
                return;
            }
            window.__GHOST_MODE_ACTIVE = true;
            document.addEventListener('mouseover', (e) => {
                if (!window.__GHOST_MODE_ACTIVE) return;
                const el = e.target;
                if (el.tagName === 'BODY' || el.tagName === 'HTML') return;
                el.style.pointerEvents = 'none';
                el.classList.add('__ghost-hidden');
                setTimeout(() => el.style.pointerEvents = '', 2000);
            }, { capture: true });
        }
    });
}

async function handleDOMHeatmap(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const getMaxDepth = (el) => {
                let max = 0;
                for (let child of el.children) max = Math.max(max, getMaxDepth(child));
                return 1 + max;
            };
            const totalMax = getMaxDepth(document.body);
            document.querySelectorAll('*').forEach(el => {
                let depth = 0;
                let curr = el;
                while (curr && curr !== document.body) { depth++; curr = curr.parentElement; }
                const ratio = depth / totalMax;
                const hue = (1 - ratio) * 240; // Blue (0 depth) to Red (max depth)
                el.style.outline = `1px solid hsla(${hue}, 100%, 50%, 0.3)`;
                el.style.backgroundColor = `hsla(${hue}, 100%, 50%, 0.05)`;
            });
        }
    });
}

async function handleUIAutopsy(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const onSelect = (e) => {
                e.preventDefault(); e.stopPropagation();
                const el = e.target;
                const cloned = el.cloneNode(true);
                const styles = getComputedStyle(el);
                
                const container = document.createElement('div');
                container.style = `position:fixed; top:10%; left:10%; width:80%; height:80%; background:#0d1117; z-index:10000001; border-radius:16px; border:2px solid #ff00ff; box-shadow:0 0 50px rgba(0,0,0,0.9); display:flex; flex-direction:column; overflow:hidden;`;
                container.innerHTML = `
                    <div style="padding:16px; background:var(--color-bone); display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #30363d;">
                        <span style="color:#ff00ff; font-weight:900; text-transform:uppercase; font-size:12px;">🫀 UI AUTOPSY: ${el.tagName}</span>
                        <button id="__autopsy_close" style="background:#ff4444; color:white; border:none; padding:4px 12px; border-radius:6px; cursor:pointer;">CLOSE</button>
                    </div>
                    <div style="flex:1; display:flex; background:#000;">
                        <div style="flex:1; padding:40px; display:flex; align-items:center; justify-content:center; overflow:auto;" id="__autopsy_preview"></div>
                        <div style="width:300px; background:var(--color-bone); border-left:1px solid #30363d; padding:16px; overflow:auto;">
                            <h4 style="color:#79c0ff; font-size:11px; margin-bottom:12px;">DESIGN TOKENS</h4>
                            <pre style="font-size:10px; color:#8b949e; white-space:pre-wrap;">${Array.from(el.attributes).map(a => `${a.name}: ${a.value}`).join('\n')}</pre>
                            <h4 style="color:#79c0ff; font-size:11px; margin:20px 0 12px;">COMPUTED STYLES</h4>
                            <pre style="font-size:10px; color:#8b949e; white-space:pre-wrap;">display: ${styles.display}\nposition: ${styles.position}\nwidth: ${styles.width}\nheight: ${styles.height}\nbackground: ${styles.backgroundColor}\ncolor: ${styles.color}\nfont: ${styles.fontFamily}</pre>
                        </div>
                    </div>
                `;
                document.body.appendChild(container);
                container.querySelector('#__autopsy_preview').appendChild(cloned);
                container.querySelector('#__autopsy_close').onclick = () => container.remove();
                
                document.removeEventListener('click', onSelect, true);
                document.body.style.cursor = '';
            };
            document.addEventListener('click', onSelect, true);
            document.body.style.cursor = 'crosshair';
        }
    });
}

async function handleVisualEdit(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            document.designMode = document.designMode === 'on' ? 'off' : 'on';
            return `✍ LIVE EDIT: ${document.designMode === 'on' ? 'ENABLED (Type anywhere!)' : 'DISABLED'}`;
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleInspectStyle(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const handler = (e) => {
                e.preventDefault();
                const el = e.target;
                const style = window.getComputedStyle(el);
                
                // State Detection
                const keys = Object.keys(el);
                const reactKey = keys.find(k => k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$'));
                const vueKey = keys.find(k => k.startsWith('__vue_app__') || k.startsWith('__vue'));
                let state = null;
                if (reactKey) state = el[reactKey]?.memoizedProps || el[reactKey]?.return?.memoizedProps;
                if (vueKey) state = el[vueKey];

                console.log(`%c [VAULT INSPECT] ${el.tagName} `, 'background: #6366f1; color: white; font-weight: bold;');
                console.log('Font:', style.fontFamily, style.fontSize, style.fontWeight);
                console.log('Colors:', { color: style.color, background: style.backgroundColor });
                console.log('Spacing:', { margin: style.margin, padding: style.padding });
                if (state) console.log('%c [STATE DETECTED] ', 'background: #059669; color: white; font-weight: bold;', state);
                console.log('Element:', el);
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
            return '🎯 Click an element to inspect its styles and component state.';
        }
    });
}

async function handleCopySelector(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
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
}

async function handleShadowPierce(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const findShadowRoots = (root) => {
                const roots = [];
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                let node = walker.nextNode();
                while (node) {
                    if (node.shadowRoot) {
                        roots.push(node.shadowRoot);
                        roots.push(...findShadowRoots(node.shadowRoot));
                    }
                    node = walker.nextNode();
                }
                return roots;
            };
            const shadowRoots = findShadowRoots(document.body);
            shadowRoots.forEach(sr => {
                const overlay = document.createElement('div');
                overlay.style = `position:absolute; border:2px dashed #ff00ff; pointer-events:none; z-index:1000000; background:rgba(255,0,255,0.1);`;
                const host = sr.host;
                const rect = host.getBoundingClientRect();
                overlay.style.top = (rect.top + window.scrollY) + 'px';
                overlay.style.left = (rect.left + window.scrollX) + 'px';
                overlay.style.width = rect.width + 'px';
                overlay.style.height = rect.height + 'px';
                document.body.appendChild(overlay);
                console.log('%c [SHADOW PIERCE] ', 'background:#ff00ff; color:white; font-weight:bold;', host, sr);
            });
            return `Shadow DOM Pierced: ${shadowRoots.length} roots found and highlighted.`;
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'success');
    });
}

async function handleRecordVibe(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const tokens = {};
            const r = document.querySelector(':root');
            const styles = getComputedStyle(r);
            for (let i = 0; i < styles.length; i++) {
                const prop = styles[i];
                if (prop.startsWith('--')) tokens[prop] = styles.getPropertyValue(prop);
            }
            return tokens;
        }
    }, (res) => {
        if (res?.[0]?.result) {
            chrome.storage.local.set({ vault_vibe: res[0].result }, () => {
                showContentToast(tabId, '🎨 Vibe Captured! Ready to swap into another site.', 'success');
            });
        }
    });
}

async function handleApplyVibe(tabId) {
    chrome.storage.local.get(['vault_vibe'], (res) => {
        if (!res.vault_vibe) {
            showContentToast(tabId, '❌ No vibe captured yet. Record one first!', 'error');
            return;
        }
        chrome.scripting.executeScript({
            target: { tabId },
            func: (vibe) => {
                const root = document.documentElement;
                Object.entries(vibe).forEach(([k, v]) => {
                    root.style.setProperty(k, v);
                });
                return `Vibe Applied! ${Object.keys(vibe).length} tokens swapped.`;
            },
            args: [res.vault_vibe]
        }, (res2) => {
            if (res2?.[0]?.result) showContentToast(tabId, res2[0].result, 'success');
        });
    });
}

async function handleNukeElement(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
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
}

async function handleCSSRoulette(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
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
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleDOMCleaner(tabId, raw = false) {
    await ensureInterceptorInjected(tabId);
    const traffic = vaultTrafficBuffer.slice(-50);
    const logs = await readMainWorldLogs(tabId);
    showContentToast(tabId, "🚀 Rip Master Architecture Blueprint (CodeBoarding Mode)...", "info");

    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (isRaw, networkForensic, consoleForensicRaw) => {
            const consoleForensic = (consoleForensicRaw || []).map(l => ({ level: l.type, message: l.msg, time: l.time }));
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
                if (document.documentElement.classList.contains('tw-') || document.querySelector('link[href*="tailwind"]')) stack.push('Tailwind');
                return stack;
            };

            const generateMermaid = () => {
                let diag = "graph TD\n";
                const buildTree = (el, parentId, depth) => {
                    if (depth > 5) return;
                    const id = "node_" + Math.random().toString(36).substr(2, 9);
                    const label = (el.tagName + (el.className ? "." + el.className.split(' ')[0] : "")).slice(0, 20);
                    diag += `  ${parentId} --> ${id}["${label}"]\n`;
                    Array.from(el.children).slice(0, 5).forEach(child => buildTree(child, id, depth + 1));
                };
                buildTree(document.body, "Root", 0);
                return diag;
            };

            const extractCSS = () => {
                const external = [];
                const inlineBlocks = [];
                const inlineStyles = [];
                const cssVariables = {};

                document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                    external.push({ href: link.href, media: link.media || 'all', title: link.title || '' });
                });

                document.querySelectorAll('style').forEach((style, idx) => {
                    inlineBlocks.push({ index: idx, media: style.media || 'all', text: style.textContent });
                });

                document.querySelectorAll('[style]').forEach((el, idx) => {
                    if (idx >= 200) return;
                    const selector = el.tagName.toLowerCase() +
                        (el.id ? `#${el.id}` : '') +
                        (el.className ? `.${el.className.split(' ').join('.')}` : '');
                    inlineStyles.push({ selector: selector.slice(0, 120), style: el.getAttribute('style') });
                });

                try {
                    Array.from(document.styleSheets).forEach(sheet => {
                        try {
                            Array.from(sheet.cssRules || []).forEach(rule => {
                                if (rule.style) {
                                    Array.from(rule.style).forEach(prop => {
                                        if (prop.startsWith('--')) cssVariables[prop] = rule.style.getPropertyValue(prop).trim();
                                    });
                                }
                            });
                        } catch (e) {
                            external.push({ href: sheet.href, media: sheet.media?.mediaText || 'all', crossOrigin: true });
                        }
                    });
                } catch (e) {
                    console.warn('[CSS Extractor] stylesheet read error:', e);
                }

                const root = document.querySelector(':root');
                if (root) {
                    const computed = getComputedStyle(root);
                    Array.from(computed).forEach(prop => {
                        if (prop.startsWith('--')) cssVariables[prop] = computed.getPropertyValue(prop).trim();
                    });
                }

                return {
                    external, inlineBlocks, inlineStyles, cssVariables,
                    summary: {
                        externalCount: external.length,
                        inlineBlockCount: inlineBlocks.length,
                        inlineStyleCount: inlineStyles.length,
                        variableCount: Object.keys(cssVariables).length
                    }
                };
            };

            const domSnippet = isRaw ? document.documentElement.outerHTML : cleanDomForTokens(document.documentElement);
            const stack = detectStack();
            const mermaidDiagram = generateMermaid();
            const css = extractCSS();

            const report = `# 🧬 Antigravity Snapshot — ${document.title}
**URL:** ${window.location.href}
**Stack:** ${stack.join(', ') || 'Unknown'}
**Timestamp:** ${new Date().toISOString()}

## 🎨 CSS Extraction
- External stylesheets: ${css.summary.externalCount}
- Inline style blocks: ${css.summary.inlineBlockCount}
- Inline element styles: ${css.summary.inlineStyleCount}
- CSS variables: ${css.summary.variableCount}

\`\`\`json
${JSON.stringify(css.cssVariables, null, 2).slice(0, 4000)}
${Object.keys(css.cssVariables).length > 100 ? '<!-- [TRUNCATED] -->' : ''}
\`\`\`

## 📡 Network Forensics (Last 50)
| Method | Status | Type | URL |
|--------|--------|------|-----|
${(networkForensic || []).map(r => `| ${r.method || 'GET'} | ${r.status} | ${r.type || 'N/A'} | \`${(r.url || '').slice(0, 80)}\` |`).join('\n')}

## 🖥️ Console Logs (Last 50)
| Level | Message |
|-------|---------|
${(consoleForensic || []).map(l => `| ${l.level} | \`${(l.message || '').slice(0, 80)}\` |`).join('\n')}

## 🏗 DOM Architecture
\`\`\`html
${domSnippet.slice(0, 12000)}
${domSnippet.length > 12000 ? '<!-- [TRUNCATED] -->' : ''}
\`\`\`

## 🗺 Component Hierarchy
\`\`\`mermaid
${mermaidDiagram}
\`\`\`

**AI Prompt:** "Reconstruct this application using ${stack.join(', ') || 'modern React'}. Use the DOM, CSS tokens, and network logs for data flow."`;

            return { success: true, url: window.location.href, dom: domSnippet, report };
        },
        args: [raw, traffic, logs]
    });

    if (results?.[0]?.result?.success) {
        const snap = results[0].result;
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = Array.isArray(res.snap_history) ? res.snap_history : [];
            history.unshift({
                timestamp: new Date().toISOString(),
                url: snap.url,
                title: snap.title || 'Untitled',
                dom: snap.dom,
                report: snap.report
            });
            chrome.storage.local.set({ snap_history: history.slice(0, 5) });
        });
        showContentToast(tabId, "✅ Master Blueprint ripped to clipboard!", "success");
        return snap;
    }
    return { success: false, error: 'Snapshot failed' };
}

async function handleCSSExtractor(tabId) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const external = [];
            const inlineBlocks = [];
            const inlineStyles = [];
            const cssVariables = {};

            document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                external.push({ href: link.href, media: link.media || 'all', title: link.title || '' });
            });

            document.querySelectorAll('style').forEach((style, idx) => {
                inlineBlocks.push({ index: idx, media: style.media || 'all', text: style.textContent });
            });

            document.querySelectorAll('[style]').forEach((el, idx) => {
                if (idx >= 200) return;
                const selector = el.tagName.toLowerCase() +
                    (el.id ? `#${el.id}` : '') +
                    (el.className ? `.${el.className.split(' ').join('.')}` : '');
                inlineStyles.push({ selector: selector.slice(0, 120), style: el.getAttribute('style') });
            });

            try {
                Array.from(document.styleSheets).forEach(sheet => {
                    try {
                        Array.from(sheet.cssRules || []).forEach(rule => {
                            if (rule.style) {
                                Array.from(rule.style).forEach(prop => {
                                    if (prop.startsWith('--')) cssVariables[prop] = rule.style.getPropertyValue(prop).trim();
                                });
                            }
                        });
                    } catch (e) {
                        external.push({ href: sheet.href, media: sheet.media?.mediaText || 'all', crossOrigin: true });
                    }
                });
            } catch (e) {
                console.warn('[CSS Extractor] stylesheet read error:', e);
            }

            const root = document.querySelector(':root');
            if (root) {
                const computed = getComputedStyle(root);
                Array.from(computed).forEach(prop => {
                    if (prop.startsWith('--')) cssVariables[prop] = computed.getPropertyValue(prop).trim();
                });
            }

            const data = {
                url: window.location.href,
                timestamp: new Date().toISOString(),
                external,
                inlineBlocks,
                inlineStyles,
                cssVariables,
                summary: {
                    externalCount: external.length,
                    inlineBlockCount: inlineBlocks.length,
                    inlineStyleCount: inlineStyles.length,
                    variableCount: Object.keys(cssVariables).length
                }
            };

            let bundle = `/* CSS Bundle extracted from ${data.url} */\n`;
            bundle += `/* Timestamp: ${data.timestamp} */\n\n`;
            inlineBlocks.forEach(block => {
                bundle += `/* Inline style block #${block.index} */\n${block.text}\n\n`;
            });
            bundle += `:root {\n`;
            Object.entries(cssVariables).forEach(([k, v]) => { bundle += `  ${k}: ${v};\n`; });
            bundle += `}\n\n`;
            inlineStyles.forEach(item => { bundle += `${item.selector} { ${item.style} }\n`; });
            data.bundle = bundle;

            return { success: true, data };
        }
    });

    if (results?.[0]?.result?.success) {
        showContentToast(tabId, "🎨 CSS extraction complete!", "success");
        return results[0].result.data;
    }
    return { success: false, error: 'CSS extraction failed' };
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
            const colors = { success: 'var(--color-forest)', error: 'var(--color-crimson)', info: 'var(--color-ember)' };
            toast.style = `position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:var(--color-bone); color:white; padding:12px 24px; border-radius:12px; z-index:10000000; font-family:sans-serif; font-size:14px; font-weight:600; border:1px solid ${colors[t] || colors.info}; box-shadow:0 10px 40px rgba(0,0,0,0.8); animation: toastIn 0.3s ease forwards;`;
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
                    <div class="card" style="grid-column: span 2; border-color: var(--amber); background: rgba(210, 153, 34, 0.05);">
                    <div class="card-title" style="color: var(--amber);">Forensic UI Profiler (Refero)</div>
                    <div class="card-desc">Deep style analysis, typography mapping, and token extraction linked to network context.</div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary" id="btn-forensic-profile" style="flex:1; background: var(--amber); border-color: var(--amber);">🧬 Profile DNA</button>
                        <button class="btn" id="btn-ghost-mode" style="flex:1;">👻 Ghost Mode</button>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <button class="btn" id="btn-dom-heatmap" style="flex:1;">🌡️ Heatmap</button>
                        <button class="btn" id="btn-ui-autopsy" style="flex:1;">🫀 Autopsy</button>
                    </div>
                </div>
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
function setupMenus() {
    const menus = [
        { id: "webdev_toolbox", title: "\u{1F6E0} Webdev Toolbox" },
        { id: "ai_context_capture", parentId: "webdev_toolbox", title: "\u{1F9F9} AI: Context Capture" },
        { id: "design_lab", parentId: "webdev_toolbox", title: "\u{2728} AI: Design Superpowers (Lab)" },
        { id: "visual_edit", parentId: "webdev_toolbox", title: "\u{1F3A8} Design: Toggle Edit Mode" },
        { id: "inspect_style", parentId: "webdev_toolbox", title: "\u{1F50D} Design: Inspect Style" },
        { id: "copy_selector", parentId: "webdev_toolbox", title: "\u{1F4CB} Dev: Copy Selector" },
        { id: "nuke_element", parentId: "webdev_toolbox", title: "\u{1F480} Dev: Nuke Element" },
        { id: "css_roulette", parentId: "webdev_toolbox", title: "\u{1F3B2} Chaos: CSS Roulette" },
        { id: "forensic_profiler", parentId: "webdev_toolbox", title: "\u{1F9EC} Forensic: UI Profiler (Refero)" },
        { id: "ghost_mode", parentId: "webdev_toolbox", title: "\u{1F47B} Forensic: Toggle Ghost Mode" },
        { id: "dom_heatmap", parentId: "webdev_toolbox", title: "\u{1F321} Forensic: Analyze Heatmap" },
        { id: "ui_autopsy", parentId: "webdev_toolbox", title: "\u{1FAC0} Forensic: Live UI Autopsy" },
        { id: "state_ghosting", parentId: "webdev_toolbox", title: "\u{1F47B} Forensic: State Ghosting (React/Vue)" },
        { id: "color_autopsy", parentId: "webdev_toolbox", title: "\u{1F3A8} Forensic: Color Palette Autopsy" },
        { id: "font_autopsy", parentId: "webdev_toolbox", title: "\u{1F4DC} Forensic: Font Autopsy" },
        { id: "svg_ripper", parentId: "webdev_toolbox", title: "\u{1F3F9} Forensic: SVG Ripper" },
        { id: "shadow_pierce", parentId: "webdev_toolbox", title: "\u{1F52E} Forensic: Shadow DOM Pierce" },
        { id: "record_vibe", parentId: "webdev_toolbox", title: "\u{1F3A8} Inception: Record Vibe" },
        { id: "apply_vibe", parentId: "webdev_toolbox", title: "\u{2728} Inception: Apply Vibe" },
        { id: "vibe_recorder", parentId: "webdev_toolbox", title: "\u{1F3AC} Macro: Vibe Recorder" },
        { id: "anti_slop_detect", parentId: "webdev_toolbox", title: "\u{1F6AB} AI Slop Detector (Impeccable)" },
        { id: "floating_nexus", parentId: "webdev_toolbox", title: "\u{1F310} Toggle Floating Nexus Toolbar" },
        { id: "visual_diff", parentId: "webdev_toolbox", title: "\u{1F52C} Visual DOM Diff (Last 2 Snaps)" },
        { id: "z_index_map", parentId: "webdev_toolbox", title: "\u{1F9CA} Forensic: Z-Index 3D Map" },
        { id: "skeleton_ripper", parentId: "webdev_toolbox", title: "\u{1F9B4} Inception: Skeleton Ripper" },
        { id: "refero_lens", parentId: "webdev_toolbox", title: "\u{1F50D} Lab: The Refero Lens" },
        { id: "quantum_physics", parentId: "webdev_toolbox", title: "\u{269B} Chaos: Quantum Physics" },
        { id: "thermal_map", parentId: "webdev_toolbox", title: "\u{1F321} Forensic: Performance Thermal Map" },
        { id: "vibe_slider", parentId: "webdev_toolbox", title: "\u{1F39B} Lab: CSS Variable Time-Slider" },
        { id: "ui_xray", parentId: "webdev_toolbox", title: "\u{1F480} Chaos: UI X-Ray (Skeleton)" },
        { id: "browser_invert", parentId: "webdev_toolbox", title: "\u{1F308} Chaos: Browser Inversion" },
        { id: "hydration_forensic", parentId: "webdev_toolbox", title: "\u{1F9EA} Forensic: Hydration Mismatch" },
        { id: "slop_fixer", parentId: "webdev_toolbox", title: "\u{1FA79} Lab: AI Slop Auto-Fixer" }
    ];

    chrome.contextMenus.removeAll(() => {
        const parentMenu = menus.find(m => m.id === "webdev_toolbox");
        const childMenus = menus.filter(m => m.id !== "webdev_toolbox");

        if (parentMenu) {
            chrome.contextMenus.create({ ...parentMenu, contexts: ["all"] }, () => {
                if (chrome.runtime.lastError) { /* ignore */ }
                for (const m of childMenus) {
                    chrome.contextMenus.create({ ...m, contexts: ["all"] }, () => {
                        if (chrome.runtime.lastError) { /* ignore */ }
                    });
                }
            });
        }
    });
}

chrome.runtime.onInstalled.addListener(() => {
    setupMenus();
});
chrome.runtime.onStartup.addListener(setupMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
    console.log(`[VAULT LOG] Action: ${info.menuItemId} on tab ${tab.id}`);
    const handlers = {
        ai_context_capture: () => handleDOMCleaner(tab.id, false),
        design_lab: () => handleDesignLab(tab.id),
        visual_edit: () => handleVisualEdit(tab.id),
        inspect_style: () => handleInspectStyle(tab.id),
        copy_selector: () => handleCopySelector(tab.id),
        nuke_element: () => handleNukeElement(tab.id),
        css_roulette: () => handleCSSRoulette(tab.id),
        forensic_profiler: () => handleForensicProfiler(tab.id),
        ghost_mode: () => handleGhostMode(tab.id),
        dom_heatmap: () => handleDOMHeatmap(tab.id),
        ui_autopsy: () => handleUIAutopsy(tab.id),
        state_ghosting: () => handleStateGhosting(tab.id),
        color_autopsy: () => handleColorAutopsy(tab.id),
        font_autopsy: () => handleFontAutopsy(tab.id),
        svg_ripper: () => handleSVGRipper(tab.id),
        shadow_pierce: () => handleShadowPierce(tab.id),
        record_vibe: () => handleRecordVibe(tab.id),
        apply_vibe: () => handleApplyVibe(tab.id),
        anti_slop_detect: () => handleSlopDetect(tab.id),
        floating_nexus: () => handleFloatingNexus(tab.id),
        visual_diff: () => handleVisualDiff(tab.id),
        vibe_recorder: () => handleVibeRecorder(tab.id),
        z_index_map: () => handleZIndexLayerMap(tab.id),
        skeleton_ripper: () => handleSkeletonRipper(tab.id),
        refero_lens: () => handleReferoLens(tab.id),
        quantum_physics: () => handleQuantumPhysics(tab.id),
        thermal_map: () => handleThermalMap(tab.id),
        vibe_slider: () => handleVibeSlider(tab.id),
        ui_xray: () => handleUIXRay(tab.id),
        browser_invert: () => handleInvertColors(tab.id),
        hydration_forensic: () => handleHydrationForensic(tab.id),
        slop_fixer: () => handleSlopFixer(tab.id)
    };
    if (handlers[info.menuItemId]) handlers[info.menuItemId]();
});

// ── Forensic Mastery & Vault Logic ──────────────────────────────────────────
async function handleZIndexLayerMap(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (document.body.style.transform.includes('rotateX')) {
                // Toggle off
                document.body.style.transform = '';
                document.body.style.transformStyle = '';
                document.body.style.perspective = '';
                document.querySelectorAll('*').forEach(el => {
                    el.style.transform = el.dataset.origTransform || '';
                    el.style.boxShadow = el.dataset.origBoxShadow || '';
                });
                return 'Z-Index 3D Map Disabled.';
            }

            document.body.style.perspective = '2000px';
            document.body.style.transformStyle = 'preserve-3d';
            document.body.style.transform = 'rotateX(60deg) rotateZ(-30deg) scale(0.6)';
            document.body.style.transition = 'transform 1s ease';

            document.querySelectorAll('*').forEach(el => {
                const z = window.getComputedStyle(el).zIndex;
                if (z !== 'auto' && z !== '0') {
                    el.dataset.origTransform = el.style.transform;
                    el.dataset.origBoxShadow = el.style.boxShadow;
                    
                    // Cap extreme z-index values so it doesn't break the viewport
                    const zVal = Math.min(Math.max(parseInt(z, 10), -500), 500);
                    const offset = zVal * 2; // scale the visual offset
                    
                    el.style.transform = `translateZ(${offset}px)`;
                    el.style.boxShadow = `0 ${offset}px ${offset/2}px rgba(0,0,0,0.3)`;
                    el.style.transition = 'all 1s ease';
                }
            });
            return '🧊 Z-Index 3D Map Enabled! (Click again to disable)';
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleStateGhosting(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const onSelect = (e) => {
                e.preventDefault(); e.stopPropagation();
                const el = e.target;
                const keys = Object.keys(el);
                const reactKey = keys.find(k => k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$'));
                const vueKey = keys.find(k => k.startsWith('__vue_app__') || k.startsWith('__vue'));
                
                let state = null;
                if (reactKey) state = el[reactKey]?.memoizedProps || el[reactKey]?.return?.memoizedProps;
                if (vueKey) state = el[vueKey];

                console.log('%c [STATE GHOST] ', 'background:#00ff00; color:black; font-weight:bold;', state);
                
                const report = JSON.stringify(state, (key, val) => {
                    if (typeof val === 'function') return '[Function]';
                    if (val instanceof HTMLElement) return '[Element]';
                    return val;
                }, 2);
                
                const tmp = document.createElement('textarea');
                tmp.value = report;
                document.body.appendChild(tmp);
                tmp.select();
                document.execCommand('copy');
                document.body.removeChild(tmp);
                
                alert('🧬 Component State Ghosted to Clipboard!');
                document.removeEventListener('click', onSelect, true);
                document.body.style.cursor = 'default';
            };
            document.body.style.cursor = 'crosshair';
            document.addEventListener('click', onSelect, true);
            return '🎯 Select an element to ghost its state (React/Vue/Fiber)...';
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleColorAutopsy(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const colors = new Set();
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);
            let node = walker.nextNode();
            while (node) {
                const s = window.getComputedStyle(node);
                if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') colors.add(s.backgroundColor);
                if (s.color) colors.add(s.color);
                node = walker.nextNode();
            }
            const palette = Array.from(colors).slice(0, 24);
            console.log('%c [COLOR AUTOPSY] ', 'background:#ff0000; color:white; font-weight:bold;', palette);
            return `🎨 Autopsy Complete: ${palette.length} unique colors extracted to console.`;
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'success');
    });
}

async function handleFontAutopsy(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const fonts = [];
            document.fonts.forEach(f => {
                fonts.push({ family: f.family, style: f.style, weight: f.weight, status: f.status });
            });
            console.log('%c [FONT AUTOPSY] ', 'background: #ec4899; color: white; font-weight: bold;', fonts);
            return `📜 Font Autopsy: ${fonts.length} fonts detected. Check console.`;
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleSVGRipper(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const svgs = Array.from(document.querySelectorAll('svg')).map(s => s.outerHTML);
            if (svgs.length === 0) return 'No SVGs found on this page.';
            const combined = `<!-- Ripped by Antigravity -->\n<svg xmlns="http://www.w3.org/2000/svg">\n${svgs.join('\n\n')}\n</svg>`;
            const blob = new Blob([combined], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `antigravity_ripped_${Date.now()}.svg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return `🏹 Ripped ${svgs.length} SVGs to your downloads!`;
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'success');
    });
}

async function handleUIXRay(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const id = 'vault-xray-style';
            let style = document.getElementById(id);
            if (style) { style.remove(); return 'UI X-Ray Disabled.'; }
            style = document.createElement('style');
            style.id = id;
            style.textContent = `
                * {
                    background: rgba(0, 255, 255, 0.05) !important;
                    outline: 1px solid rgba(0, 255, 255, 0.3) !important;
                    color: rgba(255, 255, 255, 0.5) !important;
                    box-shadow: none !important;
                }
                *:hover {
                    outline: 1px solid #00ffff !important;
                    background: rgba(0, 255, 255, 0.1) !important;
                }
            `;
            document.head.appendChild(style);
            return '💀 UI X-Ray Enabled! (Skeleton mode)';
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleInvertColors(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const id = 'vault-invert-style';
            let style = document.getElementById(id);
            if (style) { style.remove(); return 'Colors Restored.'; }
            style = document.createElement('style');
            style.id = id;
            style.textContent = `
                html { filter: invert(1) hue-rotate(180deg) !important; background: #fff; }
                img, video, canvas, svg { filter: invert(1) hue-rotate(180deg) !important; }
            `;
            document.head.appendChild(style);
            return '🌈 Browser Inversion Enabled!';
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleSkeletonRipper(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const onSelect = (e) => {
                e.preventDefault(); e.stopPropagation();
                const el = e.target;
                
                // Deep clone and clean
                const cloned = el.cloneNode(true);
                
                // Generic skeleton classes (Tailwind-ish)
                const walker = document.createTreeWalker(cloned, NodeFilter.SHOW_ELEMENT, null, false);
                let node = walker.nextNode();
                // Add the root element itself to the list to process
                const allNodes = [cloned];
                while (node) { allNodes.push(node); node = walker.nextNode(); }

                allNodes.forEach(n => {
                    // Strip specific styling attributes
                    n.removeAttribute('style');
                    n.removeAttribute('id');
                    
                    // Replace content with skeleton blocks
                    if (n.children.length === 0 && n.textContent.trim().length > 0) {
                        n.textContent = '';
                        n.classList.add('bg-gray-200', 'rounded', 'animate-pulse');
                        if (!n.classList.contains('h-') && !n.className.match(/h-\d/)) n.classList.add('h-4', 'w-full');
                    }
                    
                    // Strip complex classes, keep structure
                    const keepClasses = ['flex', 'grid', 'flex-col', 'items-center', 'justify-between', 'gap-', 'p-', 'm-', 'w-', 'h-', 'rounded'];
                    if (n.className && typeof n.className === 'string') {
                        const newClasses = n.className.split(' ').filter(c => keepClasses.some(kc => c.startsWith(kc)));
                        n.className = newClasses.join(' ');
                    }
                });

                const html = cloned.outerHTML;
                const tmp = document.createElement('textarea');
                tmp.value = html;
                document.body.appendChild(tmp);
                tmp.select();
                document.execCommand('copy');
                tmp.remove();

                document.removeEventListener('click', onSelect, true);
                document.body.style.cursor = '';
                
                console.log('🦴 Skeleton Ripped:\n', html);
                alert('Skeleton boilerplate copied to clipboard!');
            };
            document.addEventListener('click', onSelect, true);
            document.body.style.cursor = 'crosshair';
            return 'Click any element to rip its skeleton.';
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleReferoLens(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (window.__refero_lens_active) {
                document.removeEventListener('mousemove', window.__refero_lens_fn);
                document.getElementById('__refero_lens')?.remove();
                window.__refero_lens_active = false;
                return 'Refero Lens Disabled.';
            }
            
            window.__refero_lens_active = true;
            const lens = document.createElement('div');
            lens.id = '__refero_lens';
            lens.style = `position:fixed; pointer-events:none; z-index:2147483647; background:rgba(13,17,23,0.95); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px; box-shadow:0 10px 30px rgba(0,0,0,0.5); font-family:monospace; color:#e6edf3; font-size:11px; min-width:220px; transition:opacity 0.1s; opacity:0;`;
            document.body.appendChild(lens);

            window.__refero_lens_fn = (e) => {
                const el = document.elementFromPoint(e.clientX, e.clientY);
                if (!el || el === document.body || el === document.documentElement) {
                    lens.style.opacity = '0';
                    return;
                }
                lens.style.opacity = '1';
                
                // Offset lens so it doesn't block the cursor
                const x = e.clientX + 15;
                const y = e.clientY + 15;
                lens.style.left = `${x}px`;
                lens.style.top = `${y}px`;

                const cs = window.getComputedStyle(el);
                const tag = el.tagName.toLowerCase();
                const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').join('.')}` : '';
                
                lens.innerHTML = `
                    <div style="color:#7ee787; font-weight:bold; margin-bottom:6px; font-size:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">
                        ${tag}${cls}
                    </div>
                    <div style="display:grid; grid-template-columns:80px 1fr; gap:4px;">
                        <span style="color:#8b949e">Font:</span> <span>${cs.fontFamily.split(',')[0]}</span>
                        <span style="color:#8b949e">Size:</span> <span>${cs.fontSize}</span>
                        <span style="color:#8b949e">Weight:</span> <span>${cs.fontWeight}</span>
                        <span style="color:#8b949e">Line:</span> <span>${cs.lineHeight}</span>
                        <span style="color:#8b949e">Spacing:</span> <span>${cs.letterSpacing}</span>
                        <span style="color:#8b949e">Color:</span> <span style="display:flex; align-items:center; gap:4px;"><div style="width:10px;height:10px;border-radius:2px;background:${cs.color}"></div> ${cs.color}</span>
                        <span style="color:#8b949e">Margin:</span> <span>${cs.margin}</span>
                        <span style="color:#8b949e">Padding:</span> <span>${cs.padding}</span>
                    </div>
                `;
            };
            document.addEventListener('mousemove', window.__refero_lens_fn);
            return '🔍 Refero Lens Enabled! Hover over elements.';
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleQuantumPhysics(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (window.__quantum_active) {
                window.__quantum_active = false;
                cancelAnimationFrame(window.__quantum_raf);
                document.removeEventListener('mousemove', window.__quantum_mouse);
                return 'Quantum Physics Disabled.';
            }

            window.__quantum_active = true;
            const elements = Array.from(document.querySelectorAll('p, h1, h2, h3, img, button, a, .card, span'))
                .filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
            
            const physicsData = elements.map(el => {
                const rect = el.getBoundingClientRect();
                // We use transform instead of absolute positioning to avoid destroying the layout completely
                return {
                    el,
                    x: 0,
                    y: 0,
                    vx: 0,
                    vy: 0,
                    origX: rect.left + rect.width / 2,
                    origY: rect.top + rect.height / 2
                };
            });

            let mouseX = -1000, mouseY = -1000;
            window.__quantum_mouse = (e) => { mouseX = e.clientX; mouseY = e.clientY; };
            document.addEventListener('mousemove', window.__quantum_mouse);

            const loop = () => {
                if (!window.__quantum_active) return;
                
                physicsData.forEach(p => {
                    const elCenterX = p.origX + p.x;
                    const elCenterY = p.origY + p.y;
                    
                    const dx = elCenterX - mouseX;
                    const dy = elCenterY - mouseY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    
                    // Repulsion logic
                    if (dist < 150) {
                        const force = (150 - dist) / 150; // 0 to 1
                        p.vx += (dx / dist) * force * 2;
                        p.vy += (dy / dist) * force * 2;
                    }

                    // Return-to-origin spring logic
                    p.vx += (0 - p.x) * 0.05;
                    p.vy += (0 - p.y) * 0.05;

                    // Friction
                    p.vx *= 0.85;
                    p.vy *= 0.85;

                    p.x += p.vx;
                    p.y += p.vy;

                    p.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
                });
                
                window.__quantum_raf = requestAnimationFrame(loop);
            };
            window.__quantum_raf = requestAnimationFrame(loop);
            return '⚛️ Quantum Physics Activated! Move your mouse.';
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleThermalMap(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (window.__thermal_active) {
                window.__thermal_active = false;
                window.__thermal_observer?.disconnect();
                return 'Performance Thermal Map Disabled.';
            }
            window.__thermal_active = true;
            try {
                window.__thermal_observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.entryType === 'layout-shift') {
                            entry.sources.forEach(source => {
                                const el = source.node;
                                if (el && el.style) {
                                    const origOutline = el.style.outline;
                                    const origTransition = el.style.transition;
                                    const origBg = el.style.backgroundColor;
                                    el.style.transition = 'none';
                                    el.style.outline = '3px solid rgba(239, 68, 68, 0.8)';
                                    el.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                                    setTimeout(() => {
                                        el.style.transition = 'all 1s ease';
                                        el.style.outline = origOutline;
                                        el.style.backgroundColor = origBg;
                                    }, 200);
                                }
                            });
                        }
                    }
                });
                window.__thermal_observer.observe({ type: 'layout-shift', buffered: true });
                return '🌡️ Thermal Map Active! Watching for Layout Shifts (CLS).';
            } catch (e) {
                return 'Error: PerformanceObserver not supported here.';
            }
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}

async function handleVibeSlider(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (document.getElementById('__vibe_slider')) {
                document.getElementById('__vibe_slider').remove();
                document.body.style.filter = '';
                return 'Vibe Slider Removed.';
            }

            const container = document.createElement('div');
            container.id = '__vibe_slider';
            container.style = `position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:rgba(13,17,23,0.95); padding:15px 25px; border-radius:30px; z-index:2147483647; backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); box-shadow:0 10px 40px rgba(0,0,0,0.5); display:flex; align-items:center; gap:15px; font-family:monospace;`;
            container.innerHTML = `
                <span style="color:#e6edf3; font-size:12px; font-weight:bold;">VIBE SHIFT</span>
                <input type="range" min="0" max="360" value="0" style="width:200px; accent-color:#8b5cf6; cursor:pointer;">
                <span style="color:#8b949e; cursor:pointer; font-weight:bold; font-size:14px;" onclick="this.parentElement.remove(); document.body.style.filter = '';">×</span>
            `;
            document.body.appendChild(container);
            
            container.querySelector('input').addEventListener('input', (e) => {
                const hueOffset = e.target.value;
                document.body.style.filter = `hue-rotate(${hueOffset}deg)`;
            });
            return '🎛️ Vibe Time-Slider Active!';
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'info');
    });
}



async function handleSlopDetect(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const findings = [];
            const body = document.body;
            const allEls = body.querySelectorAll('*');
            allEls.forEach(el => {
                const cs = window.getComputedStyle(el);
                const bg = cs.backgroundImage;
                if (bg && bg.includes('gradient') && (bg.includes('purple') || bg.includes('#8b5cf6') || bg.includes('#6366f1') || bg.includes('#a855f7') || bg.includes('violet'))) {
                    findings.push({ rule: 'Purple Gradient', severity: 'high', selector: el.tagName + (el.id ? '#' + el.id : ''), detail: bg.slice(0, 80) });
                }
                if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') {
                    findings.push({ rule: 'Gradient Text', severity: 'high', selector: el.tagName + (el.id ? '#' + el.id : ''), detail: 'webkit-background-clip: text' });
                }
                const font = cs.fontFamily;
                ['Inter', 'Roboto', 'Space Grotesk', 'Plus Jakarta Sans', 'Geist', 'Fraunces', 'Instrument Sans', 'Recoleta'].forEach(f => {
                    if (font && font.includes(f)) {
                        findings.push({ rule: 'Overused Font', severity: 'medium', selector: el.tagName + (el.id ? '#' + el.id : ''), detail: f });
                    }
                });
                const color = cs.color;
                const bgColor = cs.backgroundColor;
                if (color === bgColor && color !== 'rgba(0, 0, 0, 0)') {
                    findings.push({ rule: 'Zero Contrast', severity: 'critical', selector: el.tagName + (el.id ? '#' + el.id : ''), detail: color });
                }
            });

            const existing = document.getElementById('__slop_panel');
            if (existing) { existing.remove(); return; }
            const panel = document.createElement('div');
            panel.id = '__slop_panel';
            panel.style = `position:fixed; top:20px; right:20px; width:380px; max-height:70vh; background:#0d1117; border:1px solid #ef4444; border-radius:16px; z-index:10000000; font-family:monospace; color:white; overflow:hidden; display:flex; flex-direction:column; box-shadow: 0 20px 50px rgba(239,68,68,0.3);`;
            
            const severityColor = { critical: 'var(--color-crimson)', high: '#f97316', medium: '#f59e0b', low: '#6b7280' };
            panel.innerHTML = `
                <div style="padding:14px 18px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; background:rgba(239,68,68,0.1);">
                    <div style="font-size:11px; font-weight:900; letter-spacing:2px; color:#ef4444;">⚠ AI SLOP DETECTOR</div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <span style="font-size:10px; color:#ef4444; font-weight:700;">${findings.length} Issues</span>
                        <span id="__slop_close" style="cursor:pointer; opacity:0.5;">✕</span>
                    </div>
                </div>
                <div style="overflow-y:auto; flex:1; padding:12px; display:flex; flex-direction:column; gap:8px;">
                    ${findings.length === 0 ? '<div style="color:#10b981; text-align:center; padding:30px;">✓ No AI Slop Detected!</div>' : findings.map(f => `
                        <div style="background:#1a1f2e; border-left:3px solid ${severityColor[f.severity]}; border-radius:8px; padding:10px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span style="font-size:11px; font-weight:700; color:${severityColor[f.severity]};">${f.rule}</span>
                            </div>
                            <div style="font-size:10px; color:#8b949e; margin-bottom:2px;">@ <code>${f.selector}</code></div>
                            <div style="font-size:10px; color:#6b7280; word-break:break-all;">${f.detail}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            document.body.appendChild(panel);
            document.getElementById('__slop_close').onclick = () => panel.remove();
        }
    });
}

async function handleFloatingNexus(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const existing = document.getElementById('__nexus_bar');
            if (existing) { existing.remove(); return; }
            const bar = document.createElement('div');
            bar.id = '__nexus_bar';
            bar.style = `position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:4px; padding:8px 12px; background:rgba(13,17,23,0.95); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.1); border-radius:50px; z-index:10000000; box-shadow:0 10px 40px rgba(0,0,0,0.5); color:white;`;
            
            const tools = [
                { label: '🧹', title: 'Context Capture', action: 'TRIGGER_DOM_CLEAN' },
                { label: '✏️', title: 'Edit Mode', fn: () => { document.designMode = document.designMode === 'on' ? 'off' : 'on'; } },
                { label: '🔍', title: 'Lens', action: 'TRIGGER_REFERO_LENS' },
                { label: '⚛️', title: 'Physics', action: 'TRIGGER_QUANTUM_PHYSICS' },
                { label: '🌡️', title: 'Thermal', action: 'TRIGGER_THERMAL_MAP' },
                { label: '🧪', title: 'Hydration', action: 'TRIGGER_HYDRATION_FORENSIC' },
                { label: '✕', title: 'Close', fn: () => bar.remove() }
            ];

            tools.forEach(t => {
                const btn = document.createElement('button');
                btn.textContent = t.label;
                btn.title = t.title;
                btn.style = `background:transparent; border:none; color:white; width:32px; height:32px; cursor:pointer; font-size:14px; border-radius:50%; transition:0.2s;`;
                btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.1)';
                btn.onmouseout = () => btn.style.background = 'transparent';
                btn.onclick = () => {
                    if (t.fn) t.fn();
                    else chrome.runtime.sendMessage({ action: t.action });
                };
                bar.appendChild(btn);
            });
            document.body.appendChild(bar);
        }
    });
}

async function handleVisualDiff(tabId) {
    chrome.storage.local.get(['snap_history'], (res) => {
        const history = res.snap_history || [];
        if (history.length < 2) {
            showContentToast(tabId, '⚠ Need at least 2 snapshots for diff.', 'error');
            return;
        }
        showContentToast(tabId, 'Visual Diff triggered between last 2 snaps.', 'info');
            });
        }

async function handleHydrationForensic(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const appEl = document.querySelector('#app, #root, [data-reactroot], [ng-version], [data-v-app]');
            const findings = [];
            if (appEl) {
                const attrs = Array.from(appEl.attributes).map(a => a.name).join(', ');
                findings.push({ rule: 'Framework Root', detail: `${appEl.tagName} (${attrs})` });
            }
            const allEls = document.querySelectorAll('*');
            const hydrated = Array.from(allEls).filter(el => el.__vue_app__ || el._reactRootContainer || el.__zone_symbol__originalInstance);
            findings.push({ rule: 'Hydration Markers', detail: `${hydrated.length} elements with framework internals` });
            return findings;
        }
    }, (res) => {
        const data = res?.[0]?.result || [];
        showContentToast(tabId, `🧪 Hydration: ${data.length} findings`, 'info');
    });
}

async function handleSlopFixer(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const fixed = [];
            const allEls = document.querySelectorAll('*');
            allEls.forEach(el => {
                const cs = window.getComputedStyle(el);
                if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') {
                    el.style.backgroundClip = 'border-box';
                    el.style.webkitBackgroundClip = 'border-box';
                    fixed.push('gradient-text');
                }
                if (cs.backgroundImage && cs.backgroundImage.includes('gradient') && cs.backgroundImage.includes('purple')) {
                    el.style.backgroundImage = 'none';
                    fixed.push('purple-gradient');
                }
            });
            return `🩹 Slop Fixed: ${fixed.length} issues patched`;
        }
    }, (res) => {
        if (res?.[0]?.result) showContentToast(tabId, res[0].result, 'success');
    });
}
