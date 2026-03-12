.PHONY: pdf clean view

# Default target
all: pdf

# Build PDF using pdflatex
pdf:
	@echo "Compiling LaTeX document..."
	pdflatex -interaction=nonstopmode verlet-drift-equations.tex
	@echo "Processing bibliography..."
	bibtex verlet-drift-equations
	@echo "Recompiling for references (pass 1)..."
	pdflatex -interaction=nonstopmode verlet-drift-equations.tex
	@echo "Recompiling for references (pass 2)..."
	pdflatex -interaction=nonstopmode verlet-drift-equations.tex
	@echo "PDF generated: verlet-drift-equations.pdf"

# Clean intermediate files
clean:
	rm -f *.aux *.bbl *.blg *.log *.out *.toc *.lof *.lot
	@echo "Cleaned intermediate files"

# Clean everything including PDF
distclean: clean
	rm -f verlet-drift-equations.pdf
	@echo "Cleaned all generated files"

# Open PDF in viewer (requires appropriate viewer installed)
view: pdf
	@command -v start >/dev/null && start verlet-drift-equations.pdf || \
	command -v open >/dev/null && open verlet-drift-equations.pdf || \
	command -v xdg-open >/dev/null && xdg-open verlet-drift-equations.pdf || \
	echo "Unable to open PDF. Please open verlet-drift-equations.pdf manually."
