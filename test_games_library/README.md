# Test Games Folder Library (Otix Simulation Environment)

This test directory contains a comprehensive simulation of real-world game installations,
downloads, crack releases, repacks, platforms, and emulation ROMs designed to rigorously test
Otix's local game detection, release parsing, archive healing, indexer, and organization engine.

---

## Simulated Categories & Test Cases

### 1. Official Store Platforms
- **Steam**:
  - Valid `appmanifest_<id>.acf` manifests (Cyberpunk 2077, Baldur's Gate 3, CS2, Hollow Knight, Elden Ring).
  - `steamapps/common/` game hierarchies with native `steam_api64.dll`.
  - Incomplete download state in `steamapps/downloading/`.
  - Workshop mod directory and user config `localconfig.vdf`.
- **Epic Games**:
  - `.egstore/Manifest.item` and `.bps` patches for Grand Theft Auto V, Fortnite, Alan Wake 2.
  - `Launcher/Portal/Manifests/` app records.
- **GOG (Good Old Games)**:
  - GOG Galaxy installations with `goggame-<id>.info`, `.ico`, and `.hashdb` (The Witcher 3, Cyberpunk 2077).
  - GOG offline standalone multi-bin installers (`setup_...exe` + `setup_...-1.bin`).
- **EA App / Origin**:
  - Games with `__Installer/installerdata.xml` (Dead Space Remake, The Sims 4).
- **Ubisoft Connect**:
  - Games with `uplay_install.manifest` and `uplay_install.state` (Far Cry 6, Assassin's Creed Mirage).
- **Xbox / Microsoft Store**:
  - `.GamingRoot` disk identifier, MSIX `appxmanifest.xml`, and `gamelaunchhelper.exe` (Forza Horizon 5).
- **Battle.net**:
  - Games with `.build.info` and launcher executables (Diablo IV).

### 2. Repacks & Installers
- **FitGirl Repacks**:
  - Multi-bin installer sequences (`setup.exe`, `setup-fitgirl-1.bin`, `fg-01.bin`, `fg-selective-english.bin`).
  - `quickSFV.exe`, `MD5/checksum.md5`, and `fitgirl.nfo`.
  - **Anomaly Case**: Incomplete download with `.bin.part` (Ghost of Tsushima).
- **DODI Repacks**:
  - DODI archives with `.doi` data containers and `dodi.nfo` (Ghost of Tsushima).
- **ElAmigos Repacks**:
  - Clean multi-bin releases (`setup.exe` + `elamigos-1.bin`).
  - **Anomaly 1**: Duplicate download naming collision `elamigos-2 (1).bin`.
  - **Anomaly 2**: Missing prefix `data-2.bin` requiring healing to `elamigos-2.bin`.

### 3. Scene Releases & ISOs
- ISO images from major scene groups: **RUNE**, **TENOKE**, **CODEX**, **Razor1911**, **EMPRESS**, **FLT**, **DELUSION**.
- Accompanying scene metadata: `.nfo`, `.sfv`, and `file_id.diz`.
- Extracted scene folders with `setup.exe` and internal crack directories (`CODEX/`, `RUNE/`).

### 4. Cracked Games, Emulators, Crackfixes & Unlockers
- **Goldberg Steam Emulator**: Full configuration with `steam_emu.ini`, `steam_settings/steam_appid.txt`, `DLC.txt`, `configs.user.ini`.
- **RUNE & EMPRESS Cracks**: Standalone installations with `rune.ini` and `emp.dll`.
- **OnlineFix Multiplayer Crack**: Spacewar (AppID 480) multiplayer bypass with `OnlineFix64.dll` and `OnlineFix.ini`.
- **DLC Unlockers**: CreamAPI (`cream_api.ini` + `steam_api64_o.dll`), Koaloader (`version.dll`), and SmokeAPI.
- **Crackfixes & Standalone Crack Folders**: `Crack.Only-ELAMIGOS/`, `Crackfix.V2-RUNE/`, `Crackfix-RUNE.exe`.

### 5. Satellite Updates & Patches
- Standalone executable patches: `Cyberpunk 2077 update 2.12 - 2.13.exe`, `Elden Ring update 1.12.3 - 1.13.0.exe`.
- Folder packages containing cumulative update binaries and setup engines.

### 6. Portable & Direct-Play Games
- Unity Engine direct-play (`Hollow Knight.exe` + `*_Data/` + `UnityCrashHandler64.exe`).
- Unreal Engine direct-play (`Black Myth Wukong` + `Win64-Shipping.exe` + `*.pak`).
- Custom engines (Dyson Sphere Program, Factorio, Dead Cells, Need for Speed).

### 7. Archives & Compressed Downloads
- Multi-part RARs (`.part01.rar`, `.part02.rar`).
- `.zip`, `.7z`, single `.rar` downloads.

### 8. Console & Retro Emulation ROMs
- **Nintendo Switch**: `.nsp`, `.xci`, `.nsz` with Title IDs, base games, updates (`[UPD]`), and DLCs (`[DLC]`).
- **PlayStation 3 (RPCS3)**: `PS3_GAME/` folder structure with `USRDIR/EBOOT.BIN`, `PARAM.SFO`, `ICON0.PNG`, `PS3_DISC.SFB`, and `.pkg` updates.
- **PlayStation 4 (shadPS4)**: `CUSA00411 - Bloodborne` with `eboot.bin` and `sce_sys/`.
- **PlayStation 2 & 1**: Compressed `.chd` and multi-track `.cue`/`.bin`.
- **PSP & PS Vita**: `.iso`, `.pbp`, and `.vpk`.
- **Nintendo GameCube & Wii**: `.rvz`, `.gcz`, and `.wbfs`.
- **Retro Systems**: Nintendo 64 (`.z64`), SNES (`.sfc`), NES (`.nes`), Genesis (`.md`), Game Boy Advance (`.gba`), Nintendo DS (`.nds`), Nintendo 3DS (`.3ds`).

### 9. Noise & System Junk (Verification of Filter Rules)
- Redistributables: `_CommonRedist/DirectX/DXSETUP.exe`, `vcredist/vc_redist.x64.exe`, `dotnetfx35.exe`.
- OS metadata: `.DS_Store`, `Thumbs.db`, `desktop.ini`, `$RECYCLE.BIN/`, `System Volume Information/`.
- Incomplete downloads: `*.crdownload`, `*.part`, `*.tmp`.

---

## How to Test With Otix

```bash
# Run dry-run simulation with the unified game management script:
node scripts/simulate-game-management.js --dir "test_games_library"

# Test with a specific preset:
node scripts/simulate-game-management.js --dir "test_games_library" --preset clean_game_folder

# Output structured JSON:
node scripts/simulate-game-management.js --dir "test_games_library" --json
```
