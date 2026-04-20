# ============================================================================
# Makefile for VerletDrift Equations LaTeX Documentation
# ============================================================================

# PDF output filename
MAIN = verlet-drift-equations
PDF = $(MAIN).pdf

# LaTeX compiler
PDFLATEX = pdflatex
BIBTEX = bibtex

# Compilation flags
PDFLATEX_FLAGS = -interaction=nonstopmode -output-directory=.

# Source files
TEX_SOURCES = \
  $(MAIN).tex \
  0-introduction.tex \
  1-verlet-integration.tex \
  2-weight-transfer.tex \
  3-engine-drivetrain.tex \
  4-tire-pacejka.tex \
  5-tire-relaxation-grip.tex \
  6-steering-sat.tex \
  7-drag-resistance.tex \
  8-camera-rendering.tex \
  9-scoring-dynamics.tex \
  10-undocumented-functions.tex \
  a-appendix-constants.tex \
  diagrams.tex \
  bibliography.bib

# Default target
.PHONY: all clean pdf view

all: pdf

# Build PDF
pdf: $(PDF)

$(PDF): $(TEX_SOURCES)
	@echo "=== Pass 1: Initial LaTeX compilation ==="
	$(PDFLATEX) $(PDFLATEX_FLAGS) $(MAIN).tex
	@echo ""
	@echo "=== Pass 2: BibTeX compilation ==="
	$(BIBTEX) $(MAIN)
	@echo ""
	@echo "=== Pass 3: LaTeX compilation with bibliography ==="
	$(PDFLATEX) $(PDFLATEX_FLAGS) $(MAIN).tex
	@echo ""
	@echo "=== Pass 4: Final LaTeX compilation (resolve cross-references) ==="
	$(PDFLATEX) $(PDFLATEX_FLAGS) $(MAIN).tex
	@echo ""
	@echo "=== PDF generated successfully ==="

# View PDF (requires PDF viewer)
view: $(PDF)
	@echo "Opening PDF viewer..."
	@start $(PDF)

# Clean temporary files
clean:
	@echo "Cleaning temporary LaTeX files..."
	@del /Q *.aux *.bbl *.blg *.log *.out *.toc 2>nul || true
	@echo "Cleaned."

# Clean everything including PDF
distclean: clean
	@echo "Removing PDF..."
	@del /Q $(PDF) 2>nul || true
	@echo "Complete cleanup done."

# Help message
help:
	@echo "VerletDrift Equations Documentation Build System"
	@echo ""
	@echo "Targets:"
	@echo "  make pdf      - Build the PDF document"
	@echo "  make view     - Build PDF and open in viewer"
	@echo "  make clean    - Remove temporary files"
	@echo "  make distclean - Remove all generated files including PDF"
	@echo "  make help     - Show this help message"
	@echo ""
	@echo "Usage: make pdf"
