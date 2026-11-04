import json
from pathlib import Path

fixtures_path = Path("fixtures/parser_fixtures.json")
data = json.loads(fixtures_path.read_text(encoding="utf-8"))
cases = data["cases"]

print("=== PC CASES (Cases 1-66) ===")
for i in range(0, 66):
    c = cases[i]
    exp = c["expected"]
    print(f"{i+1}: {c['input']} -> title='{exp['title']}', clean='{exp['clean_title']}', plat='{exp['platform']}', grp='{exp['release_group']}', yr='{exp['year']}', ed='{exp['edition']}', ver='{exp['version']}', scene={exp['is_scene']}")
