import pathlib,re,json
root=pathlib.Path('js'); rows=[]
for p in root.rglob('*.js'):
 if p.parts[1] not in ['physics','input.js','main.js','render-state.js','state.js','gpu-renderer.js']:continue
 for n,line in enumerate(p.read_text().splitlines(),1):
  if re.search(r'Math\.(min|max)|clamp|sleep|prev[XY]\s*=|angularVelocity\s*=|\.omega\s*=|\.rpm\s*=|droppedSubsteps|reset|stabili',line,re.I):rows.append({'file':str(p),'line':n,'source':line.strip()})
pathlib.Path('research/full-system-forensic/data/mechanism-inventory.json').write_text(json.dumps(rows,indent=2))
