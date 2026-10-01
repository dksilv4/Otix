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
}

// FpsCollector manages live frame capture and statistics for a game process.
type FpsCollector interface {
	Start(pid int, processName string, gameID string) error
	Stop() *FpsStatsData
	GetSnapshot() *LiveFpsSnapshot
	IsAvailable() bool
	Subscribe() <-chan LiveFpsSnapshot
	Unsubscribe(ch <-chan LiveFpsSnapshot)
}

// PresentMonCollector captures frame timing using Intel PresentMon.
type PresentMonCollector struct {
	mu           sync.RWMutex
	customBinDir string
	cmd          *exec.Cmd
	stdinPipe    io.WriteCloser
	isRunning    bool
	targetPID    int
	processName  string
	gameID       string
	startTime    time.Time

	// Frame timing history
	frameTimes []float64
	samples    []FrameSample

	// Cached foreground status (sampled periodically to minimize syscalls)
	lastForegroundCheck time.Time
	cachedForeground    bool

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

	// Standard workspace & relative locations
	candidates = append(candidates,
		"./storage/bin/PresentMon.exe",
		"../desktop/bin/PresentMon.exe",
		"../../desktop/bin/PresentMon.exe",
	)

	// Windows standard directories
	if progFiles := os.Getenv("ProgramFiles"); progFiles != "" {
		candidates = append(candidates, filepath.Join(progFiles, "PresentMon", "PresentMon.exe"))
	}
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		candidates = append(candidates, filepath.Join(localAppData, "PresentMon", "PresentMon.exe"))
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

func (c *PresentMonCollector) Start(pid int, processName string, gameID string) error {
	c.mu.Lock()
	if c.isRunning {
		c.mu.Unlock()
		c.Stop()
		c.mu.Lock()
	}

	exe := c.FindPresentMon()
	if exe == "" {
		c.mu.Unlock()
		return fmt.Errorf("PresentMon executable not found")
	}

	args := []string{
		"--output_stdout",
		"--session_name", "OtixPresentMon",
		"--stop_existing_session",
		"--no_console_stats",
		"--process_id", strconv.Itoa(pid),
	}
	if processName != "" {
		args = append(args, "--process_name", processName)
	}

	cmd := exec.Command(exe, args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		c.mu.Unlock()
		return fmt.Errorf("failed to open PresentMon stdout: %w", err)
	}

	if err := cmd.Start(); err != nil {
		c.mu.Unlock()
		return fmt.Errorf("failed to start PresentMon: %w", err)
	}

	now := time.Now()
	c.cmd = cmd
	c.isRunning = true
	c.targetPID = pid
	c.processName = processName
	c.gameID = gameID
	c.startTime = now
	c.frameTimes = make([]float64, 0, 1000)
	c.samples = make([]FrameSample, 0, 1000)
	c.lastForegroundCheck = now
	c.cachedForeground = isProcessInForeground(pid)
	c.latestSnapshot = &LiveFpsSnapshot{
		Timestamp: now.UnixMilli(),
	}
	c.stopChan = make(chan struct{})
	c.mu.Unlock()

	// Parse CSV in background
	go c.readCsvStream(stdout)
	// Start ticker for live snapshot updates and subscriber emission
	go c.tickerLoop()

	return nil
}

func (c *PresentMonCollector) checkForeground(now time.Time) bool {
	if c.targetPID <= 0 {
		return true
	}
	if now.Sub(c.lastForegroundCheck) > 200*time.Millisecond {
		c.cachedForeground = isProcessInForeground(c.targetPID)
		c.lastForegroundCheck = now
	}
	return c.cachedForeground
}

func (c *PresentMonCollector) readCsvStream(r io.Reader) {
	scanner := bufio.NewScanner(r)
	var colMap map[string]int
	headerParsed := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		// Remove null bytes if any
		line = strings.ReplaceAll(line, "\x00", "")

		if !headerParsed {
			lower := strings.ToLower(line)
			if strings.HasPrefix(lower, "application") || strings.HasPrefix(lower, "processid") {
				cols := strings.Split(line, ",")
				colMap = make(map[string]int, len(cols))
				for i, col := range cols {
					colMap[strings.ToLower(strings.TrimSpace(col))] = i
				}
				headerParsed = true
			}
			continue
		}

		ft := parseFrameTime(line, colMap, c.targetPID)
		if ft > 0 {
			now := time.Now()
			c.mu.Lock()
			if c.isRunning {
				isBg := !c.checkForeground(now)
				sample := FrameSample{
					MsBetweenPresents: ft,
					TimestampMs:       now.UnixMilli(),
					IsBackground:      isBg,
				}
				c.samples = append(c.samples, sample)
				c.frameTimes = append(c.frameTimes, ft)
				if len(c.samples) > MaxStoredFrames {
					c.samples = c.samples[len(c.samples)-MaxStoredFrames:]
					c.frameTimes = c.frameTimes[len(c.frameTimes)-MaxStoredFrames:]
				}
			}
			c.mu.Unlock()
		}
	}

	c.mu.Lock()
	c.isRunning = false
	c.mu.Unlock()
}

// parseFrameTime extracts msBetweenPresents for the matching PID.
func parseFrameTime(line string, colMap map[string]int, targetPID int) float64 {
	cols := strings.Split(line, ",")

	if targetPID > 0 && colMap != nil {
		if pidIdx, ok := colMap["processid"]; ok && pidIdx < len(cols) {
			pid, err := strconv.Atoi(strings.TrimSpace(cols[pidIdx]))
			if err == nil && pid != targetPID {
				return 0
			}
		}
	}

	if colMap == nil {
		return 0
	}

	msIdx, ok := colMap["msbetweenpresents"]
	if !ok || msIdx >= len(cols) {
		return 0
	}

	val, err := strconv.ParseFloat(strings.TrimSpace(cols[msIdx]), 64)
	if err != nil || val <= 0 || val > 5000 {
		return 0
	}
	return val
}

func (c *PresentMonCollector) tickerLoop() {
	ticker := time.NewTicker(BroadcastTickMs * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-c.stopChan:
			return
		case <-ticker.C:
			snapshot := c.computeLiveSnapshot()
			if snapshot == nil {
				continue
			}

			c.mu.Lock()
			c.latestSnapshot = snapshot
			subs := make([]chan LiveFpsSnapshot, 0, len(c.subscribers))
			for ch := range c.subscribers {
				subs = append(subs, ch)
			}
			c.mu.Unlock()

			// Broadcast to subscribers without blocking
			for _, ch := range subs {
				select {
				case ch <- *snapshot:
				default:
				}
			}
		}
	}
}

func (c *PresentMonCollector) computeLiveSnapshot() *LiveFpsSnapshot {
	c.mu.RLock()
	n := len(c.samples)
	if n == 0 {
		c.mu.RUnlock()
		return nil
	}

	lastSample := c.samples[n-1]
	isBg := lastSample.IsBackground || !c.cachedForeground

	// Sliding 1000ms window from end
	var windowSum float64
	var windowCount int
	for i := n - 1; i >= 0; i-- {
		windowSum += c.samples[i].MsBetweenPresents
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
	// Filter out hard stalls and background from rolling percentiles so HUD doesn't fluctuate wildly
	sampleLen := 300
	if n < sampleLen {
		sampleLen = n
	}
	recentSlice := make([]FrameSample, sampleLen)
	copy(recentSlice, c.samples[n-sampleLen:])
	c.mu.RUnlock()

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
		FPS:          liveFps,
		AvgFPS:       avgFps,
		MinFPS:       minFps,
		MaxFPS:       maxFps,
		Low1Percent:  low1,
		Low01Percent: low01,
		FrameCount:   int64(n),
		SampleCount:  windowCount,
		Timestamp:    time.Now().UnixMilli(),
		IsLoading:    isLoading,
		IsBackground: isBg,
	}
}

func (c *PresentMonCollector) GetSnapshot() *LiveFpsSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.latestSnapshot
}

func (c *PresentMonCollector) Stop() *FpsStatsData {
	c.mu.Lock()
	if !c.isRunning && c.cmd == nil {
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

	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
		_ = c.cmd.Wait()
		c.cmd = nil
	}
	c.isRunning = false

	duration := int(time.Since(c.startTime).Seconds())
	samples := make([]FrameSample, len(c.samples))
	copy(samples, c.samples)
	startTime := c.startTime
	c.mu.Unlock()

	return ComputeFinalStatsFromSamples(samples, duration, startTime)
}

const (
	tagNone         = 0
	tagBackground   = 1 << 0
	tagLoadingStall = 1 << 1
	tagLoadingBlock = 1 << 2
	tagWarmup       = 1 << 3
)

// FilterFrameSamples processes frame timing history to separate pure gameplay frames
// from loading screens, asset stalls, warmup, and background / Alt-Tab throttled periods.
func FilterFrameSamples(samples []FrameSample, sessionStart time.Time, durationSeconds int) FilterResult {
	n := len(samples)
	if n == 0 {
		return FilterResult{DurationSeconds: durationSeconds}
	}

	tags := make([]byte, n)
	startMs := sessionStart.UnixMilli()

	// 1. Tag background, warmup, and hard stalls
	for i := 0; i < n; i++ {
		s := samples[i]
		if s.IsBackground {
			tags[i] |= tagBackground
		}
		if startMs > 0 && s.TimestampMs > 0 && (s.TimestampMs-startMs) < 4000 {
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

	// 3. Accumulate loading and background durations
	var loadingMs float64
	var bgMs float64
	var gameplayFrames []float64

	for i := 0; i < n; i++ {
		s := samples[i]
		isBg := (tags[i] & tagBackground) != 0
		isLoading := (tags[i] & (tagLoadingStall | tagLoadingBlock)) != 0

		if isBg {
			bgMs += s.MsBetweenPresents
		} else if isLoading {
			loadingMs += s.MsBetweenPresents
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

	// Ensure times do not exceed total wall-clock duration
	if durationSeconds > 0 {
		if bgSec > durationSeconds {
			bgSec = durationSeconds
		}
		if loadingSec > durationSeconds-bgSec {
			loadingSec = durationSeconds - bgSec
		}
	}
	gameplaySec := durationSeconds - loadingSec - bgSec
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

	return FilterResult{
		GameplayFrames:      gameplayFrames,
		TotalFrames:         int64(n),
		GameplayFramesCount: int64(len(gameplayFrames)),
		DurationSeconds:     durationSeconds,
		GameplaySeconds:     gameplaySec,
		LoadingSeconds:      loadingSec,
		BackgroundSeconds:   bgSec,
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
