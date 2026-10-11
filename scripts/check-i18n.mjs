import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const langs = ['de', 'en', 'es', 'fr', 'it', 'nl', 'lv'];
const dictionaries = new Map();
const errors = [];

// Jede Sprache steht in src/lib/locales/<sprache>.ts als `const dict = { … }`.
for (const lang of langs) {
  const source = fs.readFileSync(path.join(root, `src/lib/locales/${lang}.ts`), 'utf8');
  const file = ts.createSourceFile(`${lang}.ts`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const values = new Map();
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'dict' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = prop.name.getText(file).replace(/^['"]|['"]$/g, '');
        const value = ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer) ? prop.initializer.text : '';
        if (values.has(key)) errors.push(`Duplicate: ${lang}.${key}`);
        values.set(key, value);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
  dictionaries.set(lang, values);
}

const reference = dictionaries.get('de') ?? new Map();
const placeholders = (value) => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((match) => match[1]).sort().join(',');
for (const lang of langs) {
  const values = dictionaries.get(lang);
  if (!values) { errors.push(`Missing language: ${lang}`); continue; }
  for (const key of reference.keys()) {
    if (!values.has(key)) errors.push(`Missing: ${lang}.${key}`);
    else if (!values.get(key).trim()) errors.push(`Empty: ${lang}.${key}`);
    else if (placeholders(values.get(key)) !== placeholders(reference.get(key))) {
      errors.push(`Placeholder mismatch: ${lang}.${key}`);
    }
  }
  for (const key of values.keys()) {
    if (!reference.has(key)) errors.push(`Extra: ${lang}.${key}`);
  }
  console.log(`${lang}: ${values.size} keys`);
}

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'staff') scan(absolute);
      continue;
    }
    if (!/\.[jt]sx?$/.test(entry.name) || entry.name === 'DemoShop.tsx') continue;
    const contents = fs.readFileSync(absolute, 'utf8');
    for (const match of contents.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) {
      if (!reference.has(match[1])) errors.push(`Unknown key: ${path.relative(root, absolute)}: ${match[1]}`);
    }
  }
}
scan(path.join(root, 'src'));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('All translation keys and static t() calls are valid.');
}
