package games

import (
	"bufio"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	MaxStoredFrames = 36000 // ~10 minutes at 60 FPS
	SlidingWindowMs = 1000  // 1-second window for instantaneous live FPS
	BroadcastTickMs = 500   // Emit live FPS snapshot every 500ms
)

// FrameSample captures an individual frame timing sample along with state context.
type FrameSample struct {
	MsBetweenPresents float64 `json:"ms"`
	TimestampMs       int64   `json:"ts"`
	IsBackground      bool    `json:"is_bg"`
	IsLobby           bool    `json:"is_lobby,omitempty"`
}

// FilterResult holds the categorized and filtered frame streams for benchmark calculations.
type FilterResult struct {
	GameplayFrames      []float64
	TotalFrames         int64
	GameplayFramesCount int64
	DurationSeconds     int
	GameplaySeconds     int
	LoadingSeconds      int
	BackgroundSeconds   int
	LobbySeconds        int
	UnfilteredAvgFPS    float64
}

// FpsCollector manages live frame capture and statistics for a game process.
type FpsCollector interface {
	Start(pid int, processName string, gameID string) error
	Stop() *FpsStatsData
	StopGame(gameID string) *FpsStatsData
	GetSnapshot() *LiveFpsSnapshot
	GetSnapshotForGame(gameID string) *LiveFpsSnapshot
	IsAvailable() bool
	IsPermissionDenied() bool
	Subscribe() <-chan LiveFpsSnapshot
	Unsubscribe(ch <-chan LiveFpsSnapshot)
}

// ProcessFrameBuffer holds frame samples and metrics for a specific running game process.
type ProcessFrameBuffer struct {
	PID                 int
	ProcessName         string
	GameID              string
	StartTime           time.Time
	Samples             []FrameSample
	FrameTimes          []float64
	LatestSnapshot      *LiveFpsSnapshot
	LastForegroundCheck time.Time
	CachedForeground    bool
}

// PresentMonCollector captures frame timing using Intel PresentMon.
type PresentMonCollector struct {
	mu           sync.RWMutex
	customBinDir string
	cmd          *exec.Cmd
	serviceBody  io.ReadCloser // active HTTP stream from OtixCapture service (Zero Reboot)
	usingService bool          // true when streaming from background service
	stdinPipe    io.WriteCloser
	isRunning    bool
	targetPID    int
	processName  string
	gameID       string
	startTime    time.Time

	// Multi-process frame buffers keyed by PID and gameID
	buffers   map[int]*ProcessFrameBuffer
	gameToPID map[string]int

	// Error & permission tracking
	permissionDenied bool
	lastError        string

	// Live snapshot cache
	latestSnapshot *LiveFpsSnapshot

	// Broadcast channels
	subscribers map[chan LiveFpsSnapshot]struct{}
	stopChan    chan struct{}
}

// NewPresentMonCollector creates a collector instance.
func NewPresentMonCollector(customBinDir string) *PresentMonCollector {
	return &PresentMonCollector{
		customBinDir: customBinDir,
		buffers:      make(map[int]*ProcessFrameBuffer),
		gameToPID:    make(map[string]int),
		subscribers:  make(map[chan LiveFpsSnapshot]struct{}),
	}
}

// FindPresentMon attempts to locate PresentMon.exe in common locations.
func (c *PresentMonCollector) FindPresentMon() string {
	candidates := []string{}

	if c.customBinDir != "" {
		candidates = append(candidates,
			filepath.Join(c.customBinDir, "PresentMon.exe"),
			filepath.Join(c.customBinDir, "bin", "PresentMon.exe"),
		)
	}

	// 1. Next to the running executable (e.g. desktop/bin/otix-node.exe -> desktop/bin/PresentMon.exe)
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		candidates = append(candidates,
			filepath.Join(exeDir, "PresentMon.exe"),
			filepath.Join(exeDir, "bin", "PresentMon.exe"),
			filepath.Join(exeDir, "..", "bin", "PresentMon.exe"),
			filepath.Join(exeDir, "..", "resources", "bin", "PresentMon.exe"),
		)
	}

	// 2. Relative to current working directory
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(cwd, "PresentMon.exe"),
			filepath.Join(cwd, "bin", "PresentMon.exe"),
			filepath.Join(cwd, "desktop", "bin", "PresentMon.exe"),
			filepath.Join(cwd, "..", "desktop", "bin", "PresentMon.exe"),
			filepath.Join(cwd, "..", "..", "desktop", "bin", "PresentMon.exe"),
			filepath.Join(cwd, "dist", "desktop", "win-unpacked", "resources", "bin", "PresentMon.exe"),
			filepath.Join(cwd, "storage", "bin", "PresentMon.exe"),
		)
	}

	// Standard workspace & relative locations
	candidates = append(candidates,
		"bin/PresentMon.exe",
		"../bin/PresentMon.exe",
		"./storage/bin/PresentMon.exe",
		"desktop/bin/PresentMon.exe",
		"../desktop/bin/PresentMon.exe",
		"../../desktop/bin/PresentMon.exe",
	)

	// User Data & AppData paths
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		candidates = append(candidates,
			filepath.Join(localAppData, "Otix", "bin", "PresentMon.exe"),
			filepath.Join(localAppData, "Otix", "storage", "bin", "PresentMon.exe"),
			filepath.Join(localAppData, "Programs", "Otix", "resources", "bin", "PresentMon.exe"),
			filepath.Join(localAppData, "PresentMon", "PresentMon.exe"),
		)
	}
	if appData := os.Getenv("APPDATA"); appData != "" {
		candidates = append(candidates,
			filepath.Join(appData, "Otix", "bin", "PresentMon.exe"),
			filepath.Join(appData, "Otix", "PresentMon", "PresentMon.exe"),
		)
	}

	// Windows standard directories
	if progFiles := os.Getenv("ProgramFiles"); progFiles != "" {
		candidates = append(candidates,
			filepath.Join(progFiles, "Otix", "resources", "bin", "PresentMon.exe"),
			filepath.Join(progFiles, "PresentMon", "PresentMon.exe"),
			filepath.Join(progFiles, "Intel", "PresentMon", "PresentMon.exe"),
			filepath.Join(progFiles, "NVIDIA Corporation", "FrameViewSDK", "PresentMon.exe"),
		)
	}
	if progFilesX86 := os.Getenv("ProgramFiles(x86)"); progFilesX86 != "" {
		candidates = append(candidates,
			filepath.Join(progFilesX86, "Intel", "PresentMon", "PresentMon.exe"),
		)
	}

	for _, p := range candidates {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			abs, errAbs := filepath.Abs(p)
			if errAbs == nil {
				return abs
			}
			return p
		}
	}

	// Search PATH
	if pathExe, err := exec.LookPath("PresentMon.exe"); err == nil {
		return pathExe
	}
	if pathExe, err := exec.LookPath("PresentMon"); err == nil {
		return pathExe
	}

	return ""
}

func (c *PresentMonCollector) IsAvailable() bool {
	return c.FindPresentMon() != ""
}

func (c *PresentMonCollector) IsPermissionDenied() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.permissionDenied
}

func (c *PresentMonCollector) Start(pid int, processName string, gameID string) error {
	c.mu.Lock()
	if c.buffers == nil {
		c.buffers = make(map[int]*ProcessFrameBuffer)
	}
	if c.gameToPID == nil {
		c.gameToPID = make(map[string]int)
	}

	c.targetPID = pid
	c.processName = processName
	c.gameID = gameID

	now := time.Now()

	// Register or update process frame buffer for this game PID
	buf, exists := c.buffers[pid]
	if !exists {
		buf = &ProcessFrameBuffer{
			PID:                 pid,
			ProcessName:         processName,
			GameID:              gameID,
			StartTime:           now,
			Samples:             make([]FrameSample, 0, 1000),
			FrameTimes:          make([]float64, 0, 1000),
			LastForegroundCheck: now,
			CachedForeground:    isProcessInForeground(pid),
			LatestSnapshot: &LiveFpsSnapshot{
				GameID:    gameID,
				Timestamp: now.UnixMilli(),
			},
		}
		c.buffers[pid] = buf
		c.gameToPID[gameID] = pid
	} else {
		buf.GameID = gameID
		buf.ProcessName = processName
		c.gameToPID[gameID] = pid
	}

	c.latestSnapshot = buf.LatestSnapshot

	// If capture is already active:
	if c.isRunning {
		if c.targetPID == pid {
			c.mu.Unlock()
			return nil
		}
		// Active game has switched to another PID. Retarget the capture stream.
		c.targetPID = pid
		c.processName = processName
		c.gameID = gameID

		if c.serviceBody != nil {
			_ = c.serviceBody.Close()
			c.serviceBody = nil
		}
		if c.cmd != nil && c.cmd.Process != nil {
			_ = c.cmd.Process.Kill()
			_ = c.cmd.Wait()
			c.cmd = nil
		}

		if IsCaptureServiceAvailable() {
			stream, err := StartServiceStream(pid, processName)
			if err == nil {
				c.serviceBody = stream
				c.usingService = true
				c.mu.Unlock()
				go c.readCsvStream(stream)
				return nil
			}
		}

		exe := c.FindPresentMon()
		if exe != "" {
			cleanupInterferingEtwSessions()
			args := []string{
				"--output_stdout",
				"--session_name", "OtixPresentMon",
				"--stop_existing_session",
				"--no_console_stats",
				"--process_id", strconv.Itoa(pid),
			}
			if processName != "" && strings.HasSuffix(strings.ToLower(processName), ".exe") {
				args = append(args, "--process_name", processName)
			}
			cmd := exec.Command(exe, args...)
			configureCmdForProcess(cmd)
			stdout, err := cmd.StdoutPipe()
			if err == nil {
				if err := cmd.Start(); err == nil {
					c.cmd = cmd
					c.usingService = false
					c.mu.Unlock()
					go c.readCsvStream(stdout)
					return nil
				}
			}
		}

		c.mu.Unlock()
		return nil
	}

	c.targetPID = pid
	c.processName = processName
	c.gameID = gameID
	c.permissionDenied = false
	c.lastError = ""

	// 1. Try Zero-Reboot OtixCapture background service first (LocalSystem token)
	if IsCaptureServiceAvailable() {
		stream, err := StartServiceStream(pid, processName)
		if err == nil {
			c.serviceBody = stream
			c.usingService = true
			c.cmd = nil
			c.isRunning = true
			c.startTime = now
			c.stopChan = make(chan struct{})
			c.mu.Unlock()

			// Parse CSV in background from service HTTP stream
			go c.readCsvStream(stream)
			// Start ticker for live snapshot updates and subscriber emission
			go c.tickerLoop()
			return nil
		}
		fmt.Printf("[PresentMon] Service stream failed (%v); falling back to direct process execution\n", err)
	}

	// 2. Fallback to direct process execution (requires Performance Log Users token or elevation)
	exe := c.FindPresentMon()
	if exe == "" {
		c.mu.Unlock()
		return fmt.Errorf("PresentMon executable not found")
	}

	// Clean up any stale or interfering ETW trace sessions before starting
	cleanupInterferingEtwSessions()

	args := []string{
		"--output_stdout",
		"--session_name", "OtixPresentMon",
		"--stop_existing_session",
		"--no_console_stats",
	}
	if len(c.buffers) == 1 && pid > 0 {
		args = append(args, "--process_id", strconv.Itoa(pid))
		if processName != "" && strings.HasSuffix(strings.ToLower(processName), ".exe") {
			args = append(args, "--process_name", processName)
		}
	}

	cmd := exec.Command(exe, args...)
	configureCmdForProcess(cmd)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		c.mu.Unlock()
		return fmt.Errorf("failed to open PresentMon stdout: %w", err)
	}
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		c.mu.Unlock()
		return fmt.Errorf("failed to start PresentMon: %w", err)
	}

	c.cmd = cmd
	c.usingService = false
	c.isRunning = true
	c.startTime = now
	c.stopChan = make(chan struct{})
	c.mu.Unlock()

	// Read stderr to catch permission denied or errors
	if stderr != nil {
		go c.readStderr(stderr)
	}

	// Parse CSV in background
	go c.readCsvStream(stdout)
	// Start ticker for live snapshot updates and subscriber emission
	go c.tickerLoop()

	return nil
}


func (c *PresentMonCollector) readStderr(r io.Reader) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		low := strings.ToLower(line)
		if strings.Contains(low, "access denied") || strings.Contains(low, "performance log users") || strings.Contains(low, "elevated privilege") {
			c.mu.Lock()
			c.permissionDenied = true
			c.lastError = line
			if c.latestSnapshot != nil {
				c.latestSnapshot.PermissionDenied = true
				c.latestSnapshot.Status = "permission_denied"
			}
			c.mu.Unlock()
			fmt.Printf("[PresentMon] Performance capture permission required: %s\n", line)
		} else if strings.Contains(low, "error:") {
			c.mu.Lock()
			c.lastError = line
			c.mu.Unlock()
			fmt.Printf("[PresentMon] %s\n", line)
		}
	}
}


func (c *PresentMonCollector) checkBufferForeground(buf *ProcessFrameBuffer, now time.Time) bool {
	if buf.PID <= 0 {
		return true
	}
	if now.Sub(buf.LastForegroundCheck) > 200*time.Millisecond {
		buf.CachedForeground = isProcessInForeground(buf.PID)
		buf.LastForegroundCheck = now
	}
	return buf.CachedForeground
}

func (c *PresentMonCollector) checkForeground(now time.Time) bool {
	if c.targetPID <= 0 {
		return true
	}
	if buf, ok := c.buffers[c.targetPID]; ok && buf != nil {
		return c.checkBufferForeground(buf, now)
	}
	return isProcessInForeground(c.targetPID)
}

func (c *PresentMonCollector) readCsvStream(r io.Reader) {
	scanner := bufio.NewScanner(r)
	var colMap map[string]int
	headerParsed := false

	for scanner.Scan() {
		raw := scanner.Text()
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}

		// Strip UTF-8 BOM if present
		line = strings.TrimPrefix(line, "\ufeff")
		// Remove null bytes if any
		line = strings.ReplaceAll(line, "\x00", "")

		if !headerParsed {
			lower := strings.ToLower(line)
			if strings.Contains(lower, "application") || strings.Contains(lower, "processid") || strings.Contains(lower, "msbetweenpresents") {
				cols := strings.Split(line, ",")
				colMap = make(map[string]int, len(cols))
				for i, col := range cols {
					colMap[strings.ToLower(strings.TrimSpace(col))] = i
				}
				headerParsed = true
			}
			continue
		}

		pid, ft := parseProcessIdAndFrameTime(line, colMap)
		if ft > 0 {
			now := time.Now()
			c.mu.Lock()
			if c.isRunning {
				var buf *ProcessFrameBuffer
				if pid > 0 {
					buf = c.buffers[pid]
				}
				if buf == nil && len(c.buffers) == 1 {
					for _, b := range c.buffers {
						if b.PID == 0 || b.PID == pid {
							buf = b
						}
						break
					}
				}

				if buf != nil {
					isBg := !c.checkBufferForeground(buf, now)
					sample := FrameSample{
						MsBetweenPresents: ft,
						TimestampMs:       now.UnixMilli(),
						IsBackground:      isBg,
					}
					buf.Samples = append(buf.Samples, sample)
					buf.FrameTimes = append(buf.FrameTimes, ft)
					if len(buf.Samples) > MaxStoredFrames {
						buf.Samples = buf.Samples[len(buf.Samples)-MaxStoredFrames:]
						buf.FrameTimes = buf.FrameTimes[len(buf.FrameTimes)-MaxStoredFrames:]
					}
				}
			}
			c.mu.Unlock()
		}
	}

	c.mu.Lock()
	c.isRunning = false
	c.mu.Unlock()
}

// parseProcessIdAndFrameTime extracts both process ID and msBetweenPresents from a CSV line.
func parseProcessIdAndFrameTime(line string, colMap map[string]int) (int, float64) {
	if colMap == nil {
		return 0, 0
	}
	cols := strings.Split(line, ",")
	pid := 0
	pidCols := []string{"processid", "pid", "process_id"}
	for _, name := range pidCols {
		if pidIdx, ok := colMap[name]; ok && pidIdx < len(cols) {
			if parsed, err := strconv.Atoi(strings.TrimSpace(cols[pidIdx])); err == nil {
				pid = parsed
			}
			break
		}
	}

	msCols := []string{"msbetweenpresents", "ms_between_presents", "frametime", "msbetweendisplaychange"}
	var msIdx int = -1
	for _, name := range msCols {
		if idx, ok := colMap[name]; ok && idx < len(cols) {
			msIdx = idx
			break
		}
	}

	if msIdx < 0 || msIdx >= len(cols) {
		return pid, 0
	}

	val, err := strconv.ParseFloat(strings.TrimSpace(cols[msIdx]), 64)
	if err != nil || val <= 0 || val > 5000 {
		return pid, 0
	}
	return pid, val
}

// parseFrameTime extracts msBetweenPresents for the matching PID.
func parseFrameTime(line string, colMap map[string]int, targetPID int) float64 {
	pid, ft := parseProcessIdAndFrameTime(line, colMap)
	if targetPID > 0 && pid > 0 && pid != targetPID {
		return 0
	}
	return ft
}

func (c *PresentMonCollector) tickerLoop() {
	ticker := time.NewTicker(BroadcastTickMs * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-c.stopChan:
			return
		case <-ticker.C:
			c.mu.Lock()
			permDenied := c.permissionDenied
			now := time.Now()

			var activeSnap *LiveFpsSnapshot
			allSnaps := make([]LiveFpsSnapshot, 0, len(c.buffers))

			for pid, buf := range c.buffers {
				snap := computeLiveSnapshotForBuffer(buf, now, permDenied)
				if snap != nil {
					buf.LatestSnapshot = snap
					allSnaps = append(allSnaps, *snap)
					if pid == c.targetPID || buf.GameID == c.gameID {
						activeSnap = snap
					}
				}
			}

			if activeSnap == nil && len(allSnaps) > 0 {
				activeSnap = &allSnaps[0]
			}
			c.latestSnapshot = activeSnap

			subs := make([]chan LiveFpsSnapshot, 0, len(c.subscribers))
			for ch := range c.subscribers {
				subs = append(subs, ch)
			}
			c.mu.Unlock()

			// Broadcast all game snapshots to subscribers
			for _, snap := range allSnaps {
				for _, ch := range subs {
					select {
					case ch <- snap:
					default:
					}
				}
			}
		}
	}
}

func computeLiveSnapshotForBuffer(buf *ProcessFrameBuffer, now time.Time, permDenied bool) *LiveFpsSnapshot {
	gameID := buf.GameID
	n := len(buf.Samples)
	if n == 0 {
		if permDenied {
			return &LiveFpsSnapshot{
				GameID:           gameID,
				FPS:              0,
				Timestamp:        now.UnixMilli(),
				PermissionDenied: true,
				Status:           "permission_denied",
			}
		}
		return nil
	}

	lastSample := buf.Samples[n-1]
	isBg := lastSample.IsBackground || !buf.CachedForeground

	// Sliding 1000ms window from end
	var windowSum float64
	var windowCount int
	for i := n - 1; i >= 0; i-- {
		windowSum += buf.Samples[i].MsBetweenPresents
		windowCount++
		if windowSum >= SlidingWindowMs {
			break
		}
	}

	var liveFps float64
	if windowSum > 0 && windowCount > 0 {
		liveFps = math.Round((float64(windowCount)/windowSum)*10000) / 10
	}

	// Detect if currently loading (hard stall or sustained low FPS under window)
	isLoading := (lastSample.MsBetweenPresents >= 200.0) || (windowSum >= 800.0 && liveFps < 15.0)

	// Rolling stats over up to 300 recent frames (~5 sec) for min/max/percentiles
	sampleLen := 300
	if n < sampleLen {
		sampleLen = n
	}
	recentSlice := make([]FrameSample, sampleLen)
	copy(recentSlice, buf.Samples[n-sampleLen:])

	var cleanFpsVals []float64
	var sumFps float64
	for _, s := range recentSlice {
		if s.IsBackground || s.MsBetweenPresents >= 200.0 {
			continue
		}
		f := 1000.0 / s.MsBetweenPresents
		cleanFpsVals = append(cleanFpsVals, f)
		sumFps += f
	}

	// Fallback if all recent frames are filtered
	if len(cleanFpsVals) == 0 {
		for _, s := range recentSlice {
			f := 1000.0 / s.MsBetweenPresents
			cleanFpsVals = append(cleanFpsVals, f)
			sumFps += f
		}
	}

	sort.Float64s(cleanFpsVals)
	cn := len(cleanFpsVals)

	avgFps := math.Round((sumFps/float64(cn))*10) / 10
	minFps := math.Round(cleanFpsVals[0]*10) / 10
	maxFps := math.Round(cleanFpsVals[cn-1]*10) / 10

	// 1% low
	onePctCount := int(math.Max(1, math.Floor(float64(cn)*0.01)))
	var onePctSum float64
	for i := 0; i < onePctCount; i++ {
		onePctSum += cleanFpsVals[i]
	}
	low1 := math.Round((onePctSum/float64(onePctCount))*10) / 10

	// 0.1% low
	dotOnePctCount := int(math.Max(1, math.Floor(float64(cn)*0.001)))
	var dotOneSum float64
	for i := 0; i < dotOnePctCount; i++ {
		dotOneSum += cleanFpsVals[i]
	}
	low01 := math.Round((dotOneSum/float64(dotOnePctCount))*10) / 10

	return &LiveFpsSnapshot{
		GameID:           gameID,
		FPS:              liveFps,
		AvgFPS:           avgFps,
		MinFPS:           minFps,
		MaxFPS:           maxFps,
		Low1Percent:      low1,
		Low01Percent:     low01,
		FrameCount:       int64(n),
		SampleCount:      windowCount,
		Timestamp:        now.UnixMilli(),
		IsLoading:        isLoading,
		IsBackground:     isBg,
		PermissionDenied: permDenied,
	}
}

func (c *PresentMonCollector) computeLiveSnapshot() *LiveFpsSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if buf, ok := c.buffers[c.targetPID]; ok && buf != nil {
		return computeLiveSnapshotForBuffer(buf, time.Now(), c.permissionDenied)
	}
	for _, buf := range c.buffers {
		if buf != nil {
			return computeLiveSnapshotForBuffer(buf, time.Now(), c.permissionDenied)
		}
	}
	return nil
}

func (c *PresentMonCollector) GetSnapshot() *LiveFpsSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.latestSnapshot
}

func (c *PresentMonCollector) GetSnapshotForGame(gameID string) *LiveFpsSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if pid, ok := c.gameToPID[gameID]; ok {
		if buf, exists := c.buffers[pid]; exists && buf.LatestSnapshot != nil {
			return buf.LatestSnapshot
		}
	}
	for _, b := range c.buffers {
		if b.GameID == gameID && b.LatestSnapshot != nil {
			return b.LatestSnapshot
		}
	}
	if c.latestSnapshot != nil && c.latestSnapshot.GameID == gameID {
		return c.latestSnapshot
	}
	return nil
}

func (c *PresentMonCollector) StopGame(gameID string) *FpsStatsData {
	c.mu.Lock()
	var targetPID int
	var found bool
	if pid, ok := c.gameToPID[gameID]; ok {
		targetPID = pid
		found = true
	} else {
		for p, b := range c.buffers {
			if b.GameID == gameID {
				targetPID = p
				found = true
				break
			}
		}
	}

	if !found {
		c.mu.Unlock()
		return nil
	}

	buf := c.buffers[targetPID]
	delete(c.buffers, targetPID)
	delete(c.gameToPID, gameID)

	var stats *FpsStatsData
	if buf != nil {
		duration := int(time.Since(buf.StartTime).Seconds())
		stats = ComputeFinalStatsFromSamples(buf.Samples, duration, buf.StartTime)
	}

	if len(c.buffers) == 0 {
		c.mu.Unlock()
		c.Stop()
		return stats
	}

	for remPID, remBuf := range c.buffers {
		c.targetPID = remPID
		c.gameID = remBuf.GameID
		c.processName = remBuf.ProcessName
		c.latestSnapshot = remBuf.LatestSnapshot
		break
	}
	c.mu.Unlock()
	return stats
}

func (c *PresentMonCollector) Stop() *FpsStatsData {
	c.mu.Lock()
	if !c.isRunning && c.cmd == nil && c.serviceBody == nil {
		c.mu.Unlock()
		return nil
	}

	if c.stopChan != nil {
		select {
		case <-c.stopChan:
		default:
			close(c.stopChan)
		}
	}

	if c.serviceBody != nil {
		_ = c.serviceBody.Close()
		c.serviceBody = nil
	}
	if c.usingService {
		c.usingService = false
		go StopServiceCapture()
	}

	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
		_ = c.cmd.Wait()
		c.cmd = nil
	}
	c.isRunning = false

	var stats *FpsStatsData
	if buf, ok := c.buffers[c.targetPID]; ok && buf != nil {
		duration := int(time.Since(buf.StartTime).Seconds())
		stats = ComputeFinalStatsFromSamples(buf.Samples, duration, buf.StartTime)
	} else if len(c.buffers) > 0 {
		for _, b := range c.buffers {
			duration := int(time.Since(b.StartTime).Seconds())
			stats = ComputeFinalStatsFromSamples(b.Samples, duration, b.StartTime)
			break
		}
	}

	c.buffers = make(map[int]*ProcessFrameBuffer)
	c.gameToPID = make(map[string]int)
	c.latestSnapshot = nil
	c.mu.Unlock()

	cleanupInterferingEtwSessions()
	return stats
}

const (
	tagNone         = 0
	tagBackground   = 1 << 0
	tagLoadingStall = 1 << 1
	tagLoadingBlock = 1 << 2
	tagWarmup       = 1 << 3
	tagLobby        = 1 << 4
)

var commonMenuCaps = []float64{30, 60, 120, 144, 165, 200, 240}

// FilterFrameSamples processes frame timing history to separate pure gameplay frames
// from loading screens, asset stalls, warmup, and background / Alt-Tab throttled periods.
func FilterFrameSamples(samples []FrameSample, sessionStart time.Time, durationSeconds int) FilterResult {
	n := len(samples)
	if n == 0 {
		return FilterResult{DurationSeconds: durationSeconds}
	}

	tags := make([]byte, n)
	startMs := sessionStart.UnixMilli()
	var totalMs float64

	// 1. Tag background, warmup, explicit lobby, and hard stalls
	for i := 0; i < n; i++ {
		s := samples[i]
		totalMs += s.MsBetweenPresents
		if s.IsBackground {
			tags[i] |= tagBackground
		}
		if s.IsLobby {
			tags[i] |= tagLobby
		}
		if startMs > 0 && s.TimestampMs > 0 && (s.TimestampMs-startMs) < 4000 && s.MsBetweenPresents >= 40.0 {
			tags[i] |= tagWarmup
		}
		// Asset loading stalls: frame time >= 200ms (<= 5 FPS)
		if s.MsBetweenPresents >= 200.0 {
			tags[i] |= tagLoadingStall
		}
	}

	// 2. Tag sustained low-FPS loading screen blocks:
	// Contiguous run of frames with frame time > 40ms (< 25 FPS) spanning >= 1.0s with average < 15 FPS
	blockStart := -1
	var blockDuration float64
	for i := 0; i < n; i++ {
		if (tags[i] & tagBackground) != 0 {
			if blockStart != -1 {
				evalLoadingBlock(samples, tags, blockStart, i, blockDuration)
				blockStart = -1
				blockDuration = 0
			}
			continue
		}

		fps := 1000.0 / samples[i].MsBetweenPresents
		if fps < 25.0 {
			if blockStart == -1 {
				blockStart = i
				blockDuration = 0
			}
			blockDuration += samples[i].MsBetweenPresents
		} else {
			if blockStart != -1 {
				evalLoadingBlock(samples, tags, blockStart, i, blockDuration)
				blockStart = -1
				blockDuration = 0
			}
		}
	}
	if blockStart != -1 {
		evalLoadingBlock(samples, tags, blockStart, n, blockDuration)
	}

	// 3. Statistical lobby & menu detection for ALL games
	type winMeta struct {
		startIdx    int
		endIdx      int
		meanFps     float64
		cov         float64
		isCapLocked bool
	}

	var candidateIndices []int
	for i := 0; i < n; i++ {
		if (tags[i] & (tagBackground | tagLoadingStall | tagLoadingBlock | tagWarmup | tagLobby)) == 0 {
			candidateIndices = append(candidateIndices, i)
		}
	}

	if len(candidateIndices) >= 40 {
		var windows []winMeta
		var curIndices []int
		var curWindowMs float64

		flushWin := func() {
			if len(curIndices) >= 15 {
				var sumFps float64
				fpsVals := make([]float64, len(curIndices))
				for k, cidx := range curIndices {
					f := 1000.0 / samples[cidx].MsBetweenPresents
					fpsVals[k] = f
					sumFps += f
				}
				mean := sumFps / float64(len(fpsVals))
				var sumSq float64
				for _, f := range fpsVals {
					diff := f - mean
					sumSq += diff * diff
				}
				variance := sumSq / float64(len(fpsVals))
				stdDev := math.Sqrt(variance)
				cov := 0.0
				if mean > 0 {
					cov = stdDev / mean
				}

				isCapLocked := false
				for _, cap := range commonMenuCaps {
					if math.Abs(mean-cap)/cap <= 0.025 && cov < 0.035 {
						isCapLocked = true
						break
					}
				}

				windows = append(windows, winMeta{
					startIdx:    curIndices[0],
					endIdx:      curIndices[len(curIndices)-1],
					meanFps:     mean,
					cov:         cov,
					isCapLocked: isCapLocked,
				})
			}
			curIndices = nil
			curWindowMs = 0
		}

		for ci, idx := range candidateIndices {
			ms := samples[idx].MsBetweenPresents
			if len(curIndices) >= 15 {
				prevMs := samples[curIndices[len(curIndices)-1]].MsBetweenPresents
				minMs := math.Min(ms, prevMs)
				if minMs > 0 && math.Abs(ms-prevMs)/minMs > 0.40 {
					// Phase step change (e.g. lobby to match transition)
					flushWin()
				}
			}

			curIndices = append(curIndices, idx)
			curWindowMs += ms

			if curWindowMs >= 2500.0 || ci == len(candidateIndices)-1 {
				flushWin()
			}
		}

		if len(windows) >= 3 {
			means := make([]float64, len(windows))
			for k, w := range windows {
				means[k] = w.meanFps
			}
			sort.Float64s(means)
			p75 := means[int(math.Floor(float64(len(means))*0.75))]
			minMean := means[0]

			if p75 >= minMean*1.25 {
				lobbyTaggedCount := 0
				var lobbyWindows []winMeta
				for _, w := range windows {
					if w.meanFps <= p75*0.80 && (w.isCapLocked || w.cov < 0.06) {
						lobbyWindows = append(lobbyWindows, w)
						lobbyTaggedCount += (w.endIdx - w.startIdx + 1)
					}
				}

				if lobbyTaggedCount < int(float64(len(candidateIndices))*0.85) && (len(candidateIndices)-lobbyTaggedCount) >= 15 {
					for _, w := range lobbyWindows {
						for k := w.startIdx; k <= w.endIdx; k++ {
							if (tags[k] & (tagBackground | tagLoadingStall | tagLoadingBlock)) == 0 {
								tags[k] |= tagLobby
							}
						}
					}
				}
			}
		}
	}

	// 4. Accumulate durations and collect pure gameplay frames
	var loadingMs float64
	var bgMs float64
	var lobbyMs float64
	var gameplayFrames []float64

	for i := 0; i < n; i++ {
		s := samples[i]
		isBg := (tags[i] & tagBackground) != 0
		isLoading := (tags[i] & (tagLoadingStall | tagLoadingBlock)) != 0
		isLobby := (tags[i] & tagLobby) != 0

		if isBg {
			bgMs += s.MsBetweenPresents
		} else if isLoading {
			loadingMs += s.MsBetweenPresents
		} else if isLobby {
			lobbyMs += s.MsBetweenPresents
		} else {
			// Check if warmup frame is severe stutter (< 25 FPS)
			if (tags[i] & tagWarmup) != 0 {
				fps := 1000.0 / s.MsBetweenPresents
				if fps < 25.0 {
					continue
				}
			}
			gameplayFrames = append(gameplayFrames, s.MsBetweenPresents)
		}
	}

	loadingSec := int(math.Round(loadingMs / 1000.0))
	bgSec := int(math.Round(bgMs / 1000.0))
	lobbySec := int(math.Round(lobbyMs / 1000.0))

	// Ensure times do not exceed total wall-clock duration
	if durationSeconds > 0 {
		if bgSec > durationSeconds {
			bgSec = durationSeconds
		}
		if loadingSec > durationSeconds-bgSec {
			loadingSec = durationSeconds - bgSec
		}
		if lobbySec > durationSeconds-bgSec-loadingSec {
			lobbySec = durationSeconds - bgSec - loadingSec
		}
	}
	gameplaySec := durationSeconds - loadingSec - bgSec - lobbySec
	if gameplaySec < 0 {
		gameplaySec = 0
	}

	// Graceful fallback: if no gameplay frames survived filtering, use all non-background frames
	if len(gameplayFrames) == 0 {
		for i := 0; i < n; i++ {
			if (tags[i] & tagBackground) == 0 {
				gameplayFrames = append(gameplayFrames, samples[i].MsBetweenPresents)
			}
		}
		// If still empty (e.g. game entirely in background), fallback to all frames
		if len(gameplayFrames) == 0 {
			for i := 0; i < n; i++ {
				gameplayFrames = append(gameplayFrames, samples[i].MsBetweenPresents)
			}
		}
	}

	var unfilteredAvg float64
	if totalMs > 0 {
		unfilteredAvg = math.Round(((float64(n)/totalMs)*1000.0)*10) / 10
	}

	return FilterResult{
		GameplayFrames:      gameplayFrames,
		TotalFrames:         int64(n),
		GameplayFramesCount: int64(len(gameplayFrames)),
		DurationSeconds:     durationSeconds,
		GameplaySeconds:     gameplaySec,
		LoadingSeconds:      loadingSec,
		BackgroundSeconds:   bgSec,
		LobbySeconds:        lobbySec,
		UnfilteredAvgFPS:    unfilteredAvg,
	}
}

func evalLoadingBlock(samples []FrameSample, tags []byte, start, end int, durationMs float64) {
	if durationMs < 1000.0 {
		return
	}
	count := end - start
	if count <= 0 {
		return
	}
	avgFps := (float64(count) / durationMs) * 1000.0
	if avgFps < 15.0 {
		for k := start; k < end; k++ {
			tags[k] |= tagLoadingBlock
		}
	}
}

// ComputeFinalStatsFromSamples aggregates session metrics using detailed FrameSample data.
func ComputeFinalStatsFromSamples(samples []FrameSample, durationSeconds int, sessionStart time.Time) *FpsStatsData {
	res := FilterFrameSamples(samples, sessionStart, durationSeconds)
	if len(res.GameplayFrames) == 0 {
		return &FpsStatsData{
			DurationSeconds:   durationSeconds,
			GameplaySeconds:   res.GameplaySeconds,
			LoadingSeconds:    res.LoadingSeconds,
			BackgroundSeconds: res.BackgroundSeconds,
			LobbySeconds:      res.LobbySeconds,
			UnfilteredAvgFPS:  res.UnfilteredAvgFPS,
		}
	}

	fpsVals := make([]float64, len(res.GameplayFrames))
	var sumFps float64
	for i, ms := range res.GameplayFrames {
		fps := 1000.0 / ms
		fpsVals[i] = fps
		sumFps += fps
	}
	sort.Float64s(fpsVals)

	gn := len(fpsVals)
	avgFps := math.Round((sumFps/float64(gn))*10) / 10
	minFps := math.Round(fpsVals[0]*10) / 10
	maxFps := math.Round(fpsVals[gn-1]*10) / 10

	onePctCount := int(math.Max(1, math.Floor(float64(gn)*0.01)))
	var onePctSum float64
	for i := 0; i < onePctCount; i++ {
		onePctSum += fpsVals[i]
	}
	low1 := math.Round((onePctSum/float64(onePctCount))*10) / 10

	dotOnePctCount := int(math.Max(1, math.Floor(float64(gn)*0.001)))
	var dotOneSum float64
	for i := 0; i < dotOnePctCount; i++ {
		dotOneSum += fpsVals[i]
	}
	low01 := math.Round((dotOneSum/float64(dotOnePctCount))*10) / 10

	return &FpsStatsData{
		AvgFPS:            avgFps,
		MinFPS:            minFps,
		MaxFPS:            maxFps,
		Low1Percent:       low1,
		Low01Percent:      low01,
		TotalFrames:       res.TotalFrames,
		GameplayFrames:    res.GameplayFramesCount,
		DurationSeconds:   durationSeconds,
		GameplaySeconds:   res.GameplaySeconds,
		LoadingSeconds:    res.LoadingSeconds,
		BackgroundSeconds: res.BackgroundSeconds,
		LobbySeconds:      res.LobbySeconds,
		UnfilteredAvgFPS:  res.UnfilteredAvgFPS,
	}
}

// ComputeFinalStats aggregates complete session frame metrics from raw frame times.
func ComputeFinalStats(frameTimesMs []float64, durationSeconds int) *FpsStatsData {
	n := len(frameTimesMs)
	if n == 0 {
		return &FpsStatsData{
			DurationSeconds: durationSeconds,
		}
	}

	samples := make([]FrameSample, n)
	startTime := time.Now().Add(-time.Duration(durationSeconds) * time.Second)
	currTime := startTime
	for i, ms := range frameTimesMs {
		currTime = currTime.Add(time.Duration(ms * float64(time.Millisecond)))
		samples[i] = FrameSample{
			MsBetweenPresents: ms,
			TimestampMs:       currTime.UnixMilli(),
			IsBackground:      false,
		}
	}

	return ComputeFinalStatsFromSamples(samples, durationSeconds, startTime)
}

func (c *PresentMonCollector) Subscribe() <-chan LiveFpsSnapshot {
	c.mu.Lock()
	defer c.mu.Unlock()
	ch := make(chan LiveFpsSnapshot, 20)
	c.subscribers[ch] = struct{}{}
	return ch
}

func (c *PresentMonCollector) Unsubscribe(ch <-chan LiveFpsSnapshot) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for s := range c.subscribers {
		if s == ch {
			delete(c.subscribers, s)
			close(s)
			break
		}
	}
}
