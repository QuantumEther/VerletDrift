"""Generate stable, refresh-safe experiment routes from lab/experiments.json."""
import json,html,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
items=json.loads((root/'lab/experiments.json').read_text())
latest=max(item['sequence'] for item in items)
seen=set()
sequences=set()
for item in items:
 key=item['id']; assert re.fullmatch('[a-z0-9-]+',key) and key not in seen;seen.add(key)
 seq=item['sequence']; assert isinstance(seq,int) and seq>0 and seq not in sequences;sequences.add(seq)
 entry=root/item['entry'];assert entry.is_file() and entry.resolve().is_relative_to(root)
 label=' · Latest' if seq==latest else ''
 title=html.escape(item['title']);src=html.escape('../../'+item['entry'],quote=True)
 dest=root/'lab'/key;dest.mkdir(exist_ok=True)
 (dest/'index.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} · VerletDrift Lab</title><style>html,body{{margin:0;height:100%;background:#10191d;color:#e9eee9;font:14px system-ui}}body{{display:flex;flex-direction:column}}nav{{display:flex;gap:20px;padding:12px 16px;flex-wrap:wrap}}a{{color:#cce5af}}iframe{{border:0;width:100%;flex:1;min-height:0}}</style><nav aria-label="Laboratory navigation"><a href="../">← Laboratory</a><span>No. {seq:02d} · {title}{label}</span><a href="{src}">Open full screen ↗</a></nav><iframe title="{title}" src="{src}" allow="autoplay; fullscreen" allowfullscreen></iframe></html>''')
print(f'Generated {len(seen)} laboratory routes')
