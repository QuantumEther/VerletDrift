"""Build the portable, offline presentation benchmark with local ES modules."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
with ZipFile(root / 'independent-benchmark.zip', 'w', ZIP_DEFLATED) as archive:
    for name in ['index.html', 'application.js', 'benchmark.js', 'output-check.js']:
        archive.write(root / name, name)
    dependencies = (root / 'dependencies.js').read_text()
    archive.writestr('dependencies.js', dependencies.replace('../vendor/three-r180/', './vendor-r180/')
                     .replace('laboratoryAvailable = true', 'laboratoryAvailable = false'))
    for revision, source in [(180, root.parent / 'vendor/three-r180'), (187, root / 'vendor-r187')]:
        for name in ['LICENSE', 'three.core.js', 'three.webgpu.js',
                     'three.module.js' if revision == 180 else 'three.tsl.js']:
            archive.write(source / name, f'vendor-r{revision}/{name}')
    archive.writestr('README.txt', 'Extract all files into one directory. In that directory run python -m http.server 8792 --bind 127.0.0.1 and open http://127.0.0.1:8792/ in Chrome. Click Run Benchmark, then Export JSON. The application comparisons require the full checkout.')
