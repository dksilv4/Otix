package games

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/dksilv4/otix/node/internal/hardware"
	"github.com/dksilv4/otix/node/internal/indexer"
)

// KnownGameSignatures maps common game executable names to pretty titles.
var KnownGameSignatures = map[string]string{
	"cyberpunk2077.exe":                   "Cyberpunk 2077",
	"witcher3.exe":                        "The Witcher 3: Wild Hunt",
	"gta5.exe":                            "Grand Theft Auto V",
	"rdr2.exe":                            "Red Dead Redemption 2",
	"eldenring.exe":                       "Elden Ring",
	"starfield.exe":                       "Starfield",
	"bg3.exe":                             "Baldur's Gate 3",
	"bg3_dx11.exe":                        "Baldur's Gate 3",
	"baldursgate3.exe":                    "Baldur's Gate 3",
	"hogwartslegacy.exe":                  "Hogwarts Legacy",
	"forzahorizon5.exe":                   "Forza Horizon 5",
	"monsterhunterworld.exe":              "Monster Hunter: World",
	"monsterhunterrise.exe":               "Monster Hunter Rise",
	"cs2.exe":                             "Counter-Strike 2",
	"csgo.exe":                            "Counter-Strike: Global Offensive",
	"dota2.exe":                           "Dota 2",
	"valorant.exe":                        "Valorant",
	"valorant-win64-shipping.exe":         "Valorant",
	"leagueclient.exe":                    "League of Legends",
	"league of legends.exe":               "League of Legends",
	"destiny2.exe":                        "Destiny 2",
	"overwatch.exe":                       "Overwatch 2",
	"r5apex.exe":                          "Apex Legends",
	"fortniteclient-win64-shipping.exe":   "Fortnite",
	"rocketleague.exe":                    "Rocket League",
	"deadbydaylight.exe":                  "Dead by Daylight",
	"deadbydaylight-win64-shipping.exe":   "Dead by Daylight",
	"helldivers2.exe":                     "Helldivers 2",
	"palworld-win64-shipping.exe":         "Palworld",
	"blackmythwukong.exe":                 "Black Myth: Wukong",
	"b1-win64-shipping.exe":               "Black Myth: Wukong",
	"spacemarine2.exe":                    "Warhammer 40k: Space Marine 2",
	"warhammer2.exe":                      "Total War: Warhammer II",
	"warhammer3.exe":                      "Total War: Warhammer III",
	"civ6.exe":                            "Sid Meier's Civilization VI",
	"civ6_dx12.exe":                       "Sid Meier's Civilization VI",
	"sekiro.exe":                          "Sekiro: Shadows Die Twice",
	"darksoulsiii.exe":                    "Dark Souls III",
	"armoredcore6.exe":                    "Armored Core VI",
	"godofwar.exe":                        "God of War",
	"gow_ragnarok.exe":                    "God of War Ragnarok",
	"spiderman.exe":                       "Marvel's Spider-Man Remastered",
	"milesmorales.exe":                    "Marvel's Spider-Man: Miles Morales",
	"tlou-i.exe":                          "The Last of Us Part I",
	"ghostooftsushima.exe":                "Ghost of Tsushima",
	"horizonzerodawn.exe":                 "Horizon Zero Dawn",
	"horizonforbiddenwest.exe":            "Horizon Forbidden West",
	"residentevil4.exe":                   "Resident Evil 4",
	"re4.exe":                             "Resident Evil 4",
	"re8.exe":                             "Resident Evil Village",
	"re2.exe":                             "Resident Evil 2",
	"re3.exe":                             "Resident Evil 3",
	"fallout4.exe":                        "Fallout 4",
	"skyrimse.exe":                        "The Elder Scrolls V: Skyrim",
	"tesv.exe":                            "The Elder Scrolls V: Skyrim",
	"hades.exe":                           "Hades",
	"hades2.exe":                          "Hades II",
	"hollow_knight.exe":                   "Hollow Knight",
	"silksong.exe":                        "Hollow Knight: Silksong",
	"subnautica.exe":                      "Subnautica",
	"factorio.exe":                        "Factorio",
	"terraria.exe":                        "Terraria",
	"valheim.exe":                         "Valheim",
	"stardew valley.exe":                  "Stardew Valley",
	"stardewvalley.exe":                   "Stardew Valley",
	"deadcells.exe":                       "Dead Cells",
	"slaythespire.exe":                    "Slay the Spire",
	"balatro.exe":                         "Balatro",
	"bloonstd6.exe":                       "Bloons TD 6",
	"btd6.exe":                            "Bloons TD 6",
	"cleaner-btd6.exe":                    "Bloons TD 6",
	"factorygamesteam.exe":                "Satisfactory",
	"satisfactory.exe":                    "Satisfactory",
	"modernwarfare.exe":                   "Call of Duty: Modern Warfare",
	"supermarket together.exe":            "Supermarket Together",
	"supermarkettogether.exe":             "Supermarket Together",
	"rs2client.exe":                       "RuneScape",
	"runescape.exe":                       "RuneScape",
	"rsdragonwilds.exe":                   "RuneScape Dragonwilds",
	"rsdragonwilds-win64-shipping.exe":    "RuneScape Dragonwilds",
	"oriwotw.exe":                         "Ori and the Will of the Wisps",
	"oride.exe":                           "Ori and the Blind Forest",
	"timberborn.exe":                      "Timberborn",
	"pragmata.exe":                        "Pragmata",
	"brawlhalla.exe":                      "Brawlhalla",
	"pathofexilesteam.exe":                "Path of Exile 2",
	"pathofexile.exe":                     "Path of Exile",
	"pathofexile_x64.exe":                 "Path of Exile",
	"pathofexile2.exe":                    "Path of Exile 2",
	"losslessscaling.exe":                 "Lossless Scaling",
	"transportfever3.exe":                 "Transport Fever 3",
	"transportfever2.exe":                 "Transport Fever 2",
	"whiskerwood.exe":                     "Whiskerwood",
	"whiskerwood-win64-shipping.exe":      "Whiskerwood",
	"ultimatechickenhorse.exe":            "Ultimate Chicken Horse",
	"tekken 8.exe":                        "Tekken 8",
	"tekken8.exe":                         "Tekken 8",
	"risk of rain 2.exe":                  "Risk of Rain 2",
	"riskofrain2.exe":                     "Risk of Rain 2",
	"wardogs.exe":                         "Wardogs",
	"wardogsclient.exe":                   "Wardogs",
	"wardogsclient-win64-shipping.exe":    "Wardogs",
	"wardogslauncher-shipping.exe":        "Wardogs",
	"wardogs-win64-shipping.exe":          "Wardogs",
}

var NoiseProcesses = map[string]bool{
	"explorer.exe": true, "chrome.exe": true, "firefox.exe": true, "msedge.exe": true,
	"code.exe": true, "devenv.exe": true, "discord.exe": true, "spotify.exe": true,
	"steam.exe": true, "steamwebhelper.exe": true, "epicgameslauncher.exe": true,
	"origin.exe": true, "eadesktop.exe": true, "riotclientservices.exe": true,
	"battlenet.exe": true, "upc.exe": true, "galaxyclient.exe": true,
	"taskmgr.exe": true, "cmd.exe": true, "powershell.exe": true, "conhost.exe": true,
	"svchost.exe": true, "presentmon.exe": true, "otix.exe": true, "electron.exe": true,
	"node.exe": true,
}

// GameTracker monitors running processes, detects game launches, manages FPS capture and recording.
type GameTracker struct {
	mu           sync.RWMutex
	store        *SessionStore
	fpsCollector FpsCollector
	indexer      *indexer.StorageIndexer
	runningGames map[string]*RunningGame
	activeGameID string
	stopChan     chan struct{}
	nodeName     string
	nodePort     int

	onGameStarted       func(game *RunningGame)
	onGameStopped       func(session *PlaySession)
	onActiveGameChanged func(game *RunningGame)
}

// NewGameTracker creates a GameTracker instance.
func NewGameTracker(store *SessionStore, fpsCollector FpsCollector, idx *indexer.StorageIndexer) *GameTracker {
	return &GameTracker{
		store:        store,
		fpsCollector: fpsCollector,
		indexer:      idx,
		runningGames: make(map[string]*RunningGame),
		stopChan:     make(chan struct{}),
	}
}

// SetNodeInfo configures the identifying node details for game sessions.
func (gt *GameTracker) SetNodeInfo(name string, port int) {
	gt.mu.Lock()
	defer gt.mu.Unlock()
	gt.nodeName = name
	gt.nodePort = port
}

// SetCallbacks registers lifecycle hooks (used by OverlayManager).
func (gt *GameTracker) SetCallbacks(onStarted func(game *RunningGame), onStopped func(session *PlaySession)) {
	gt.mu.Lock()
	defer gt.mu.Unlock()
	gt.onGameStarted = onStarted
	gt.onGameStopped = onStopped
}

// SetActiveGameCallback registers a hook called whenever the active/foreground game changes.
func (gt *GameTracker) SetActiveGameCallback(onActiveChanged func(game *RunningGame)) {
	gt.mu.Lock()
	defer gt.mu.Unlock()
	gt.onActiveGameChanged = onActiveChanged
}

// Start begins periodic process scanning (every 3 seconds) and foreground window focus tracking (every 300ms).
func (gt *GameTracker) Start() {
	go gt.scanLoop()
	go gt.focusLoop()
}

// Stop terminates background scanning and stops active tracking cleanly.
func (gt *GameTracker) Stop() {
	close(gt.stopChan)
	gt.mu.Lock()
	gt.stopActiveSessionLocked()
	gt.mu.Unlock()
}

func (gt *GameTracker) scanLoop() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-gt.stopChan:
			return
		case <-ticker.C:
			gt.scanStep()
		}
	}
}

func (gt *GameTracker) focusLoop() {
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-gt.stopChan:
			return
		case <-ticker.C:
			gt.updateActiveGame()
		}
	}
}

func (gt *GameTracker) updateActiveGame() {
	fgPid := getForegroundProcessPID()

	gt.mu.Lock()
	defer gt.mu.Unlock()

	if len(gt.runningGames) == 0 {
		gt.activeGameID = ""
		return
	}

	// 1. Check if the foreground window directly belongs to one of our running games
	var fgGame *RunningGame
	if fgPid > 0 {
		for _, g := range gt.runningGames {
			if g.PID == fgPid {
				fgGame = g
				break
			}
		}
	}

	targetID := gt.activeGameID
	if fgGame != nil {
		targetID = fgGame.ID
	} else {
		// If current activeGameID is no longer running or empty, pick the newest running game
		if _, exists := gt.runningGames[targetID]; !exists {
			var latest *RunningGame
			for _, g := range gt.runningGames {
				if latest == nil || g.StartTime.After(latest.StartTime) {
					latest = g
				}
			}
			if latest != nil {
				targetID = latest.ID
			}
		}
	}

	if targetID == "" {
		return
	}

	activeGame := gt.runningGames[targetID]
	if activeGame == nil {
		return
	}

	switched := gt.activeGameID != targetID
	gt.activeGameID = targetID

	if switched {
		if gt.fpsCollector != nil && activeGame.FpsAvailable {
			_ = gt.fpsCollector.Start(activeGame.PID, activeGame.ProcessName, activeGame.ID)
		}
		cb := gt.onActiveGameChanged
		if cb != nil {
			cp := *activeGame
			go cb(&cp)
		}
	}
}

func (gt *GameTracker) scanStep() {
	procs, err := ListProcesses()
	if err != nil {
		return
	}

	gt.mu.Lock()
	defer gt.mu.Unlock()

	// 1. Verify all currently running games are still alive
	for id, game := range gt.runningGames {
		stillAlive := false
		for _, p := range procs {
			if p.PID == game.PID && strings.EqualFold(p.Name, game.ProcessName) {
				stillAlive = true
				break
			}
		}

		if stillAlive {
			game.CurrentDurationSec = int(time.Since(game.StartTime).Seconds())
			if gt.fpsCollector != nil {
				snap := gt.fpsCollector.GetSnapshot()
				if snap != nil && (snap.GameID == game.ID || (snap.GameID == "" && id == gt.activeGameID)) {
					game.FpsSnapshot = snap
				} else {
					game.FpsSnapshot = nil
				}
			}
		} else {
			// Game has exited!
			gt.stopActiveSessionLocked(id)
		}
	}

	// 2. Scan processes to detect any games not yet tracked
	runningPIDs := make(map[int]bool, len(gt.runningGames))
	for _, g := range gt.runningGames {
		runningPIDs[g.PID] = true
	}

	for _, p := range procs {
		if runningPIDs[p.PID] {
			continue
		}
		identified := gt.identifyGameFull(p.Name)
		if identified != nil && identified.ID != "" {
			if _, exists := gt.runningGames[identified.ID]; !exists {
				gt.startActiveSessionLocked(p.PID, p.Name, p.Path, identified.ID, identified.Title, identified)
				runningPIDs[p.PID] = true
			}
		}
	}
}

// IdentifiedGame holds the resolved metadata for a detected game process.
type IdentifiedGame struct {
	ID          string
	Title       string
	OtixMediaID string
	PosterURL   string
	BackdropURL string
	Overview    string
}

func (gt *GameTracker) identifyGame(processName string) (string, string) {
	g := gt.identifyGameFull(processName)
	if g == nil {
		return "", ""
	}
	return g.ID, g.Title
}

func (gt *GameTracker) identifyGameFull(processName string) *IdentifiedGame {
	lower := strings.ToLower(processName)
	if NoiseProcesses[lower] {
		return nil
	}

	// 1. Check custom mappings
	if m := gt.store.GetMappingForProcess(lower); m != nil {
		return &IdentifiedGame{
			ID:    m.GameID,
			Title: m.GameTitle,
		}
	}

	// 2. Check local indexed libraries
	if gt.indexer != nil {
		files := gt.indexer.Files()
		for _, f := range files {
			base := strings.ToLower(filepath.Base(f.Filepath))
			if base == lower {
				id := f.OtixMediaID
				if id == "" {
					id = f.ID
				}
				title := f.OtixTitle
				if title == "" {
					if sigTitle, ok := KnownGameSignatures[lower]; ok {
						title = sigTitle
					} else if f.GameTitle != "" {
						title = f.GameTitle
					} else {
						title = strings.TrimSuffix(f.Filename, filepath.Ext(f.Filename))
					}
				}
				poster := ""
				backdrop := ""
				if f.OtixImages != nil {
					if p, ok := f.OtixImages["poster"]; ok {
						poster = p.URL
					}
					if b, ok := f.OtixImages["backdrop"]; ok {
						backdrop = b.URL
					}
				}
				return &IdentifiedGame{
					ID:          id,
					Title:       title,
					OtixMediaID: f.OtixMediaID,
					PosterURL:   poster,
					BackdropURL: backdrop,
					Overview:    f.OtixOverview,
				}
			}
		}
	}

	// 3. Check known popular game executable signatures
	if title, ok := KnownGameSignatures[lower]; ok {
		slug := strings.ToLower(strings.ReplaceAll(title, " ", "-"))
		return &IdentifiedGame{
			ID:    slug,
			Title: title,
		}
	}

	// 4. Try stripping common UE/client/shipping suffixes to match KnownGameSignatures
	cleanLower := lower
	for _, suffix := range []string{
		"-win64-shipping.exe",
		"_win64_shipping.exe",
		"-shipping.exe",
		"_shipping.exe",
		"client.exe",
		"launcher.exe",
	} {
		if strings.HasSuffix(cleanLower, suffix) {
			baseCandidate := strings.TrimSuffix(cleanLower, suffix)
			if title, ok := KnownGameSignatures[baseCandidate+".exe"]; ok {
				slug := strings.ToLower(strings.ReplaceAll(title, " ", "-"))
				return &IdentifiedGame{
					ID:    slug,
					Title: title,
				}
			}
			if title, ok := KnownGameSignatures[baseCandidate+"client.exe"]; ok {
				slug := strings.ToLower(strings.ReplaceAll(title, " ", "-"))
				return &IdentifiedGame{
					ID:    slug,
					Title: title,
				}
			}
			break
		}
	}

	return nil
}

func (gt *GameTracker) startActiveSessionLocked(pid int, procName, exePath, gameID, gameTitle string, meta ...*IdentifiedGame) {
	var otixMediaID, posterURL, backdropURL, overview string
	if len(meta) > 0 && meta[0] != nil {
		otixMediaID = meta[0].OtixMediaID
		posterURL = meta[0].PosterURL
		backdropURL = meta[0].BackdropURL
		overview = meta[0].Overview
	}

	running := &RunningGame{
		ID:                 gameID,
		Title:              gameTitle,
		ExePath:            exePath,
		ProcessName:        procName,
		PID:                pid,
		StartTime:          time.Now(),
		CurrentDurationSec: 0,
		FpsAvailable:       gt.fpsCollector != nil && gt.fpsCollector.IsAvailable(),
		OtixMediaID:        otixMediaID,
		PosterURL:          posterURL,
		BackdropURL:        backdropURL,
		Overview:           overview,
	}

	if gt.runningGames == nil {
		gt.runningGames = make(map[string]*RunningGame)
	}
	gt.runningGames[gameID] = running

	// When a game starts, activate it as the foreground game
	prevActive := gt.activeGameID
	gt.activeGameID = gameID
	if gt.fpsCollector != nil && running.FpsAvailable {
		_ = gt.fpsCollector.Start(pid, procName, gameID)
	}

	cb := gt.onGameStarted
	if cb != nil {
		go cb(running)
	}
	if prevActive != "" && prevActive != gameID {
		if activeCb := gt.onActiveGameChanged; activeCb != nil {
			cp := *running
			go activeCb(&cp)
		}
	}
}

func (gt *GameTracker) stopSingleSessionLocked(game *RunningGame) {
	delete(gt.runningGames, game.ID)

	wasActive := gt.activeGameID == game.ID
	if wasActive {
		gt.activeGameID = ""
	}

	var stats *FpsStatsData
	if wasActive && gt.fpsCollector != nil {
		stats = gt.fpsCollector.Stop()
	}

	// If other games are still running, activate the newest remaining game!
	var nextActive *RunningGame
	if len(gt.runningGames) > 0 {
		for _, g := range gt.runningGames {
			if nextActive == nil || g.StartTime.After(nextActive.StartTime) {
				nextActive = g
			}
		}
		if nextActive != nil {
			gt.activeGameID = nextActive.ID
			if gt.fpsCollector != nil && nextActive.FpsAvailable {
				_ = gt.fpsCollector.Start(nextActive.PID, nextActive.ProcessName, nextActive.ID)
			}
			cbActive := gt.onActiveGameChanged
			if cbActive != nil {
				cp := *nextActive
				go cbActive(&cp)
			}
		}
	} else if !wasActive && gt.fpsCollector != nil {
		_ = gt.fpsCollector.Stop()
	}

	hw := hardware.GetMachineHardware(false)
	var hwSummary *SessionHardwareSummary
	if hw != nil {
		gpuName := ""
		isDiscrete := false
		for _, g := range hw.GPUs {
			if g.IsDiscrete || (gpuName == "" && g.Name != "") {
				gpuName = g.Name
				isDiscrete = g.IsDiscrete
				if g.IsDiscrete {
					break
				}
			}
		}
		hwSummary = &SessionHardwareSummary{
			CPU:         hw.CPU.ModelName,
			GPU:         gpuName,
			RAMBytes:    hw.Memory.TotalBytes,
			OS:          hw.OS.Name,
			DiscreteGPU: isDiscrete,
		}
	}

	nodeName := gt.nodeName
	if nodeName == "" {
		nodeName, _ = os.Hostname()
	}
	port := gt.nodePort
	if port <= 0 {
		port = 8090
	}

	session := &PlaySession{
		GameID:          game.ID,
		GameTitle:       game.Title,
		ProcessName:     game.ProcessName,
		StartTime:       game.StartTime.Format(time.RFC3339),
		EndTime:         time.Now().Format(time.RFC3339),
		DurationSeconds: int(time.Since(game.StartTime).Seconds()),
		FpsStats:        stats,
		Node: &SessionNodeSummary{
			Name:      nodeName,
			URL:       fmt.Sprintf("http://127.0.0.1:%d", port),
			Installed: true,
			Running:   true,
		},
		Hardware:      hwSummary,
		ShareEligible: true,
	}

	_ = gt.store.RecordSession(*session)

	cb := gt.onGameStopped
	if cb != nil {
		go cb(session)
	}
}

func (gt *GameTracker) stopActiveSessionLocked(gameIDs ...string) {
	if len(gt.runningGames) == 0 {
		return
	}
	if len(gameIDs) > 0 && gameIDs[0] != "" {
		if game, ok := gt.runningGames[gameIDs[0]]; ok {
			gt.stopSingleSessionLocked(game)
		}
		return
	}

	toStop := make([]*RunningGame, 0, len(gt.runningGames))
	for _, g := range gt.runningGames {
		toStop = append(toStop, g)
	}
	for _, g := range toStop {
		gt.stopSingleSessionLocked(g)
	}
}

// GetActiveGame returns the currently active (foreground/focused) game session, or nil if none is running.
func (gt *GameTracker) GetActiveGame() *RunningGame {
	gt.mu.RLock()
	defer gt.mu.RUnlock()
	if len(gt.runningGames) == 0 {
		return nil
	}

	var active *RunningGame
	if gt.activeGameID != "" {
		active = gt.runningGames[gt.activeGameID]
	}
	if active == nil {
		for _, g := range gt.runningGames {
			if active == nil || g.StartTime.After(active.StartTime) {
				active = g
			}
		}
	}
	if active == nil {
		return nil
	}
	cp := *active
	if gt.fpsCollector != nil {
		snap := gt.fpsCollector.GetSnapshot()
		if snap != nil && (snap.GameID == active.ID || snap.GameID == "") {
			cp.FpsSnapshot = snap
		}
	}
	return &cp
}

// GetRunningGame returns the active running game session, or nil if none is running.
func (gt *GameTracker) GetRunningGame() *RunningGame {
	return gt.GetActiveGame()
}

// GetRunningGames returns all currently active game sessions with the active game first,
// followed by remaining games sorted by start time (newest first).
func (gt *GameTracker) GetRunningGames() []*RunningGame {
	gt.mu.RLock()
	defer gt.mu.RUnlock()
	if len(gt.runningGames) == 0 {
		return []*RunningGame{}
	}

	var active *RunningGame
	if gt.activeGameID != "" {
		active = gt.runningGames[gt.activeGameID]
	}

	others := make([]*RunningGame, 0, len(gt.runningGames))
	for id, g := range gt.runningGames {
		if active != nil && id == active.ID {
			continue
		}
		cp := *g
		cp.FpsSnapshot = nil
		others = append(others, &cp)
	}

	sort.Slice(others, func(i, j int) bool {
		return others[i].StartTime.After(others[j].StartTime)
	})

	list := make([]*RunningGame, 0, len(gt.runningGames))
	if active != nil {
		cp := *active
		if gt.fpsCollector != nil {
			snap := gt.fpsCollector.GetSnapshot()
			if snap != nil && (snap.GameID == active.ID || snap.GameID == "") {
				cp.FpsSnapshot = snap
			}
		}
		list = append(list, &cp)
	}
	list = append(list, others...)
	return list
}

// Launch programmatically spawns a game executable and immediately starts tracking it.
func (gt *GameTracker) Launch(exePath string, args []string, gameID, title string) (*RunningGame, error) {
	gt.mu.Lock()
	defer gt.mu.Unlock()

	procName := filepath.Base(exePath)
	if gameID == "" {
		gameID = strings.TrimSuffix(procName, filepath.Ext(procName))
	}
	if title == "" {
		title = gameID
	}

	if existing, ok := gt.runningGames[gameID]; ok {
		gt.stopActiveSessionLocked(existing.ID)
	}

	cmd := exec.Command(exePath, args...)
	cmd.Dir = filepath.Dir(exePath)
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to launch %s: %w", exePath, err)
	}

	pid := cmd.Process.Pid
	gt.startActiveSessionLocked(pid, procName, exePath, gameID, title)

	// Detach child process so it survives tracker restart
	go func() {
		_ = cmd.Wait()
		gt.mu.Lock()
		if g, ok := gt.runningGames[gameID]; ok && g.PID == pid {
			gt.stopActiveSessionLocked(gameID)
		}
		gt.mu.Unlock()
	}()

	return gt.runningGames[gameID], nil
}

// StopTracking forcefully stops monitoring the active game.
func (gt *GameTracker) StopTracking(gameID string) {
	gt.mu.Lock()
	defer gt.mu.Unlock()

	if gameID != "" {
		gt.stopActiveSessionLocked(gameID)
	} else {
		gt.stopActiveSessionLocked()
	}
}

// ListProcesses returns the currently running OS processes.
func ListProcesses() ([]ProcessInfo, error) {
	return listProcessesOS()
}
