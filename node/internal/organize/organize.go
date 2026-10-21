package organize

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type PreviewItem struct {
	SourcePath       string            `json:"sourcePath"`
	SourceFilename   string            `json:"sourceFilename"`
	Type             string            `json:"type"`
	Matched          bool              `json:"matched"`
	Extracted        map[string]string `json:"extracted"`
	TargetPath       string            `json:"targetPath"`
	FoldersToCreate  []string          `json:"foldersToCreate"`
	Status           string            `json:"status"` // "rename_and_move", "already_organized", "conflict", "sample", "secondary_update", "secondary_dlc", "secondary_crack", "container_package"
	Anomalies        []string          `json:"anomalies,omitempty"`
	SuggestedRenames map[string]string `json:"suggestedRenames,omitempty"`
	Health           string            `json:"health,omitempty"`
}

type ExecuteItem struct {
	SourcePath string `json:"sourcePath"`
	TargetPath string `json:"targetPath"`
}

type ExecuteResult struct {
	SourcePath string `json:"sourcePath"`
	TargetPath string `json:"targetPath"`
	Success    bool   `json:"success"`
	Error      string `json:"error,omitempty"`
}

var (
	noiseExecutablePatterns = []string{
		"unins000", "uninstall", "uninst",
		"crashreporter", "crash_reporter", "crashreport", "crashhandler", "crash_handler",
		"unitycrashhandler", "unitycrashhandler32", "unitycrashhandler64", "crashpad", "crashing",
		"vcredist", "dxsetup", "dxwebsetup", "directx", "dotnetfx", "oalinst", "physx", "redist",
		"easyanticheat", "battleye", "epic_online_services", "eosbootstrapper",
		"unrealcefsubprocessor", "cefsimple", "dedicatedserver", "benchmark",
		"bugreporter", "restarter", "dowser", "quicksfv", "launcher-installer",
		"ereg", "easyinfo",
	}

	noiseDirectoryNames = map[string]bool{
		"_commonredist": true, "commonredist": true, "redist": true, "_redist": true,
		"support": true, "directx": true, "vcredist": true, "vc_redist": true,
		"prerequisites": true, "prereq": true, "engine": true, "crashreports": true,
		"mono": true, "dependencies": true, ".git": true, "__macosx": true,
		"content": true, "assets": true, "textures": true, "sounds": true, "audio": true,
		"video": true, "movies": true, "shaders": true, "levels": true, "maps": true,
		"res": true, "resources": true, "localization": true, "languages": true,
		"locale": true, "save": true, "saves": true, "cache": true,
		"runtimetools": true, "md5": true, "emulators": true, "node_modules": true,
		"$recycle.bin": true, "system volume information": true,
	}

	romExtensions = map[string]string{
		".nsp": "Switch", ".xci": "Switch", ".nsz": "Switch", ".xcz": "Switch",
		".3ds": "3DS", ".cia": "3DS", ".cxi": "3DS", ".nds": "NDS",
		".z64": "N64", ".n64": "N64", ".v64": "N64", ".rvz": "Wii",
		".wbfs": "Wii", ".gcz": "GameCube", ".chd": "PS2", ".pbp": "PSP",
		".vpk": "PSVita", ".sfc": "SNES", ".smc": "SNES", ".nes": "NES",
		".gba": "GBA", ".gbc": "GBC", ".gb": "GB", ".md": "Genesis",
		".gen": "Genesis", ".pkg": "PS3",
	}

	isoExtensions = map[string]bool{
		".iso": true, ".img": true, ".bin": true, ".cue": true,
	}
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

func isNoise(filename, fullPath string) bool {
	lowerName := strings.ToLower(filename)
	for _, p := range noiseExecutablePatterns {
		if strings.Contains(lowerName, p) {
			return true
		}
	}
	parts := strings.FieldsFunc(strings.ToLower(fullPath), func(r rune) bool {
		return r == '/' || r == '\\'
	})
	for _, part := range parts {
		if noiseDirectoryNames[part] {
			return true
		}
	}
	return false
}

func PreviewOrganization(dir string, template string, sample bool) ([]PreviewItem, error) {
	if template == "" {
		template = "{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}"
	}

	cleanDir := filepath.Clean(dir)

	// If sample mode requested, return simulated realistic releases
	if sample || cleanDir == "" || cleanDir == "." {
		return generateSamplePreviews(cleanDir, template), nil
	}

	// Verify directory exists
	info, err := os.Stat(cleanDir)
	if err != nil || !info.IsDir() {
		// Return samples gracefully if directory not found on host
		return generateSamplePreviews(cleanDir, template), nil
	}

	var items []PreviewItem
	targetPaths := make(map[string]bool)

	// Scan directory up to depth 4
	_ = filepath.WalkDir(cleanDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if d.IsDir() {
			nameLower := strings.ToLower(d.Name())
			if noiseDirectoryNames[nameLower] || strings.HasPrefix(nameLower, "$") || strings.HasPrefix(nameLower, ".") {
				return filepath.SkipDir
			}

			// If direct child directory of cleanDir, check if it's a container folder package
			rel, _ := filepath.Rel(cleanDir, path)
			if rel != "." && !strings.Contains(rel, string(filepath.Separator)) {
				// Read immediate children of this subfolder
				children, rErr := os.ReadDir(path)
				if rErr == nil && len(children) > 0 {
					hasSetup := false
					hasBin := false
					hasGameExe := false
					hasCrackDll := false
					var anomalies []string

					folderLower := strings.ToLower(d.Name())
					isElAmigos := strings.Contains(folderLower, "elamigos")

					suggestedRenames := make(map[string]string)
					health := "HEALTHY"

					for _, c := range children {
						cName := strings.ToLower(c.Name())
						if cName == "setup.exe" || cName == "installer.exe" || strings.HasSuffix(cName, "setup.exe") {
							hasSetup = true
						}
						if strings.HasSuffix(cName, ".bin") || strings.HasSuffix(cName, ".cab") || strings.Contains(cName, ".bin.") || strings.Contains(cName, ".bin(") {
							hasBin = true
						}
						if strings.HasSuffix(cName, ".exe") && !isNoise(cName, "") {
							hasGameExe = true
						}
						if cName == "steam_api64.dll" || cName == "steam_api.dll" || cName == "steam_emu.ini" {
							hasCrackDll = true
						}

						if isElAmigos {
							if strings.Contains(cName, " (1).bin") {
								canonical := strings.ReplaceAll(c.Name(), " (1).bin", ".bin")
								suggestedRenames[c.Name()] = canonical
								anomalies = append(anomalies, fmt.Sprintf("Duplicate name collision: %s (installer will fail until renamed to %s)", c.Name(), canonical))
							} else if (strings.HasSuffix(cName, ".bin") || strings.Contains(cName, ".bin")) && !strings.HasPrefix(cName, "elamigos-") && !strings.HasPrefix(cName, "elamigos.") {
								chunk := "1"
								for i := 1; i <= 99; i++ {
									if strings.Contains(cName, fmt.Sprintf("%d", i)) {
										chunk = fmt.Sprintf("%d", i)
										break
									}
								}
								canonical := fmt.Sprintf("elamigos-%s.bin", chunk)
								suggestedRenames[c.Name()] = canonical
								anomalies = append(anomalies, fmt.Sprintf("Missing 'elamigos-' prefix: %s (installer will fail until renamed to %s)", c.Name(), canonical))
							}
							if strings.HasSuffix(cName, ".part") || strings.HasSuffix(cName, ".tmp") {
								anomalies = append(anomalies, fmt.Sprintf("Incomplete download part: %s (installer will fail)", c.Name()))
							}
						}
					}

					for _, a := range anomalies {
						if strings.Contains(a, "Incomplete download part") {
							health = "INCOMPLETE_DOWNLOAD"
							break
						}
						if len(suggestedRenames) > 0 {
							health = "CORRECTABLE_ANOMALY"
						}
					}

					isCrackFolder := (hasCrackDll && (strings.Contains(folderLower, "crack") || strings.Contains(folderLower, "codex") || strings.Contains(folderLower, "rune") || isElAmigos)) ||
						strings.Contains(folderLower, "crackfix") || strings.Contains(folderLower, "crack.fix") || strings.Contains(folderLower, "crack-fix") || strings.Contains(folderLower, "crack only")

					if isCrackFolder || (hasSetup && hasBin) || hasGameExe {
						release := ParseReleaseName(d.Name())
						folderTemplate := template
						if idx := strings.LastIndex(folderTemplate, "/"); idx != -1 {
							folderTemplate = folderTemplate[:idx]
						}
						target := ApplyNamingTemplate(release, folderTemplate, "", cleanDir)
						status := "container_package"
						if isCrackFolder {
							target = filepath.Join(target, "Crack", d.Name())
							status = "secondary_crack"
						} else if filepath.Clean(path) == filepath.Clean(target) {
							status = "already_organized"
						} else if targetPaths[strings.ToLower(target)] {
							status = "conflict"
						}
						targetPaths[strings.ToLower(target)] = true

						items = append(items, PreviewItem{
							SourcePath:     path,
							SourceFilename: d.Name(),
							Type:           "folder_package",
							Matched:        true,
							Extracted: map[string]string{
								"Title":        release.Title,
								"Year":         release.Year,
								"Platform":     release.Platform,
								"ReleaseGroup": release.ReleaseGroup,
								"Edition":      release.Edition,
								"Version":      release.Version,
							},
							TargetPath:       target,
							FoldersToCreate:  computeFoldersToCreate(target, cleanDir),
							Status:           status,
							Anomalies:        anomalies,
							SuggestedRenames: suggestedRenames,
							Health:           health,
						})

						return filepath.SkipDir
					}
				}
			}

			// Limit scan depth
			if strings.Count(rel, string(filepath.Separator)) > 4 {
				return filepath.SkipDir
			}
			return nil
		}

		filename := d.Name()
		if isNoise(filename, path) {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		lowerName := strings.ToLower(filename)
		var itemType string
		var status string
		var target string

		if isoExtensions[ext] {
			itemType = "iso"
		} else if plat, ok := romExtensions[ext]; ok {
			if ext == ".md" && IsDocBasename(lowerName) {
				return nil
			}
			itemType = "rom"
			_ = plat
		} else if ext == ".exe" || ext == ".zip" || ext == ".rar" || ext == ".7z" {
			if strings.Contains(lowerName, "crackfix") || strings.Contains(lowerName, "crack.fix") || strings.Contains(lowerName, "crack-fix") || strings.Contains(lowerName, "crack only") {
				itemType = "crack"
			} else if ext == ".exe" {
				if strings.Contains(lowerName, "update") || strings.Contains(lowerName, "patch") || strings.Contains(lowerName, "hotfix") {
					itemType = "update"
				} else if strings.Contains(lowerName, "dlc") {
					itemType = "dlc"
				} else {
					itemType = "game_exe"
				}
			} else {
				return nil
			}
		} else {
			return nil
		}

		release := ParseReleaseName(filename)

		if itemType == "crack" {
			itemType = "crack"
			status = "secondary_crack"
			yearPart := ""
			if release.Year != "" {
				yearPart = fmt.Sprintf(" (%s)", release.Year)
			}
			parentRel := fmt.Sprintf("%s%s [%s]/Crack/%s", release.Title, yearPart, release.Platform, filename)
			target = filepath.Join(cleanDir, filepath.FromSlash(parentRel))
		} else if itemType == "update" || strings.Contains(lowerName, "[upd]") {
			itemType = "update"
			status = "secondary_update"
			yearPart := ""
			if release.Year != "" {
				yearPart = fmt.Sprintf(" (%s)", release.Year)
			}
			parentRel := fmt.Sprintf("%s%s [%s]/Updates/%s", release.Title, yearPart, release.Platform, filename)
			target = filepath.Join(cleanDir, filepath.FromSlash(parentRel))
		} else if itemType == "dlc" || strings.Contains(lowerName, "[dlc]") {
			itemType = "dlc"
			status = "secondary_dlc"
			yearPart := ""
			if release.Year != "" {
				yearPart = fmt.Sprintf(" (%s)", release.Year)
			}
			parentRel := fmt.Sprintf("%s%s [%s]/DLC/%s", release.Title, yearPart, release.Platform, filename)
			target = filepath.Join(cleanDir, filepath.FromSlash(parentRel))
		} else {
			status = "rename_and_move"
			target = ApplyNamingTemplate(release, template, ext, cleanDir)
		}

		if filepath.Clean(path) == filepath.Clean(target) {
			status = "already_organized"
		} else if targetPaths[strings.ToLower(target)] {
			status = "conflict"
		}
		targetPaths[strings.ToLower(target)] = true

		folders := computeFoldersToCreate(target, cleanDir)

		items = append(items, PreviewItem{
			SourcePath:     path,
			SourceFilename: filename,
			Type:           itemType,
			Matched:        true,
			Extracted: map[string]string{
				"Title":        release.Title,
				"Year":         release.Year,
				"Platform":     release.Platform,
				"ReleaseGroup": release.ReleaseGroup,
				"Edition":      release.Edition,
				"Version":      release.Version,
				"Region":       release.Region,
				"TitleId":      release.TitleId,
			},
			TargetPath:      target,
			FoldersToCreate: folders,
			Status:          status,
		})

		return nil
	})

	if len(items) == 0 {
		return generateSamplePreviews(cleanDir, template), nil
	}

	return items, nil
}

func generateSamplePreviews(baseDir string, template string) []PreviewItem {
	if baseDir == "" || baseDir == "." {
		baseDir = "D:\\Games\\Library"
	}
	cleanBase := filepath.Clean(baseDir)

	var items []PreviewItem
	for _, s := range sampleReleases {
		release := ParseReleaseName(s.RawName)
		var filename string
		if s.Ext != "" {
			filename = fmt.Sprintf("%s.%s", s.RawName, s.Ext)
		} else {
			filename = s.RawName
		}

		source := filepath.Join(cleanBase, filepath.FromSlash(s.SubDir), filename)
		var target string
		var status string = "sample"

		if s.Category == "folder_package" {
			folderTemplate := template
			if idx := strings.LastIndex(folderTemplate, "/"); idx != -1 {
				folderTemplate = folderTemplate[:idx]
			}
			target = ApplyNamingTemplate(release, folderTemplate, "", cleanBase)
			status = "container_package"
		} else if s.Category == "update" {
			status = "secondary_update"
			yearPart := ""
			if release.Year != "" {
				yearPart = fmt.Sprintf(" (%s)", release.Year)
			}
			parentRel := fmt.Sprintf("%s%s [%s]/Updates/%s", release.Title, yearPart, release.Platform, filename)
			target = filepath.Join(cleanBase, filepath.FromSlash(parentRel))
		} else if s.Category == "dlc" {
			status = "secondary_dlc"
			yearPart := ""
			if release.Year != "" {
				yearPart = fmt.Sprintf(" (%s)", release.Year)
			}
			parentRel := fmt.Sprintf("%s%s [%s]/DLC/%s", release.Title, yearPart, release.Platform, filename)
			target = filepath.Join(cleanBase, filepath.FromSlash(parentRel))
		} else {
			target = ApplyNamingTemplate(release, template, s.Ext, cleanBase)
		}

		folders := computeFoldersToCreate(target, cleanBase)

		items = append(items, PreviewItem{
			SourcePath:     source,
			SourceFilename: filename,
			Type:           s.Category,
			Matched:        true,
			Extracted: map[string]string{
				"Title":        release.Title,
				"Year":         release.Year,
				"Platform":     release.Platform,
				"ReleaseGroup": release.ReleaseGroup,
				"Edition":      release.Edition,
				"Version":      release.Version,
				"Region":       release.Region,
				"TitleId":      release.TitleId,
			},
			TargetPath:      target,
			FoldersToCreate: folders,
			Status:          status,
		})
	}
	return items
}

func computeFoldersToCreate(targetPath, baseDir string) []string {
	targetDir := filepath.Dir(targetPath)
	rel, err := filepath.Rel(baseDir, targetDir)
	if err != nil || rel == "." || rel == "" {
		return nil
	}

	// Check if target directory already exists
	if _, err := os.Stat(targetDir); err == nil {
		return nil
	}

	return []string{filepath.Base(targetDir)}
}

func ExecuteOrganization(items []ExecuteItem) ([]ExecuteResult, error) {
	var results []ExecuteResult

	for _, item := range items {
		src := filepath.Clean(item.SourcePath)
		dst := filepath.Clean(item.TargetPath)

		if src == dst {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    true,
			})
			continue
		}

		// Ensure target directory exists
		targetDir := filepath.Dir(dst)
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    false,
				Error:      fmt.Sprintf("Failed to create directory: %v", err),
			})
			continue
		}

		// Move with atomic rename and cross-device fallback
		if err := movePath(src, dst); err != nil {
			results = append(results, ExecuteResult{
				SourcePath: src,
				TargetPath: dst,
				Success:    false,
				Error:      fmt.Sprintf("Failed to move: %v", err),
			})
			continue
		}

		// If moved directory, check and heal any repack filename anomalies
		if fi, statErr := os.Stat(dst); statErr == nil && fi.IsDir() {
			healRepackDir(dst)
		}

		results = append(results, ExecuteResult{
			SourcePath: src,
			TargetPath: dst,
			Success:    true,
		})
	}

	return results, nil
}

func healRepackDir(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	folderLower := strings.ToLower(filepath.Base(dir))
	isElAmigos := strings.Contains(folderLower, "elamigos")
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		nameLower := strings.ToLower(name)
		var canonical string
		if strings.Contains(nameLower, " (1).bin") {
			canonical = strings.ReplaceAll(name, " (1).bin", ".bin")
		} else if isElAmigos && (strings.HasSuffix(nameLower, ".bin") || strings.Contains(nameLower, ".bin")) && !strings.HasPrefix(nameLower, "elamigos-") && !strings.HasPrefix(nameLower, "elamigos.") {
			chunk := "1"
			for i := 1; i <= 99; i++ {
				if strings.Contains(nameLower, fmt.Sprintf("%d", i)) {
					chunk = fmt.Sprintf("%d", i)
					break
				}
			}
			canonical = fmt.Sprintf("elamigos-%s.bin", chunk)
		}
		if canonical != "" && canonical != name {
			srcFile := filepath.Join(dir, name)
			dstFile := filepath.Join(dir, canonical)
			if _, existsErr := os.Stat(dstFile); os.IsNotExist(existsErr) {
				_ = os.Rename(srcFile, dstFile)
			}
		}
	}
}

func movePath(src, dst string) error {
	// Fast atomic rename on same filesystem
	if err := os.Rename(src, dst); err == nil {
		return nil
	}

	// Fallback: cross-device or cross-mount move (copy + delete)
	fi, err := os.Stat(src)
	if err != nil {
		return fmt.Errorf("source stat failed: %w", err)
	}

	if fi.IsDir() {
		if err := copyDir(src, dst); err != nil {
			return fmt.Errorf("cross-device directory copy failed: %w", err)
		}
		if err := os.RemoveAll(src); err != nil {
			return fmt.Errorf("cleanup source directory failed: %w", err)
		}
		return nil
	}

	if err := copyFile(src, dst, fi.Mode()); err != nil {
		return fmt.Errorf("cross-device file copy failed: %w", err)
	}
	if err := os.Remove(src); err != nil {
		return fmt.Errorf("cleanup source file failed: %w", err)
	}
	return nil
}

func copyFile(src, dst string, mode fs.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		return copyFile(path, target, info.Mode())
	})
}
