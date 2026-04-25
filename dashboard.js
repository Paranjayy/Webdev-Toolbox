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
        });
    });

    // ── Extensions Logic ──────────────────────────────────────────────────
    function renderExtensions() {
        const grid = document.getElementById('extensions-grid');
        chrome.management.getAll((extensions) => {
            const list = extensions.filter(e => e.id !== chrome.runtime.id);
            grid.innerHTML = list.map(ext => `
                <div class="card">
                    <div class="card-header">
                        <img class="ext-icon" src="${ext.icons?.[ext.icons.length-1]?.url || 'icon/icon-48.png'}">
                        <span class="status-pill ${ext.enabled ? 'on' : 'off'}">${ext.enabled ? 'Active' : 'Disabled'}</span>
                    </div>
                    <div class="card-title">${ext.name}</div>
                    <div class="card-id">ID: ${ext.id}</div>
                    <div class="card-desc">${ext.description || 'No description provided.'}</div>
                    <div class="card-actions">
                        <button class="btn btn-primary" onclick="toggleExt('${ext.id}', ${ext.enabled})">${ext.enabled ? 'Disable' : 'Enable'}</button>
                        <button class="btn" onclick="openOptions('${ext.id}')">Options</button>
                    </div>
                </div>
            `).join('');
        });
    }

    window.toggleExt = (id, current) => {
        chrome.management.setEnabled(id, !current, () => renderExtensions());
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
                <td><div style="display:flex; align-items:center; gap:8px;"><span style="color:var(--primary)">⚡</span> This Vault</div></td>
                <td>${cmd.name}</td>
                <td><span class="key-badge">${cmd.shortcut || 'Not Set'}</span></td>
                <td>Global</td>
            </tr>
        `).join('');

        // Add instructions for other extensions
        const instructionRow = `
            <tr style="background: rgba(255,255,255,0.02);">
                <td colspan="4" style="text-align:center; padding: 30px; color:var(--text-dim);">
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
                    <span style="cursor:pointer; color:var(--danger)" onclick="removeRedaction(${i})">×</span>
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
                    <div class="ext-icon" style="background:rgba(139, 92, 246, 0.1); color:var(--accent);">🧪</div>
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

    // ── Boot ──────────────────────────────────────────────────────────────
    renderExtensions();
    renderReverse();
    document.getElementById('btn-refresh')?.addEventListener('click', () => {
        renderExtensions();
        renderShortcuts();
    });
});
