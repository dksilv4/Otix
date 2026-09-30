package games

import (
	"math"
	"testing"
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

	// Invalid / extreme frame time (dropped or paused frame > 500ms)
	invalidLine := "Game.exe, 1234, 1500.0"
	if parseFrameTime(invalidLine, colMap, 1234) != 0 {
		t.Fatalf("expected 0 for frame time > 500ms")
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
	collector.mu.Lock()
	for i := 0; i < 60; i++ {
		collector.frameTimes = append(collector.frameTimes, 16.66666)
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
}
