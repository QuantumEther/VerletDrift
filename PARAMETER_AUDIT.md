# Parameter Audit - Check Your Current Slider Values

Your debug output shows `engineRpmFromWheel=68516` which is way beyond redline (9000).
This suggests one or more sliders have been set to non-standard values.

## Formula Verification

If: `engineRpmFromWheel = wheelRpm × gearRatio × finalDrive`

With your values:
- `rearAvgOmega = 500 rad/s` (extremely high!)
- `wheelRpmValue = 500 × (60/TAU) = 4774.5 RPM`
- `engineRpmFromWheel = 68516 RPM` (reported)

Then: `gearRatio × finalDrive = 68516 / 4774.5 = 14.35`

**Expected defaults:**
- gearRatio (1st) = 3.5
- finalDrive = 4.1
- Product = 3.5 × 4.1 = 14.35 ✓

So the math is correct, but **rearAvgOmega = 500 rad/s is the real problem!**

This suggests a slider affecting wheel physics is way off, like:
- **wheelInertia** set too low (< 0.1) → wheels spin up instantly
- **wheelRadius** set way too high → omega needs to be extreme to achieve same surface speed
- Some other physics parameter causing unrealistic acceleration

## Critical Parameters to Check

Open the game and check these sliders (watch the value shown next to each):

### Engine Parameters
- [ ] idleRpm: **should be 800**
- [ ] redlineRpm: **should be 9000** (note: tachometer shows 6500)
- [ ] stallRpm: **should be 600**
- [ ] peakEngineTorqueNm: **should be ~350-400**

### Drivetrain Parameters
- [ ] finalDriveRatio: **should be 4.1**
- [ ] gearRatio1: **should be 3.5** (1st gear)
- [ ] gearRatio2: **should be 2.1**
- [ ] gearRatio3: **should be 1.4**
- [ ] gearRatio4: **should be 1.0**
- [ ] gearRatio5: **should be 0.75**
- [ ] gearRatio6: **should be 0.58**

### Wheel Physics Parameters
- [ ] wheelRadius: **should be 0.35** (metres)
- [ ] wheelInertia: **should be 1.2** (kg·m²) — THIS IS CRITICAL!
  - If < 0.1: wheels spin up instantly (explains 500 rad/s!)
  - If > 10: wheels barely accelerate
- [ ] brakeForce: **should be 8000-10000 N**

### Tire Parameters
- [ ] tireFrictionCoeff: **should be 1.2-1.3**
- [ ] peakSlipRatio: **should be 0.12**
- [ ] peakSlipAngleDeg: **should be 18**

### Vehicle Parameters
- [ ] carMassKg: **should be 1200-1500**
- [ ] cogHeight: **should be 0.5-0.7**
- [ ] rollingResistanceCoeff: **should be 0.015**
- [ ] aeroDragCoeff: **should be 1.0-1.2**

## How to Check All Values

1. Open browser console (F12)
2. Type: `console.log(JSON.stringify(state.params, null, 2))`
3. This will dump ALL parameters with current values
4. **Share this output** so I can see what's been changed

## Most Likely Culprits for rearAvgOmega=500

If wheelInertia is the issue:
```javascript
const omegaDelta = (netWheelTorque / wheelInertia) * dt;
// If wheelInertia = 0.01 instead of 1.2:
// omegaDelta = torque / 0.01 = 100× higher!
```

### Quick Test
1. Find the **wheelInertia** slider
2. Check its value (should be 1.2)
3. If it's something like 0.001, 0.01, or 100+, **that's the problem**
4. Reset it to 1.2

## Diagnostic Output Format

If you can, run this in the console and paste the output:
```javascript
const critical = {
  wheelInertia: state.params.wheelInertia,
  wheelRadius: state.params.wheelRadius,
  finalDriveRatio: state.params.finalDriveRatio,
  gearRatio1: state.params.gearRatio1,
  carMassKg: state.params.carMassKg,
  peakEngineTorqueNm: state.params.peakEngineTorqueNm,
  idleRpm: state.params.idleRpm,
  redlineRpm: state.params.redlineRpm,
};
console.log(critical);
```

This will show the core parameters in a clean format.
