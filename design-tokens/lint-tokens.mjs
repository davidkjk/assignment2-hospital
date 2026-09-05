import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC = /\b(rgb|rgba|hsl|hsla)\s*\(/;
const NEW_TOKEN = /--color-(?!primary|ink|ink-muted|warn|danger|danger-bg|done|done-bg|gray-past|bg|surface|divider|sidebar-ink|doctor-palette-\d(-fill)?)/;
const EMOJI = /\p{Extended_Pictographic}/u;
const GENERATED = ['frontend/src/styles/tokens.css', 'design-tokens/tokens.json'];
const SOURCE_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.vue', '.html']);

function normalizedPath(filename) {
  return filename.replaceAll('\\', '/');
}

function isGenerated(filename) {
  const normalized = normalizedPath(filename);
  return GENERATED.some((generated) => normalized === generated || normalized.endsWith(`/${generated}`));
}

function lintSource(filename, source) {
  if (isGenerated(filename)) return [];

  const violations = [];
  const rules = [
    ['HEX', HEX],
    ['FUNC', FUNC],
    ['NEW_TOKEN', NEW_TOKEN],
    ['EMOJI', EMOJI],
  ];

  source.split(/\r?\n/).forEach((line, index) => {
    const matched = rules.filter(([, rule]) => rule.test(line)).map(([name]) => name);
    if (matched.length > 0) {
      violations.push({
        filename,
        line: index + 1,
        rules: matched,
        source: line,
      });
    }
  });

  return violations;
}

function filesUnder(target) {
  const absoluteTarget = resolve(target);
  const stats = statSync(absoluteTarget);
  if (stats.isFile()) return [absoluteTarget];

  const files = [];
  for (const entry of readdirSync(absoluteTarget, { withFileTypes: true })) {
    const path = join(absoluteTarget, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else if (SOURCE_EXTENSIONS.has(path.slice(path.lastIndexOf('.')))) files.push(path);
  }
  return files;
}

function runCli(targets) {
  const root = process.cwd();
  const violations = targets.flatMap((target) => filesUnder(target).flatMap((filename) => (
    lintSource(relative(root, filename), readFileSync(filename, 'utf8'))
  )));

  for (const violation of violations) {
    console.error(`${violation.filename}:${violation.line} [${violation.rules.join(', ')}] ${violation.source}`);
  }
  return violations.length === 0 ? 0 : 1;
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const targets = process.argv.slice(2);
  process.exitCode = runCli(targets.length > 0 ? targets : ['frontend/src']);
}

export { lintSource };
