# VerletDrift Mathematical Equations Reference

## Overview

This directory contains a comprehensive LaTeX documentation of all 43+ mathematical equations underlying the VerletDrift physics simulator, organized by functional category with academic citations and code references.

## Files

### Main Document
- **`verlet-drift-equations.tex`** — Master document (preamble, structure, includes all sections)
- **`verlet-drift-equations.pdf`** — Compiled PDF (generated via `make pdf`)

### Content Sections
- **`0-introduction.tex`** — Unit system, notation conventions, scope
- **`1-verlet-integration.tex`** — Verlet integration, kinematics (5 equations)
- **`2-weight-transfer.tex`** — Weight transfer and load distribution (4 equations)
- **`3-engine-drivetrain.tex`** — Engine torque, clutch, drive force (7 equations)
- **`4-tire-pacejka.tex`** — Pacejka magic formula, slip angles (5 equations)
- **`5-tire-relaxation-grip.tex`** — Tire relaxation, grip saturation (4 equations)
- **`6-steering-sat.tex`** — Self-aligning torque, steering dynamics (6 equations)
- **`7-drag-resistance.tex`** — Drag forces and resistance (3 equations)
- **`8-camera-rendering.tex`** — Camera systems, gauge animation (6 equations)
- **`9-scoring-dynamics.tex`** — Scoring, particles, effects (3 equations)

### Supporting Files
- **`a-appendix-constants.tex`** — Tunable parameters table (~40+ parameters)
- **`diagrams.tex`** — 8 comprehensive TikZ diagrams (car geometry, slip angle, weight transfer, etc.)
- **`bibliography.bib`** — Academic references (IEEE format, 8 sources)
- **`Makefile`** — Automated PDF compilation

## Compilation

### Prerequisites
- **pdflatex** (MiKTeX on Windows, TeX Live on macOS/Linux)
- **bibtex** (included with MiKTeX/TeX Live)

### Build PDF
```bash
cd /c/Users/Quantum/Documents/GitHub/VerletDrift/docs/equations
make pdf
```

Or manually:
```bash
pdflatex -interaction=nonstopmode verlet-drift-equations.tex
bibtex verlet-drift-equations
pdflatex -interaction=nonstopmode verlet-drift-equations.tex
pdflatex -interaction=nonstopmode verlet-drift-equations.tex
```

### Clean Intermediate Files
```bash
make clean
```

## Document Features

### Mathematics
- **43 equations** covering all physics, rendering, and dynamics
- **IEEE citations** for standard models (Verlet, Pacejka, weight transfer, etc.)
- **Implementation notes** for custom approximations
- **Code references** mapping each equation to source file and line number
- **JavaScript code snippets** showing actual implementations

### Structure
- **Unit system**: All equations use SI units (meters, kg, Newtons, rad/s, etc.)
- **Notation**: Consistent vector/scalar notation, time derivatives, subscripts
- **Organization**: 9 sections + appendix, organized by functional category
- **Cross-references**: Hyperlinks between equations, sections, bibliography

### Diagrams (8 total)
1. Car body geometry (4-particle Verlet, rigid constraints)
2. Tire slip angle geometry
3. Weight transfer (longitudinal & lateral)
4. Friction ellipse (traction circle)
5. Self-aligning torque (SAT) mechanism
6. Verlet integration concept
7. Spring-damper system (camera & steering)
8. Drivetrain torque path (gear ratios)

### Parameters
- **~40+ tunable constants** from `constants.js`
- Organized by category: geometry, engine, tires, steering, gauges, etc.
- Includes SI units, default values, and physical interpretations

## Citation

If citing VerletDrift methodology in academic work, reference this document:

```
VerletDrift: Mathematical Equations Reference.
Comprehensive Documentation of Physics, Rendering, and Dynamics.
Generated from source code: https://github.com/your-org/VerletDrift
```

## Bibliography

Key academic sources (IEEE format):
1. **Jakobsen, T.** — Advanced Character Physics (GDC 2001)
2. **Pacejka, H. B.** — Tire and Vehicle Dynamics (2005)
3. **Milliken & Milliken** — Race Car Vehicle Dynamics (1995)
4. **Goldstein, H.** — Classical Mechanics (2002)
5. **Ogata, K.** — Modern Control Engineering (2009)
6. **Verlet, L.** — Computer Experiments on Classical Fluids (1967)
7. **Nocedal & Wright** — Numerical Optimization (2006)
8. **Filippelli, D.** — Exponential Moving Average Filters (2000)

## Implementation Details

### Equation Categories
- **Core Physics** (5): Verlet integration, velocity, acceleration, jerk
- **Vehicle Dynamics** (4): Weight transfer per wheel
- **Engine/Drivetrain** (7): Torque curve, clutch, drive force, idle creep
- **Tire Model** (5): Pacejka formula, slip angles, low-speed fade
- **Tire Physics** (4): Relaxation, grip saturation, friction ellipse
- **Steering** (6): Pneumatic trail, SAT, semi-implicit integration
- **Drag** (3): Rolling resistance, aerodynamic drag
- **Rendering** (6): Camera spring-damper, zoom, gauge needle animation
- **Scoring** (3): Drift intensity, splat factor, balloon scoring

### Code References
Every equation includes:
- Source file (e.g., `physics.js:268`)
- Line range where implemented
- Snippet of actual JavaScript code
- Parameters and constants used

### Verification
All equations have been:
- ✅ Extracted from source code
- ✅ Verified for dimensional consistency
- ✅ Checked against physical principles
- ✅ Cross-referenced with academic literature

## Customization

### Adding Diagrams to Sections
Diagrams in `diagrams.tex` can be moved to appropriate sections:
- Fig 1 (Car geometry) → Section 1 (Verlet Integration)
- Fig 2 (Slip angle) → Section 4 (Tire Pacejka)
- Fig 3 (Weight transfer) → Section 2 (Weight Transfer)
- etc.

### Modifying Equations
To update an equation:
1. Edit the appropriate `.tex` file (e.g., `3-engine-drivetrain.tex`)
2. Verify against source code in `/js/`
3. Recompile: `make pdf`
4. Commit changes to git

## Troubleshooting

### `pdflatex` command not found
Install MiKTeX (Windows) or TeX Live (macOS/Linux):
- **Windows**: `choco install miktex` (if Chocolatey available) or download from miktex.org
- **macOS**: `brew install basictex` or download from miktex.org
- **Linux**: `sudo apt install texlive-full` (Debian/Ubuntu)

### Undefined references in PDF
Run `make pdf` (or pdflatex twice) to resolve cross-references and bibliography.

### TikZ diagrams not rendering
Ensure `tikz` package is installed (included with modern TeX distributions).

## Future Enhancements

Possible additions:
- More detailed derivations of custom implementations
- Animation sequences (velocity field, force diagrams)
- Parameter sensitivity analysis charts
- Real-time equation visualization
- Interactive parameter adjustment notebook

## License

This documentation is part of the VerletDrift project.
All equations are extracted from open-source code.

## Contact

For questions about the mathematics or documentation:
- Review source code: `/js/physics.js` (primary reference)
- See inline comments in source for implementation notes
- Check parameter documentation in `/js/constants.js`

---

**Generated**: March 2026
**Total equations documented**: 43
**Total diagrams**: 8
**Parameters listed**: 40+
**Academic references**: 8 (IEEE format)
