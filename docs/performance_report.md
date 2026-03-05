# Performance Report: `VerletDrift_Performance.json.gz`

## Main-thread timing summary

The table below reports main-thread (`CrRendererMain`) timing derived from complete (`ph: "X"`) trace events.

| Category | Event filter used | Count | Total time (ms) | Avg/event (ms) | Share of main-thread sampled time |
|---|---|---:|---:|---:|---:|
| RunTask | `name == "RunTask"` | 26,802 | 46,151.588 | 1.722 | 18.153% |
| mainLoop | `name == "FunctionCall"` and `args.data.functionName == "mainLoop"` | 2,668 | 37,762.288 | 14.154 | 14.853% |
| Paint | `name == "Paint"` | 5,335 | 2,103.876 | 0.394 | 0.828% |
| Layout | `name == "Layout"` | 2,671 | 959.396 | 0.359 | 0.377% |
| GC | `name in {"MinorGC", "MajorGC"}` | 206 | 917.208 | 4.452 | 0.361% |

Reference total for sampled main-thread complete-event time: **254,241.265 ms**.

## Optimization priority

**Primary optimization priority should be JavaScript compute inside `mainLoop` (physics/update work), not DOM/layout.**

Reason: `mainLoop` and scheduler work (`RunTask`) dominate trace time, while rendering pipeline slices (`Paint` + `Layout`) and GC are comparatively small in this capture.

## Method and extraction commands

I extracted and summarized the trace with Python from the gzipped Chrome trace file.

```bash
python - <<'PY'
import gzip,json
PID,TID=71792,71796
with gzip.open('VerletDrift_Performance.json.gz','rt',encoding='utf-8') as f:data=json.load(f)
main=[e for e in data['traceEvents'] if e.get('pid')==PID and e.get('tid')==TID and e.get('ph')=='X']
main_total=sum(e.get('dur',0) for e in main)

metrics={
  'RunTask':[e.get('dur',0) for e in main if e.get('name')=='RunTask'],
  'mainLoop':[e.get('dur',0) for e in main if e.get('name')=='FunctionCall' and e.get('args',{}).get('data',{}).get('functionName')=='mainLoop'],
  'Paint':[e.get('dur',0) for e in main if e.get('name')=='Paint'],
  'Layout':[e.get('dur',0) for e in main if e.get('name')=='Layout'],
  'GC':[e.get('dur',0) for e in main if e.get('name') in ('MinorGC','MajorGC')],
}

print('main_total_ms', main_total/1000)
for k,v in metrics.items():
    total=sum(v)
    print(k, len(v), total/1000, (total/main_total*100 if main_total else 0), (total/len(v)/1000 if v else 0))
PY
```

Thread identification (`CrRendererMain`) was obtained with:

```bash
python - <<'PY'
import gzip,json
with gzip.open('VerletDrift_Performance.json.gz','rt',encoding='utf-8') as f:data=json.load(f)
for e in data['traceEvents']:
    if e.get('ph')=='M' and e.get('name')=='thread_name':
        name=e.get('args',{}).get('name')
        if 'Main' in str(name):
            print(e.get('pid'), e.get('tid'), name)
PY
```

### Caveats

- Chrome tracing and profiling instrumentation adds overhead; absolute durations are not zero-overhead measurements.
- Sampling/profiling granularity can shift attribution slightly (especially nested JS call stacks).
- This is a single capture; optimization priorities should be validated against additional representative runs/scenarios.
