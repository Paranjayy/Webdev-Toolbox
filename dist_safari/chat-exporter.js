const browser = typeof chrome !== "undefined" ? chrome : window.browser;
const fs = require('fs');
const path = require('path');

/**
 * Antigravity Sovereign Chat Exporter
 * Aggregates all conversation logs into a portable Markdown vault.
 */

const brainDir = '/Users/paranjay/.gemini/antigravity/brain';
const exportPath = path.join(__dirname, 'antigravity_export_' + Date.now() + '.md');

function exportAllChats() {
    console.log('🚀 Starting Sovereign Export...');
    
    if (!fs.existsSync(brainDir)) {
        console.error('❌ Brain directory not found at:', brainDir);
        return;
    }

    const conversations = fs.readdirSync(brainDir).filter(f => {
        return fs.statSync(path.join(brainDir, f)).isDirectory() && f !== 'tempmediaStorage' && f !== 'scratch';
    });

    let fullVault = `# ANTIGRAVITY SOVEREIGN EXPORT\nGenerated: ${new Date().toLocaleString()}\n\n`;

    conversations.forEach(id => {
        const overviewPath = path.join(brainDir, id, '.system_generated', 'logs', 'overview.txt');
        if (fs.existsSync(overviewPath)) {
            const content = fs.readFileSync(overviewPath, 'utf8');
            fullVault += `## CONVERSATION: ${id}\n\n\`\`\`text\n${content}\n\`\`\`\n\n---\n\n`;
        }
    });

    fs.writeFileSync(exportPath, fullVault);
    console.log(`✅ Export Complete: ${exportPath}`);
}

exportAllChats();
