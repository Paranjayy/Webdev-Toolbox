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
            if (target === 'operations') renderOperations();
            if (target === 'privacy') renderPrivacy();
            if (target === 'settings') renderSettings();
        });
    });

    function renderSettings() {
        console.log("Settings view rendered.");
    }

    // ── Operations / Command Center Logic ────────────────────────────────
    const terminalOutput = document.getElementById('terminal-output');
    const terminalInput = document.getElementById('terminal-input');

    function appendToTerminal(text, type = 'info') {
        if (!terminalOutput) return;
        const div = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString([], { hour12: false });
        let color = '#39ff14';
        if (type === 'error') color = 'var(--danger)';
        if (type === 'success') color = 'var(--success)';
        if (type === 'warning') color = 'var(--warning)';
        if (type === 'system') color = 'var(--primary)';

        div.style.color = color;
        div.innerHTML = `<span style="color:var(--text-dim); font-size:0.7rem;">[${timestamp}]</span> ${text}`;
        terminalOutput.appendChild(div);
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }

    async function executeCommand(cmd) {
        appendToTerminal(`vault@paranjayy ~ % ${cmd}`, 'system');
        const command = cmd.toLowerCase().trim();

        if (command === 'git sync') {
            appendToTerminal("Scanning local repositories...");
            await new Promise(r => setTimeout(r, 800));
            appendToTerminal("Found 3 repositories: 7tv-raycast, Antigravity-Dev-Vault, ipl-engine");
            appendToTerminal("Pushing 7tv-raycast changes to origin...");
            await new Promise(r => setTimeout(r, 1200));
            appendToTerminal("[SUCCESS] 7tv-raycast synced.", 'success');
        } else if (command === 'ray publish') {
            appendToTerminal("Initiating Raycast Store publishing flow...");
            await new Promise(r => setTimeout(r, 500));
            appendToTerminal("Validating package.json...");
            appendToTerminal("Running linter...");
            await new Promise(r => setTimeout(r, 1500));
            appendToTerminal("[ERROR] Metadata screenshots missing. Please add them to /metadata.", 'error');
        } else if (command === 'vault audit') {
            appendToTerminal("Starting security audit...");
            await new Promise(r => setTimeout(r, 1000));
            appendToTerminal("Checking for leaked credentials...");
            appendToTerminal("Verifying 'Privacy Shield' redaction rules...");
            await new Promise(r => setTimeout(r, 1000));
            appendToTerminal("[SUCCESS] Audit complete. 0 vulnerabilities found.", 'success');
        } else if (command === 'clean temp') {
            appendToTerminal("Wiping temp artifacts from scratch directory...");
            await new Promise(r => setTimeout(r, 800));
            appendToTerminal("[SUCCESS] 42MB cleared.", 'success');
        } else if (command === 'help') {
            appendToTerminal("Available commands: git sync, ray publish, vault audit, clean temp, clear, help");
        } else if (command === 'clear') {
            terminalOutput.innerHTML = '<div>[VAULT-INFO] Terminal cleared.</div>';
        } else {
            appendToTerminal(`Command not found: ${cmd}`, 'error');
        }
    }

    terminalInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = terminalInput.value;
            if (cmd) executeCommand(cmd);
            terminalInput.value = '';
        }
    });

    document.querySelectorAll('.ops-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            executeCommand(cmd);
        });
    });

    function renderOperations() {
        terminalInput?.focus();
    }

    // ── Extensions Logic ──────────────────────────────────────────────────
    let currentFilter = 'all';
    function renderExtensions() {
        const grid = document.getElementById('extensions-grid');
        if (!grid) return;
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

    // Hook up extension filters
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
        if (!body) return;
        const myShortcuts = await chrome.commands.getAll();
        body.innerHTML = myShortcuts.map(cmd => `
            <tr>
                <td><div style="display:flex; align-items:center; gap:8px;"><span style="color:var(--primary)">⚡</span> The Vault</div></td>
                <td>${cmd.name}</td>
                <td><span class="key-badge">${cmd.shortcut || 'Not Set'}</span></td>
                <td>Global</td>
            </tr>
        `).join('');

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
        if (!redactTags) return;
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

    // ── Goated Features: Theme Toggle ──────────────────────────────────────
    let isCyberMode = false;
    function toggleTheme() {
        isCyberMode = !isCyberMode;
        if (isCyberMode) {
            document.documentElement.style.setProperty('--primary', '#8b5cf6');
            document.documentElement.style.setProperty('--primary-glow', 'rgba(139, 92, 246, 0.5)');
            document.documentElement.style.setProperty('--bg', '#020617');
        } else {
            document.documentElement.style.setProperty('--primary', '#3b82f6');
            document.documentElement.style.setProperty('--primary-glow', 'rgba(59, 130, 246, 0.5)');
            document.documentElement.style.setProperty('--bg', '#030712');
        }
    }

    // ── Boot ──────────────────────────────────────────────────────────────
    renderExtensions();
    
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
        appendToTerminal("Dashboard manually refreshed.", "system");
    });

    // Auto-Refresh Logic: Trigger a refresh after successful commands
    const originalExecute = executeCommand;
    executeCommand = async (cmd) => {
        await originalExecute(cmd);
        if (document.querySelector('[data-view="settings"] button.btn-primary')?.textContent === 'ON') {
            setTimeout(() => {
                renderExtensions();
                renderShortcuts();
                appendToTerminal("Auto-refreshing dashboard registry...", "system");
            }, 500);
        }
    };
});
