package games

import (
	"time"
)

// RunningGame represents a currently running game process being monitored.
type RunningGame struct {
	ID                 string           `json:"id"`
	Title              string           `json:"title"`
	ExePath            string           `json:"exe_path,omitempty"`
	ProcessName        string           `json:"process_name"`
	PID                int              `json:"pid"`
	StartTime          time.Time        `json:"start_time"`
	CurrentDurationSec int              `json:"current_duration_seconds"`
	FpsAvailable       bool             `json:"fps_available"`
	FpsSnapshot        *LiveFpsSnapshot `json:"fps_snapshot,omitempty"`
}

// LiveFpsSnapshot captures the instant performance metrics for live display and sparklines.
type LiveFpsSnapshot struct {
	FPS          float64 `json:"fps"`
	AvgFPS       float64 `json:"avg_fps"`
	MinFPS       float64 `json:"min_fps"`
	MaxFPS       float64 `json:"max_fps"`
	Low1Percent  float64 `json:"low_1_percent"`
	Low01Percent float64 `json:"low_01_percent"`
	FrameCount   int64   `json:"frame_count"`
	SampleCount  int     `json:"sample_count"`
	Timestamp    int64   `json:"timestamp"` // Unix timestamp in ms
	IsLoading    bool    `json:"is_loading,omitempty"`
	IsBackground bool    `json:"is_background,omitempty"`
}

// FpsStatsData aggregates overall performance metrics at the end of a session.
type FpsStatsData struct {
	AvgFPS            float64 `json:"avg_fps"`
	MinFPS            float64 `json:"min_fps"`
	MaxFPS            float64 `json:"max_fps"`
	Low1Percent       float64 `json:"low_1_percent"`
	Low01Percent      float64 `json:"low_01_percent"`
	TotalFrames       int64   `json:"total_frames"`
	GameplayFrames    int64   `json:"gameplay_frames,omitempty"`
	DurationSeconds   int     `json:"duration_seconds"`
	GameplaySeconds   int     `json:"gameplay_seconds,omitempty"`
	LoadingSeconds    int     `json:"loading_seconds,omitempty"`
	BackgroundSeconds int     `json:"background_seconds,omitempty"`
}

// PlaySession records a completed gaming session.
type PlaySession struct {
	ID              string        `json:"id"`
	GameID          string        `json:"game_id"`
	GameTitle       string        `json:"game_title"`
	ProcessName     string        `json:"process_name"`
	StartTime       string        `json:"start_time"`
	EndTime         string        `json:"end_time"`
	DurationSeconds int           `json:"duration_seconds"`
	FpsStats        *FpsStatsData `json:"fps_stats,omitempty"`
}

// GamePlaytimeSummary summarizes lifetime stats for a single game.
type GamePlaytimeSummary struct {
	GameID       string        `json:"game_id"`
	GameTitle    string        `json:"game_title"`
	TotalMinutes int           `json:"total_minutes"`
	SessionCount int           `json:"session_count"`
	LastPlayed   *string       `json:"last_played"`
	LastFpsStats *FpsStatsData `json:"last_fps_stats,omitempty"`
}

// GameMapping maps a process executable name to a specific Otix game.
type GameMapping struct {
	ProcessName string `json:"process_name"`
	GameID      string `json:"game_id"`
	GameTitle   string `json:"game_title"`
}

// OverlaySettings controls the appearance and behavior of the HUD overlay.
type OverlaySettings struct {
	Enabled         bool    `json:"enabled"`
	Corner          string  `json:"corner"` // "top-left", "top-right", "bottom-left", "bottom-right"
	ShowFps         bool    `json:"show_fps"`
	ShowPercentiles bool    `json:"show_percentiles"`
	ShowPlaytime    bool    `json:"show_playtime"`
	ShowTitle       bool    `json:"show_title"`
	Opacity         float64 `json:"opacity"`
	Scale           float64 `json:"scale"`
	Hotkey          string  `json:"hotkey"`
}

// DefaultOverlaySettings provides sensible defaults for the HUD.
func DefaultOverlaySettings() OverlaySettings {
	return OverlaySettings{
		Enabled:         true,
		Corner:          "top-left",
		ShowFps:         true,
		ShowPercentiles: true,
		ShowPlaytime:    true,
		ShowTitle:       true,
		Opacity:         0.92,
		Scale:           1.0,
		Hotkey:          "Ctrl+Shift+O",
	}
}

// ProcessInfo represents a running OS process.
type ProcessInfo struct {
	PID  int    `json:"pid"`
	Name string `json:"name"`
	Path string `json:"path,omitempty"`
}
