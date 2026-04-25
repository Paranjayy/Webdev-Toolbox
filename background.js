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

    } else if (request.action === 'PERFORM_SNAPSHOT') {
        handleGigaSnap(sender.tab?.id || request.tabId, request.raw || false);
        sendResponse({ success: true });
    } else if (request.action === 'PERFORM_MACRO') {
        handleVibeRecorder(sender.tab?.id || request.tabId);
        sendResponse({ success: true });
    }
    return true;
});

async function handleGigaSnap(tabId, raw = false) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (isRaw) => {
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

            const megasnapshot = {
                metadata: { 
                    timestamp: new Date().toISOString(), 
                    url: window.location.href, 
                    title: document.title,
                    type: isRaw ? 'Raw' : 'Token-Optimized'
                },
                stack: detectStack(),
                clean_dom: isRaw ? document.documentElement.outerHTML : cleanDomForTokens(document.documentElement)
            };

            const prompt = `### AI SNAPSHOT CONTEXT\n${JSON.stringify(megasnapshot, null, 2)}`;
            const tmp = document.createElement('textarea');
            tmp.value = prompt; document.body.appendChild(tmp);
            tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp);
            return megasnapshot;
        },
        args: [raw]
    });

    if (results?.[0]?.result) {
        const snap = results[0].result;
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = Array.isArray(res.snap_history) ? res.snap_history : [];
            history.unshift(snap);
            chrome.storage.local.set({ snap_history: history.slice(0, 5) });
        });
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

// ── Context Menu Setup ───────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "gigasnap",
        title: "📸 DEV: GigaSnap (Optimized)",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "annotator",
        id: "visual_edit",
        title: "🎨 DEV: Visual Edit Mode",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "color_tweak",
        title: "🌈 DEV: Tweak Colors",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "vibe_recorder",
        title: "🎬 DEV: Vibe Recorder",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "inspect_style",
        title: "🔍 DEV: Inspect Style",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "copy_selector",
        title: "📋 DEV: Copy Selector",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "nuke_element",
        title: "💀 DEV: Nuke Element",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "css_roulette",
        title: "🎲 DEV: CSS Roulette",
        contexts: ["all"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "gigasnap") {
        handleGigaSnap(tab.id, false);
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
                    console.log(`%c [TOOLBOX INSPECT] ${e.target.tagName} `, 'background: #6366f1; color: white; font-weight: bold;');
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
