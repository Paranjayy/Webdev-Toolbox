import re
import os

def clean_dom_and_stats(filepath):
    print(f"🧹 Cleaning DOM: {filepath}")
    with open(filepath, 'r') as f:
        content = f.read()

    # Stats
    total_chars = len(content)
    total_tags = len(re.findall(r'<[^>]+>', content))
    
    # Rate limit check
    rate_limit_mentions = re.findall(r'(?i)rate.?limit|limit|throttle|quota', content)
    
    # Clean up: Remove noisy attributes (style, class, etc. if excessive)
    # Keeping it simple for now: remove script and style blocks
    cleaned = re.sub(r'<script.*?>.*?</script>', '', content, flags=re.DOTALL)
    cleaned = re.sub(r'<style.*?>.*?</style>', '', cleaned, flags=re.DOTALL)
    
    # Extract Antigravity specific stats from DOM
    # Looking for conversation list, active docs, etc.
    workspaces = re.findall(r'data-workspace-card="true".*?>(.*?)</span>', content, re.DOTALL)
    convos = re.findall(r'data-testid="convo-pill-.*?>(.*?)</span>', content, re.DOTALL)
    
    notes = f"""# DOM Forensic Analysis: {os.path.basename(filepath)}
    
## 📊 Raw Stats
- **Total Characters**: {total_chars:,}
- **Total HTML Tags**: {total_tags:,}
- **Detected Workspaces**: {len(workspaces)}
- **Detected Conversations**: {len(convos)}

## 🚨 Rate Limit Signals
- **Mentions**: {len(rate_limit_mentions)}
- **Contexts**: {', '.join(set(rate_limit_mentions))}

## 🧩 Structure Notes
- The DOM is a high-fidelity snapshot of the Antigravity (VS Code based) interface.
- It contains a persistent sidebar with multiple workspace contexts.
- Rate limit mentions often appear in MCP or provider telemetry hooks.

## 📝 Cleaned Preview (First 2000 chars)
{cleaned[:2000]}...
"""
    
    with open('dom_notes.md', 'w') as f:
        f.write(notes)
    
    print("✅ Cleaned notes generated: dom_notes.md")

clean_dom_and_stats('/Users/paranjay/Developer/Antigravity-Dev-Vault/ag dom.md')
