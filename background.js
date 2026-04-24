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
});

// ── Context Menu Setup ───────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "gigasnap",
        title: "⚡ Nexus: GIGASNAP Context",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "annotator",
        title: "📝 Nexus: AI Annotator mode",
        contexts: ["all"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "gigasnap") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const cleanDomForTokens = (docEl) => {
                    const traverse = (node) => {
                        let cloned = node.cloneNode(true);
                        
                        // 1. Remove comments
                        const iterator = document.createNodeIterator(cloned, NodeFilter.SHOW_COMMENT, null, false);
                        let comment;
                        while (comment = iterator.nextNode()) comment.parentNode.removeChild(comment);
                        
                        // 2. Handle Shadow DOM recursion
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
                        
                        // 4. Refine SVGs
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

                const detectStack = () => {
                    const stack = [];
                    if (window.React || document.querySelector('[data-reactroot]')) stack.push('React');
                    if (window.__NEXT_DATA__) stack.push('Next.js');
                    if (window.Vue || document.querySelector('[data-v-root]')) stack.push('Vue.js');
                    if (window.jQuery) stack.push('jQuery');
                    if (window.Angular || document.querySelector('[ng-app], [ng-version]')) stack.push('Angular');
                    if (window.Svelte || document.querySelector('[class*="svelte-"]')) stack.push('Svelte');
                    if (document.documentElement.classList.contains('tw-') || document.querySelector('[class*=":"]')) stack.push('Tailwind');
                    if (window.bootstrap) stack.push('Bootstrap');
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
                        protocol: nav.nextHopProtocol
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
                                if (k.toLowerCase().includes('config') || k.toLowerCase().includes('data') || k.toLowerCase().includes('initial')) {
                                    globals[k] = val;
                                }
                            }
                        } catch(e){}
                    });
                    return globals;
                };

                const getDesignTokens = () => {
                    const colors = new Set();
                    const fonts = new Set();
                    const walk = (node) => {
                        if (node.nodeType === 1) {
                            const style = window.getComputedStyle(node);
                            if (style.color && !style.color.includes('rgba(0, 0, 0, 0)')) colors.add(style.color);
                            if (style.backgroundColor && !style.backgroundColor.includes('rgba(0, 0, 0, 0)')) colors.add(style.backgroundColor);
                            if (style.fontFamily) fonts.add(style.fontFamily.split(',')[0].replace(/['"]/g, ''));
                        }
                        node.childNodes.forEach(walk);
                    };
                    // Sampling only first 200 elements to avoid performance hit
                    const samples = Array.from(document.querySelectorAll('*')).slice(0, 200);
                    samples.forEach(el => {
                        const style = window.getComputedStyle(el);
                        colors.add(style.color);
                        colors.add(style.backgroundColor);
                        fonts.add(style.fontFamily.split(',')[0].replace(/['"]/g, ''));
                    });
                    return { colors: Array.from(colors).slice(0, 15), fonts: Array.from(fonts).slice(0, 5) };
                };

                const megasnapshot = {
                    metadata: { 
                        timestamp: new Date().toISOString(), 
                        url: window.location.href, 
                        title: document.title,
                        type: 'Token-Optimized (Full)'
                    },
                    stack: detectStack(),
                    performance: getPerformance(),
                    design_tokens: getDesignTokens(),
                    errors: window.__DEV_VAULT_ERRORS || [],
                    global_variables: huntGlobalVars(),
                    hidden_fields: Array.from(document.querySelectorAll('input[type="hidden"]')).map(i => ({ name: i.name, id: i.id, value: i.value })),
                    system: { 
                        viewport: `${window.innerWidth}x${window.innerHeight}`, 
                        userAgent: navigator.userAgent,
                        language: navigator.language
                    },
                    storage: { 
                        local: Object.assign({}, window.localStorage),
                        session: Object.assign({}, window.sessionStorage),
                        cookies: document.cookie
                    },
                    clean_dom: cleanDomForTokens(document.documentElement)
                };

                const prompt = `### AI GIGASNAP CONTEXT (Full Intelligence Snap)\n${JSON.stringify(megasnapshot, null, 2)}\n\nPlease help me analyze this.`;
                const tmp = document.createElement('textarea');
                tmp.value = prompt;
                document.body.appendChild(tmp);
                tmp.select();
                document.execCommand('copy');
                document.body.removeChild(tmp);
                alert("GIGASNAP (Perfected) copied!\n- Full Cleaned DOM\n- Performance Metrics\n- Global State Keys\n- Storage & Metadata");
            }
        });
    } else if (info.menuItemId === "annotator") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__ANNOTATOR_ACTIVE) return;
                window.__ANNOTATOR_ACTIVE = true;
                const selections = [];

                const container = document.createElement('div');
                container.id = '__vibe_annotator_ui';
                container.style = `
                    position: fixed; top: 10px; right: 10px; width: 320px; max-height: 80vh;
                    background: #0f172a; border: 1px solid #334155; border-radius: 12px;
                    z-index: 9999999; color: white; display: flex; flex-direction: column;
                    font-family: sans-serif; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
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
                            <textarea data-idx="${i}" placeholder="Describe the task or issue here..." style="width:100%; background:#0f172a; border:1px solid #334155; color:white; font-size:11px; padding:6px; border-radius:4px; resize:vertical; min-height:40px;">${s.comment || ''}</textarea>
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
                    const prompt = `### AI TASK ANNOTATIONS\n\n${selections.map(s => `- **ELEMENT**: \`${s.selector}\`\n  **TASK**: ${s.comment || 'No specific task described.'}`).join('\n\n')}`;
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
