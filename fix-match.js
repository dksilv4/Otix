const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'frontend/src/features/settings/components/EpicMatchModal.tsx');
let content = fs.readFileSync(file, 'utf-8');

const oldCode = '        const { data } = await apiClient.post(\'/media/match/batch\', { games: batchGames })\n\n        if (cancelled) return';
const newCode = '        const apiBaseUrl = (await import(\'@/lib/config\')).API_BASE_URL\n        const token = localStorage.getItem(\'otix_access_token\')\n\n        const res = await fetch(apiBaseUrl + \'/media/match/batch\', {\n          method: \'POST\',\n          headers: {\n            \'Content-Type\': \'application/json\',\n            ...(token ? { Authorization: \'Bearer \' + token } : {}),\n          },\n          body: JSON.stringify({\n            games: batchGames.map(g => ({\n              title: g.title,\n              developer: g.developer || null,\n              platforms: g.platforms || null,\n              external_ids: [{ source: \'epic\', id: g.external_ids[0].id }],\n              media_type: \'game\',\n            })),\n          }),\n        })\n\n        if (!res.ok) {\n          const errBody = await res.text();\n          console.error(\'[EpicMatch] batch match failed:\', res.status, errBody);\n          throw new Error(\'Match API error: \' + res.status);\n        }\n\n        const data = await res.json()\n        if (cancelled) return';

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(file, content, 'utf-8');
  console.log('OK: replaced');
} else {
  console.log('pattern not found');
  process.exit(1);
}
