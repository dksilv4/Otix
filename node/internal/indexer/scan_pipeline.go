package indexer

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
)

// scanPipeline coordinates state, candidate election, and real-time persistence during a library scan.
type scanPipeline struct {
	si                *StorageIndexer
	deep              bool
	libs              []config.LibraryConfig
	cachedFiles       map[string]HostedFile
	cachedByPath      map[string]string
	cachedMtimes      map[string]int64
	store             *Store
	newFiles          map[string]HostedFile
	newFilesByPath    map[string]string
	newMtimes         map[string]int64
	indexed           []HostedFile
	filesToPersist    []HostedFile
	activePathsPerLib map[string]map[string]bool
	totalFilesScanned int
	lastBroadcast     time.Time
	startTime         time.Time
}

// newScanPipeline initializes snapshot cache and scan status for library traversal.
func newScanPipeline(si *StorageIndexer, deep bool) *scanPipeline {
	si.mu.RLock()
	libs := make([]config.LibraryConfig, len(si.libraries))
	copy(libs, si.libraries)
	cachedFiles := make(map[string]HostedFile, len(si.filesByID))
	for k, v := range si.filesByID {
		cachedFiles[k] = v
	}
	cachedByPath := make(map[string]string, len(si.filesByPath))
	for k, v := range si.filesByPath {
		cachedByPath[k] = v
	}
	cachedMtimes := make(map[string]int64, len(si.mtimesByPath))
	for k, v := range si.mtimesByPath {
		cachedMtimes[k] = v
	}
	store := si.store
	si.mu.RUnlock()

	startTime := time.Now()
	si.statusMu.Lock()
	si.status = ScanStatus{
		Phase:        ScanPhaseScanning,
		StartedAt:    startTime,
		FilesScanned: 0,
		TotalFiles:   len(cachedFiles),
	}
	si.statusMu.Unlock()
	si.broadcastProgress(ScanProgressEvent{
		Event: "scan_started",
		Data:  si.GetStatus(),
	})

	return &scanPipeline{
		si:                si,
		deep:              deep,
		libs:              libs,
		cachedFiles:       cachedFiles,
		cachedByPath:      cachedByPath,
		cachedMtimes:      cachedMtimes,
		store:             store,
		newFiles:          make(map[string]HostedFile),
		newFilesByPath:    make(map[string]string),
		newMtimes:         make(map[string]int64),
		activePathsPerLib: make(map[string]map[string]bool),
		startTime:         startTime,
		lastBroadcast:     time.Now(),
	}
}

// registerHostedFile updates local pipeline collections, global indexer state, SQLite store, and broadcasts events.
func (sp *scanPipeline) registerHostedFile(hf HostedFile, mtimeUnix int64, paths ...string) {
	sp.newFiles[hf.ID] = hf
	for _, p := range paths {
		sp.newFilesByPath[p] = hf.ID
		sp.newMtimes[p] = mtimeUnix
	}
	sp.indexed = append(sp.indexed, hf)
	sp.filesToPersist = append(sp.filesToPersist, hf)

	sp.si.mu.Lock()
	sp.si.filesByID[hf.ID] = hf
	for _, p := range paths {
		sp.si.filesByPath[p] = hf.ID
		sp.si.mtimesByPath[p] = mtimeUnix
	}
	sp.si.mu.Unlock()

	if sp.store != nil {
		_ = sp.store.UpsertFiles([]HostedFile{hf})
	}

	sp.si.statusMu.Lock()
	sp.si.status.TotalFiles = len(sp.newFiles)
	sp.si.statusMu.Unlock()

	sp.si.broadcastProgress(ScanProgressEvent{
		Event: "file_indexed",
		Data:  hf,
		File:  &hf,
	})
	if hf.FormatCategory != "update" {
		sp.si.broadcastProgress(ScanProgressEvent{
			Event: "game_found",
			Data:  hf,
			File:  &hf,
		})
	}
}

// registerExisting updates pipeline collections and global state for unchanged files without re-reading from disk.
func (sp *scanPipeline) registerExisting(existing HostedFile, mtimeUnix int64, paths ...string) {
	sp.newFiles[existing.ID] = existing
	for _, p := range paths {
		sp.newFilesByPath[p] = existing.ID
		sp.newMtimes[p] = mtimeUnix
	}
	sp.indexed = append(sp.indexed, existing)

	sp.si.mu.Lock()
	sp.si.filesByID[existing.ID] = existing
	for _, p := range paths {
		sp.si.filesByPath[p] = existing.ID
		sp.si.mtimesByPath[p] = mtimeUnix
	}
	sp.si.mu.Unlock()

	sp.si.statusMu.Lock()
	sp.si.status.TotalFiles = len(sp.newFiles)
	sp.si.statusMu.Unlock()
}

// flushRootDirCandidates elects the best game executable or installer from gathered directory candidates.
func (sp *scanPipeline) flushRootDirCandidates(rootDir string, dirCandidates map[string][]candidateExe, dirRootNames map[string]string, libPath, libName string) {
	candidates := dirCandidates[rootDir]
	if len(candidates) == 0 {
		delete(dirCandidates, rootDir)
		delete(dirRootNames, rootDir)
		return
	}
	delete(dirCandidates, rootDir)

	rootName := dirRootNames[rootDir]
	delete(dirRootNames, rootDir)
	if rootName == "" {
		rootName = filepath.Base(rootDir)
	}

	var gameCandidates []candidateExe
	var installerCandidates []candidateExe

	for _, c := range candidates {
		if c.isInstaller {
			installerCandidates = append(installerCandidates, c)
		} else {
			c.score = ScoreGameCandidate(c.path, rootName, c.info, false)
			gameCandidates = append(gameCandidates, c)
		}
	}

	var elected candidateExe
	var formatCategory string

	if len(gameCandidates) > 0 {
		best := gameCandidates[0]
		for _, gc := range gameCandidates[1:] {
			if gc.score > best.score {
				best = gc
			}
		}
		elected = best
		formatCategory = "game"
	} else {
		best := installerCandidates[0]
		for _, ic := range installerCandidates[1:] {
			stem := strings.ToLower(strings.TrimSuffix(ic.filename, filepath.Ext(ic.filename)))
			if stem == "setup" || stem == "install" {
				best = ic
				break
			}
		}
		elected = best
		formatCategory = "installer"
	}

	mtimeUnix := elected.info.ModTime().Unix()
	cachedID, hasCached := sp.cachedByPath[elected.path]
	cachedMt, hasMt := sp.cachedMtimes[elected.path]

	if !sp.deep && hasCached && hasMt && cachedMt == mtimeUnix {
		if existing, ok := sp.cachedFiles[cachedID]; ok {
			sp.registerExisting(existing, mtimeUnix, elected.path)
			return
		}
	}

	fileSize := elected.info.Size()
	modTime := elected.info.ModTime().UTC().Format(time.RFC3339)
	headHash := ComputeHeadHash(elected.path)

	hasher := md5.New()
	hasher.Write([]byte(elected.path))
	fileID := fmt.Sprintf("file_%s", hex.EncodeToString(hasher.Sum(nil))[:12])

	rel := RelativeLibraryPath(elected.path, libPath)
	title := TitleFromInstallerPath(elected.filename, elected.path, libPath)
	if formatCategory == "game" {
		if !GenericFolderNames[strings.ToLower(rootName)] && rootName != "." {
			title = CleanTitleFromFilename(rootName)
		}
	}

	ext := strings.ToLower(filepath.Ext(elected.filename))
	hf := HostedFile{
		ID:             fileID,
		Filename:       elected.filename,
		Filepath:       elected.path,
		RelativePath:   rel,
		Filesize:       fileSize,
		SHA256Head:     headHash,
		Extension:      ext,
		FormatCategory: formatCategory,
		Platform:       string(DeterminePlatform(elected.filename, elected.path)),
		LibraryName:    libName,
		GameTitle:      title,
		ModifiedAt:     modTime,
		RootDir:        rootDir,
	}
	AttachOtixSidecar(&hf, libPath)

	sp.registerHostedFile(hf, mtimeUnix, elected.path)
}

// scanLibrary traverses a single library directory, extracting ROMs, ISOs, installers, and folder games.
func (sp *scanPipeline) scanLibrary(lib config.LibraryConfig) {
	libName := lib.Name
	if libName == "" {
		libName = "Default"
	}
	libPath := lib.Path
	if !IsPathReachable(libPath) {
		cleanLibPath := filepath.Clean(libPath)
		for id, cf := range sp.cachedFiles {
			if cf.LibraryName == libName || strings.HasPrefix(filepath.Clean(cf.Filepath), cleanLibPath) {
				sp.newFiles[id] = cf
				sp.newFilesByPath[cf.Filepath] = id
				if m, ok := sp.cachedMtimes[cf.Filepath]; ok {
					sp.newMtimes[cf.Filepath] = m
				}
			}
		}
		return
	}
	sp.activePathsPerLib[libName] = make(map[string]bool)

	allowedExts := lib.AllowedExtensions
	if len(allowedExts) == 0 {
		allowedExts = config.DefaultAllowedExtensions(lib.Kind)
	}
	allowedMap := make(map[string]bool, len(allowedExts))
	for _, ext := range allowedExts {
		allowedMap[strings.ToLower(ext)] = true
	}

	dirCandidates := make(map[string][]candidateExe)
	dirRootNames := make(map[string]string)
	activeRootDir := ""

	_ = filepath.Walk(libPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		name := info.Name()
		if strings.HasPrefix(name, ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		sp.totalFilesScanned++
		if time.Since(sp.lastBroadcast) > 120*time.Millisecond {
			sp.lastBroadcast = time.Now()
			sp.si.updateStatus(func(s *ScanStatus) {
				s.CurrentDirectory = filepath.Dir(path)
				s.FilesScanned = sp.totalFilesScanned
				s.ElapsedMs = time.Since(sp.startTime).Milliseconds()
			})
		}

		// If moving outside activeRootDir, finalize and register candidate game immediately
		if activeRootDir != "" && path != activeRootDir && !strings.HasPrefix(filepath.Clean(path), filepath.Clean(activeRootDir)+string(filepath.Separator)) {
			sp.flushRootDirCandidates(activeRootDir, dirCandidates, dirRootNames, libPath, libName)
			activeRootDir = ""
		}

		// Handle directory entries (e.g. PS5 dumps, macOS bundles)
		if info.IsDir() {
			if path == libPath {
				return nil
			}
			if ContainerFolderNames[strings.ToLower(name)] {
				return nil
			}

			// Optimized PS5 game dump package detection
			if isPS5, exePath, _, titleName := detectPS5GameDump(path); isPS5 {
				mtimeUnix := info.ModTime().Unix()
				sp.activePathsPerLib[libName][path] = true
				sp.activePathsPerLib[libName][exePath] = true

				cachedID, hasCached := sp.cachedByPath[exePath]
				if !hasCached {
					cachedID, hasCached = sp.cachedByPath[path]
				}
				cachedMt, hasMt := sp.cachedMtimes[exePath]
				if !hasMt {
					cachedMt, hasMt = sp.cachedMtimes[path]
				}

				if !sp.deep && hasCached && hasMt && cachedMt == mtimeUnix {
					if existing, ok := sp.cachedFiles[cachedID]; ok {
						sp.registerExisting(existing, mtimeUnix, path, exePath)
						return filepath.SkipDir
					}
				}

				fileSize := int64(0)
				headHash := "0000000000000000000000000000000000000000000000000000000000000000"
				if st, sErr := os.Stat(exePath); sErr == nil {
					fileSize = st.Size()
					headHash = ComputeHeadHash(exePath)
				}

				modTime := info.ModTime().UTC().Format(time.RFC3339)
				hasher := md5.New()
				hasher.Write([]byte(exePath))
				fileID := fmt.Sprintf("file_%s", hex.EncodeToString(hasher.Sum(nil))[:12])
				rel := RelativeLibraryPath(exePath, libPath)

				title := titleName
				if title == "" {
					title = CleanTitleFromFilename(name)
				}

				hf := HostedFile{
					ID:             fileID,
					Filename:       filepath.Base(exePath),
					Filepath:       exePath,
					RelativePath:   rel,
					Filesize:       fileSize,
					SHA256Head:     headHash,
					Extension:      strings.ToLower(filepath.Ext(exePath)),
					FormatCategory: "game",
					Platform:       "PS5",
					LibraryName:    libName,
					GameTitle:      title,
					ModifiedAt:     modTime,
					RootDir:        path,
				}
				AttachOtixSidecar(&hf, libPath)
				sp.registerHostedFile(hf, mtimeUnix, path, exePath)
				return filepath.SkipDir
			}

			// Handle macOS .app bundle
			if strings.HasSuffix(strings.ToLower(name), ".app") {
				plist := filepath.Join(path, "Contents", "Info.plist")
				macosDir := filepath.Join(path, "Contents", "MacOS")
				if _, errP := os.Stat(plist); errP == nil || func() bool { _, errM := os.Stat(macosDir); return errM == nil }() {
					mtimeUnix := info.ModTime().Unix()
					sp.activePathsPerLib[libName][path] = true
					cachedID, hasCached := sp.cachedByPath[path]
					cachedMt, hasMt := sp.cachedMtimes[path]

					if !sp.deep && hasCached && hasMt && cachedMt == mtimeUnix {
						if existing, ok := sp.cachedFiles[cachedID]; ok {
							sp.registerExisting(existing, mtimeUnix, path)
							return filepath.SkipDir
						}
					}

					modTime := info.ModTime().UTC().Format(time.RFC3339)
					hasher := md5.New()
					hasher.Write([]byte(path))
					fileID := fmt.Sprintf("file_%s", hex.EncodeToString(hasher.Sum(nil))[:12])
					rel := RelativeLibraryPath(path, libPath)
					title := CleanTitleFromFilename(strings.TrimSuffix(name, ".app"))
					cat := "game"
					if strings.Contains(strings.ToLower(name), "install") || strings.Contains(strings.ToLower(name), "setup") {
						cat = "installer"
					}

					hf := HostedFile{
						ID:             fileID,
						Filename:       name,
						Filepath:       path,
						RelativePath:   rel,
						Filesize:       info.Size(),
						SHA256Head:     "0000000000000000000000000000000000000000000000000000000000000000",
						Extension:      ".app",
						FormatCategory: cat,
						LibraryName:    libName,
						GameTitle:      title,
						ModifiedAt:     modTime,
						RootDir:        path,
					}
					AttachOtixSidecar(&hf, libPath)
					sp.registerHostedFile(hf, mtimeUnix, path)
					return filepath.SkipDir
				}
			}

			if strings.HasPrefix(name, ".") && path != libPath {
				return filepath.SkipDir
			}
			if NoiseDirectoryNames[strings.ToLower(name)] {
				return filepath.SkipDir
			}
			if path != libPath {
				rel := RelativeLibraryPath(path, libPath)
				parts := strings.Split(rel, "/")
				if len(parts) > 7 {
					return filepath.SkipDir
				}
			}
			return nil
		}

		if strings.HasPrefix(name, ".") {
			return nil
		}

		lowerName := strings.ToLower(name)
		ext := strings.ToLower(filepath.Ext(path))
		if strings.HasSuffix(lowerName, ".nsp.hdf") {
			ext = ".nsp"
		}
		isConsoleExe := strings.EqualFold(name, "eboot.bin")
		if len(allowedMap) > 0 && !allowedMap[ext] && !isConsoleExe {
			return nil
		}
		if IsInstallerPayloadFile(name) {
			return nil
		}
		if ext == ".bin" && !isConsoleExe && SkipExtensions[ext] {
			return nil
		}
		if IsNoiseHostedPackage(name, path) {
			return nil
		}

		sp.activePathsPerLib[libName][path] = true
		mtimeUnix := info.ModTime().Unix()

		indexFile := func(cat, title string) {
			cachedID, hasCached := sp.cachedByPath[path]
			cachedMt, hasMt := sp.cachedMtimes[path]

			if !sp.deep && hasCached && hasMt && cachedMt == mtimeUnix {
				if existing, ok := sp.cachedFiles[cachedID]; ok {
					sp.registerExisting(existing, mtimeUnix, path)
					return
				}
			}

			fileSize := info.Size()
			modTime := info.ModTime().UTC().Format(time.RFC3339)
			headHash := ComputeHeadHash(path)
			hasher := md5.New()
			hasher.Write([]byte(path))
			fileID := fmt.Sprintf("file_%s", hex.EncodeToString(hasher.Sum(nil))[:12])
			rel := RelativeLibraryPath(path, libPath)
			hf := HostedFile{
				ID:             fileID,
				Filename:       name,
				Filepath:       path,
				RelativePath:   rel,
				Filesize:       fileSize,
				SHA256Head:     headHash,
				Extension:      ext,
				FormatCategory: cat,
				Platform:       string(DeterminePlatform(name, path)),
				LibraryName:    libName,
				GameTitle:      title,
				ModifiedAt:     modTime,
				RootDir:        GameRootForFile(path, libPath),
			}
			AttachOtixSidecar(&hf, libPath)
			sp.registerHostedFile(hf, mtimeUnix, path)
		}

		if IsUpdateOrPatchArtifact(name, path) {
			indexFile("update", ParentGameTitleForUpdate(name, path, libPath))
			return nil
		}

		if ext == ".exe" {
			if IsNoiseOrUtilityExecutable(name, path) {
				return nil
			}

			isInst := DetectInstallerType(path, name) != ""
			rootDir, rootName := FindGameRootFolder(path, libPath)
			if activeRootDir != "" && activeRootDir != rootDir {
				sp.flushRootDirCandidates(activeRootDir, dirCandidates, dirRootNames, libPath, libName)
			}
			activeRootDir = rootDir
			dirCandidates[rootDir] = append(dirCandidates[rootDir], candidateExe{
				path:        path,
				filename:    name,
				info:        info,
				isInstaller: isInst,
			})
			dirRootNames[rootDir] = rootName
			return nil
		}

		cat := DetermineFileFormatCategory(path, name)
		if cat == "file" {
			return nil
		}

		indexFile(cat, TitleFromInstallerPath(name, path, libPath))
		return nil
	})

	// Flush any remaining candidates for this library
	if activeRootDir != "" {
		sp.flushRootDirCandidates(activeRootDir, dirCandidates, dirRootNames, libPath, libName)
		activeRootDir = ""
	}
	for rootDir := range dirCandidates {
		sp.flushRootDirCandidates(rootDir, dirCandidates, dirRootNames, libPath, libName)
	}
}

// finalize persists scan changes to SQLite store, updates global memory state, and completes scan status.
func (sp *scanPipeline) finalize() []HostedFile {
	// Persist changes and prune missing files in SQLite store
	if sp.store != nil {
		if len(sp.filesToPersist) > 0 {
			_ = sp.store.UpsertFiles(sp.filesToPersist)
		}
		for libName, activeMap := range sp.activePathsPerLib {
			_, _ = sp.store.DeleteMissing(activeMap, libName)
		}
		var activeLibNames []string
		for _, lib := range sp.libs {
			name := lib.Name
			if name == "" {
				name = "Default"
			}
			activeLibNames = append(activeLibNames, name)
		}
		_ = sp.store.PruneRemovedLibraries(activeLibNames)
	}

	sp.si.mu.Lock()
	sp.si.filesByID = sp.newFiles
	sp.si.filesByPath = sp.newFilesByPath
	sp.si.mtimesByPath = sp.newMtimes
	sp.si.lastScanned = time.Now()
	sp.si.mu.Unlock()

	elapsed := time.Since(sp.startTime).Milliseconds()
	sp.si.statusMu.Lock()
	sp.si.status = ScanStatus{
		Phase:            ScanPhaseCompleted,
		CurrentDirectory: "",
		FilesScanned:     sp.totalFilesScanned,
		TotalFiles:       len(sp.newFiles),
		Percentage:       100.0,
		StartedAt:        sp.startTime,
		ElapsedMs:        elapsed,
		LastCompletedAt:  time.Now(),
	}
	completedStatus := sp.si.status
	sp.si.statusMu.Unlock()

	sp.si.broadcastProgress(ScanProgressEvent{
		Event: "scan_completed",
		Data:  completedStatus,
	})

	return sp.indexed
}
