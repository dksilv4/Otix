import fs from 'fs';
import path from 'path';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

function getFiles(dir, exts) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, exts));
    } else {
      if (exts.some(ext => fullPath.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const targetDirs = [
  path.resolve('frontend/src/features/music'),
  path.resolve('frontend/src/lib/player')
];

let allFiles = [];
for (const dir of targetDirs) {
  allFiles = allFiles.concat(getFiles(dir, ['.tsx', '.ts']));
}

const tsxFiles = allFiles.filter(f => f.endsWith('.tsx'));
const nonTestTsxFiles = tsxFiles.filter(f => !f.includes('__tests__') && !f.endsWith('.test.tsx'));

console.log(`=== Empirical Challenge: Milestone 3 ===`);
console.log(`Target directories:`);
targetDirs.forEach(d => console.log(` - ${path.relative(process.cwd(), d)}`));
console.log(`Total files found: ${allFiles.length} (${tsxFiles.length} .tsx, ${nonTestTsxFiles.length} component .tsx)\n`);

const issues = {
  functionDeclarationsInTsx: [],
  nonArrowComponents: [],
  nonComponentExportsInTsx: [],
  helperFunctionsInComponentFiles: [],
  hardcodedColors: [],
  harshBorders: [],
  arbitraryDots: []
};

// 1. AST Analysis of component files
for (const filePath of nonTestTsxFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(process.cwd(), filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  ts.forEachChild(sourceFile, node => {
    // Check for function declarations
    if (ts.isFunctionDeclaration(node)) {
      issues.functionDeclarationsInTsx.push({
        file: relPath,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        name: node.name ? node.name.text : 'anonymous'
      });
    }

    // Check for export declarations
    const isExported = node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);

    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach(decl => {
        const name = decl.name.getText(sourceFile);
        const initializer = decl.initializer;

        if (isExported) {
          // If exported and doesn't start with capital letter, check if it's a component or something else
          if (!/^[A-Z]/.test(name)) {
            issues.nonComponentExportsInTsx.push({
              file: relPath,
              line: sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1,
              name
            });
          }
        }

        // Check if top-level helper function exists in component file
        if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
          if (!/^[A-Z]/.test(name)) {
            // Lowercase function in a component file
            issues.helperFunctionsInComponentFiles.push({
              file: relPath,
              line: sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1,
              name,
              exported: isExported
            });
          }
        }
      });
    }
  });
}

// 2. Check router.ts and other .ts files for function declarations
const nonTestTsFiles = allFiles.filter(f => f.endsWith('.ts') && !f.includes('__tests__') && !f.endsWith('.test.ts'));
for (const filePath of nonTestTsFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(process.cwd(), filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  ts.forEachChild(sourceFile, node => {
    if (ts.isFunctionDeclaration(node)) {
      // In router.ts or components:
      if (relPath.includes('router.ts')) {
        issues.functionDeclarationsInTsx.push({
          file: relPath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          name: node.name ? node.name.text : 'anonymous'
        });
      }
    }
  });
}

// 3. Regex scan for hardcoded colors in non-test .tsx and .ts files
const hexColorRegex = /#([0-9a-fA-F]{3,8})\b/g;
const rgbColorRegex = /(?:rgb|rgba|hsl|hsla|oklch)\s*\([^)]+\)/g;
// Tailwind palette patterns:
// (text|bg|border|fill|stroke)-(white|black) or (slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+
const tailwindPaletteRegex = /\b(?:text|bg|border|fill|stroke)-(?:white|black|slate-\d+|gray-\d+|zinc-\d+|neutral-\d+|stone-\d+|red-\d+|orange-\d+|amber-\d+|yellow-\d+|lime-\d+|green-\d+|emerald-\d+|teal-\d+|cyan-\d+|sky-\d+|blue-\d+|indigo-\d+|violet-\d+|purple-\d+|fuchsia-\d+|pink-\d+|rose-\d+)\b/g;

// Permitted exceptions or tokens:
// e.g. border-white/[0.04] is a micro-border, but bg-white or text-white is hardcoded color.
// Wait, is border-white/[0.04] matching tailwindPaletteRegex? Notice border-white/[0.04] has -white/!
// Let's check: \b(?:text|bg|border|fill|stroke)-(?:white|black)\b will NOT match border-white/[0.04] because of the trailing slash!
// But let's verify exact matches.

for (const filePath of nonTestTsxFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(process.cwd(), filePath);
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Strip comments
    const codeLine = line.replace(/\/\*.*?\*\/|\/\/.*/, '');

    // Hex matches
    let match;
    while ((match = hexColorRegex.exec(codeLine)) !== null) {
      // Check if it's in a comment or allowed context
      issues.hardcodedColors.push({
        file: relPath,
        line: idx + 1,
        match: match[0],
        snippet: line.trim()
      });
    }

    // RGB matches
    while ((match = rgbColorRegex.exec(codeLine)) !== null) {
      // allow rgba(255, 255, 255, 0.04) or check if used for colors
      // Note: rule says: "Never hardcode colours in UI (no raw hex, rgb()/oklch() literals, Tailwind palette classes like bg-emerald-500 / text-white, or one-off inline colour styles) unless the user explicitly asks for an exception."
      issues.hardcodedColors.push({
        file: relPath,
        line: idx + 1,
        match: match[0],
        snippet: line.trim()
      });
    }

    // Tailwind palette matches
    while ((match = tailwindPaletteRegex.exec(codeLine)) !== null) {
      // Check if it's followed by a slash like border-white/[0.04]
      const afterMatch = codeLine.slice(match.index + match[0].length);
      if (afterMatch.startsWith('/')) {
        // e.g. border-white/[0.04] or bg-white/10
        // wait! Is bg-white/10 allowed? Rule: "No hardcoded hex or Tailwind color palette classes (bg-emerald-500, bg-white/10, text-white, etc.)"
        // But border-white/[0.04] to border-white/[0.06] is explicitly mandated micro-border!
        if (match[0].startsWith('border-white')) {
          // Check opacity
          const opacityMatch = afterMatch.match(/^\/\[0\.0[4-6]\]/);
          if (opacityMatch) {
            // This is the mandated micro-border!
            continue;
          }
        }
        issues.hardcodedColors.push({
          file: relPath,
          line: idx + 1,
          match: match[0] + afterMatch.split(' ')[0],
          snippet: line.trim()
        });
      } else {
        issues.hardcodedColors.push({
          file: relPath,
          line: idx + 1,
          match: match[0],
          snippet: line.trim()
        });
      }
    }

    // 4. Harsh borders check
    // Look for classes like `\bborder\b` without micro-border, or `border-2`, `border-[solid]`, `border-border`
    // "No hard borders or outlines: Do not place prominent border, border-border, or outline strokes around cards, tiles, or interior pods"
    const harshBorderRegex = /\b(?:border-(?:border|solid|gray-\d+|slate-\d+|zinc-\d+|primary)|border-(?:2|4|8)|outline-(?:white|black|\d+))\b/g;
    while ((match = harshBorderRegex.exec(codeLine)) !== null) {
      issues.harshBorders.push({
        file: relPath,
        line: idx + 1,
        match: match[0],
        snippet: line.trim()
      });
    }

    // 5. Arbitrary dots or bubbles before text
    // Look for pinging dots or arbitrary circles before text: e.g. `animate-ping`, `rounded-full w-2 h-2` next to text
    const dotRegex = /\b(?:animate-ping|h-1\.5\s+w-1\.5\s+rounded-full|h-2\s+w-2\s+rounded-full|w-2\s+h-2\s+rounded-full)\b/g;
    while ((match = dotRegex.exec(codeLine)) !== null) {
      issues.arbitraryDots.push({
        file: relPath,
        line: idx + 1,
        match: match[0],
        snippet: line.trim()
      });
    }
  });
}

console.log('--- DETAILED BORDER OCCURRENCES IN COMPONENT .TSX ---');
const borderOccurrences = [];
for (const filePath of nonTestTsxFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(process.cwd(), filePath);
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/border/.test(line)) {
      borderOccurrences.push({
        file: relPath,
        line: idx + 1,
        code: line.trim()
      });
    }
  });
}
console.log('Total border occurrences in non-test .tsx:', borderOccurrences.length);
borderOccurrences.forEach(o => console.log(`  ${o.file}:${o.line} -> ${o.code}`));

console.log('1. Function Declarations in .tsx / router.ts:', issues.functionDeclarationsInTsx.length);
if (issues.functionDeclarationsInTsx.length) console.log(issues.functionDeclarationsInTsx);

console.log('2. Non-Component Exports in Component .tsx:', issues.nonComponentExportsInTsx.length);
if (issues.nonComponentExportsInTsx.length) console.log(issues.nonComponentExportsInTsx);

console.log('3. Top-level Helper Functions in Component .tsx:', issues.helperFunctionsInComponentFiles.length);
if (issues.helperFunctionsInComponentFiles.length) console.log(issues.helperFunctionsInComponentFiles);

console.log('4. Hardcoded Color Literals / Classes:', issues.hardcodedColors.length);
if (issues.hardcodedColors.length) console.log(issues.hardcodedColors);

console.log('5. Harsh Borders / Outlines:', issues.harshBorders.length);
if (issues.harshBorders.length) console.log(issues.harshBorders);

console.log('6. Arbitrary Dots/Bubbles before text:', issues.arbitraryDots.length);
if (issues.arbitraryDots.length) console.log(issues.arbitraryDots);
