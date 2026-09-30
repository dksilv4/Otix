package games

import (
	"os"
	"testing"
)

func TestSessionStore(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-games-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewSessionStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create SessionStore: %v", err)
	}

	// Test mapping
	err = store.AddMapping(GameMapping{
		ProcessName: "Cyberpunk2077.exe",
		GameID:      "cp2077",
		GameTitle:   "Cyberpunk 2077",
	})
	if err != nil {
		t.Fatalf("failed to add mapping: %v", err)
	}

	mapping := store.GetMappingForProcess("cyberpunk2077.exe")
	if mapping == nil || mapping.GameID != "cp2077" {
		t.Fatalf("expected mapping cp2077, got %+v", mapping)
	}

	// Test recording sessions
	sess1 := PlaySession{
		GameID:          "cp2077",
		GameTitle:       "Cyberpunk 2077",
		ProcessName:     "Cyberpunk2077.exe",
		DurationSeconds: 1800, // 30 mins
		FpsStats: &FpsStatsData{
			AvgFPS: 82.5,
		},
	}
	sess2 := PlaySession{
		GameID:          "cp2077",
		GameTitle:       "Cyberpunk 2077",
		ProcessName:     "Cyberpunk2077.exe",
		DurationSeconds: 3600, // 60 mins
		FpsStats: &FpsStatsData{
			AvgFPS: 79.1,
		},
	}

	if err := store.RecordSession(sess1); err != nil {
		t.Fatalf("failed to record sess1: %v", err)
	}
	if err := store.RecordSession(sess2); err != nil {
		t.Fatalf("failed to record sess2: %v", err)
	}

	recent := store.GetRecentSessions(10)
	if len(recent) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(recent))
	}

	summary := store.GetPlaytimeForGame("cp2077")
	if summary.TotalMinutes != 90 {
		t.Fatalf("expected 90 minutes total playtime, got %d", summary.TotalMinutes)
	}
	if summary.SessionCount != 2 {
		t.Fatalf("expected 2 sessions, got %d", summary.SessionCount)
	}
	if summary.LastFpsStats == nil || summary.LastFpsStats.AvgFPS != 79.1 {
		t.Fatalf("expected latest FPS 79.1, got %+v", summary.LastFpsStats)
	}
}
