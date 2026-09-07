# Logo colour analysis — real DB assets

- Sample: **30** logo assets from `otix_dev` (12 SteamGridDB, 18 Fanart).
- New classifier differs from the old one on **20** assets; **0** download failures.

| # | Title | Provider | Label | Size | New guess | Old guess | Change | Transparent % |
|---|-------|----------|-------|------|-----------|-----------|--------|---------------|
| 1 | Jurassic World Evolution 2 | steamgrid | multicolor | 1000×1089 | `guess_multicolor` | `guess_multicolor` |  | 38% |
| 2 | Samorost 2 | steamgrid | multicolor | — | `guess_gray` | `guess_black` | ✅ | 89% |
| 3 | BioShock Infinite | steamgrid | custom | 860×444 | `guess_colorful` | `guess_multicolor` | ✅ | 37% |
| 4 | Garry's Mod | steamgrid | white | 755×364 | `guess_white` | `guess_black` | ✅ | 77% |
| 5 | Ori and the Blind Forest | steamgrid | custom | 4462×2926 | `guess_white` | `guess_multicolor` | ✅ | 68% |
| 6 | Sifu | steamgrid | multicolor | 2724×1608 | `guess_colorful` | `guess_multicolor` | ✅ | 59% |
| 7 | Evil Dead: The Game | steamgrid | multicolor | — | `guess_colorful` | `guess_multicolor` | ✅ | 62% |
| 8 | Helldivers 2 | steamgrid | multicolor | 1245×351 | `guess_colorful` | `guess_multicolor` | ✅ | 61% |
| 9 | Destiny 2 | steamgrid | white | 1074×206 | `guess_white` | `guess_white` |  | 86% |
| 10 | Battlefield 6 | steamgrid | multicolor | 1999×286 | `guess_colorful` | `guess_multicolor` | ✅ | 55% |
| 11 | Brawlhalla | steamgrid | multicolor | 3331×2435 | `guess_colorful` | `guess_black` | ✅ | 56% |
| 12 | BioShock Remastered | steamgrid | custom | 824×827 | `guess_black` | `guess_black` |  | 25% |
| 13 | Brother Bear | fanart | multicolor | — | `guess_black` | `guess_black` |  | 77% |
| 14 | Deaimon: Recipe for Happiness | fanart | multicolor | — | `guess_black` | `guess_black` |  | 80% |
| 15 | The Majestic | fanart | multicolor | — | `guess_colorful` | `guess_colorful` |  | 70% |
| 16 | Jumper | fanart | multicolor | — | `guess_white` | `guess_black` | ✅ | 64% |
| 17 | The Lodger: A Story of the London Fog | fanart | multicolor | — | `guess_colorful` | `guess_multicolor` | ✅ | 83% |
| 18 | American Dragon: Jake Long | fanart | multicolor | — | `guess_multicolor` | `guess_white` | ✅ | 71% |
| 19 | The Big Hit | fanart | multicolor | — | `guess_white` | `guess_multicolor` | ✅ | 68% |
| 20 | The Watch | fanart | multicolor | — | `guess_white` | `guess_white` |  | 39% |
| 21 | Intolerable Cruelty | fanart | multicolor | — | `guess_colorful` | `guess_multicolor` | ✅ | 80% |
| 22 | Let's Go to Prison | fanart | multicolor | — | `guess_black` | `guess_white` | ✅ | 36% |
| 23 | Seven Samurai | fanart | multicolor | — | `guess_white` | `guess_black` | ✅ | 92% |
| 24 | Invasion of the Body Snatchers | fanart | multicolor | — | `guess_colorful` | `guess_multicolor` | ✅ | 68% |
| 25 | Resident Evil | fanart | multicolor | — | `guess_colorful` | `guess_colorful` |  | 81% |
| 26 | Vanishing Point | fanart | multicolor | — | `guess_white` | `guess_black` | ✅ | 87% |
| 27 | The Sword in the Stone | fanart | multicolor | — | `guess_white` | `guess_white` |  | 88% |
| 28 | All About My Mother | fanart | multicolor | — | `guess_colorful` | `guess_multicolor` | ✅ | 90% |
| 29 | Iron Man 3 | fanart | multicolor | — | `guess_colorful` | `guess_white` | ✅ | 75% |
| 30 | Friday Night Lights | fanart | multicolor | — | `guess_colorful` | `guess_colorful` |  | 74% |

## Cases the new classifier fixed

- **Samorost 2** (steamgrid, label `multicolor`, None×None, transparent 89%): `guess_black` → `guess_gray`
  https://cdn2.steamgriddb.com/logo/2d6304a207cd9469f776e651e81ed7f8.png
- **BioShock Infinite** (steamgrid, label `custom`, 860×444, transparent 37%): `guess_multicolor` → `guess_colorful`
  https://cdn2.steamgriddb.com/logo/b649660304e88f8b157d9fee00b82668.png
- **Garry's Mod** (steamgrid, label `white`, 755×364, transparent 77%): `guess_black` → `guess_white`
  https://cdn2.steamgriddb.com/logo/f98666685a0cc8c237d82a7ba9e27052.png
- **Ori and the Blind Forest** (steamgrid, label `custom`, 4462×2926, transparent 68%): `guess_multicolor` → `guess_white`
  https://cdn2.steamgriddb.com/logo/b359ff14a406dbfe43f505e5b9dfbec8.png
- **Sifu** (steamgrid, label `multicolor`, 2724×1608, transparent 59%): `guess_multicolor` → `guess_colorful`
  https://cdn2.steamgriddb.com/logo/70dbb2a1ae97e1b1b95f152de348b89d.png
- **Evil Dead: The Game** (steamgrid, label `multicolor`, None×None, transparent 62%): `guess_multicolor` → `guess_colorful`
  https://cdn2.steamgriddb.com/logo/f948a0d891d3928d5a31f319a01a614f.png
- **Helldivers 2** (steamgrid, label `multicolor`, 1245×351, transparent 61%): `guess_multicolor` → `guess_colorful`
  https://cdn2.steamgriddb.com/logo/3458d004586a7398c9b8eb0209df37a3.png
- **Battlefield 6** (steamgrid, label `multicolor`, 1999×286, transparent 55%): `guess_multicolor` → `guess_colorful`
  https://cdn2.steamgriddb.com/logo/3756300ee847fa7af4eba4c9dcca907b.png
- **Brawlhalla** (steamgrid, label `multicolor`, 3331×2435, transparent 56%): `guess_black` → `guess_colorful`
  https://cdn2.steamgriddb.com/logo/036693fe730fe6e807f07830bc20994f.png
- **Jumper** (fanart, label `multicolor`, None×None, transparent 64%): `guess_black` → `guess_white`
  https://assets.fanart.tv/fanart/jumper-6117cf0b9efcc.png
- **The Lodger: A Story of the London Fog** (fanart, label `multicolor`, None×None, transparent 83%): `guess_multicolor` → `guess_colorful`
  https://assets.fanart.tv/fanart/the-lodger-a-story-of-the-london-fog-5d45f82b4de01.png
- **American Dragon: Jake Long** (fanart, label `multicolor`, None×None, transparent 71%): `guess_white` → `guess_multicolor`
  https://assets.fanart.tv/fanart/AmericanDragonJakeLong-74344.png
- **The Big Hit** (fanart, label `multicolor`, None×None, transparent 68%): `guess_multicolor` → `guess_white`
  https://assets.fanart.tv/fanart/the-big-hit-65c3c214378d1.png
- **Intolerable Cruelty** (fanart, label `multicolor`, None×None, transparent 80%): `guess_multicolor` → `guess_colorful`
  https://assets.fanart.tv/fanart/intolerable-cruelty-58b7db811b4a7.png
- **Let's Go to Prison** (fanart, label `multicolor`, None×None, transparent 36%): `guess_white` → `guess_black`
  https://assets.fanart.tv/fanart/lets-go-to-prison-5872309c2f81f.png
- **Seven Samurai** (fanart, label `multicolor`, None×None, transparent 92%): `guess_black` → `guess_white`
  https://assets.fanart.tv/fanart/seven-samurai-65fc40c8b3efe.png
- **Invasion of the Body Snatchers** (fanart, label `multicolor`, None×None, transparent 68%): `guess_multicolor` → `guess_colorful`
  https://assets.fanart.tv/fanart/invasion-of-the-body-snatchers-4f76fcca279f6.png
- **Vanishing Point** (fanart, label `multicolor`, None×None, transparent 87%): `guess_black` → `guess_white`
  https://assets.fanart.tv/fanart/vanishing-point-51a561ee832dc.png
- **All About My Mother** (fanart, label `multicolor`, None×None, transparent 90%): `guess_multicolor` → `guess_colorful`
  https://assets.fanart.tv/fanart/all-about-my-mother-654695f08416f.png
- **Iron Man 3** (fanart, label `multicolor`, None×None, transparent 75%): `guess_white` → `guess_colorful`
  https://assets.fanart.tv/fanart/iron-man-3-5c855c417eb5c.png

## URL reference

1. `https://cdn2.steamgriddb.com/logo/14072b2ff783182847122db384e8863f.png`
2. `https://cdn2.steamgriddb.com/logo/2d6304a207cd9469f776e651e81ed7f8.png`
3. `https://cdn2.steamgriddb.com/logo/b649660304e88f8b157d9fee00b82668.png`
4. `https://cdn2.steamgriddb.com/logo/f98666685a0cc8c237d82a7ba9e27052.png`
5. `https://cdn2.steamgriddb.com/logo/b359ff14a406dbfe43f505e5b9dfbec8.png`
6. `https://cdn2.steamgriddb.com/logo/70dbb2a1ae97e1b1b95f152de348b89d.png`
7. `https://cdn2.steamgriddb.com/logo/f948a0d891d3928d5a31f319a01a614f.png`
8. `https://cdn2.steamgriddb.com/logo/3458d004586a7398c9b8eb0209df37a3.png`
9. `https://cdn2.steamgriddb.com/logo/3f2ad34b5e5d4a0532b9fb0f84ed250a.png`
10. `https://cdn2.steamgriddb.com/logo/3756300ee847fa7af4eba4c9dcca907b.png`
11. `https://cdn2.steamgriddb.com/logo/036693fe730fe6e807f07830bc20994f.png`
12. `https://cdn2.steamgriddb.com/logo/429d874a49b9f943f384c52da297fce5.png`
13. `https://assets.fanart.tv/fanart/brother-bear-4f9342f33cd77.png`
14. `https://assets.fanart.tv/fanart/deaimon-recipe-for-happiness-650ed4b30a6b2.png`
15. `https://assets.fanart.tv/fanart/the-majestic-518b705856ce5.png`
16. `https://assets.fanart.tv/fanart/jumper-6117cf0b9efcc.png`
17. `https://assets.fanart.tv/fanart/the-lodger-a-story-of-the-london-fog-5d45f82b4de01.png`
18. `https://assets.fanart.tv/fanart/AmericanDragonJakeLong-74344.png`
19. `https://assets.fanart.tv/fanart/the-big-hit-65c3c214378d1.png`
20. `https://assets.fanart.tv/fanart/the-watch-512378d105dbf.png`
21. `https://assets.fanart.tv/fanart/intolerable-cruelty-58b7db811b4a7.png`
22. `https://assets.fanart.tv/fanart/lets-go-to-prison-5872309c2f81f.png`
23. `https://assets.fanart.tv/fanart/seven-samurai-65fc40c8b3efe.png`
24. `https://assets.fanart.tv/fanart/invasion-of-the-body-snatchers-4f76fcca279f6.png`
25. `https://assets.fanart.tv/fanart/resident-evil-5129fce8667e0.png`
26. `https://assets.fanart.tv/fanart/vanishing-point-51a561ee832dc.png`
27. `https://assets.fanart.tv/fanart/the-sword-in-the-stone-612bf2248d51a.png`
28. `https://assets.fanart.tv/fanart/all-about-my-mother-654695f08416f.png`
29. `https://assets.fanart.tv/fanart/iron-man-3-5c855c417eb5c.png`
30. `https://assets.fanart.tv/fanart/friday-night-lights-5271741857b0c.png`
