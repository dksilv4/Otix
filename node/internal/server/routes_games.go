package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/dksilv4/otix/node/internal/explorer"
	"github.com/dksilv4/otix/node/internal/games"
	"github.com/dksilv4/otix/node/internal/hardware"
	"github.com/go-chi/chi/v5"
)

func (s *Server) registerGamesRoutes(r chi.Router) {
	// Hardware inspection (host hardware specs)
	r.Get("/api/v1/hardware", func(w http.ResponseWriter, r *http.Request) {
		refresh := r.URL.Query().Get("refresh") == "true"
		jsonResponse(w, http.StatusOK, hardware.GetMachineHardware(refresh))
	})
	r.Get("/api/v1/desktop/hardware", func(w http.ResponseWriter, r *http.Request) {
		refresh := r.URL.Query().Get("refresh") == "true"
		jsonResponse(w, http.StatusOK, hardware.GetMachineHardware(refresh))
	})

	// Status (Rich server metrics)
	r.Get("/api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		isAuthed := s.isTokenValid(r)
		uptime := int(time.Since(s.startTime).Seconds())
		totalFiles := s.indexer.TotalFiles()
		totalSize := s.indexer.TotalSizeBytes()

		var freeBytes, totalBytes uint64
		if isAuthed {
			storagePath := s.cfg.Saves.StoragePath
			if len(s.cfg.GameLibraries) > 0 {
				storagePath = s.cfg.GameLibraries[0].Path
			}
			f, t, err := explorer.GetDiskUsage(storagePath)
			if err == nil {
				freeBytes = f
				totalBytes = t
			}
		}

		resp := map[string]interface{}{
			"status":          "online",
			"server_name":     s.cfg.Server.Name,
			"version":         "0.0.1",
			"uptime_seconds":  uptime,
			"libraries_count": len(s.cfg.GameLibraries),
			"total_files":     totalFiles,
			"claimed":         s.claimMgr.IsClaimed(),
			"claimed_by":      s.claimMgr.Status().Username,
		}
		if isAuthed {
			resp["total_size_bytes"] = totalSize
			resp["disk_free_bytes"] = freeBytes
			resp["disk_total_bytes"] = totalBytes
		}
		jsonResponse(w, http.StatusOK, resp)
	})

	// â”€â”€ Game Detection, FPS Tracking & Overlay APIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	// Web Overlay HTML
	r.Get("/api/v1/games/overlay", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(games.WebOverlayHTML))
	})

	// Live FPS SSE stream
	r.Get("/api/v1/games/fps/live", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
			return
		}

		// Send initial snapshot if available
		snap := s.fpsCollector.GetSnapshot()
		if snap != nil {
			data, _ := json.Marshal(snap)
			_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}

		ch := s.fpsCollector.Subscribe()
		defer s.fpsCollector.Unsubscribe(ch)

		ctx := r.Context()
		for {
			select {
			case <-ctx.Done():
				return
			case snapshot, ok := <-ch:
				if !ok {
					return
				}
				data, err := json.Marshal(snapshot)
				if err == nil {
					_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
					flusher.Flush()
				}
			}
		}
	})

	// Fix FPS capture permissions (adds user to Performance Log Users)
	r.Post("/api/v1/games/fps/fix-permissions", func(w http.ResponseWriter, r *http.Request) {
		success, err := games.FixFpsPermissions()
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
			return
		}
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"success":      success,
			"need_restart": true,
		})
	})

	// Currently running games
	r.Get("/api/v1/games/running", func(w http.ResponseWriter, r *http.Request) {
		runningGames := s.gamesTracker.GetRunningGames()
		single := s.gamesTracker.GetRunningGame()
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"running": len(runningGames) > 0,
			"game":    single,
			"games":   runningGames,
		})
	})

	// Switch or cycle active game focus
	r.Post("/api/v1/games/active", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			GameID string `json:"game_id"`
			Action string `json:"action"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		var target *games.RunningGame
		if req.Action == "cycle" {
			target = s.gamesTracker.CycleActiveGame()
		} else if req.GameID != "" {
			target = s.gamesTracker.SetActiveGame(req.GameID)
		} else {
			target = s.gamesTracker.GetActiveGame()
		}
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"success":     target != nil,
			"active_game": target,
		})
	})

	// Recent play sessions
	r.Get("/api/v1/games/sessions", func(w http.ResponseWriter, r *http.Request) {
		limit := 20
		if l := r.URL.Query().Get("limit"); l != "" {
			if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
				limit = parsed
			}
		}
		jsonResponse(w, http.StatusOK, s.gamesStore.GetRecentSessions(limit))
	})

	// Playtime summary for a specific game
	r.Get("/api/v1/games/playtime/{game_id}", func(w http.ResponseWriter, r *http.Request) {
		gameID := chi.URLParam(r, "game_id")
		jsonResponse(w, http.StatusOK, s.gamesStore.GetPlaytimeForGame(gameID))
	})

	// Running processes list
	r.Get("/api/v1/games/processes", func(w http.ResponseWriter, r *http.Request) {
		procs, err := games.ListProcesses()
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, http.StatusOK, procs)
	})

	// Custom process mappings
	r.Get("/api/v1/games/mappings", func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, http.StatusOK, s.gamesStore.GetMappings())
	})

	r.Post("/api/v1/games/mappings", func(w http.ResponseWriter, r *http.Request) {
		var mapping games.GameMapping
		if err := json.NewDecoder(r.Body).Decode(&mapping); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}
		if err := s.gamesStore.AddMapping(mapping); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}
		jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Delete("/api/v1/games/mappings/{process_name}", func(w http.ResponseWriter, r *http.Request) {
		procName := chi.URLParam(r, "process_name")
		if err := s.gamesStore.RemoveMapping(procName); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Launch game executable
	r.Post("/api/v1/games/launch", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ExePath string   `json:"exe_path"`
			Args    []string `json:"args"`
			GameID  string   `json:"game_id"`
			Title   string   `json:"title"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}
		if req.ExePath == "" {
			http.Error(w, `{"error":"exe_path is required"}`, http.StatusBadRequest)
			return
		}
		running, err := s.gamesTracker.Launch(req.ExePath, req.Args, req.GameID, req.Title)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"status": "launched",
			"game":   running,
		})
	})

	// Stop tracking active game
	r.Post("/api/v1/games/stop", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			GameID string `json:"game_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		s.gamesTracker.StopTracking(req.GameID)
		jsonResponse(w, http.StatusOK, map[string]string{"status": "stopped"})
	})

	// Overlay Settings, monitors & controls
	r.Get("/api/v1/games/overlay/settings", func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, http.StatusOK, s.gamesStore.GetOverlaySettings())
	})

	r.Get("/api/v1/games/overlay/monitors", func(w http.ResponseWriter, r *http.Request) {
		if s.overlayMgr != nil {
			jsonResponse(w, http.StatusOK, s.overlayMgr.GetAvailableMonitors())
		} else {
			jsonResponse(w, http.StatusOK, []games.MonitorInfo{{ID: "auto", Name: "Auto (Follow Active Game)"}})
		}
	})

	r.Post("/api/v1/games/overlay/settings", func(w http.ResponseWriter, r *http.Request) {
		settings := s.gamesStore.GetOverlaySettings()
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}
		if v, ok := body["enabled"]; ok {
			if b, okB := v.(bool); okB {
				settings.Enabled = b
			}
		}
		if v, ok := body["corner"]; ok {
			if sVal, okS := v.(string); okS && sVal != "" {
				settings.Corner = sVal
			}
		}
		if v, ok := body["monitor"]; ok {
			if sVal, okS := v.(string); okS && sVal != "" {
				settings.Monitor = sVal
			}
		}
		if v, ok := body["hotkey"]; ok {
			if sVal, okS := v.(string); okS && sVal != "" {
				settings.Hotkey = sVal
			}
		}
		if v, ok := body["show_fps"]; ok {
			if b, okB := v.(bool); okB {
				settings.ShowFps = b
			}
		} else if v, ok := body["showFps"]; ok {
			if b, okB := v.(bool); okB {
				settings.ShowFps = b
			}
		}
		if v, ok := body["show_percentiles"]; ok {
			if b, okB := v.(bool); okB {
				settings.ShowPercentiles = b
			}
		} else if v, ok := body["showPercentiles"]; ok {
			if b, okB := v.(bool); okB {
				settings.ShowPercentiles = b
			}
		}
		if v, ok := body["show_playtime"]; ok {
			if b, okB := v.(bool); okB {
				settings.ShowPlaytime = b
			}
		} else if v, ok := body["showPlaytime"]; ok {
			if b, okB := v.(bool); okB {
				settings.ShowPlaytime = b
			}
		}
		if v, ok := body["show_title"]; ok {
			if b, okB := v.(bool); okB {
				settings.ShowTitle = b
			}
		} else if v, ok := body["showTitle"]; ok {
			if b, okB := v.(bool); okB {
				settings.ShowTitle = b
			}
		}
		if v, ok := body["opacity"]; ok {
			if fVal, okF := v.(float64); okF && fVal > 0 {
				settings.Opacity = fVal
			}
		}
		if v, ok := body["scale"]; ok {
			if fVal, okF := v.(float64); okF && fVal > 0 {
				settings.Scale = fVal
			}
		}
		if v, ok := body["only_track_scanned"]; ok {
			if b, okB := v.(bool); okB {
				settings.OnlyTrackScanned = b
				if s.gamesTracker != nil {
					s.gamesTracker.SetOnlyTrackScanned(b)
				}
			}
		} else if v, ok := body["onlyTrackScanned"]; ok {
			if b, okB := v.(bool); okB {
				settings.OnlyTrackScanned = b
				if s.gamesTracker != nil {
					s.gamesTracker.SetOnlyTrackScanned(b)
				}
			}
		} else if v, ok := body["onlyTrackScannedGames"]; ok {
			if b, okB := v.(bool); okB {
				settings.OnlyTrackScanned = b
				if s.gamesTracker != nil {
					s.gamesTracker.SetOnlyTrackScanned(b)
				}
			}
		}
		if settings.Opacity <= 0 || settings.Opacity > 1.0 {
			settings.Opacity = 0.92
		}
		if settings.Scale <= 0 {
			settings.Scale = 1.0
		}
		if err := s.gamesStore.SaveOverlaySettings(settings); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
			return
		}
		if s.overlayMgr != nil {
			s.overlayMgr.ApplySettings(settings)
		}
		jsonResponse(w, http.StatusOK, settings)
	})

	r.Post("/api/v1/games/overlay/toggle", func(w http.ResponseWriter, r *http.Request) {
		s.overlayMgr.Toggle()
		jsonResponse(w, http.StatusOK, map[string]string{"status": "toggled"})
	})


}
