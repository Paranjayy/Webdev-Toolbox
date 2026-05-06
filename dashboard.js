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
            viewTitle.textContent = item.textContent.trim();

            if (target === 'vault') renderVault();
            if (target === 'extensions') renderExtensions();
            if (target === 'shortcuts') renderShortcuts();
            if (target === 'settings') renderSettings();
        });
    });

    // ── Visual Vault (Refero Logic) ─────────────────────────────────────────
    function renderVault() {
        const grid = document.getElementById('vault-grid');
        const countEl = document.getElementById('vault-count');
        
        chrome.storage.local.get(['snap_history'], (res) => {
            const history = res.snap_history || [];
            countEl.textContent = `${history.length} Items`;

            if (history.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <div class="empty-icon">📂</div>
                        <div class="card-title">Vault is Empty</div>
                        <div class="card-desc">Start capturing components or page states from the extension popup.</div>
                    </div>
                `;
                return;
            }

            grid.innerHTML = history.reverse().map((snap, i) => `
                <div class="snap-card" onclick="inspectSnap(${history.length - 1 - i})">
                    <div class="snap-thumb-container">
                        <img class="snap-thumb" src="${snap.metadata?.screenshot || 'icon.png'}" loading="lazy">
                        <div class="snap-badge">${snap.metadata?.type || 'CORE'}</div>
                    </div>
                    <div class="snap-info">
                        <div class="snap-title">${snap.metadata?.title || 'Untitled Capture'}</div>
                        <div class="snap-meta">
                            <span>${new URL(snap.metadata?.url || 'https://local').hostname}</span>
                            <span>•</span>
                            <span>${new Date(snap.metadata?.timestamp).toLocaleDateString()}</span>
                        </div>
                        <div class="snap-footer">
                            <span class="snap-tag">${snap.stack?.[0] || 'Vanilla'}</span>
                            <span class="snap-tag">${(snap.dom_content.length / 1024).toFixed(1)}KB</span>
                        </div>
                    </div>
                </div>
            `).join('');
        });
    }

    window.inspectSnap = (idx) => {
        chrome.storage.local.get(['snap_history'], (res) => {
            const snap = res.snap_history[idx];
            // In a real build, we'd open a high-fidelity modal here
            console.log("Inspecting Snap:", snap);
            alert(`Inspecting Snapshot: ${snap.metadata.title}\nSource: ${snap.metadata.url}\n\nCheck console for full DOM & Metadata.`);
        });
    };

    // ── Extensions Logic (Hardened) ────────────────────────────────────────
    let currentFilter = 'all';
    function renderExtensions() {
        const grid = document.getElementById('extensions-grid');
        
        if (!chrome.management) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="empty-icon">🧭</div>
                    <div class="card-title" style="color:var(--primary)">WEBKIT SANDBOX ACTIVE</div>
                    <div class="card-desc" style="max-width:400px;">
                        Safari does not allow extensions to query or manage other extensions for security reasons. 
                        Please use the standard Safari Extensions preferences to manage your toolset.
                    </div>
                </div>
            `;
            return;
        }

        chrome.management.getAll((extensions) => {
            const list = extensions.filter(e => e.id !== chrome.runtime.id);
            const filtered = list.filter(ext => {
                if (currentFilter === 'all') return true;
                if (currentFilter === 'development') return ext.installType === 'development';
                if (currentFilter === 'store') return ext.installType !== 'development';
                return true;
            });

            grid.innerHTML = filtered.map(ext => `
                <div class="card">
                    <div class="card-header">
                        <img class="ext-icon" src="${ext.icons?.[ext.icons.length-1]?.url || 'icon.png'}">
                        <span class="status-pill ${ext.enabled ? 'on' : 'off'}">${ext.enabled ? 'Active' : 'Disabled'}</span>
                    </div>
                    <div class="card-title">${ext.name}</div>
                    <div class="card-id">ID: ${ext.id}</div>
                    <div class="card-desc">${ext.description || 'No description provided.'}</div>
                    <div class="card-actions">
                        <button class="btn btn-primary" onclick="toggleExt('${ext.id}', ${ext.enabled})">${ext.enabled ? 'Disable' : 'Enable'}</button>
                        <button class="btn" onclick="openOptions('${ext.id}')">System Panel</button>
                    </div>
                </div>
            `).join('');
        });
    }

    document.querySelectorAll('.ext-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ext-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderExtensions();
        });
    });

    window.toggleExt = (id, current) => {
        chrome.management.setEnabled(id, !current, () => renderExtensions());
    };

    window.openOptions = (id) => {
        chrome.tabs.create({ url: `chrome://extensions/?id=${id}` });
    };

    // ── Shortcuts Logic ───────────────────────────────────────────────────
    async function renderShortcuts() {
        const body = document.getElementById('shortcuts-body');
        if (!chrome.commands) {
            body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:var(--text-dim);">Shortcuts API not available in this environment.</td></tr>';
            return;
        }

        const myShortcuts = await chrome.commands.getAll();
        body.innerHTML = myShortcuts.map(cmd => `
            <tr>
                <td style="padding:16px 24px;"><div style="display:flex; align-items:center; gap:8px;"><span style="color:var(--primary)">⚡</span> The Vault</div></td>
                <td style="padding:16px 24px;">${cmd.name}</td>
                <td style="padding:16px 24px;"><span style="background:var(--border); padding:4px 8px; border-radius:6px; font-size:0.75rem; font-family:'Fira Code', monospace;">${cmd.shortcut || 'Not Set'}</span></td>
                <td style="padding:16px 24px;">Global</td>
            </tr>
        `).join('');
    }

    function renderSettings() {
        console.log("Settings view rendered.");
    }

    // Initial Load
    renderVault();
});
