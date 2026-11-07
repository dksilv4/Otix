package organize

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dksilv4/otix/node/internal/otixmeta"
)

type sampleDef struct {
	RawName  string
	Ext      string
	Platform string
	Category string
	IsDir    bool
	SubDir   string
}

var sampleReleases = []sampleDef{
	{RawName: "Cyberpunk.2077.v2.12.REPACK-ELAMIGOS", Ext: "iso", Platform: "PC", Category: "iso", SubDir: "Downloads"},
	{RawName: "Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE", Ext: "iso", Platform: "PC", Category: "iso", SubDir: "Downloads"},
	{RawName: "The.Witcher.3.Wild.Hunt.GOTY-GOG", Ext: "iso", Platform: "PC", Category: "iso", SubDir: "Downloads"},
	{RawName: "Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL", Ext: "", Platform: "PC", Category: "folder_package", IsDir: true, SubDir: "Downloads"},
	{RawName: "Hollow Knight", Ext: "", Platform: "PC", Category: "folder_package", IsDir: true, SubDir: "Games"},
	{RawName: "Hades.II.v0.91024-EarlyAccess", Ext: "exe", Platform: "PC", Category: "game_exe", SubDir: "Downloads/Hades 2"},
	{RawName: "Cyberpunk 2077 update 2.12 - 2.13", Ext: "exe", Platform: "PC", Category: "update", SubDir: "Downloads/Cyberpunk 2077/Updates"},
	{RawName: "Elden Ring update 1.12.3 - 1.13.0", Ext: "exe", Platform: "PC", Category: "update", SubDir: "Downloads/Elden Ring/Updates"},
	{RawName: "The Legend of Zelda Tears of the Kingdom [0100F2C0115B6000][v0]", Ext: "nsp", Platform: "Switch", Category: "rom", SubDir: "ROMs/Switch"},
	{RawName: "The Legend of Zelda Tears of the Kingdom [0100F2C0115B6800][v131072][UPD]", Ext: "nsp", Platform: "Switch", Category: "update", SubDir: "ROMs/Switch"},
	{RawName: "Super Smash Bros Ultimate [01006A800016F001][v0][DLC]", Ext: "nsp", Platform: "Switch", Category: "dlc", SubDir: "ROMs/Switch"},
	{RawName: "Super Mario 64 (USA)", Ext: "z64", Platform: "N64", Category: "rom", SubDir: "ROMs/N64"},
	{RawName: "God of War II (USA)", Ext: "chd", Platform: "PS2", Category: "rom", SubDir: "ROMs/PS2"},
	{RawName: "Pokemon - Emerald Version (USA, Europe)", Ext: "gba", Platform: "GBA", Category: "rom", SubDir: "ROMs/GBA"},
}

func findOtixSidecar(dir string) (*otixmeta.Sidecar, string) {
	if sc, err := otixmeta.Read(dir); err == nil && sc != nil && (sc.MediaID != "" || sc.Title != "" || sc.TitleID != "") {
		return sc, otixmeta.Path(dir)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, ""
	}
	var nonNoiseSubdirs []os.DirEntry
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		nameLower := strings.ToLower(e.Name())
		if noiseDirectoryNames[nameLower] || strings.HasPrefix(nameLower, "$") || strings.HasPrefix(nameLower, ".") {
			continue
		}
		nonNoiseSubdirs = append(nonNoiseSubdirs, e)
	}
	if len(nonNoiseSubdirs) == 1 {
		subPath := filepath.Join(dir, nonNoiseSubdirs[0].Name())
		if sc, err := otixmeta.Read(subPath); err == nil && sc != nil && (sc.MediaID != "" || sc.Title != "" || sc.TitleID != "") {
			return sc, otixmeta.Path(subPath)
		}
	}
	return nil, ""
}

func platformFromSidecar(sc *otixmeta.Sidecar, fallback string) string {
	if fallback == "PS5" {
		return "PS5"
	}
	if sc != nil && strings.HasPrefix(strings.ToUpper(sc.TitleID), "PPSA") {
		return "PS5"
	}
	if sc != nil && len(sc.Platforms) > 0 {
		for _, p := range sc.Platforms {
			name := ""
			if n, ok := p["name"].(string); ok {
				name = n
			}
			slug := ""
			if s, ok := p["slug"].(string); ok {
				slug = s
			}
			pUpper := strings.ToUpper(name)
			slugUpper := strings.ToUpper(slug)

			if strings.Contains(pUpper, "PC") || strings.Contains(pUpper, "WINDOWS") || strings.Contains(pUpper, "LINUX") || strings.Contains(pUpper, "MAC") ||
				strings.Contains(slugUpper, "WIN") || strings.Contains(slugUpper, "PC") || strings.Contains(slugUpper, "LINUX") || strings.Contains(slugUpper, "MAC") {
				return "PC"
			}
		}

		for _, p := range sc.Platforms {
			name := ""
			if n, ok := p["name"].(string); ok {
				name = n
			}
			slug := ""
			if s, ok := p["slug"].(string); ok {
				slug = s
			}
			pUpper := strings.ToUpper(name)
			slugUpper := strings.ToUpper(slug)
			combined := pUpper + " " + slugUpper
			if strings.Contains(combined, "SWITCH") || strings.Contains(combined, "NSW") {
				return "Switch"
			} else if strings.Contains(combined, "PS5") || strings.Contains(combined, "PLAYSTATION 5") || strings.Contains(combined, "PLAYSTATION-5") {
				return "PS5"
			} else if strings.Contains(combined, "PS4") || strings.Contains(combined, "PLAYSTATION 4") || strings.Contains(combined, "PLAYSTATION-4") {
				return "PS4"
			} else if strings.Contains(combined, "PS3") || strings.Contains(combined, "PLAYSTATION 3") || strings.Contains(combined, "PLAYSTATION-3") {
				return "PS3"
			} else if strings.Contains(combined, "3DS") {
				return "3DS"
			} else if strings.Contains(combined, "WII U") || strings.Contains(combined, "WIIU") || strings.Contains(combined, "WII-U") {
				return "WiiU"
			} else if strings.Contains(combined, "WII") {
				return "Wii"
			} else if strings.Contains(combined, "XBOX 360") || strings.Contains(combined, "XBOX-360") || strings.Contains(combined, "XBOX360") {
				return "Xbox360"
			} else if strings.Contains(combined, "XBOX ONE") || strings.Contains(combined, "XBOX-ONE") || strings.Contains(combined, "XBOX SERIES") || strings.Contains(combined, "SERIES-X") {
				return "Xbox"
			} else if strings.Contains(combined, "XBOX") {
				return "Xbox"
			}
			if name != "" {
				return name
			}
		}
	}
	if fallback != "" {
		return fallback
	}
	return "PC"
}

func yearFromSidecar(sc *otixmeta.Sidecar, rawName string) string {
	if y := ExtractYear(rawName); y > 1980 && y <= 2030 {
		return fmt.Sprintf("%d", y)
	}
	if sc != nil && sc.Title != "" {
		if y := ExtractYear(sc.Title); y > 1980 && y <= 2030 {
			return fmt.Sprintf("%d", y)
		}
	}
	return ""
}

func isGameExeName(name, fullPath string) bool {
	lower := strings.ToLower(name)
	if !strings.HasSuffix(lower, ".exe") {
		return false
	}
	if isNoise(name, fullPath) {
		return false
	}
	if strings.Contains(lower, "setup") || strings.Contains(lower, "installer") ||
		strings.Contains(lower, "update") || strings.Contains(lower, "patch") ||
		strings.Contains(lower, "hotfix") || strings.Contains(lower, "dlc") ||
		strings.Contains(lower, "addon") || isCrackName(lower) {
		return false
	}
	return true
}

func scanForGameExe(dirPath string) bool {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return false
	}
	var nonNoiseSubdirs []os.DirEntry
	for _, e := range entries {
		eLower := strings.ToLower(e.Name())
		if e.IsDir() {
			if !noiseDirectoryNames[eLower] && !strings.HasPrefix(eLower, "$") && !strings.HasPrefix(eLower, ".") && eLower != "updates" && eLower != "dlc" && eLower != "crack" {
				nonNoiseSubdirs = append(nonNoiseSubdirs, e)
			}
		} else {
			if isGameExeName(e.Name(), filepath.Join(dirPath, e.Name())) {
				return true
			}
		}
	}
	for _, sd := range nonNoiseSubdirs {
		sdLower := strings.ToLower(sd.Name())
		if len(nonNoiseSubdirs) > 1 && !knownGameSubdirs[sdLower] {
			continue
		}
		subPath := filepath.Join(dirPath, sd.Name())
		subEntries, sErr := os.ReadDir(subPath)
		if sErr != nil {
			continue
		}
		var deeperSubdirs []os.DirEntry
		for _, se := range subEntries {
			seLower := strings.ToLower(se.Name())
			if se.IsDir() {
				if !noiseDirectoryNames[seLower] && !strings.HasPrefix(seLower, "$") && !strings.HasPrefix(seLower, ".") && seLower != "updates" && seLower != "dlc" && seLower != "crack" {
					deeperSubdirs = append(deeperSubdirs, se)
				}
			} else {
				if isGameExeName(se.Name(), filepath.Join(subPath, se.Name())) {
					return true
				}
			}
		}
		for _, dsd := range deeperSubdirs {
			dsdLower := strings.ToLower(dsd.Name())
			if len(deeperSubdirs) > 1 && !knownGameSubdirs[dsdLower] {
				continue
			}
			deeperPath := filepath.Join(subPath, dsd.Name())
			deeperEntries, dErr := os.ReadDir(deeperPath)
			if dErr != nil {
				continue
			}
			for _, de := range deeperEntries {
				if !de.IsDir() && isGameExeName(de.Name(), filepath.Join(deeperPath, de.Name())) {
					return true
				}
			}
		}
	}
	return false
}
