import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { cleanGameTitle, parseReleaseName } = require('../desktop/dist/game/parser.js');

const fixturePath = 'fixtures/parser_fixtures.json';
const raw = fs.readFileSync(fixturePath, 'utf8');
const cases = JSON.parse(raw).cases;

console.log('Total cases:', cases.length);

let cleanMatches = 0;
let titleMatches = 0;
let platMatches = 0;
let allMatches = 0;

for (let i = 0; i < cases.length; i++) {
  const tc = cases[i];
  const act = parseReleaseName(tc.input, tc.ext_hint, tc.parent_dir);
  const cTitle = cleanGameTitle(tc.input).toLowerCase();

  const cMatch = cTitle === tc.expected.clean_title.toLowerCase();
  const tMatch = act.title.toLowerCase() === tc.expected.title.toLowerCase();
  const pMatch = (act.platform || '').toLowerCase() === (tc.expected.platform || '').toLowerCase();

  if (cMatch) cleanMatches++;
  if (tMatch) titleMatches++;
  if (pMatch) platMatches++;

  if (act.title === tc.expected.title && act.cleanTitle === tc.expected.clean_title && act.platform === tc.expected.platform) {
    allMatches++;
  } else {
    if (i < 10) {
      console.log(`[Diff #${i+1}] input: "${tc.input}"`);
      console.log(`  expected:`, JSON.stringify(tc.expected));
      console.log(`  actual:  `, JSON.stringify({
        title: act.title,
        cleanTitle: act.cleanTitle,
        platform: act.platform,
        group: act.group,
        year: act.year,
        version: act.version,
        isScene: act.isScene
      }));
    }
  }
}

console.log(`Summary:`);
console.log(`CleanTitle matches: ${cleanMatches} / ${cases.length}`);
console.log(`Title matches: ${titleMatches} / ${cases.length}`);
console.log(`Platform matches: ${platMatches} / ${cases.length}`);
console.log(`All 3 matches: ${allMatches} / ${cases.length}`);
