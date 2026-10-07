package games

import (
	"os"
	"testing"
	"time"
)

type mockFpsCollector struct {
	available bool
	started   bool
	stopped   bool
	lastPID   int
	lastGame  string
	snapshot  *LiveFpsSnapshot
}

func (m *mockFpsCollector) Start(pid int, processName string, gameID string) error {
	m.started = true
	m.lastPID = pid
	m.lastGame = gameID
	return nil
}

func (m *mockFpsCollector) Stop() *FpsStatsData {
	m.stopped = true
	return &FpsStatsData{
		AvgFPS:          120.0,
		TotalFrames:     1200,
		DurationSeconds: 10,
	}
}

func (m *mockFpsCollector) GetSnapshot() *LiveFpsSnapshot {
	return m.snapshot
}

func (m *mockFpsCollector) IsAvailable() bool {
	return m.available
}

func (m *mockFpsCollector) Subscribe() <-chan LiveFpsSnapshot {
	ch := make(chan LiveFpsSnapshot)
	return ch
}

func (m *mockFpsCollector) Unsubscribe(ch <-chan LiveFpsSnapshot) {}

func TestGameTrackerIdentification(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-tracker-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewSessionStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	mockCollector := &mockFpsCollector{
		available: true,
		snapshot: &LiveFpsSnapshot{
			FPS: 144.0,
		},
	}

	tracker := NewGameTracker(store, mockCollector, nil)

	// Test known game signature
	id, title := tracker.identifyGame("Cyberpunk2077.exe")
	if id == "" || title != "Cyberpunk 2077" {
		t.Fatalf("expected Cyberpunk 2077 match, got id=%s title=%s", id, title)
	}

	// Test noise process
	idNoise, _ := tracker.identifyGame("explorer.exe")
	if idNoise != "" {
		t.Fatalf("expected noise process to be rejected, got %s", idNoise)
	}

	// Test custom mapping override
	_ = store.AddMapping(GameMapping{
		ProcessName: "customgame.exe",
		GameID:      "my-custom-game",
		GameTitle:   "My Custom Game",
	})

	idCustom, titleCustom := tracker.identifyGame("CustomGame.exe")
	if idCustom != "my-custom-game" || titleCustom != "My Custom Game" {
		t.Fatalf("expected custom mapping match, got id=%s title=%s", idCustom, titleCustom)
	}
}

func TestGameTrackerLifecycle(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-tracker-lifecycle-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewSessionStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	mockCollector := &mockFpsCollector{
		available: true,
		snapshot: &LiveFpsSnapshot{
			FPS: 144.0,
		},
	}

	tracker := NewGameTracker(store, mockCollector, nil)

	var startedGame *RunningGame
	var stoppedSession *PlaySession
	tracker.SetCallbacks(func(game *RunningGame) {
		startedGame = game
	}, func(session *PlaySession) {
		stoppedSession = session
	})

	// Manually trigger start
	tracker.mu.Lock()
	tracker.startActiveSessionLocked(1234, "EldenRing.exe", "", "elden-ring", "Elden Ring")
	tracker.mu.Unlock()

	time.Sleep(20 * time.Millisecond)
	if startedGame == nil || startedGame.PID != 1234 {
		t.Fatalf("expected onGameStarted called with PID 1234, got %+v", startedGame)
	}
	if !mockCollector.started {
		t.Fatalf("expected mockCollector.Start() to have been called")
	}

	running := tracker.GetRunningGame()
	if running == nil || running.Title != "Elden Ring" {
		t.Fatalf("expected running game Elden Ring, got %+v", running)
	}
	if running.FpsSnapshot == nil || running.FpsSnapshot.FPS != 144.0 {
		t.Fatalf("expected snapshot FPS 144.0, got %+v", running.FpsSnapshot)
	}

	// Manually trigger stop
	tracker.mu.Lock()
	tracker.stopActiveSessionLocked()
	tracker.mu.Unlock()

	time.Sleep(20 * time.Millisecond)
	if stoppedSession == nil || stoppedSession.GameID != "elden-ring" {
		t.Fatalf("expected onGameStopped called, got %+v", stoppedSession)
	}
	if !mockCollector.stopped {
		t.Fatalf("expected mockCollector.Stop() to have been called")
	}

	// Verify session was recorded to store
	sessions := store.GetRecentSessions(5)
	if len(sessions) != 1 || sessions[0].GameID != "elden-ring" {
		t.Fatalf("expected 1 session saved for elden-ring, got %+v", sessions)
	}
}

func TestGameTrackerMultipleGames(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-tracker-multi-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewSessionStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	mockCollector := &mockFpsCollector{
		available: true,
		snapshot: &LiveFpsSnapshot{
			FPS: 60.0,
		},
	}

	tracker := NewGameTracker(store, mockCollector, nil)

	// Start Game 1: Brawlhalla
	tracker.mu.Lock()
	tracker.startActiveSessionLocked(1001, "Brawlhalla.exe", "", "brawlhalla", "Brawlhalla")
	tracker.mu.Unlock()

	time.Sleep(10 * time.Millisecond)

	// Start Game 2: Valheim
	tracker.mu.Lock()
	tracker.startActiveSessionLocked(1002, "valheim.exe", "", "valheim", "Valheim")
	tracker.mu.Unlock()

	time.Sleep(10 * time.Millisecond)

	// Verify both games are running in GetRunningGames()
	runningList := tracker.GetRunningGames()
	if len(runningList) != 2 {
		t.Fatalf("expected 2 running games, got %d", len(runningList))
	}
	// Sorted newest first: Valheim then Brawlhalla
	if runningList[0].ID != "valheim" || runningList[1].ID != "brawlhalla" {
		t.Fatalf("expected [valheim, brawlhalla], got [%s, %s]", runningList[0].ID, runningList[1].ID)
	}

	// Single GetRunningGame returns the newest (Valheim)
	single := tracker.GetRunningGame()
	if single == nil || single.ID != "valheim" {
		t.Fatalf("expected single running game valheim, got %+v", single)
	}

	// Stop only Brawlhalla
	tracker.StopTracking("brawlhalla")
	time.Sleep(10 * time.Millisecond)

	remaining := tracker.GetRunningGames()
	if len(remaining) != 1 || remaining[0].ID != "valheim" {
		t.Fatalf("expected 1 remaining game (valheim), got %+v", remaining)
	}

	// Stop Valheim
	tracker.StopTracking("valheim")
	time.Sleep(10 * time.Millisecond)

	if len(tracker.GetRunningGames()) != 0 {
		t.Fatalf("expected 0 running games after stopping all, got %d", len(tracker.GetRunningGames()))
	}

	// Verify both sessions were recorded into store
	sessions := store.GetRecentSessions(5)
	if len(sessions) != 2 {
		t.Fatalf("expected 2 recorded sessions, got %d", len(sessions))
	}
}

func TestGameTrackerActiveGameSwitching(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-tracker-switch-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewSessionStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	mockCollector := &mockFpsCollector{
		available: true,
		snapshot: &LiveFpsSnapshot{
			GameID: "valheim",
			FPS:    90.0,
		},
	}

	tracker := NewGameTracker(store, mockCollector, nil)

	var activeChangedGame *RunningGame
	tracker.SetActiveGameCallback(func(game *RunningGame) {
		activeChangedGame = game
	})

	// Start Game 1: Brawlhalla
	tracker.mu.Lock()
	tracker.startActiveSessionLocked(1001, "Brawlhalla.exe", "", "brawlhalla", "Brawlhalla")
	tracker.mu.Unlock()

	time.Sleep(10 * time.Millisecond)

	// Start Game 2: Valheim
	tracker.mu.Lock()
	tracker.startActiveSessionLocked(1002, "valheim.exe", "", "valheim", "Valheim")
	tracker.mu.Unlock()

	time.Sleep(10 * time.Millisecond)

	// Currently active should be Valheim (newest)
	if tracker.GetActiveGame().ID != "valheim" {
		t.Fatalf("expected active game to be valheim, got %s", tracker.GetActiveGame().ID)
	}
	if mockCollector.lastPID != 1002 {
		t.Fatalf("expected FPS collector to target PID 1002, got %d", mockCollector.lastPID)
	}

	// Now manually switch active game to Brawlhalla
	tracker.mu.Lock()
	tracker.activeGameID = "brawlhalla"
	if bGame := tracker.runningGames["brawlhalla"]; bGame != nil {
		_ = tracker.fpsCollector.Start(bGame.PID, bGame.ProcessName, bGame.ID)
		if tracker.onActiveGameChanged != nil {
			cp := *bGame
			go tracker.onActiveGameChanged(&cp)
		}
	}
	tracker.mu.Unlock()

	time.Sleep(20 * time.Millisecond)

	if tracker.GetActiveGame().ID != "brawlhalla" {
		t.Fatalf("expected active game to be brawlhalla, got %s", tracker.GetActiveGame().ID)
	}
	if mockCollector.lastPID != 1001 {
		t.Fatalf("expected FPS collector to target PID 1001, got %d", mockCollector.lastPID)
	}
	if activeChangedGame == nil || activeChangedGame.ID != "brawlhalla" {
		t.Fatalf("expected activeChangedGame callback for brawlhalla, got %+v", activeChangedGame)
	}

	// GetRunningGames should put active game first
	runningList := tracker.GetRunningGames()
	if len(runningList) != 2 || runningList[0].ID != "brawlhalla" {
		t.Fatalf("expected brawlhalla first in running games, got %+v", runningList[0])
	}
}


