package games

import (
	"math"
	"testing"
	"time"
)

func TestParseFrameTime(t *testing.T) {
	colMap := map[string]int{
		"application":       0,
		"processid":         1,
		"msbetweenpresents": 2,
	}

	// Correct match for PID 1234
	line := "Game.exe, 1234, 16.666"
	ft := parseFrameTime(line, colMap, 1234)
	if math.Abs(ft-16.666) > 0.001 {
		t.Fatalf("expected 16.666, got %f", ft)
	}

	// PID mismatch
	ft2 := parseFrameTime(line, colMap, 9999)
	if ft2 != 0 {
		t.Fatalf("expected 0 for mismatched PID, got %f", ft2)
	}

	// Extreme frame time (> 5000ms)
	invalidLine := "Game.exe, 1234, 15000.0"
	if parseFrameTime(invalidLine, colMap, 1234) != 0 {
		t.Fatalf("expected 0 for frame time > 5000ms")
	}

	// Malformed float
	badLine := "Game.exe, 1234, invalid_float"
	if parseFrameTime(badLine, colMap, 1234) != 0 {
		t.Fatalf("expected 0 for malformed float")
	}
}

func TestComputeFinalStats(t *testing.T) {
	// Create 100 frames: 90 frames at 16.666ms (~60fps), 10 frames at 33.333ms (~30fps)
	frameTimes := make([]float64, 0, 100)
	for i := 0; i < 90; i++ {
		frameTimes = append(frameTimes, 16.6666)
	}
	for i := 0; i < 10; i++ {
		frameTimes = append(frameTimes, 33.3333)
	}

	stats := ComputeFinalStats(frameTimes, 120)
	if stats == nil {
		t.Fatal("expected non-nil stats")
	}

	if stats.TotalFrames != 100 {
		t.Fatalf("expected 100 frames, got %d", stats.TotalFrames)
	}
	if stats.DurationSeconds != 120 {
		t.Fatalf("expected 120s duration, got %d", stats.DurationSeconds)
	}
	if stats.MinFPS < 29.0 || stats.MinFPS > 31.0 {
		t.Fatalf("expected min fps ~30, got %f", stats.MinFPS)
	}
	if stats.MaxFPS < 59.0 || stats.MaxFPS > 61.0 {
		t.Fatalf("expected max fps ~60, got %f", stats.MaxFPS)
	}
	if stats.AvgFPS < 55.0 || stats.AvgFPS > 58.0 {
		t.Fatalf("expected avg fps ~57, got %f", stats.AvgFPS)
	}
	if stats.Low1Percent < 29.0 || stats.Low1Percent > 31.0 {
		t.Fatalf("expected 1%% low ~30, got %f", stats.Low1Percent)
	}
}

func TestComputeLiveSnapshot(t *testing.T) {
	collector := NewPresentMonCollector("")

	// Add 60 frames of 16.666ms (totaling ~1000ms)
	now := time.Now().UnixMilli()
	collector.mu.Lock()
	for i := 0; i < 60; i++ {
		collector.samples = append(collector.samples, FrameSample{
			MsBetweenPresents: 16.66666,
			TimestampMs:       now,
			IsBackground:      false,
		})
	}
	collector.mu.Unlock()

	snapshot := collector.computeLiveSnapshot()
	if snapshot == nil {
		t.Fatal("expected non-nil live snapshot")
	}

	if snapshot.FPS < 59.0 || snapshot.FPS > 61.0 {
		t.Fatalf("expected live FPS ~60.0, got %f", snapshot.FPS)
	}
	if snapshot.FrameCount != 60 {
		t.Fatalf("expected 60 frame count, got %d", snapshot.FrameCount)
	}
	if snapshot.IsLoading {
		t.Fatalf("expected IsLoading = false during steady 60fps")
	}
	if snapshot.IsBackground {
		t.Fatalf("expected IsBackground = false")
	}
}

func TestLoadingScreenFiltering_HardStalls(t *testing.T) {
	// Simulate 600 gameplay frames at 16.67ms (60 FPS = 10s gameplay)
	// Interrupted by 4 asset loading stalls (500ms each = 2s loading time)
	startTime := time.Now().Add(-20 * time.Second)
	currTime := startTime

	samples := make([]FrameSample, 0, 700)
	for i := 0; i < 300; i++ {
		currTime = currTime.Add(16670 * time.Microsecond)
		samples = append(samples, FrameSample{
			MsBetweenPresents: 16.67,
			TimestampMs:       currTime.UnixMilli(),
			IsBackground:      false,
		})
	}

	// 4 Hard asset loading stalls (e.g. shader cache / level streaming pause)
	for i := 0; i < 4; i++ {
		currTime = currTime.Add(500 * time.Millisecond)
		samples = append(samples, FrameSample{
			MsBetweenPresents: 500.0, // 2 FPS
			TimestampMs:       currTime.UnixMilli(),
			IsBackground:      false,
		})
	}

	for i := 0; i < 300; i++ {
		currTime = currTime.Add(16670 * time.Microsecond)
		samples = append(samples, FrameSample{
			MsBetweenPresents: 16.67,
			TimestampMs:       currTime.UnixMilli(),
			IsBackground:      false,
		})
	}

	stats := ComputeFinalStatsFromSamples(samples, 12, startTime)
	if stats == nil {
		t.Fatal("expected non-nil stats")
	}

	// Without filter: 4 frames at 500ms would drag the 1% low (bottom 6 frames) to ~2 FPS.
	// With filter: Hard stalls are excluded, so 1% low must remain ~60 FPS!
	if stats.Low1Percent < 55.0 {
		t.Fatalf("1%% Low was corrupted by loading stalls: got %f, expected ~60", stats.Low1Percent)
	}
	if stats.AvgFPS < 58.0 {
		t.Fatalf("Avg FPS was corrupted: got %f, expected ~60", stats.AvgFPS)
	}
	if stats.LoadingSeconds < 2 {
		t.Fatalf("expected at least 2s loading time, got %ds", stats.LoadingSeconds)
	}
	if stats.GameplayFrames != 600 {
		t.Fatalf("expected 600 gameplay frames, got %d", stats.GameplayFrames)
	}
	if stats.TotalFrames != 604 {
		t.Fatalf("expected 604 total frames, got %d", stats.TotalFrames)
	}
}

func TestLoadingScreenFiltering_SustainedBlock(t *testing.T) {
	// Simulate 60 FPS gameplay interrupted by a sustained 3-second loading screen at 10 FPS (100ms frames)
	startTime := time.Now().Add(-30 * time.Second)
	currTime := startTime

	samples := make([]FrameSample, 0, 1000)
	// 500 frames of 60 FPS
	for i := 0; i < 500; i++ {
		currTime = currTime.Add(16670 * time.Microsecond)
		samples = append(samples, FrameSample{
			MsBetweenPresents: 16.67,
			TimestampMs:       currTime.UnixMilli(),
			IsBackground:      false,
		})
	}

	// 30 frames at 100ms (10 FPS = 3.0s sustained loading screen)
	for i := 0; i < 30; i++ {
		currTime = currTime.Add(100 * time.Millisecond)
		samples = append(samples, FrameSample{
			MsBetweenPresents: 100.0,
			TimestampMs:       currTime.UnixMilli(),
			IsBackground:      false,
		})
	}

	// 500 more frames of 60 FPS
	for i := 0; i < 500; i++ {
		currTime = currTime.Add(16670 * time.Microsecond)
		samples = append(samples, FrameSample{
			MsBetweenPresents: 16.67,
			TimestampMs:       currTime.UnixMilli(),
			IsBackground:      false,
		})
	}

	stats := ComputeFinalStatsFromSamples(samples, 20, startTime)
	if stats == nil {
		t.Fatal("expected non-nil stats")
	}

	// The 30 loading frames should be tagged and excluded from gameplay 1% low
	if stats.Low1Percent < 55.0 {
		t.Fatalf("1%% Low was dragged down by loading screen: got %f, expected ~60", stats.Low1Percent)
	}
	if stats.LoadingSeconds < 3 {
		t.Fatalf("expected at least 3s loading time, got %d", stats.LoadingSeconds)
	}
	if stats.GameplayFrames != 1000 {
		t.Fatalf("expected 1000 gameplay frames, got %d", stats.GameplayFrames)
	}
	if stats.TotalFrames != 1030 {
		t.Fatalf("expected 1030 total frames, got %d", stats.TotalFrames)
	}
}

func TestBackgroundFiltering(t *testing.T) {
	// Simulate 60 FPS gameplay, followed by an Alt-Tab period where game renders throttled at 15 FPS
	startTime := time.Now().Add(-60 * time.Second)
	currTime := startTime

	samples := make([]FrameSample, 0, 1000)
	// 600 frames at 60 FPS in foreground
	for i := 0; i < 600; i++ {
		currTime = currTime.Add(16670 * time.Microsecond)
		samples = append(samples, FrameSample{
			MsBetweenPresents: 16.67,
			TimestampMs:       currTime.UnixMilli(),
			IsBackground:      false,
		})
	}

	// 150 frames at 66.67ms (15 FPS throttled) while in background
	for i := 0; i < 150; i++ {
		currTime = currTime.Add(66670 * time.Microsecond)
		samples = append(samples, FrameSample{
			MsBetweenPresents: 66.67,
			TimestampMs:       currTime.UnixMilli(),
			IsBackground:      true,
		})
	}

	stats := ComputeFinalStatsFromSamples(samples, 20, startTime)
	if stats == nil {
		t.Fatal("expected non-nil stats")
	}

	// Background throttled frames must not lower the active gameplay avg or 1% low
	if stats.AvgFPS < 58.0 {
		t.Fatalf("Avg FPS was dragged down by background frames: got %f, expected ~60", stats.AvgFPS)
	}
	if stats.Low1Percent < 55.0 {
		t.Fatalf("1%% Low was dragged down by background frames: got %f, expected ~60", stats.Low1Percent)
	}
	if stats.BackgroundSeconds < 10 {
		t.Fatalf("expected at least 10s background time, got %d", stats.BackgroundSeconds)
	}
	if stats.GameplayFrames != 600 {
		t.Fatalf("expected 600 gameplay frames, got %d", stats.GameplayFrames)
	}
	if stats.TotalFrames != 750 {
		t.Fatalf("expected 750 total frames, got %d", stats.TotalFrames)
	}
}
