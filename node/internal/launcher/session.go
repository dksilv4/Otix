package launcher

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

var (
	ErrSessionNotFound = errors.New("session not found")
	ErrSessionEnded    = errors.New("session is already ended")
)

// ProcessState describes the lifecycle status of a launched process.
type ProcessState string

const (
	StateStarting   ProcessState = "starting"
	StateRunning    ProcessState = "running"
	StateTerminated ProcessState = "terminated"
	StateFailed     ProcessState = "failed"
)

// ProcessSession models an active or historical game execution session.
type ProcessSession struct {
	ID              string       `json:"id"`
	GameID          string       `json:"game_id"`
	Title           string       `json:"title"`
	PID             int          `json:"pid"`
	ExecutablePath  string       `json:"executable_path"`
	State           ProcessState `json:"state"`
	StartTime       time.Time    `json:"start_time"`
	EndTime         *time.Time   `json:"end_time,omitempty"`
	DurationSeconds int          `json:"duration_seconds"`
	ExitCode        int          `json:"exit_code"`
	ErrorMessage    string       `json:"error_message,omitempty"`
}

// IsActive returns true if the session is currently in starting or running state.
func (s *ProcessSession) IsActive() bool {
	return s.State == StateStarting || s.State == StateRunning
}

// Duration returns the total duration if ended, or elapsed time since StartTime if still active.
func (s *ProcessSession) Duration() time.Duration {
	if s.EndTime != nil && !s.EndTime.IsZero() {
		return s.EndTime.Sub(s.StartTime)
	}
	if s.StartTime.IsZero() {
		return 0
	}
	return time.Since(s.StartTime)
}

// DurationMinutes returns the elapsed or recorded duration in fractional minutes.
func (s *ProcessSession) DurationMinutes() float64 {
	return s.Duration().Minutes()
}

// PlaytimeMinutes returns the duration rounded to the nearest integer minute.
func (s *ProcessSession) PlaytimeMinutes() int {
	return int(math.Round(s.DurationMinutes()))
}

// Snapshot returns a copy of the session with live DurationSeconds calculated.
func (s *ProcessSession) Snapshot() *ProcessSession {
	cp := *s
	if cp.IsActive() {
		cp.DurationSeconds = int(math.Max(0, time.Since(cp.StartTime).Seconds()))
	}
	return &cp
}

// SessionPersister handles saving and loading session history.
type SessionPersister interface {
	Save(sessions []*ProcessSession) error
	Load() ([]*ProcessSession, error)
}

// FileSessionPersister persists session records as JSON.
type FileSessionPersister struct {
	filePath string
	mu       sync.Mutex
}

// NewFileSessionPersister creates a persister targeting the given file path.
func NewFileSessionPersister(filePath string) *FileSessionPersister {
	return &FileSessionPersister{
		filePath: filePath,
	}
}

// Save writes sessions to disk in indented JSON format with parent dir creation.
func (p *FileSessionPersister) Save(sessions []*ProcessSession) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	dir := filepath.Dir(p.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create session directory: %w", err)
	}

	data, err := json.MarshalIndent(sessions, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal sessions: %w", err)
	}

	tmpPath := p.filePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write temp sessions file: %w", err)
	}

	if err := os.Rename(tmpPath, p.filePath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to atomic rename sessions file: %w", err)
	}

	return nil
}

// Load reads sessions from disk. Returns empty slice if file does not exist.
func (p *FileSessionPersister) Load() ([]*ProcessSession, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	data, err := os.ReadFile(p.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []*ProcessSession{}, nil
		}
		return nil, fmt.Errorf("failed to read sessions file: %w", err)
	}

	var list []*ProcessSession
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, fmt.Errorf("failed to parse sessions file: %w", err)
	}

	return list, nil
}

// SessionTracker coordinates in-memory active sessions and persisted history.
type SessionTracker struct {
	mu         sync.RWMutex
	active     map[string]*ProcessSession
	history    []*ProcessSession
	persister  SessionPersister
	maxHistory int

	onStarted func(session *ProcessSession)
	onEnded   func(session *ProcessSession)
}

// NewSessionTracker initializes a tracker with optional persistence.
func NewSessionTracker(persister SessionPersister) *SessionTracker {
	st := &SessionTracker{
		active:     make(map[string]*ProcessSession),
		history:    make([]*ProcessSession, 0),
		persister:  persister,
		maxHistory: 200,
	}

	if persister != nil {
		if loaded, err := persister.Load(); err == nil && len(loaded) > 0 {
			st.history = loaded
		}
	}

	return st
}

// SetCallbacks registers lifecycle hook callbacks.
func (st *SessionTracker) SetCallbacks(onStarted func(s *ProcessSession), onEnded func(s *ProcessSession)) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.onStarted = onStarted
	st.onEnded = onEnded
}

// StartSession creates, records, and returns a new active process session.
func (st *SessionTracker) StartSession(gameID, title, exePath string, pid int) *ProcessSession {
	st.mu.Lock()

	sessionID := uuid.New().String()
	now := time.Now().UTC()

	session := &ProcessSession{
		ID:              sessionID,
		GameID:          gameID,
		Title:           title,
		PID:             pid,
		ExecutablePath:  exePath,
		State:           StateRunning,
		StartTime:       now,
		DurationSeconds: 0,
		ExitCode:        0,
	}

	st.active[sessionID] = session

	cb := st.onStarted
	st.mu.Unlock()

	if cb != nil {
		cb(session.Snapshot())
	}

	return session.Snapshot()
}

// EndSession records termination of an active session, calculating duration and exit code.
func (st *SessionTracker) EndSession(sessionID string, exitCode int, errMsg string) (*ProcessSession, error) {
	st.mu.Lock()

	session, exists := st.active[sessionID]
	if !exists {
		// Check if it's already in history
		for _, h := range st.history {
			if h.ID == sessionID {
				st.mu.Unlock()
				return h.Snapshot(), nil
			}
		}
		st.mu.Unlock()
		return nil, ErrSessionNotFound
	}

	now := time.Now().UTC()
	session.EndTime = &now
	session.DurationSeconds = int(math.Max(0, now.Sub(session.StartTime).Seconds()))
	session.ExitCode = exitCode
	session.ErrorMessage = errMsg

	if exitCode == 0 {
		session.State = StateTerminated
	} else {
		session.State = StateFailed
	}

	delete(st.active, sessionID)
	st.history = append(st.history, session)

	if len(st.history) > st.maxHistory {
		st.history = st.history[len(st.history)-st.maxHistory:]
	}

	// Prepare history copy for saving
	var toSave []*ProcessSession
	if st.persister != nil {
		toSave = make([]*ProcessSession, len(st.history))
		for i, s := range st.history {
			toSave[i] = s.Snapshot()
		}
	}

	result := session.Snapshot()
	cb := st.onEnded
	st.mu.Unlock()

	if st.persister != nil && len(toSave) > 0 {
		_ = st.persister.Save(toSave)
	}

	if cb != nil {
		cb(result)
	}

	return result, nil
}

// GetSession returns a snapshot of a session by ID if found in active or history.
func (st *SessionTracker) GetSession(sessionID string) (*ProcessSession, bool) {
	st.mu.RLock()
	defer st.mu.RUnlock()

	if active, ok := st.active[sessionID]; ok {
		return active.Snapshot(), true
	}

	for _, h := range st.history {
		if h.ID == sessionID {
			return h.Snapshot(), true
		}
	}

	return nil, false
}

// ActiveSessions returns live snapshots of all currently active sessions.
func (st *SessionTracker) ActiveSessions() []*ProcessSession {
	st.mu.RLock()
	defer st.mu.RUnlock()

	list := make([]*ProcessSession, 0, len(st.active))
	for _, s := range st.active {
		list = append(list, s.Snapshot())
	}
	return list
}

// ActiveSessionByPID looks up an active session by process PID.
func (st *SessionTracker) ActiveSessionByPID(pid int) (*ProcessSession, bool) {
	st.mu.RLock()
	defer st.mu.RUnlock()

	for _, s := range st.active {
		if s.PID == pid {
			return s.Snapshot(), true
		}
	}
	return nil, false
}

// ActiveSessionByGameID looks up an active session by game ID.
func (st *SessionTracker) ActiveSessionByGameID(gameID string) (*ProcessSession, bool) {
	st.mu.RLock()
	defer st.mu.RUnlock()

	for _, s := range st.active {
		if s.GameID == gameID {
			return s.Snapshot(), true
		}
	}
	return nil, false
}

// SessionHistory returns historical completed sessions up to limit.
func (st *SessionTracker) SessionHistory(limit int) []*ProcessSession {
	st.mu.RLock()
	defer st.mu.RUnlock()

	if limit <= 0 || limit > len(st.history) {
		limit = len(st.history)
	}

	startIdx := len(st.history) - limit
	list := make([]*ProcessSession, limit)
	for i := 0; i < limit; i++ {
		list[i] = st.history[startIdx+i].Snapshot()
	}
	return list
}

// ActiveCount returns the number of currently running game sessions.
func (st *SessionTracker) ActiveCount() int {
	st.mu.RLock()
	defer st.mu.RUnlock()
	return len(st.active)
}
