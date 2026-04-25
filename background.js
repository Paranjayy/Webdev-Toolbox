// ── Auto-poll active tabs for DOM errors ─────────────────────────────────────
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
        chrome.storage.local.get(['extension_errors'], (res) => {
            const storageErrors = Array.isArray(res.extension_errors) ? res.extension_errors : [];
            const total = domErrors.length + storageErrors.length;
            if (total > 0) {
                chrome.action.setBadgeText({ text: String(total > 99 ? '99+' : total) });
                chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
            } else {
                chrome.action.setBadgeText({ text: '' });
            }
            lastErrorCount = total;
        });
    } catch (e) {}
}

setInterval(pollActiveTabErrors, 8000);

// ── Global Helper: Toast Injection (Cleaned string concat to avoid syntax errors) ──
const TOAST_FN = "const showToast = (msg, type = 'info') => {" +
    "let container = document.getElementById('webdev-toast-container');" +
    "if (!container) {" +
    "container = document.createElement('div');" +
    "container.id = 'webdev-toast-container';" +
    "container.style = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:10000000; display:flex; flex-direction:column; gap:10px; pointer-events:none;';" +
    "document.body.appendChild(container);" +
    "}" +
    "const toast = document.createElement('div');" +
    "const colors = { info: '#6366f1', success: '#10b981', error: '#ef4444', warning: '#f59e0b' };" +
    "const color = colors[type] || colors.info;" +
    "toast.style = 'background:rgba(15,23,42,0.95); backdrop-filter:blur(12px); border:1px solid ' + color + '44; border-left:4px solid ' + color + '; color:white; padding:12px 24px; border-radius:12px; font-family:sans-serif; font-size:13px; font-weight:600; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5); opacity:0; transform:translateY(-20px); transition:all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events:auto; min-width:260px; text-align:center; display:flex; align-items:center; justify-content:center; gap:10px;';" +
    "toast.innerHTML = '<span>' + msg + '</span>';" +
    "container.appendChild(toast);" +
    "setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 10);" +
    "setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-20px)'; setTimeout(() => toast.remove(), 400); }, 3500);" +
    "};";

// ── Extension Logic ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'RELOAD_EXT_AND_TAB') {
        chrome.management.setEnabled(request.id, false, () => {
            chrome.management.setEnabled(request.id, true, () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0] && !tabs[0].url.startsWith('chrome://')) chrome.tabs.reload(tabs[0].id);
                });
                sendResponse({ success: true });
            });
        });
        return true;
    }

    if (request.action === 'PERFORM_SNAPSHOT') {
        handleGigaSnap(sender.tab?.id || request.tabId, request.raw || false);
        sendResponse({ success: true });
    } else if (request.action === 'GET_ERRORS') {
        chrome.storage.local.get(['extension_errors'], (res) => sendResponse({ errors: res.extension_errors || [] }));
        return true;
    } else if (request.action === 'CLEAR_ERRORS') {
        chrome.storage.local.set({ extension_errors: [] }, () => sendResponse({ ok: true }));
        return true;
    }
    return true;
});

// ── Context Menu Setup ───────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    const menus = [
        { id: 'gsnap', title: '📸 Snap: GigaSnap' },
        { id: 'annotate', title: '🎨 Design: Annotate Mode' },
        { id: 'visual_edit', title: '🎨 Design: Visual Edit' },
        { id: 'inspect_style', title: '🔍 Design: Inspect Style' },
        { id: 'nuke_element', title: '💀 Design: Nuke Element' },
        { id: 'copy_selector', title: '📋 Dev: Copy Selector' },
        { id: 'vibe_record', title: '🔴 Record: Playwright Macro' },
        { id: 'chaos_mode', title: '🧬 Chaos: Glitch Mode' }
    ];
    menus.forEach(m => chrome.contextMenus.create({ id: m.id, title: m.title, contexts: ['all'] }));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    const id = info.menuItemId;
    if (id === "gsnap") handleGigaSnap(tab.id, false);
    else if (id === "vibe_record") handleVibeRecorder(tab.id);
    else if (id === "annotate") injectTool(tab.id, 'annotate');
    else if (id === "visual_edit") injectTool(tab.id, 'visual_edit');
    else if (id === "chaos_mode") injectTool(tab.id, 'chaos');
    else if (id === "inspect_style") injectTool(tab.id, 'inspect');
    else if (id === "copy_selector") injectTool(tab.id, 'selector');
    else if (id === "nuke_element") injectTool(tab.id, 'nuke');
});

async function injectTool(tabId, type) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: (t, toastFn) => {
            eval(toastFn);
            if (t === 'annotate') {
                if (window.__ANNOTATE_CANVAS) { window.__ANNOTATE_CANVAS.remove(); window.__ANNOTATE_CANVAS = null; showToast('Annotate: OFF', 'warning'); return; }
                const c = document.createElement('canvas');
                c.style = 'position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:9999999; cursor:crosshair;';
                c.width = window.innerWidth; c.height = window.innerHeight;
                document.body.appendChild(c); window.__ANNOTATE_CANVAS = c;
                const ctx = c.getContext('2d'); let d = false;
                ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 4; ctx.lineCap = 'round';
                c.onmousedown = (e) => { d = true; ctx.beginPath(); ctx.moveTo(e.clientX, e.clientY); };
                c.onmousemove = (e) => { if (d) { ctx.lineTo(e.clientX, e.clientY); ctx.stroke(); } };
                c.onmouseup = () => d = false;
                showToast('Annotate: ACTIVE', 'success');
            } else if (t === 'visual_edit') {
                document.designMode = document.designMode === 'on' ? 'off' : 'on';
                showToast('Visual Edit: ' + document.designMode.toUpperCase(), 'info');
            } else if (t === 'nuke') {
                showToast('Click to NUKE', 'error');
                const h = (e) => { e.preventDefault(); e.target.remove(); document.removeEventListener('click', h, true); };
                document.addEventListener('click', h, true);
            } else if (t === 'chaos') {
                showToast('CHAOS ACTIVATED', 'error');
                document.querySelectorAll('*').forEach(el => { if (Math.random()>0.9) el.style.transform = 'rotate(' + (Math.random()*10-5) + 'deg) scale(0.9)'; });
            } else if (t === 'selector') {
                showToast('Click element for Selector', 'info');
                const h = (e) => {
                    e.preventDefault(); let el = e.target; let p = [];
                    while (el && el.nodeType===1) { let s = el.tagName.toLowerCase(); if (el.id) { s+='#'+el.id; p.unshift(s); break; } p.unshift(s); el = el.parentNode; }
                    const sel = p.join(' > ');
                    const dummy = document.createElement('textarea'); document.body.appendChild(dummy); dummy.value = sel; dummy.select(); document.execCommand('copy'); document.body.removeChild(dummy);
                    showToast('Selector Copied!', 'success');
                    document.removeEventListener('click', h, true);
                };
                document.addEventListener('click', h, true);
            }
        },
        args: [type, TOAST_FN]
    });
}

async function handleGigaSnap(tabId, raw = false) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (isRaw, toastFn) => {
            eval(toastFn);
            showToast('📸 Capturing Snapshot...', 'info');
            
            const cleanDom = (node) => {
                const cloned = node.cloneNode(true);
                const remove = ['script', 'style', 'iframe', 'img', 'video', 'canvas', 'svg'];
                remove.forEach(s => cloned.querySelectorAll(s).forEach(el => el.remove()));
                return cloned.outerHTML;
            };

            const snap = {
                url: window.location.href,
                title: document.title,
                timestamp: Date.now(),
                dom: isRaw ? document.documentElement.outerHTML : cleanDom(document.documentElement)
            };

            const prompt = '### AI SNAPSHOT\n' + JSON.stringify(snap, null, 2);
            const dummy = document.createElement('textarea'); document.body.appendChild(dummy); dummy.value = prompt; dummy.select(); document.execCommand('copy'); document.body.removeChild(dummy);
            
            setTimeout(() => showToast('✅ Copied to Clipboard!', 'success'), 500);
            return snap;
        },
        args: [raw, TOAST_FN]
    });

    if (results?.[0]?.result) {
        const snap = results[0].result;
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = res.snap_history || [];
            history.unshift(snap);
            chrome.storage.local.set({ ['snap_' + Date.now()]: snap, snap_history: history.slice(0, 10) });
        });
    }
}

async function handleVibeRecorder(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: (toastFn) => {
            eval(toastFn);
            if (window.__MACRO_ACTIVE) {
                const events = window.__MACRO_EVENTS || [];
                const script = "test('recorded', async ({ page }) => { " + events.map(e => "await page.click('" + e.selector + "');").join(' ') + " });";
                const dummy = document.createElement('textarea'); document.body.appendChild(dummy); dummy.value = script; dummy.select(); document.execCommand('copy'); document.body.removeChild(dummy);
                showToast('✅ Macro Copied!', 'success');
                window.__MACRO_ACTIVE = false;
                document.getElementById('macro-indicator')?.remove();
                return;
            }
            window.__MACRO_ACTIVE = true;
            window.__MACRO_EVENTS = [];
            showToast('🔴 Recording...', 'error');
            const ind = document.createElement('div');
            ind.id = 'macro-indicator';
            ind.style = 'position:fixed; top:20px; right:20px; background:#ef4444; color:white; padding:10px; border-radius:20px; z-index:999999; font-weight:bold;';
            ind.innerText = '🔴 RECORDING';
            document.body.appendChild(ind);
            
            window.addEventListener('click', (e) => {
                if (window.__MACRO_ACTIVE) window.__MACRO_EVENTS.push({ selector: e.target.tagName.toLowerCase() });
            }, true);
        },
        args: [TOAST_FN]
    });
}
