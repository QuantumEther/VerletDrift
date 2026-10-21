"""Render the recorded measurements; no simulation or fitted correction."""
from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parent
before = json.loads((root / 'baseline.json').read_text())
after = json.loads((root / 'after.json').read_text())
fig, axes = plt.subplots(1, 2, figsize=(10, 4), constrained_layout=True)
for data, label in [(before, 'Audited source'), (after, 'Recovery')]:
    runs = [r for r in data['free'] if r.get('production')]
    axes[0].plot([r['hz'] for r in runs],
                 [100 * r['final']['rotationalEnergy'] / r['initial']['rotationalEnergy'] for r in runs],
                 'o-', label=label)
    axes[1].loglog([1 / r['hz'] for r in data['forced']],
                   [abs(r['angleError']) for r in data['forced']], 'o-', label=label)
axes[0].set(xlabel='Mechanical frequency (Hz)', ylabel='Rotational energy retained (%)',
            title='Force-free yaw: 2 rad/s, five seconds', ylim=(0, 105))
axes[1].set(xlabel='Mechanical timestep (s)', ylabel='Absolute angle error (rad)',
            title='Constant torque: two seconds')
for ax in axes:
    ax.grid(True, alpha=.25)
    ax.legend()
for ext in ['png', 'svg', 'pdf']:
    fig.savefig(root / f'comparison.{ext}', dpi=180)

# Matplotlib's SVG writer emits insignificant trailing path whitespace.
svg = root / 'comparison.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()).rstrip() + '\n')
