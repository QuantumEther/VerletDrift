# VerletDrift Equations Documentation - v2

## Overview

This is **v2 of the VerletDrift mathematical equations documentation**, a comprehensive reanalyzed and extended reference for all mathematical functions, formulas, and algorithms used in the VerletDrift physics simulation engine.

### What's New in v2

This v2 release includes:

1. **Complete Mathematical Verification**: All 43 existing equations have been re-verified against source code implementations to ensure notational accuracy and physical validity.

2. **Extended Coverage** (9+ new equations):
   - Hysteretic grip state machine (3-state automaton)
   - Per-wheel grip smoothing with state-dependent EMA filtering
   - Brake torque integration and force directions
   - Idle creep logic for low-speed vehicle movement
   - Anti-tunnelling displacement clamping
   - Enhanced low-speed lateral fade effects
   - Detailed wheel torque integration
   - And more...

3. **Improved Documentation**: Each equation now includes:
   - Precise notation matching actual code implementation
   - Physical interpretation and real-world significance
   - Numerical stability techniques
   - Complete parameter definitions with units
   - Academic citations where available
   - Source code references with line numbers

4. **Visual Clarification**: TikZ diagrams for complex concepts

## File Structure

```
equations_v2/
├── verlet-drift-equations.tex      Master LaTeX document
├── 0-introduction.tex               Introduction and notation (REWRITTEN v2)
├── 1-verlet-integration.tex         Verlet integration (REWRITTEN v2)
├── 2-weight-transfer.tex            Weight transfer calculation (Verified v2)
├── 3-engine-drivetrain.tex          Engine & drivetrain (Original - verified)
├── 4-tire-pacejka.tex               Pacejka tire model (Original - verified)
├── 5-tire-relaxation-grip.tex       Tire relaxation (Original - verified)
├── 6-steering-sat.tex               Steering & SAT (Original - verified)
├── 7-drag-resistance.tex            Drag forces (Original - verified)
├── 8-camera-rendering.tex           Camera system (Original - verified)
├── 9-scoring-dynamics.tex           Game scoring (Original - verified)
├── 10-undocumented-functions.tex    NEW - Previously undocumented equations (NEW v2)
├── a-appendix-constants.tex         Parameter reference (Original - verified)
├── diagrams.tex                     TikZ illustrations (Original + Extended v2)
├── bibliography.bib                 IEEE-format citations (Extended v2)
├── Makefile                         Build automation
├── README.md                        This file
└── verlet-drift-equations.pdf       Output (after compilation)
```

## Building the PDF

### Prerequisites
- **pdflatex**: LaTeX compiler
- **bibtex**: Bibliography tool
- **GNU Make** or equivalent (for Makefile)

### Build Steps

On Windows (PowerShell):
```powershell
cd C:\Users\Quantum\Documents\GitHub\VerletDrift\docs\equations_v2
make pdf
```

On macOS/Linux:
```bash
cd ~/GitHub/VerletDrift/docs/equations_v2
make pdf
```

Or manually:
```bash
pdflatex -interaction=nonstopmode verlet-drift-equations.tex
bibtex verlet-drift-equations
pdflatex -interaction=nonstopmode verlet-drift-equations.tex
pdflatex -interaction=nonstopmode verlet-drift-equations.tex
```

The PDF will be generated as `verlet-drift-equations.pdf`.

### Makefile Targets

- `make pdf` - Build the PDF document
- `make view` - Build PDF and open in viewer (Windows)
- `make clean` - Remove temporary LaTeX files (*.aux, *.log, etc.)
- `make distclean` - Remove all generated files including PDF
- `make help` - Show help message

## Key Sections

### 0. Introduction (REWRITTEN v2)
- Purpose and scope
- Version history and improvements
- Unit system (SI units)
- Notation conventions
- Car coordinate system
- How to use the document

### 1. Verlet Integration & Core Kinematics (REWRITTEN v2)
- Verlet position integration formula
- Implicit velocity extraction
- Angular velocity and heading computation
- Linear acceleration and jerk (3rd derivative)
- Coordinate transformations

### 2. Weight Transfer & Load Distribution
- Total vehicle weight
- Longitudinal weight transfer (acceleration/braking)
- Lateral weight transfer (cornering)
- Per-wheel normal loads
- Relationship to tire grip

### 3-9. Physics Systems (Verified from Original)
- **3**: Engine & drivetrain (torque curves, clutch, gearing)
- **4**: Pacejka tire model (magic formula, slip angles, slip ratios)
- **5**: Tire relaxation and grip transitions
- **6**: Steering and self-aligning torque (SAT)
- **7**: Drag and air resistance
- **8**: Camera rendering (spring-damper system)
- **9**: Scoring and game dynamics

### 10. Previously Undocumented Functions (NEW v2)

This new section documents advanced implementations not covered in the original documentation:

1. **Hysteretic Grip State Machine**
   - Three-state automaton (stable → slipping → recovering)
   - Friction-based state transitions with hysteresis
   - Prevents oscillation at state boundaries

2. **Per-Wheel Grip Smoothing**
   - State-dependent EMA filtering
   - Different smoothing rates for stable vs. slipping states
   - Reduces constraint solver noise

3. **Brake Torque Integration**
   - Brake force to wheel torque conversion
   - Front/rear brake distribution (80/20 split)
   - Direction based on wheel rotation direction

4. **Idle Creep Logic**
   - Low-speed forward motion without throttle
   - Conditions for activation
   - Clutch-dependent force application

5. **Anti-Tunnelling Displacement Clamping**
   - Prevents wheel particles from moving too far in one step
   - Avoids collision tunnelling at high speeds
   - Preserves acceleration for next step

6. **Low-Speed Lateral Fade**
   - Lateral force attenuation at speeds < 2 m/s
   - Prevents twitching from constraint solver noise
   - Smooth fade function

7. **Wheel Torque Integration**
   - Angular acceleration from net torques
   - Drive torque (rear wheels), brake torque, traction reaction
   - Wheel angular velocity clamping

### A. Appendix - Constants & Parameters

Reference table of all simulation constants including:
- Vehicle dimensions and mass properties
- Tire model parameters
- Engine characteristics
- Control system tuning values
- Default settings for all configurable parameters

## Mathematical Notation

### Key Symbols

| Symbol | Meaning | Units |
|--------|---------|-------|
| $\vv{x}$ | Position vector | meters (m) |
| $\vv{v}$ | Velocity vector | m/s |
| $\vv{a}$ | Acceleration vector | m/s² |
| $\omega$ | Angular velocity | rad/s |
| $\tau$ | Torque | N·m |
| $F$ | Force | Newtons (N) |
| $N$ | Normal load (tire contact force) | N |
| $\mu$ | Friction coefficient | dimensionless |
| $\Delta t$ or $dt$ | Physics timestep | seconds |
| $\theta$ | Heading angle / slip angle | radians |
| $\alpha$ | EMA filter coefficient | dimensionless (0-1) |

### Unit Vectors

```
Forward direction:   û_forward = (sin(θ), -cos(θ))
Right direction:     û_right = (cos(θ), sin(θ))
(where θ is car heading, canvas coords: +X=right, +Y=down)
```

### Verlet Integration Core

```
Explicit velocity:     v = (x_current - x_prev) / dt
Position update:       x_new = x_current + (x_current - x_prev) + a·dt²
Rotational component:  rotDelta = ω × arm_vector (linearized for small angles)
```

## Source Code References

All equations include references to the JavaScript source code. Source files are located in:

```
C:\Users\Quantum\Documents\GitHub\VerletDrift\js\physics\
├── integrator.js       - Verlet integration
├── constraints.js      - Constraint solver (Jakobsen method)
├── kinematics.js       - Kinematic calculations
├── tires.js           - Tire forces and slip calculations
├── steering.js        - Steering and self-aligning torque
├── engine.js          - Drivetrain and clutch
├── weight.js          - Weight transfer calculations
├── camera.js          - Spring-damper camera system
└── index.js           - Module exports
```

Each equation in the documentation includes `\coderef{file.js}{line-range}` indicating the exact location in the source code where that equation is implemented.

## Academic Citations

The documentation uses IEEE bibliography format with citations to:

- **Jakobsen (2001)**: Verlet integration in game physics
- **Pacejka (2005)**: Tire and vehicle dynamics
- **Milliken & Milliken (1995)**: Race car vehicle dynamics and weight transfer
- **Goldstein (2002)**: Classical mechanics and rotational dynamics
- **Nocedal & Wright (2006)**: Numerical optimization and constraint solving
- **Ogata (2009)**: Control theory and spring-damper systems
- **Verlet (1967)**: Original Verlet integration paper
- **Filippelli (2000)**: Exponential moving average filtering

See `bibliography.bib` for complete citations.

## Verification Notes

### What Was Verified in v2

1. **Equation Notation**: All existing equations were checked for notational consistency with the source code.

2. **Mathematical Correctness**: Formulas were verified to correctly represent the code implementation, including:
   - Sign conventions
   - Operator precedence
   - Unit consistency
   - Numerical stability techniques

3. **Code Cross-References**: All `\coderef{...}` line numbers were validated against actual source code.

4. **Parameter Accuracy**: Default values and parameter ranges were verified against actual constants in the codebase.

### Known Approximations and Simplifications

- **Rotational Acceleration**: Applied as a linearized perturbation (exact for small angles at 100 Hz)
- **Verlet Implicit Velocity**: Contains half-step phase lag relative to acceleration
- **Pacejka E=0 Simplification**: Uses simplified formula without all Pacejka parameters
- **Constraint Damping**: Introduces artificial damping to improve numerical stability
- **Low-Speed Effects**: Lateral force fade and slip angle denominator clamp are pragmatic solutions

## Compiling This Documentation

### Quick Start

```bash
cd equations_v2
make pdf
```

### Troubleshooting

**Problem**: `pdflatex: command not found`
- **Solution**: Install MiKTeX (Windows), MacTeX (macOS), or texlive (Linux)

**Problem**: `bibtex: command not found`
- **Solution**: Install included with LaTeX package, or install separately

**Problem**: Missing figure references or undefined citations
- **Solution**: Run the full 4-pass build (pdflatex → bibtex → pdflatex → pdflatex)

**Problem**: Overfull hbox warnings
- **Solution**: Normal for code listings; adjust column width in lstset if needed

## Compatibility

- **LaTeX Distribution**: pdflatex (part of MiKTeX, MacTeX, or texlive)
- **Bibliography**: BibTeX
- **TikZ Diagrams**: Requires tikz package (included in full LaTeX distributions)
- **Output Format**: PDF
- **Operating Systems**: Windows, macOS, Linux

## Future Improvements

Potential v3 enhancements:
- [ ] Additional TikZ diagrams for state machines and force vectors
- [ ] Code snippets showing numerical integration techniques
- [ ] Stability analysis of constraint solver iterations
- [ ] Performance optimization tips
- [ ] Comparison with other physics engines
- [ ] Interactive web version of equations

## Contact & Attribution

This documentation describes the VerletDrift physics simulation engine, designed and implemented as a modern approach to real-time vehicle dynamics for interactive applications.

**Documentation Version**: v2 (Reanalyzed & Extended)
**Creation Date**: March 2026
**Format**: LaTeX + TikZ
**Output**: PDF (generated via pdflatex + bibtex)

## License

This documentation is part of the VerletDrift project. Refer to the project's main LICENSE file for terms of use.
