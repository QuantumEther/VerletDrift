# Quick Slider Checklist

Instead of using the console, just **look at the slider values on the page**.

## Critical Sliders to Check

Scroll through the UI and look for these sliders. **Write down the number next to each one:**

### 🔴 MOST CRITICAL - Wheel Physics

**Find: "Wheel Inertia (kg·m²)"**
- Current value: _________
- **Should be: 1.20**
- If it's 0.01 or smaller → **THIS IS THE PROBLEM!**

**Find: "Wheel Radius (m)"**
- Current value: _________
- **Should be: 0.35**

### 🟠 HIGH PRIORITY - Drivetrain

**Find: "Final Drive Ratio"**
- Current value: _________
- **Should be: 4.1**

**Find: "Gear Ratio 1" or "1st Gear"**
- Current value: _________
- **Should be: 3.5**

### 🟡 MEDIUM PRIORITY - Engine

**Find: "Idle RPM"**
- Current value: _________
- **Should be: 800**

**Find: "Redline RPM"**
- Current value: _________
- **Should be: 9000**

**Find: "Peak Engine Torque (Nm)"**
- Current value: _________
- **Should be: 350-400**

### 🟢 LOW PRIORITY - Vehicle

**Find: "Car Mass (kg)"**
- Current value: _________
- **Should be: 1200-1500**

---

## Once You Have These Values

**Share them with me** in this format:
```
wheelInertia: X.XX
wheelRadius: X.XX
finalDriveRatio: X.X
gearRatio1: X.X
idleRpm: XXXX
redlineRpm: XXXX
peakEngineTorqueNm: XXX
carMassKg: XXXX
```

Then I can tell you:
1. Which ones are wrong
2. How to fix them
3. What the expected behavior should be

---

## If You Can't Find a Slider

Some parameters might not be in the UI. If a slider is missing:
1. Scroll to the top of the control panel
2. Look for section headers like "Tire Parameters", "Engine", "Drivetrain"
3. The sliders are usually in these groups

---

## Quick Visual Diagnostic

If **wheelInertia looks tiny** (like 0.001 or 0.01):
- **That's your problem!**
- The wheels would spin up 100+ times faster
- Reset it to 1.20

If **wheelRadius looks huge** (like 10+):
- The wheels would need extreme omega to move
- Reset it to 0.35
