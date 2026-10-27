package launcher

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestSessionLifecycleAndDuration(t *testing.T) {
	tracker := NewSessionTracker(nil)

	// 1. Start Session
	session := tracker.StartSession("game-123", "Cyberpunk 2077", "/path/to/game.exe", 1001)
	if session.ID == "" {
		t.Fatal("expected non-empty session ID")
	}
	if session.GameID != "game-123" {
		t.Fatalf("expected game-123, got %s", session.GameID)
	}
	if session.Title != "Cyberpunk 2077" {
		t.Fatalf("expected Cyberpunk 2077, got %s", session.Title)
	}
	if session.PID != 1001 {
		t.Fatalf("expected PID 1001, got %d", session.PID)
	}
	if session.State != StateRunning {
		t.Fatalf("expected state running, got %s", session.State)
	}
	if !session.IsActive() {
		t.Fatal("expected session to be active")
	}

	// Active sessions query
	active := tracker.ActiveSessions()
	if len(active) != 1 {
		t.Fatalf("expected 1 active session, got %d", len(active))
	}
	if tracker.ActiveCount() != 1 {
		t.Fatalf("expected active count 1, got %d", tracker.ActiveCount())
	}

	byPID, ok := tracker.ActiveSessionByPID(1001)
	if !ok || byPID.ID != session.ID {
		t.Fatalf("expected to find active session by PID 1001")
	}

	byGame, ok := tracker.ActiveSessionByGameID("game-123")
	if !ok || byGame.ID != session.ID {
		t.Fatalf("expected to find active session by game ID game-123")
	}

	// Simulate brief duration
	time.Sleep(50 * time.Millisecond)

	// Live snapshot duration check
	snap, found := tracker.GetSession(session.ID)
	if !found {
		t.Fatal("expected session to be found")
	}
	if snap.Duration() < 40*time.Millisecond {
		t.Fatalf("expected duration >= 40ms, got %v", snap.Duration())
	}

	// 2. Terminate Cleanly
	ended, err := tracker.EndSession(session.ID, 0, "")
	if err != nil {
		t.Fatalf("unexpected error ending session: %v", err)
	}
	if ended.State != StateTerminated {
		t.Fatalf("expected StateTerminated, got %s", ended.State)
	}
	if ended.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %d", ended.ExitCode)
	}
	if ended.EndTime == nil {
		t.Fatal("expected EndTime to be populated")
	}
	if ended.IsActive() {
		t.Fatal("expected ended session to NOT be active")
	}
	if tracker.ActiveCount() != 0 {
		t.Fatalf("expected 0 active sessions after ending, got %d", tracker.ActiveCount())
	}

	// Verify history
	history := tracker.SessionHistory(10)
	if len(history) != 1 {
		t.Fatalf("expected 1 item in history, got %d", len(history))
	}
	if history[0].ID != session.ID {
		t.Fatalf("expected history session ID %s, got %s", session.ID, history[0].ID)
	}

	// Calling EndSession again should return existing history without error
	repeat, err := tracker.EndSession(session.ID, 0, "")
	if err != nil || repeat.ID != session.ID {
		t.Fatalf("expected repeat end to succeed gracefully, got %v", err)
	}
}

func TestSessionFailureTrapping(t *testing.T) {
	tracker := NewSessionTracker(nil)
	session := tracker.StartSession("game-crash", "Crashing App", "/path/crash.exe", 2002)

	ended, err := tracker.EndSession(session.ID, 42, "process crashed with segmentation fault")
	if err != nil {
		t.Fatalf("unexpected error ending session: %v", err)
	}
	if ended.State != StateFailed {
		t.Fatalf("expected StateFailed, got %s", ended.State)
	}
	if ended.ExitCode != 42 {
		t.Fatalf("expected exit code 42, got %d", ended.ExitCode)
	}
	if ended.ErrorMessage != "process crashed with segmentation fault" {
		t.Fatalf("expected crash message, got %s", ended.ErrorMessage)
	}

	// Query non-existent session
	_, err = tracker.EndSession("non-existent-id", 1, "unknown")
	if err != ErrSessionNotFound {
		t.Fatalf("expected ErrSessionNotFound, got %v", err)
	}
}

func TestSessionDurationMinutesCalculation(t *testing.T) {
	start := time.Now().Add(-125 * time.Minute)
	end := time.Now()

	s := &ProcessSession{
		ID:        "test-session",
		StartTime: start,
		EndTime:   &end,
		State:     StateTerminated,
	}

	if s.DurationMinutes() < 124.9 || s.DurationMinutes() > 125.1 {
		t.Fatalf("expected ~125 minutes, got %f", s.DurationMinutes())
	}
	if s.PlaytimeMinutes() != 125 {
		t.Fatalf("expected 125 playtime minutes, got %d", s.PlaytimeMinutes())
	}
}

func TestFileSessionPersister(t *testing.T) {
	tmpDir := t.TempDir()
	sessionFile := filepath.Join(tmpDir, "sessions", "play-sessions.json")

	persister := NewFileSessionPersister(sessionFile)
	tracker1 := NewSessionTracker(persister)

	s1 := tracker1.StartSession("witcher3", "The Witcher 3", "witcher3.exe", 3001)
	_, _ = tracker1.EndSession(s1.ID, 0, "")

	s2 := tracker1.StartSession("cyberpunk", "Cyberpunk 2077", "cyberpunk.exe", 3002)
	_, _ = tracker1.EndSession(s2.ID, 1, "crash")

	// Ensure file was written
	if _, err := os.Stat(sessionFile); err != nil {
		t.Fatalf("expected sessions file to exist: %v", err)
	}

	// Create second tracker with same persister to verify reload
	tracker2 := NewSessionTracker(persister)
	history := tracker2.SessionHistory(10)
	if len(history) != 2 {
		t.Fatalf("expected 2 reloaded sessions in history, got %d", len(history))
	}
	if history[0].GameID != "witcher3" || history[1].GameID != "cyberpunk" {
		t.Fatalf("unexpected history order: %+v", history)
	}
}

func TestSessionCallbacks(t *testing.T) {
	tracker := NewSessionTracker(nil)

	var startedCalled, endedCalled bool
	tracker.SetCallbacks(
		func(s *ProcessSession) {
			if s.GameID == "game-cb" {
				startedCalled = true
			}
		},
		func(s *ProcessSession) {
			if s.GameID == "game-cb" && s.ExitCode == 0 {
				endedCalled = true
			}
		},
	)

	s := tracker.StartSession("game-cb", "Callback Game", "cb.exe", 4001)
	if !startedCalled {
		t.Fatal("expected started callback to be triggered")
	}

	_, _ = tracker.EndSession(s.ID, 0, "")
	if !endedCalled {
		t.Fatal("expected ended callback to be triggered")
	}
}

func TestSessionTrackerConcurrency(t *testing.T) {
	tracker := NewSessionTracker(nil)
	var wg sync.WaitGroup

	numGoroutines := 20
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			gameID := fmt.Sprintf("game-%d", id)
			s := tracker.StartSession(gameID, "Concurrent Game", "game.exe", 1000+id)

			// Concurrent reads
			_ = tracker.ActiveSessions()
			_ = tracker.ActiveCount()
			_, _ = tracker.GetSession(s.ID)
			_, _ = tracker.ActiveSessionByPID(s.PID)
			_, _ = tracker.ActiveSessionByGameID(gameID)

			_, _ = tracker.EndSession(s.ID, 0, "")
			_ = tracker.SessionHistory(5)
		}(i)
	}

	wg.Wait()

	if tracker.ActiveCount() != 0 {
		t.Fatalf("expected 0 active sessions after all ended, got %d", tracker.ActiveCount())
	}
	if len(tracker.SessionHistory(100)) != numGoroutines {
		t.Fatalf("expected %d history records, got %d", numGoroutines, len(tracker.SessionHistory(100)))
	}
}
