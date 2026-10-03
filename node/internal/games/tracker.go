package games

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
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
	running      *RunningGame
	stopChan     chan struct{}
	nodeName     string
	nodePort     int

	onGameStarted func(game *RunningGame)
	onGameStopped func(session *PlaySession)
}

// NewGameTracker creates a GameTracker instance.
func NewGameTracker(store *SessionStore, fpsCollector FpsCollector, idx *indexer.StorageIndexer) *GameTracker {
	return &GameTracker{
		store:        store,
		fpsCollector: fpsCollector,
		indexer:      idx,
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

// Start begins periodic process scanning (every 3 seconds).
func (gt *GameTracker) Start() {
	go gt.scanLoop()
}

// Stop terminates background scanning and stops active tracking cleanly.
func (gt *GameTracker) Stop() {
	close(gt.stopChan)
	gt.mu.Lock()
	if gt.running != nil {
		gt.stopActiveSessionLocked()
	}
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

func (gt *GameTracker) scanStep() {
	procs, err := ListProcesses()
	if err != nil {
		return
	}

	gt.mu.Lock()
	defer gt.mu.Unlock()

	// If currently tracking a game, verify it is still alive
	if gt.running != nil {
		stillAlive := false
		for _, p := range procs {
			if p.PID == gt.running.PID && strings.EqualFold(p.Name, gt.running.ProcessName) {
				stillAlive = true
				break
			}
		}

		if stillAlive {
			gt.running.CurrentDurationSec = int(time.Since(gt.running.StartTime).Seconds())
			if gt.fpsCollector != nil {
				gt.running.FpsSnapshot = gt.fpsCollector.GetSnapshot()
			}
			return
		}

		// Game has exited!
		gt.stopActiveSessionLocked()
	}

	// No active game running: scan processes to detect one
	for _, p := range procs {
		gameID, gameTitle := gt.identifyGame(p.Name)
		if gameID != "" {
			gt.startActiveSessionLocked(p.PID, p.Name, p.Path, gameID, gameTitle)
			break
		}
	}
}

func (gt *GameTracker) identifyGame(processName string) (string, string) {
	lower := strings.ToLower(processName)
	if NoiseProcesses[lower] {
		return "", ""
	}

	// 1. Check custom mappings
	if m := gt.store.GetMappingForProcess(lower); m != nil {
		return m.GameID, m.GameTitle
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
					title = f.GameTitle
				}
				if title == "" {
					title = strings.TrimSuffix(f.Filename, filepath.Ext(f.Filename))
				}
				return id, title
			}
		}
	}

	// 3. Check known popular game executable signatures
	if title, ok := KnownGameSignatures[lower]; ok {
		slug := strings.ToLower(strings.ReplaceAll(title, " ", "-"))
		return slug, title
	}

	return "", ""
}

func (gt *GameTracker) startActiveSessionLocked(pid int, procName, exePath, gameID, gameTitle string) {
	running := &RunningGame{
		ID:                 gameID,
		Title:              gameTitle,
		ExePath:            exePath,
		ProcessName:        procName,
		PID:                pid,
		StartTime:          time.Now(),
		CurrentDurationSec: 0,
		FpsAvailable:       gt.fpsCollector != nil && gt.fpsCollector.IsAvailable(),
	}

	gt.running = running

	if gt.fpsCollector != nil && running.FpsAvailable {
		_ = gt.fpsCollector.Start(pid, procName, gameID)
	}

	cb := gt.onGameStarted
	if cb != nil {
		go cb(running)
	}
}

func (gt *GameTracker) stopActiveSessionLocked() {
	if gt.running == nil {
		return
	}

	game := gt.running
	gt.running = nil

	var stats *FpsStatsData
	if gt.fpsCollector != nil {
		stats = gt.fpsCollector.Stop()
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

// GetRunningGame returns the currently active game session, or nil if none is running.
func (gt *GameTracker) GetRunningGame() *RunningGame {
	gt.mu.RLock()
	defer gt.mu.RUnlock()
	if gt.running == nil {
		return nil
	}
	cp := *gt.running
	if gt.fpsCollector != nil {
		cp.FpsSnapshot = gt.fpsCollector.GetSnapshot()
	}
	return &cp
}

// Launch programmatically spawns a game executable and immediately starts tracking it.
func (gt *GameTracker) Launch(exePath string, args []string, gameID, title string) (*RunningGame, error) {
	gt.mu.Lock()
	defer gt.mu.Unlock()

	if gt.running != nil {
		gt.stopActiveSessionLocked()
	}

	cmd := exec.Command(exePath, args...)
	cmd.Dir = filepath.Dir(exePath)
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to launch %s: %w", exePath, err)
	}

	pid := cmd.Process.Pid
	procName := filepath.Base(exePath)

	if gameID == "" {
		gameID = strings.TrimSuffix(procName, filepath.Ext(procName))
	}
	if title == "" {
		title = gameID
	}

	gt.startActiveSessionLocked(pid, procName, exePath, gameID, title)

	// Detach child process so it survives tracker restart
	go func() {
		_ = cmd.Wait()
		gt.mu.Lock()
		if gt.running != nil && gt.running.PID == pid {
			gt.stopActiveSessionLocked()
		}
		gt.mu.Unlock()
	}()

	return gt.running, nil
}

// StopTracking forcefully stops monitoring the active game.
func (gt *GameTracker) StopTracking(gameID string) {
	gt.mu.Lock()
	defer gt.mu.Unlock()

	if gt.running != nil && (gameID == "" || gt.running.ID == gameID) {
		gt.stopActiveSessionLocked()
	}
}

// ListProcesses returns the currently running OS processes.
func ListProcesses() ([]ProcessInfo, error) {
	if runtime.GOOS == "windows" {
		return listProcessesWindows()
	}
	return listProcessesUnix()
}

func listProcessesWindows() ([]ProcessInfo, error) {
	cmd := exec.Command("tasklist", "/fo", "csv", "/nh")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return nil, err
	}

	reader := csv.NewReader(&out)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	result := make([]ProcessInfo, 0, len(records))
	seen := make(map[int]bool)

	for _, rec := range records {
		if len(rec) < 2 {
			continue
		}
		name := strings.TrimSpace(rec[0])
		pid, err := strconv.Atoi(strings.TrimSpace(rec[1]))
		if err != nil || pid <= 0 || seen[pid] {
			continue
		}
		seen[pid] = true
		result = append(result, ProcessInfo{
			PID:  pid,
			Name: name,
		})
	}

	return result, nil
}

func listProcessesUnix() ([]ProcessInfo, error) {
	cmd := exec.Command("ps", "-eo", "pid,comm")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return nil, err
	}

	lines := strings.Split(out.String(), "\n")
	result := make([]ProcessInfo, 0, len(lines))

	for _, line := range lines {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) < 2 {
			continue
		}
		pid, err := strconv.Atoi(fields[0])
		if err != nil || pid <= 0 {
			continue
		}
		name := filepath.Base(fields[1])
		result = append(result, ProcessInfo{
			PID:  pid,
			Name: name,
			Path: fields[1],
		})
	}

	return result, nil
}
