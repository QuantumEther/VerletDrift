set -eu
AUDIT_REF=recovery/realtime node research/playable-baseline/interactive.mjs --out=research/playable-baseline/data/before-serial
AUDIT_REF=recovery/playable-baseline node research/playable-baseline/interactive.mjs --out=research/playable-baseline/data/after
AUDIT_WIDTH=1920 AUDIT_HEIGHT=1080 AUDIT_DPR=2 AUDIT_REF=recovery/realtime node research/playable-baseline/interactive.mjs --out=research/playable-baseline/data/before-highdpi
AUDIT_WIDTH=1920 AUDIT_HEIGHT=1080 AUDIT_DPR=2 AUDIT_REF=recovery/playable-baseline node research/playable-baseline/interactive.mjs --out=research/playable-baseline/data/after-highdpi
WORKLOAD=countersteer INPUT_EVENTS=400 AUDIT_REF=recovery/realtime node research/playable-baseline/interactive.mjs --no-trace --out=research/playable-baseline/data/before-long
WORKLOAD=countersteer INPUT_EVENTS=400 AUDIT_REF=recovery/playable-baseline node research/playable-baseline/interactive.mjs --no-trace --out=research/playable-baseline/data/after-long
