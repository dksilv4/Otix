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

	// Frame timing history (in milliseconds between presents)
	frameTimes []float64

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

	c.cmd = cmd
	c.isRunning = true
	c.targetPID = pid
	c.processName = processName
	c.gameID = gameID
	c.startTime = time.Now()
	c.frameTimes = make([]float64, 0, 1000)
	c.latestSnapshot = &LiveFpsSnapshot{
		Timestamp: time.Now().UnixMilli(),
	}
	c.stopChan = make(chan struct{})
	c.mu.Unlock()

	// Parse CSV in background
	go c.readCsvStream(stdout)
	// Start ticker for live snapshot updates and subscriber emission
	go c.tickerLoop()

	return nil
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
			c.mu.Lock()
			c.frameTimes = append(c.frameTimes, ft)
			if len(c.frameTimes) > MaxStoredFrames {
				// Evict old frames keeping recent MaxStoredFrames
				c.frameTimes = c.frameTimes[len(c.frameTimes)-MaxStoredFrames:]
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
	if err != nil || val <= 0 || val > 500 {
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
	n := len(c.frameTimes)
	if n == 0 {
		c.mu.RUnlock()
		return nil
	}

	// Sliding 1000ms window from end
	var windowSum float64
	var windowCount int
	for i := n - 1; i >= 0; i-- {
		windowSum += c.frameTimes[i]
		windowCount++
		if windowSum >= SlidingWindowMs {
			break
		}
	}

	var liveFps float64
	if windowSum > 0 && windowCount > 0 {
		liveFps = math.Round((float64(windowCount)/windowSum)*10000) / 10
	}

	// Rolling stats over up to 300 recent frames (~5 sec) for min/max/percentiles
	sampleLen := 300
	if n < sampleLen {
		sampleLen = n
	}
	recentSlice := make([]float64, sampleLen)
	copy(recentSlice, c.frameTimes[n-sampleLen:])
	c.mu.RUnlock()

	fpsVals := make([]float64, len(recentSlice))
	var sumFps float64
	for i, ms := range recentSlice {
		f := 1000.0 / ms
		fpsVals[i] = f
		sumFps += f
	}
	sort.Float64s(fpsVals)

	avgFps := math.Round((sumFps/float64(len(fpsVals)))*10) / 10
	minFps := math.Round(fpsVals[0]*10) / 10
	maxFps := math.Round(fpsVals[len(fpsVals)-1]*10) / 10

	// 1% low
	onePctCount := int(math.Max(1, math.Floor(float64(len(fpsVals))*0.01)))
	var onePctSum float64
	for i := 0; i < onePctCount; i++ {
		onePctSum += fpsVals[i]
	}
	low1 := math.Round((onePctSum/float64(onePctCount))*10) / 10

	// 0.1% low
	dotOnePctCount := int(math.Max(1, math.Floor(float64(len(fpsVals))*0.001)))
	var dotOneSum float64
	for i := 0; i < dotOnePctCount; i++ {
		dotOneSum += fpsVals[i]
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
	frames := make([]float64, len(c.frameTimes))
	copy(frames, c.frameTimes)
	c.mu.Unlock()

	return ComputeFinalStats(frames, duration)
}

// ComputeFinalStats aggregates complete session frame metrics.
func ComputeFinalStats(frameTimesMs []float64, durationSeconds int) *FpsStatsData {
	n := len(frameTimesMs)
	if n == 0 {
		return &FpsStatsData{
			DurationSeconds: durationSeconds,
		}
	}

	fpsVals := make([]float64, n)
	var sumFps float64
	for i, ms := range frameTimesMs {
		fps := 1000.0 / ms
		fpsVals[i] = fps
		sumFps += fps
	}
	sort.Float64s(fpsVals)

	avgFps := math.Round((sumFps/float64(n))*10) / 10
	minFps := math.Round(fpsVals[0]*10) / 10
	maxFps := math.Round(fpsVals[n-1]*10) / 10

	onePctCount := int(math.Max(1, math.Floor(float64(n)*0.01)))
	var onePctSum float64
	for i := 0; i < onePctCount; i++ {
		onePctSum += fpsVals[i]
	}
	low1 := math.Round((onePctSum/float64(onePctCount))*10) / 10

	dotOnePctCount := int(math.Max(1, math.Floor(float64(n)*0.001)))
	var dotOneSum float64
	for i := 0; i < dotOnePctCount; i++ {
		dotOneSum += fpsVals[i]
	}
	low01 := math.Round((dotOneSum/float64(dotOnePctCount))*10) / 10

	return &FpsStatsData{
		AvgFPS:          avgFps,
		MinFPS:          minFps,
		MaxFPS:          maxFps,
		Low1Percent:     low1,
		Low01Percent:    low01,
		TotalFrames:     int64(n),
		DurationSeconds: durationSeconds,
	}
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
