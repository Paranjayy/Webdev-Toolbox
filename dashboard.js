const managementAPI = (typeof chrome !== 'undefined' && chrome.management) ? chrome.management : {
    getAll: (callback) => {
        console.warn("chrome.management is not supported. Using mocked extensions registry.");
        const mockExtensions = [
            {
                id: "oocalimimnnagdfecmojcfkejecbgjjh",
                name: "Glasp: YouTube Summary with ChatGPT & Claude",
                description: "Summarize YouTube videos, articles, and PDFs with ChatGPT, Claude, and Gemini.",
                enabled: true,
                installType: "normal",
                version: "2.4.15",
                icons: [{ url: "https://glasp.co/img/logo.png" }]
            },
            {
                id: "ammjkodgbocenhlhpbobiffkgcoiopcl",
                name: "7TV",
                description: "Emotes, badges, and cosmetics for Twitch and YouTube.",
                enabled: true,
                installType: "development",
                version: "3.1.20",
                icons: []
            },
            {
                id: "cb5eb942-b94c-43eb-8ac0-8891f73a3d1d",
                name: "YouTube Auto-Transcript Drawer",
                description: "Automatically opens and displays a beautiful, interactive transcript panel on YouTube watch pages.",
                enabled: true,
                installType: "development",
                version: "1.5.0",
                icons: []
            }
        ];
        setTimeout(() => callback(mockExtensions), 50);
    },
    get: (id, callback) => {
        const mockExtensions = [
            {
                id: "oocalimimnnagdfecmojcfkejecbgjjh",
                name: "Glasp: YouTube Summary with ChatGPT & Claude",
                description: "Summarize YouTube videos, articles, and PDFs with ChatGPT, Claude, and Gemini.",
                enabled: true,
                installType: "normal",
                version: "2.4.15",
                permissions: ["tabs", "activeTab", "scripting", "storage"],
                hostPermissions: ["https://*.youtube.com/*", "https://glasp.co/*"]
            },
            {
                id: "ammjkodgbocenhlhpbobiffkgcoiopcl",
                name: "7TV",
                description: "Emotes, badges, and cosmetics for Twitch and YouTube.",
                enabled: true,
                installType: "development",
                version: "3.1.20",
                permissions: ["storage", "webRequest"],
                hostPermissions: ["https://*.7tv.app/*", "https://*.twitch.tv/*"]
            }
        ];
        const found = mockExtensions.find(e => e.id === id) || {
            id,
            name: "Unknown Extension",
            description: "No metadata available (Mocked Mode).",
            enabled: true,
            installType: "normal",
            version: "1.0.0",
            permissions: [],
            hostPermissions: []
        };
        setTimeout(() => callback(found), 50);
    },
    setEnabled: (id, enabled, callback) => {
        console.warn("chrome.management.setEnabled is mocked.");
        if (callback) setTimeout(callback, 50);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // ── Navigation ────────────────────────────────────────────────────────
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    const viewTitle = document.getElementById('active-view-title');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.view;
            navItems.forEach(i => i.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(`view-${target}`).classList.add('active');
            viewTitle.textContent = item.textContent.trim().split(' ').slice(1).join(' ');

            if (target === 'extensions') renderExtensions();
            if (target === 'shortcuts') renderShortcuts();
            if (target === 'privacy') renderPrivacy();
            if (target === 'settings') renderSettings();
        });
    });

    function renderSettings() {
        console.log("Settings view rendered.");
    }

    // ── Extensions Logic ──────────────────────────────────────────────────
    let currentFilter = 'all';
    let currentSort = 'name';
    let searchQuery = '';

    function renderExtensions() {
        const grid = document.getElementById('extensions-grid');
        if (!grid) return;
        
        managementAPI.getAll((extensions) => {
            chrome.storage.local.get(['ext_notes'], (res) => {
                const extNotes = res.ext_notes || {};
                const list = extensions.filter(e => e.id !== chrome.runtime.id);
                let filtered = list.filter(ext => {
                    const matchesSearch = ext.name.toLowerCase().includes(searchQuery.toLowerCase()) || ext.id.includes(searchQuery);
                    if (!matchesSearch) return false;
                    
                    if (currentFilter === 'all') return true;
                    if (currentFilter === 'development') return ext.installType === 'development';
                    if (currentFilter === 'store') return ext.installType !== 'development';
                    return true;
                });

                // Sort logic
                filtered.sort((a, b) => {
                    if (currentSort === 'name') return a.name.localeCompare(b.name);
                    if (currentSort === 'status') return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
                    if (currentSort === 'type') return a.installType.localeCompare(b.installType);
                    return 0;
                });

                grid.innerHTML = filtered.map(ext => {
                    const note = extNotes[ext.id] || '';
                    return `
                        <div class="card" style="border-color: ${ext.enabled ? 'var(--color-stone)' : 'rgba(207, 45, 86, 0.15)'}">
                            <div class="card-header">
                                <img class="ext-icon" src="${ext.icons?.[ext.icons.length-1]?.url || 'icon.png'}" style="opacity: ${ext.enabled ? 1 : 0.5}">
                                <div style="display:flex; gap:8px;">
                                    <button class="btn" style="padding:2px 6px;" onclick="ripExt('${ext.id}')" title="Rip Blueprint">🧬 Rip Manifest</button>
                                    <span class="status-pill ${ext.enabled ? 'on' : 'off'}">${ext.enabled ? 'Active' : 'Disabled'}</span>
                                </div>
                            </div>
                            <div class="card-title">${ext.name}</div>
                            <div class="card-id">ID: ${ext.id}</div>
                            <div class="card-desc">${ext.description || 'No description provided.'}</div>
                            
                            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-stone);">
                                <div style="font-size:0.7rem; color:var(--color-ash); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                                    <span>NOTES & ISSUES</span>
                                    <button class="btn" style="padding:2px 6px; font-size:0.6rem;" onclick="toggleNote('${ext.id}')">${note ? 'EDIT' : '+ ADD'}</button>
                                </div>
                                <textarea id="dash-note-${ext.id}" 
                                    style="display: ${note ? 'block' : 'none'}; width:100%; height:60px; background:var(--color-parchment); border:1px solid var(--color-stone); color:var(--color-ink); font-size:0.75rem; padding:8px; border-radius:6px; resize:none;"
                                    placeholder="Enter issues or notes for future resolving..."
                                    onblur="saveNote('${ext.id}', this.value)"
                                >${note}</textarea>
                                ${!note ? '<div style="font-size:0.7rem; color:var(--color-ash); opacity:0.5; font-style:italic;">No notes logged.</div>' : ''}
                            </div>

                            <div class="card-actions" style="flex-wrap: wrap; gap: 6px;">
                                <button class="btn ${ext.enabled ? '' : 'btn-primary'}" onclick="toggleExt('${ext.id}', ${ext.enabled})">${ext.enabled ? 'Disable' : 'Enable'}</button>
                                <button class="btn" onclick="openOptions('${ext.id}')">Configure</button>
                                <button class="btn" onclick="downloadExtensionAsZip('${ext.id}', '${ext.name}')" title="Rip extension source code as ZIP file">📦 ZIP Source</button>
                                <button class="btn" onclick="viewExtensionSourceOnline('${ext.id}')" title="Explore extension source code online">🔍 View Source</button>
                            </div>
                        </div>
                    `;
                }).join('');
            });
        });
    }

    window.toggleNote = (id) => {
        const el = document.getElementById(`dash-note-${id}`);
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
        if (el.style.display === 'block') el.focus();
    };

    window.saveNote = (id, val) => {
        chrome.storage.local.get(['ext_notes'], (res) => {
            const notes = res.ext_notes || {};
            if (val.trim()) notes[id] = val.trim();
            else delete notes[id];
            chrome.storage.local.set({ ext_notes: notes }, () => renderExtensions());
        });
    };

    window.ripExt = (id) => {
        managementAPI.get(id, (ext) => {
            const blueprint = {
                metadata: {
                    name: ext.name,
                    description: ext.description,
                    version: ext.version,
                    type: ext.installType,
                    id: ext.id
                },
                permissions: ext.permissions,
                hostPermissions: ext.hostPermissions,
                blueprint_type: "Extension Replication Manifest"
            };
            const tmp = document.createElement('textarea');
            tmp.value = JSON.stringify(blueprint, null, 2);
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand('copy');
            document.body.removeChild(tmp);
            showToast('Extension Blueprint copied to clipboard!');
        });
    };

    window.downloadExtensionAsZip = async (id, name) => {
        try {
            showToast("Fetching extension CRX source...");
            const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=38.0&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Fetch failed: " + response.status);
            const arrayBuffer = await response.arrayBuffer();
            const view = new DataView(arrayBuffer);
            
            if (arrayBuffer.byteLength < 16) throw new Error("File too short");
            const magic = view.getUint32(0, false);
            if (magic !== 0x43723234) {
                throw new Error("Invalid CRX file signature");
            }
            
            const version = view.getUint32(4, true);
            let zipOffset = 0;
            
            if (version === 2) {
                const publicKeyLength = view.getUint32(8, true);
                const signatureLength = view.getUint32(12, true);
                zipOffset = 16 + publicKeyLength + signatureLength;
            } else if (version === 3) {
                const headerLength = view.getUint32(8, true);
                zipOffset = 12 + headerLength;
            } else {
                throw new Error("Unsupported CRX version: " + version);
            }
            
            const zipBlob = new Blob([arrayBuffer.slice(zipOffset)], { type: "application/zip" });
            const zipUrl = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = zipUrl;
            a.download = `${name.replace(/[^a-zA-Z0-9]/g, '_')}_source.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(zipUrl);
            showToast("Extension Source ZIP downloaded!");
        } catch (err) {
            console.error("Failed to download or parse CRX: ", err);
            showToast("CORS blocked parsing. Downloading CRX directly...");
            const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=38.0&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;
            window.open(url, '_blank');
        }
    };

    window.viewExtensionSourceOnline = (id) => {
        const viewerUrl = `https://robwu.nl/crxviewer/?crx=https://clients2.google.com/service/update2/crx?response=redirect&prodversion=38.0&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;
        window.open(viewerUrl, '_blank');
    };

    function showToast(message) {
        let toast = document.getElementById('dash-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'dash-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: var(--color-bone);
                border: 1px solid var(--color-stone);
                color: var(--color-ink);
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 0.85rem;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                z-index: 10000;
                transition: opacity 0.2s, transform 0.2s;
                opacity: 0;
                transform: translateY(10px);
            `;
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
        }, 2500);
    }

    // Hook up extension filters
    document.querySelectorAll('.ext-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ext-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderExtensions();
        });
    });

    // Hook up sort
    document.getElementById('ext-sort')?.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderExtensions();
    });

    // Hook up global search
    document.getElementById('global-search')?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderExtensions();
    });

    window.toggleExt = (id, current) => {
        managementAPI.setEnabled(id, !current, () => renderExtensions());
    };

    window.openOptions = (id) => {
        chrome.tabs.create({ url: `chrome://extensions/?id=${id}` });
    };

    // ── Shortcuts Logic ───────────────────────────────────────────────────
    async function renderShortcuts() {
        const body = document.getElementById('shortcuts-body');
        
        // 1. Get our own shortcuts
        const myShortcuts = await chrome.commands.getAll();
        
        // 2. We simulate getting others by showing known ones or instructions
        // In a real extension, we can't query other extensions' shortcuts via API.
        // We show a premium guide on how to manage them.
        
        body.innerHTML = myShortcuts.map(cmd => `
            <tr>
                <td><div style="display:flex; align-items:center; gap:8px;"><span style="color:var(--color-ember)">⚡</span> The Vault</div></td>
                <td>${cmd.name}</td>
                <td><span class="key-badge">${cmd.shortcut || 'Not Set'}</span></td>
                <td>Global</td>
            </tr>
        `).join('');

        // Add instructions for other extensions
        const instructionRow = `
            <tr style="background: rgba(38, 37, 30, 0.04);">
                <td colspan="4" style="text-align:center; padding: 30px; color:var(--color-ash);">
                    <div style="margin-bottom:10px;">🛡️ To track or change shortcuts for other extensions, visit the system manager:</div>
                    <button class="btn" style="width:auto; padding: 8px 24px;" id="btn-open-system-shortcuts">Open System Shortcut Manager</button>
                </td>
            </tr>
        `;
        body.innerHTML += instructionRow;

        document.getElementById('btn-open-system-shortcuts')?.addEventListener('click', () => {
            chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        });
    }

    // ── Privacy Logic ─────────────────────────────────────────────────────
    const redactInput = document.getElementById('dash-redact-input');
    const redactTags = document.getElementById('dash-redact-tags');

    function renderPrivacy() {
        chrome.storage.local.get(['customRedactions'], (data) => {
            const list = data.customRedactions || [];
            redactTags.innerHTML = list.map((item, i) => `
                <div class="btn" style="width:auto; padding: 4px 12px; font-size:0.75rem; display:flex; align-items:center; gap:8px;">
                    ${item}
                    <span style="cursor:pointer; color:var(--color-crimson)" onclick="removeRedaction(${i})">×</span>
                </div>
            `).join('');
        });
    }

    window.removeRedaction = (index) => {
        chrome.storage.local.get(['customRedactions'], (data) => {
            const list = data.customRedactions || [];
            list.splice(index, 1);
            chrome.storage.local.set({ customRedactions: list }, renderPrivacy);
        });
    };

    document.getElementById('dash-redact-add')?.addEventListener('click', () => {
        const val = redactInput.value.trim();
        if (!val) return;
        chrome.storage.local.get(['customRedactions'], (data) => {
            const list = data.customRedactions || [];
            if (!list.includes(val)) {
                list.push(val);
                chrome.storage.local.set({ customRedactions: list }, () => {
                    redactInput.value = '';
                    renderPrivacy();
                });
            }
        });
    });

    // ── Reverse Ops Logic ────────────────────────────────────────────────
    function renderReverse() {
        const grid = document.getElementById('reverse-grid');
        // We simulate this by checking consolidated folders if we had a backend, 
        // but for now we'll show the ones we know about.
        grid.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div class="ext-icon" style="background:rgba(192, 133, 50, 0.12); color:var(--color-amber);">🧪</div>
                    <span class="status-pill on">Consolidated</span>
                </div>
                <div class="card-title">7TV (ammjkodg...)</div>
                <div class="card-id">Path: ~/Developer/7TV-Reverse</div>
                <div class="card-desc">Source code for 7TV v3.1.20. Includes emote injection logic and cosmetics engine.</div>
                <div class="card-actions">
                    <button class="btn btn-primary" onclick="alert('Analyze feature coming soon!')">Analyze Logic</button>
                    <button class="btn" onclick="alert('Path copied: /Users/paranjay/Developer/7TV-Reverse')">Copy Path</button>
                </div>
            </div>
        `;
    }

    // ── Goated Features: Keyboard Shortcuts ────────────────────────────────
    window.addEventListener('keydown', (e) => {
        if ((e.cmdKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('global-search')?.focus();
        }
    });

    // ── Goated Features: Theme Toggle ──────────────────────────────────────
    let isCyberMode = false;
    function toggleTheme() {
        isCyberMode = !isCyberMode;
        if (isCyberMode) {
            document.documentElement.style.setProperty('--primary', '#8b5cf6');
            document.documentElement.style.setProperty('--primary-glow', 'rgba(139, 92, 246, 0.5)');
            document.documentElement.style.setProperty('--bg', '#020617');
        } else {
            document.documentElement.style.setProperty('--primary', 'var(--color-ember)');
            document.documentElement.style.setProperty('--primary-glow', 'rgba(245, 78, 0, 0.2)');
            document.documentElement.style.setProperty('--bg', 'var(--color-parchment)');
        }
    }

    // ── Boot ──────────────────────────────────────────────────────────────
    renderExtensions();
    renderReverse();
    
    // Add theme toggle button to header
    const headerBtns = document.querySelector('header div:last-child');
    if (headerBtns) {
        const themeBtn = document.createElement('button');
        themeBtn.className = 'btn';
        themeBtn.style.width = 'auto';
        themeBtn.textContent = '🌓 Theme';
        themeBtn.onclick = toggleTheme;
        headerBtns.prepend(themeBtn);
    }
    document.getElementById('btn-refresh')?.addEventListener('click', () => {
        renderExtensions();
        renderShortcuts();
    });
});
