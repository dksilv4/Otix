package games

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	MaxSessionHistory = 200
)

// SessionStore handles persistence of play sessions, game mappings, and overlay settings.
type SessionStore struct {
	mu           sync.RWMutex
	baseDir      string
	sessions     []PlaySession
	mappings     map[string]GameMapping // lowercase processName -> GameMapping
	overlayPrefs OverlaySettings
}

// NewSessionStore initializes the store at the given base directory (typically ./storage).
func NewSessionStore(baseDir string) (*SessionStore, error) {
	gamesDir := filepath.Join(baseDir, "games")
	if err := os.MkdirAll(gamesDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create games storage directory: %w", err)
	}

	store := &SessionStore{
		baseDir:      baseDir,
		sessions:     make([]PlaySession, 0),
		mappings:     make(map[string]GameMapping),
		overlayPrefs: DefaultOverlaySettings(),
	}

	store.loadSessions()
	store.loadMappings()
	store.loadOverlaySettings()

	return store, nil
}

func (s *SessionStore) sessionsFilePath() string {
	return filepath.Join(s.baseDir, "games", "play-sessions.json")
}

func (s *SessionStore) mappingsFilePath() string {
	return filepath.Join(s.baseDir, "games", "game-mappings.json")
}

func (s *SessionStore) overlayFilePath() string {
	return filepath.Join(s.baseDir, "games", "overlay-settings.json")
}

func (s *SessionStore) loadSessions() {
	path := s.sessionsFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	var list []PlaySession
	if err := json.Unmarshal(data, &list); err == nil {
		s.sessions = list
	}
}

func (s *SessionStore) saveSessionsLocked() error {
	path := s.sessionsFilePath()
	data, err := json.MarshalIndent(s.sessions, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func (s *SessionStore) loadMappings() {
	path := s.mappingsFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	var list []GameMapping
	if err := json.Unmarshal(data, &list); err == nil {
		for _, m := range list {
			s.mappings[strings.ToLower(m.ProcessName)] = m
		}
	}
}

func (s *SessionStore) saveMappingsLocked() error {
	path := s.mappingsFilePath()
	list := make([]GameMapping, 0, len(s.mappings))
	for _, m := range s.mappings {
		list = append(list, m)
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].ProcessName < list[j].ProcessName
	})

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func (s *SessionStore) loadOverlaySettings() {
	path := s.overlayFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	var prefs OverlaySettings
	if err := json.Unmarshal(data, &prefs); err == nil {
		s.overlayPrefs = prefs
	}
}

func (s *SessionStore) saveOverlaySettingsLocked() error {
	path := s.overlayFilePath()
	data, err := json.MarshalIndent(s.overlayPrefs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// RecordSession adds a new completed session and trims history.
func (s *SessionStore) RecordSession(session PlaySession) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if session.ID == "" {
		session.ID = fmt.Sprintf("sess_%d", time.Now().UnixNano())
	}
	if session.EndTime == "" {
		session.EndTime = time.Now().Format(time.RFC3339)
	}

	// Insert newest first
	s.sessions = append([]PlaySession{session}, s.sessions...)
	if len(s.sessions) > MaxSessionHistory {
		s.sessions = s.sessions[:MaxSessionHistory]
	}

	return s.saveSessionsLocked()
}

// GetRecentSessions returns up to limit sessions.
func (s *SessionStore) GetRecentSessions(limit int) []PlaySession {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > len(s.sessions) {
		limit = len(s.sessions)
	}
	result := make([]PlaySession, limit)
	copy(result, s.sessions[:limit])
	return result
}

// GetPlaytimeForGame calculates total playtime and latest session metrics for a given game ID.
func (s *SessionStore) GetPlaytimeForGame(gameID string) GamePlaytimeSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	totalSec := 0
	sessionCount := 0
	var lastPlayed *string
	var lastFps *FpsStatsData
	var title string

	for _, sess := range s.sessions {
		if sess.GameID == gameID {
			totalSec += sess.DurationSeconds
			sessionCount++
			if lastPlayed == nil {
				endTime := sess.EndTime
				lastPlayed = &endTime
				lastFps = sess.FpsStats
				title = sess.GameTitle
			}
		}
	}

	return GamePlaytimeSummary{
		GameID:       gameID,
		GameTitle:    title,
		TotalMinutes: totalSec / 60,
		SessionCount: sessionCount,
		LastPlayed:   lastPlayed,
		LastFpsStats: lastFps,
	}
}

// AddMapping registers or updates a custom process-to-game mapping.
func (s *SessionStore) AddMapping(mapping GameMapping) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := strings.ToLower(strings.TrimSpace(mapping.ProcessName))
	if key == "" {
		return fmt.Errorf("process name cannot be empty")
	}

	mapping.ProcessName = key
	s.mappings[key] = mapping
	return s.saveMappingsLocked()
}

// RemoveMapping deletes a custom process mapping.
func (s *SessionStore) RemoveMapping(processName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := strings.ToLower(strings.TrimSpace(processName))
	delete(s.mappings, key)
	return s.saveMappingsLocked()
}

// GetMappings lists all custom mappings.
func (s *SessionStore) GetMappings() []GameMapping {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]GameMapping, 0, len(s.mappings))
	for _, m := range s.mappings {
		list = append(list, m)
	}
	return list
}

// GetMappingForProcess looks up mapping by executable name.
func (s *SessionStore) GetMappingForProcess(processName string) *GameMapping {
	s.mu.RLock()
	defer s.mu.RUnlock()

	key := strings.ToLower(strings.TrimSpace(processName))
	if m, ok := s.mappings[key]; ok {
		return &m
	}
	return nil
}

// GetOverlaySettings returns current overlay preferences.
func (s *SessionStore) GetOverlaySettings() OverlaySettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.overlayPrefs
}

// SaveOverlaySettings updates overlay preferences.
func (s *SessionStore) SaveOverlaySettings(settings OverlaySettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.overlayPrefs = settings
	return s.saveOverlaySettingsLocked()
}
