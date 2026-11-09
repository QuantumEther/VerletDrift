"""Optional Node-VM benchmark input preparation. Requires NumPy/SciPy, not browser dependencies."""
from pathlib import Path
import json
import sys
import numpy as np
from scipy.io import wavfile
root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/schweinemotorwerke-audio-bench')
out.mkdir(parents=True, exist_ok=True)
rows = []
for name in ['REC194'] + [f'{r}RPM_Constant' + ('_2' if r == 2000 else '') for r in [2000, 3000, 4000, 5000, 6000, 7000]]:
    rate, samples = wavfile.read(root / (name + '.wav'))
    if np.issubdtype(samples.dtype, np.integer):
        samples = samples.astype(np.float32) / (np.iinfo(samples.dtype).max + 1)
    else:
        samples = samples.astype(np.float32)
    if samples.ndim == 1:
        samples = samples[:, None]
    target = out / (name + '.pcm')
    samples.astype('<f4').tofile(target)
    rows.append({'file': name + '.wav', 'path': str(target.resolve()), 'rate': rate, 'channels': samples.shape[1]})
(out / 'recordings.json').write_text(json.dumps(rows))
print(out / 'recordings.json')
