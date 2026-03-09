import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

function unique(values) {
  return [...new Set(values)];
}

async function collectJsFiles(dir) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function checkModuleImports() {
  const jsDir = path.join(repoRoot, 'js');
  const jsFiles = await collectJsFiles(jsDir);
  const errors = [];

  for (const filePath of jsFiles) {
    const content = await readFile(filePath, 'utf8');
    const importSpecifiers = [
      ...content.matchAll(/import\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+)['"]/g),
      ...content.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]);

    for (const specifier of importSpecifiers) {
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        continue;
      }

      const normalizedSpecifier = specifier.split('?')[0].split('#')[0];
      const resolved = path.resolve(path.dirname(filePath), normalizedSpecifier);
      const candidates = [resolved, `${resolved}.js`, `${resolved}.mjs`, `${resolved}.json`];
      const found = await Promise.any(
        candidates.map(async (candidate) => {
          await access(candidate);
          return candidate;
        })
      ).catch(() => null);

      if (!found) {
        errors.push(
          `Missing import target from ${path.relative(repoRoot, filePath)}: '${specifier}'`
        );
      }
    }
  }

  return errors;
}

async function checkUiIds() {
  const uiPath = path.join(repoRoot, 'js', 'ui.js');
  const indexPath = path.join(repoRoot, 'index.html');

  const [uiSource, indexSource] = await Promise.all([
    readFile(uiPath, 'utf8'),
    readFile(indexPath, 'utf8'),
  ]);

  const idMatches = [...uiSource.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
    (match) => match[1]
  );
  const requiredIds = unique(idMatches);

  const missing = requiredIds.filter(
    (id) => !new RegExp(`id=["']${id}["']`, 'm').test(indexSource)
  );

  return missing;
}

async function main() {
  const importErrors = await checkModuleImports();
  const missingIds = await checkUiIds();

  if (importErrors.length > 0 || missingIds.length > 0) {
    for (const error of importErrors) {
      console.error(`✗ ${error}`);
    }

    for (const id of missingIds) {
      console.error(`✗ Missing DOM id in index.html: '${id}'`);
    }

    process.exit(1);
  }

  console.log('✓ Smoke checks passed (imports + UI IDs).');
}

main().catch((error) => {
  console.error('Smoke check failed with an unexpected error:', error);
  process.exit(1);
});
