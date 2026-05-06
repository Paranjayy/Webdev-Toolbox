const browser = typeof chrome !== "undefined" ? chrome : window.browser;
// ── Nexus Background Engine v2.1.0-STABLE ─────────────────────────────────────
let vaultTrafficBuffer = [];

// ── CONTEXT MENUS (Immediate Registration) ───────────────────────────────────
try {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ 
            id: "nexus_snap", 
            title: "⚡ Nexus Snapshot", 
            contexts: ["all"] 
        });
        chrome.contextMenus.create({ 
            id: "nexus_ann", 
            title: "📝 Nexus Annotate", 
            contexts: ["all"] 
        });
    });
} catch (e) {
    console.error("Context Menu Error:", e);
}

// ── MESSAGE DISPATCHER ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message Received:", request.action);

    if (request.action === 'PING') {
        sendResponse({ success: true, pong: true });
        return true;
    }

    if (request.action === 'PERFORM_SNAPSHOT') {
        handleDOMSnapshot(sender.tab?.id || request.tabId, request.raw || false);
        sendResponse({ success: true });
    } else if (request.action === 'START_ANNOTATOR') {
        handleAnnotator(sender.tab?.id || request.tabId);
        sendResponse({ success: true });
    } else if (request.action === 'GET_TRAFFIC_BUFFER') {
        sendResponse({ buffer: vaultTrafficBuffer });
    }
    return true;
});

// ── SNAPSHOT ENGINE ──────────────────────────────────────────────────────────
async function handleDOMSnapshot(tabId, isRaw = false) {
    let screenshot = null;
    try {
        screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 40 });
    } catch (e) {}

    chrome.scripting.executeScript({
        target: { tabId },
        func: (rawMode, traffic, ss) => {
            const cleanDom = (el) => {
                const cloned = el.cloneNode(true);
                const remove = ['script', 'style', 'noscript', 'iframe', 'img', 'video', 'canvas', 'svg', 'link', 'meta', 'template'];
                remove.forEach(s => cloned.querySelectorAll(s).forEach(e => e.remove()));
                cloned.querySelectorAll('*').forEach(e => {
                    const attrs = e.attributes;
                    for (let i = attrs.length - 1; i >= 0; i--) {
                        if (!/^(data-|aria-|class|id|href|src|value|type|name|placeholder)/.test(attrs[i].name)) e.removeAttribute(attrs[i].name);
                    }
                });
                return cloned.outerHTML;
            };

            const snap = {
                metadata: {
                    timestamp: Date.now(),
                    url: location.href,
                    title: document.title,
                    type: rawMode ? 'Raw-DOM' : 'Clean-DOM',
                    screenshot: ss,
                    traffic_snapshot: traffic.slice(-20)
                },
                stack: [],
                dom_content: rawMode ? document.documentElement.outerHTML : cleanDom(document.documentElement)
            };

            const blob = JSON.stringify(snap, null, 2);
            const tmp = document.createElement('textarea');
            tmp.value = `### NEXUS SNAPSHOT\n${blob}`;
            document.body.appendChild(tmp); tmp.select(); document.execCommand('copy'); tmp.remove();
            
            // In-page Toast
            const t = document.createElement('div');
            t.style = 'position:fixed; bottom:20px; right:20px; background:rgba(15,23,42,0.9); backdrop-filter:blur(10px); color:white; padding:12px 20px; border-radius:10px; border:1px solid rgba(59,130,246,0.3); z-index:2147483647; font-family:sans-serif; font-size:13px; font-weight:600; box-shadow:0 10px 30px rgba(0,0,0,0.5);';
            t.innerHTML = `⚡ ${snap.metadata.type} Archived`;
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 3000);

            return snap;
        },
        args: [isRaw, vaultTrafficBuffer, screenshot]
    }).then(results => {
        if (results?.[0]?.result) {
            const snap = results[0].result;
            chrome.storage.local.get(['snap_history'], (res) => {
                const history = Array.isArray(res.snap_history) ? res.snap_history : [];
                history.unshift(snap);
                chrome.storage.local.set({ snap_history: history.slice(0, 15) });
            });
        }
    });
}

// ── ANNOTATOR ENGINE ─────────────────────────────────────────────────────────
async function handleAnnotator(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (window.__NEXUS_ANNOTATOR) return;
            window.__NEXUS_ANNOTATOR = true;
            const annotations = [];
            const ui = document.createElement('div');
            ui.style = 'position:fixed; top:20px; right:20px; width:300px; background:#0f172a; border:1px solid #334155; border-radius:12px; z-index:1000000; color:white; padding:15px; box-shadow:0 30px 60px rgba(0,0,0,0.5);';
            ui.innerHTML = '<b>NEXUS ANNOTATOR</b><div id="ann-list"></div><button id="copy-ann" style="margin-top:10px; width:100%;">Copy Prompt</button>';
            document.body.appendChild(ui);
            // Minimal handler for stability
            ui.querySelector('#copy-ann').onclick = () => {
                alert("Annotator Placeholder - Logic simplified for stability.");
            };
        }
    });
}

// ── CONTEXT MENU CLICK HANDLER ──────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "nexus_snap") handleDOMSnapshot(tab.id);
    if (info.menuItemId === "nexus_ann") handleAnnotator(tab.id);
});
