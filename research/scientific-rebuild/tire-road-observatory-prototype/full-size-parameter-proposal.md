# Conditional full-size research parameter proposal — not an applied preset

**No values in this document are applied to the running 104 kg fixture. No manufacturer values are invented.** This is a source-grounded generic full-size benchmark proposal, not a calibrated historical car.

The accessible reference is Zhang, Takács & Orosz (2025), DOI [10.1080/00423114.2025.2522391](https://doi.org/10.1080/00423114.2025.2522391), Table 1 and Eq.(8), as transcribed and audited in [primary-source-equation-audit.md](../../../docs/scientific-rebuild/primary-source-equation-audit.md) and [parameters.mjs](../reference-model/parameters.mjs). These repository artifacts were inspected; the paper was not newly downloaded or its five-state model rerun in Mission 40. The known limitations of that reference's tire approximation do not disappear by borrowing its dimensional parameters. No tire-law borrowing is proposed.

|Parameter|Proposal / provenance|Status|
|---|---|---|
|Sprung body mass|1200 kg, published mv|Published benchmark, not manufacturer measurement|
|Front/rear lumped axle masses|100 kg each, published mw|Definition must be reconciled with carriers/housings before four-corner implementation|
|Total translating mass|1400 kg = mv+2mw|Derived|
|Wheelbase / body-G axle coordinates|2.5 m; front +1 m, rear -1.5 m|Published q,d,l|
|Total-system COM x relative to body G|-50/1400 = -.0357143 m|Derived from the published first moment|
|Axle arms about total COM|front +1.0357143 m, rear -1.4642857 m|Derived, not a second independently chosen geometry|
|Static front/rear support|8044.2 / 5689.8 N at assumed g=9.81; 58.5714 / 41.4286%|Derived; g is the declared terrestrial assumption|
|Nominal radius|.3 m, published r|Effective radius; loaded/rolling radii need the chosen constitutive model's port definitions|
|Body yaw inertia|2500 kg m², published JG|About body G; do not confuse it with the full system inertia|
|Three-body yaw inertia about total COM|2828.754286 kg m² = 2830.54 - 50²/1400|Derived from Eq.(8), no finite track in that three-body layout|
|Axle spin inertia|4.5 kg m² each, published D|A conditional equal split would be 2.25 kg m² per physical wheel, not newly measured tire inertia|
|Axle intrinsic yaw inertia|2.77 kg m² each, published C|A conditional symmetric split requires explicit mass/inertia bookkeeping|
|CG height|Source assumes wheel-center height .3 m in its planar model|A declared source restriction, **not** a credible measured height for a named full-size touring car|
|Track, physical wheel/carrier masses, roll/pitch tensor, steering/roll centers|No source values recovered for this four-corner target|**UNRESOLVED: obtain measurements or a documented vehicle dataset**|
|Spring/damper/motion ratios, anti-roll stiffness, actual pneumatic-tire coefficients|Not specified by this planar parameter set|**UNRESOLVED**; do not scale current springs or grip arbitrarily|

The fifty-kilogram-per-corner translation split is only a symmetry assumption for the lumped 100 kg axle groups. It must not be added on top of those axle masses. Likewise the 2.25 kg m² wheel spin split cannot be combined with another duplicated axle rotor. If finite track t and four corners replace virtual axle centers while the published body inertia and split intrinsic wheel inertia are retained, additional transverse parallel-axis inertia is **50*t² kg m²**. The resulting four-corner total yaw inertia would be `2828.754286+50*t²`, not the published three-body number. Do not subtract that term from the body merely to manufacture agreement.

For analytical mechanical-code checks only, the source's assumed .3 m CG height and 2.5 m wheelbase predict a spin-negligible front-load increment of 824.04 N at -.5g. This is a *benchmark under a stated assumption*, not predicted brake dive of a real car. The finite-rotor/vector-momentum and suspension benchmarks in `vehicle-realism-audit.md` must follow.

A real full-size proposal remains blocked on a named target's verified track, loaded CG height, corner weights, mass/inertia tensor, physical wheel/carrier inertias, motion ratios and tire dataset. Until those data exist, retain the present research fixture and this published-dimensional benchmark separately. Neither the 1930s appearance nor the existence of an executable tire model supplies missing manufacturer data.
