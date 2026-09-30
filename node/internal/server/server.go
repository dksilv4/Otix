package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/dksilv4/otix/node/internal/arr"
	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/desktop"
	"github.com/dksilv4/otix/node/internal/epic"
	"github.com/dksilv4/otix/node/internal/explorer"
	"github.com/dksilv4/otix/node/internal/games"
	"github.com/dksilv4/otix/node/internal/heartbeat"
	"github.com/dksilv4/otix/node/internal/indexer"
	"github.com/dksilv4/otix/node/internal/otixmeta"
	"github.com/dksilv4/otix/node/internal/plugins"
	"github.com/dksilv4/otix/node/internal/providers"
	"github.com/dksilv4/otix/node/internal/saves"
	"github.com/dksilv4/otix/node/internal/usenet"
	"github.com/dksilv4/otix/node/internal/webui"
)

type Server struct {
	cfg          *config.AppConfig
	claimMgr     *claim.ClaimManager
	indexer      *indexer.StorageIndexer
	savesMgr     *saves.SaveCloudManager
	epicClient   *epic.EpicClient
	providersMgr *providers.ProviderManager
	dealsMonitor *plugins.DealsMonitor
	gamesStore   *games.SessionStore
	gamesTracker *games.GameTracker
	fpsCollector games.FpsCollector
	overlayMgr   *games.OverlayManager
	startTime    time.Time
	router       *chi.Mux
}

func NewServer(cfg *config.AppConfig, claimMgr *claim.ClaimManager) *Server {
	idx := indexer.NewStorageIndexer(cfg.GameLibraries)
	go idx.ScanAll()

	storageDir := filepath.Dir(cfg.Saves.StoragePath)
	if storageDir == "" || storageDir == "." {
		storageDir = "./storage"
	}

	savesMgr := saves.NewSaveCloudManager(cfg.Saves.StoragePath, cfg.Saves.MaxSnapshotsPerGame)
	epicClient := epic.NewEpicClient(storageDir)
	provMgr := providers.NewProviderManager(cfg)
	dealsMon := plugins.NewDealsMonitor()

	gamesStore, err := games.NewSessionStore(storageDir)
	if err != nil {
		fmt.Printf("[Server] Warning: failed to init games store: %v\n", err)
	}
	fpsCollector := games.NewPresentMonCollector(storageDir)
	gamesTracker := games.NewGameTracker(gamesStore, fpsCollector, idx)
	gamesTracker.Start()
	overlayMgr := games.NewOverlayManager(gamesStore, gamesTracker, fpsCollector)
	overlayMgr.Start()

	s := &Server{
		cfg:          cfg,
		claimMgr:     claimMgr,
		indexer:      idx,
		savesMgr:     savesMgr,
		epicClient:   epicClient,
		providersMgr: provMgr,
		dealsMonitor: dealsMon,
		gamesStore:   gamesStore,
		gamesTracker: gamesTracker,
		fpsCollector: fpsCollector,
		overlayMgr:   overlayMgr,
		startTime:    time.Now(),
		router:       chi.NewRouter(),
	}

	s.setupRoutes()
	return s
}

func (s *Server) GamesTracker() *games.GameTracker {
	return s.gamesTracker
}

func (s *Server) GamesStore() *games.SessionStore {
	return s.gamesStore
}

func (s *Server) FpsCollector() games.FpsCollector {
	return s.fpsCollector
}

func (s *Server) OverlayManager() *games.OverlayManager {
	return s.overlayMgr
}

func (s *Server) Router() http.Handler {
	return s.router
}

// Indexer exposes the storage indexer for tests and internal tooling.
func (s *Server) Indexer() *indexer.StorageIndexer {
	return s.indexer
}

func (s *Server) verifyToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expected := s.cfg.Server.AuthToken
		if expected == "" {
			next.ServeHTTP(w, r)
			return
		}

		provided := ""
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			provided = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			provided = r.URL.Query().Get("token")
		}

		if provided != expected {
			http.Error(w, `{"detail":"Invalid server authorization token"}`, http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) isTokenValid(r *http.Request) bool {
	expected := s.cfg.Server.AuthToken
	if expected == "" {
		return true
	}
	provided := ""
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		provided = strings.TrimPrefix(authHeader, "Bearer ")
	} else {
		provided = r.URL.Query().Get("token")
	}
	return provided == expected
}

func jsonResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(data)
}

func matchLibraryPath(filePath string, libPaths []string) string {
	best := ""
	for _, libPath := range libPaths {
		if libPath == "" {
			continue
		}
		if filePath == libPath || strings.HasPrefix(filePath, strings.TrimRight(libPath, string(os.PathSeparator))+string(os.PathSeparator)) {
			if len(libPath) > len(best) {
				best = libPath
			}
		}
	}
	return best
}

func (s *Server) setupRoutes() {
	r := s.router

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		ExposedHeaders:   []string{"Content-Range", "Accept-Ranges", "Content-Length", "Content-Disposition"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Root WebUI
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		uptime := int(time.Since(s.startTime).Seconds())
		htmlContent := webui.RenderHome(s.cfg, s.claimMgr, s.indexer, uptime)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(htmlContent))
	})

	// Public Health & Claim APIs
	r.Get("/api/v1/ping", func(w http.ResponseWriter, r *http.Request) {
		status := s.claimMgr.Status()
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"status":      "online",
			"server_name": s.cfg.Server.Name,
			"version":     "0.0.1",
			"claimed":     status.Claimed,
			"claimed_by":  status.Username,
		})
	})

	r.Get("/api/v1/claim/status", func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, http.StatusOK, s.claimMgr.Status())
	})

	r.Post("/api/v1/claim/confirm", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ClaimCode  string `json:"claim_code"`
			AuthToken  string `json:"auth_token"`
			ServerName string `json:"server_name"`
			Username   string `json:"username"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}

		err := s.claimMgr.Confirm(req.ClaimCode, req.AuthToken, req.ServerName, req.Username)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}

		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"status":  "claimed",
			"message": "Node successfully claimed and assigned to account",
		})
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

	// ── Game Detection, FPS Tracking & Overlay APIs ──────────────────────────────
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

	// Currently running game
	r.Get("/api/v1/games/running", func(w http.ResponseWriter, r *http.Request) {
		running := s.gamesTracker.GetRunningGame()
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"running": running != nil,
			"game":    running,
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

	// Overlay Settings & controls
	r.Get("/api/v1/games/overlay/settings", func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, http.StatusOK, s.gamesStore.GetOverlaySettings())
	})

	r.Post("/api/v1/games/overlay/settings", func(w http.ResponseWriter, r *http.Request) {
		var settings games.OverlaySettings
		if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}
		if err := s.gamesStore.SaveOverlaySettings(settings); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
			return
		}
		if settings.Corner != "" {
			s.overlayMgr.SetCorner(settings.Corner)
		}
		if settings.Enabled {
			s.overlayMgr.Show()
		} else {
			s.overlayMgr.Hide()
		}
		jsonResponse(w, http.StatusOK, settings)
	})

	r.Post("/api/v1/games/overlay/toggle", func(w http.ResponseWriter, r *http.Request) {
		s.overlayMgr.Toggle()
		jsonResponse(w, http.StatusOK, map[string]string{"status": "toggled"})
	})

	// Authenticated routes
	r.Group(func(authed chi.Router) {
		authed.Use(s.verifyToken)

		authed.Post("/api/v1/claim/unclaim", func(w http.ResponseWriter, r *http.Request) {
			if err := s.claimMgr.Unclaim(); err != nil {
				http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]interface{}{
				"status":  "unclaimed",
				"message": "Node successfully unclaimed and reset",
			})
		})

		// ── Libraries ────────────────────────────────────────────────────────
		authed.Get("/api/v1/libraries", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, s.indexer.GetLibraries())
		})

		authed.Post("/api/v1/libraries", func(w http.ResponseWriter, r *http.Request) {
			var lib config.LibraryConfig
			if err := json.NewDecoder(r.Body).Decode(&lib); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			if len(lib.AllowedExtensions) == 0 {
				lib.AllowedExtensions = config.DefaultAllowedExtensions(lib.Kind)
			}
			s.cfg.GameLibraries = append(s.cfg.GameLibraries, lib)
			_ = s.cfg.Save("")
			s.indexer.SetLibraries(s.cfg.GameLibraries)
			go s.indexer.ScanAll()

			jsonResponse(w, http.StatusOK, s.cfg.GameLibraries)
		})

		authed.Put("/api/v1/libraries", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Libraries []config.LibraryConfig `json:"libraries"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			for i := range req.Libraries {
				if len(req.Libraries[i].AllowedExtensions) == 0 {
					req.Libraries[i].AllowedExtensions = config.DefaultAllowedExtensions(req.Libraries[i].Kind)
				}
			}
			s.cfg.GameLibraries = req.Libraries
			_ = s.cfg.Save("")
			s.indexer.SetLibraries(s.cfg.GameLibraries)
			go s.indexer.ScanAll()

			jsonResponse(w, http.StatusOK, s.cfg.GameLibraries)
		})

		authed.Post("/api/v1/scan", func(w http.ResponseWriter, r *http.Request) {
			wait := r.URL.Query().Get("wait") == "1" || r.URL.Query().Get("wait") == "true"
			if wait {
				files := s.indexer.ScanAll()
				s.triggerBackendSync()
				jsonResponse(w, http.StatusOK, map[string]any{
					"status": "scanned",
					"count":  len(files),
				})
				return
			}
			go func() {
				s.indexer.ScanAll()
				s.triggerBackendSync()
			}()
			jsonResponse(w, http.StatusOK, map[string]string{"status": "scanning_started"})
		})

		authed.Delete("/api/v1/files", func(w http.ResponseWriter, r *http.Request) {
			cleared := s.indexer.Clear()
			jsonResponse(w, http.StatusOK, map[string]any{
				"status":  "cleared",
				"cleared": cleared,
			})
		})

		authed.Post("/api/v1/scan/clear", func(w http.ResponseWriter, r *http.Request) {
			cleared := s.indexer.Clear()
			jsonResponse(w, http.StatusOK, map[string]any{
				"status":  "cleared",
				"cleared": cleared,
			})
		})

		// ── Otix sidecars ────────────────────────────────────────────────────
		authed.Get("/api/v1/otix/settings", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, map[string]any{
				"write_otix_after_scan": s.cfg.Server.WriteOtixAfterScan,
				"download_otix_images":  s.cfg.Server.DownloadOtixImages,
			})
		})

		authed.Post("/api/v1/otix/settings", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				WriteOtixAfterScan *bool `json:"write_otix_after_scan"`
				DownloadOtixImages *bool `json:"download_otix_images"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			if req.WriteOtixAfterScan != nil {
				s.cfg.Server.WriteOtixAfterScan = *req.WriteOtixAfterScan
			}
			if req.DownloadOtixImages != nil {
				s.cfg.Server.DownloadOtixImages = *req.DownloadOtixImages
			}
			_ = s.cfg.Save("")
			jsonResponse(w, http.StatusOK, map[string]any{
				"write_otix_after_scan": s.cfg.Server.WriteOtixAfterScan,
				"download_otix_images":  s.cfg.Server.DownloadOtixImages,
			})
		})

		authed.Post("/api/v1/otix/write", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				DownloadImages *bool `json:"download_images"`
				Items          []struct {
					FileID   string          `json:"file_id"`
					Filepath string          `json:"filepath"`
					Sidecar  otixmeta.Sidecar `json:"sidecar"`
				} `json:"items"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			downloadImages := s.cfg.Server.DownloadOtixImages
			if req.DownloadImages != nil {
				downloadImages = *req.DownloadImages
			}

			written := 0
			var failed []map[string]any
			libs := s.indexer.GetLibraries()
			libPaths := make([]string, 0, len(libs))
			for _, lib := range libs {
				libPaths = append(libPaths, lib.Path)
			}

			for _, item := range req.Items {
				filePath := item.Filepath
				if filePath == "" && item.FileID != "" {
					if f, ok := s.indexer.GetFile(item.FileID); ok {
						filePath = f.Filepath
					}
				}
				if filePath == "" {
					failed = append(failed, map[string]any{
						"file_id": item.FileID,
						"error":   "missing filepath",
					})
					continue
				}
				libraryPath := matchLibraryPath(filePath, libPaths)
				gameRoot := indexer.GameRootForFile(filePath, libraryPath)
				sc := item.Sidecar
				if sc.Version == 0 {
					sc.Version = otixmeta.Version
				}
				if sc.ExeRelative == "" || strings.HasSuffix(sc.ExeRelative, ".otix") {
					if rel, err := filepath.Rel(gameRoot, filePath); err == nil && rel != "." && !strings.HasSuffix(rel, ".otix") {
						sc.ExeRelative = filepath.ToSlash(rel)
					}
				}
				if downloadImages {
					_ = otixmeta.DownloadImages(gameRoot, &sc, nil)
				}
				if err := otixmeta.Write(gameRoot, &sc); err != nil {
					failed = append(failed, map[string]any{
						"file_id":  item.FileID,
						"filepath": filePath,
						"error":    err.Error(),
					})
					continue
				}
				written++
				// Refresh in-memory index fields for all files under this game root.
				allFiles := s.indexer.Files()
				for _, f := range allFiles {
					if strings.HasPrefix(f.Filepath, gameRoot) {
						indexer.AttachOtixSidecar(&f, libraryPath)
						s.indexer.UpsertFile(f)
					}
				}
			}

			jsonResponse(w, http.StatusOK, map[string]any{
				"status":  "ok",
				"written": written,
				"failed":  failed,
			})
		})

		authed.Get("/api/v1/files/{file_id}/otix", func(w http.ResponseWriter, r *http.Request) {
			fileID := chi.URLParam(r, "file_id")
			f, ok := s.indexer.GetFile(fileID)
			if !ok {
				http.Error(w, `{"detail":"Hosted file not found"}`, http.StatusNotFound)
				return
			}
			libraryPath := ""
			for _, lib := range s.indexer.GetLibraries() {
				if strings.HasPrefix(f.Filepath, lib.Path) {
					libraryPath = lib.Path
					break
				}
			}
			root := indexer.GameRootForFile(f.Filepath, libraryPath)
			sc, err := otixmeta.Read(root)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusInternalServerError)
				return
			}
			if sc == nil {
				http.Error(w, `{"detail":"Otix sidecar not found"}`, http.StatusNotFound)
				return
			}
			jsonResponse(w, http.StatusOK, sc)
		})

		authed.Get("/api/v1/files/{file_id}/otix/asset/{role}", func(w http.ResponseWriter, r *http.Request) {
			fileID := chi.URLParam(r, "file_id")
			role := chi.URLParam(r, "role")
			f, ok := s.indexer.GetFile(fileID)
			if !ok {
				http.Error(w, `{"detail":"Hosted file not found"}`, http.StatusNotFound)
				return
			}
			libraryPath := ""
			for _, lib := range s.indexer.GetLibraries() {
				if strings.HasPrefix(f.Filepath, lib.Path) {
					libraryPath = lib.Path
					break
				}
			}
			root := indexer.GameRootForFile(f.Filepath, libraryPath)
			sc, err := otixmeta.Read(root)
			if err != nil || sc == nil {
				http.Error(w, `{"detail":"Otix sidecar not found"}`, http.StatusNotFound)
				return
			}
			assetPath, ok := otixmeta.ResolveLocalAsset(root, sc, role)
			if !ok {
				http.Error(w, `{"detail":"Otix asset not found"}`, http.StatusNotFound)
				return
			}
			http.ServeFile(w, r, assetPath)
		})

		// ── Files & HTTP/2 Range Streaming ────────────────────────────────────
		authed.Get("/api/v1/files", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, s.indexer.Files())
		})

		authed.Get("/api/v1/files/{file_id}", func(w http.ResponseWriter, r *http.Request) {
			fileID := chi.URLParam(r, "file_id")
			f, ok := s.indexer.GetFile(fileID)
			if !ok {
				http.Error(w, `{"detail":"Hosted file not found"}`, http.StatusNotFound)
				return
			}
			jsonResponse(w, http.StatusOK, f)
		})

		authed.Get("/api/v1/files/{file_id}/download", func(w http.ResponseWriter, r *http.Request) {
			fileID := chi.URLParam(r, "file_id")
			f, ok := s.indexer.GetFile(fileID)
			if !ok {
				http.Error(w, `{"detail":"Hosted file not found"}`, http.StatusNotFound)
				return
			}

			file, err := os.Open(f.Filepath)
			if err != nil {
				http.Error(w, `{"detail":"File on disk missing"}`, http.StatusNotFound)
				return
			}
			defer file.Close()

			stat, err := file.Stat()
			if err != nil {
				http.Error(w, `{"detail":"File on disk missing"}`, http.StatusNotFound)
				return
			}

			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, f.Filename))
			w.Header().Set("Accept-Ranges", "bytes")
			http.ServeContent(w, r, f.Filename, stat.ModTime(), file)
		})

		// ── Explorer ─────────────────────────────────────────────────────────
		authed.Get("/api/v1/explorer/browse", func(w http.ResponseWriter, r *http.Request) {
			targetPath := r.URL.Query().Get("path")
			resp, err := explorer.InspectDirectory(targetPath, s.cfg.Server.DownloadsPath, "")
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, resp)
		})

		authed.Post("/api/v1/explorer/set-download-path", func(w http.ResponseWriter, r *http.Request) {
			var req explorer.SetDownloadPathRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			resolved, err := explorer.SanitizeAndResolvePath(req.Path, "")
			if err != nil {
				http.Error(w, `{"error":"Invalid download path"}`, http.StatusBadRequest)
				return
			}
			if req.CreateIfMissing {
				_ = os.MkdirAll(resolved, 0755)
			}
			s.cfg.Server.DownloadsPath = resolved
			s.cfg.Desktop.GamesDownloadPath = resolved

			if req.AddAsLibrary {
				exists := false
				for _, lib := range s.cfg.GameLibraries {
					if filepath.Clean(lib.Path) == filepath.Clean(resolved) {
						exists = true
						break
					}
				}
				if !exists {
					s.cfg.GameLibraries = append(s.cfg.GameLibraries, config.LibraryConfig{
						Name:              filepath.Base(resolved),
						Path:              resolved,
						Kind:              "game",
						AllowedExtensions: config.GameExtensions,
					})
					s.indexer.SetLibraries(s.cfg.GameLibraries)
					go s.indexer.ScanAll()
				}
			}

			_ = s.cfg.Save("")
			jsonResponse(w, http.StatusOK, map[string]interface{}{
				"status":        "saved",
				"download_path": resolved,
			})
		})

		authed.Post("/api/v1/explorer/create-folder", func(w http.ResponseWriter, r *http.Request) {
			var req explorer.CreateFolderRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			if !explorer.IsSafeFolderName(req.FolderName) {
				http.Error(w, `{"error":"Invalid folder name"}`, http.StatusBadRequest)
				return
			}
			parent, err := explorer.SanitizeAndResolvePath(req.ParentPath, "")
			if err != nil {
				http.Error(w, `{"error":"Invalid parent path"}`, http.StatusBadRequest)
				return
			}
			newFolder := filepath.Join(parent, req.FolderName)
			if err := os.MkdirAll(newFolder, 0755); err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"Failed to create folder: %v"}`, err), http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]interface{}{
				"status": "created",
				"path":   newFolder,
			})
		})

		authed.Post("/api/v1/explorer/request-permission", func(w http.ResponseWriter, r *http.Request) {
			var req explorer.PermissionRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			res, err := explorer.RequestFolderPermission(req.Path)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, res)
		})

		authed.Get("/api/v1/explorer/download", func(w http.ResponseWriter, r *http.Request) {
			targetPath := r.URL.Query().Get("path")
			resolved, err := explorer.SanitizeAndResolvePath(targetPath, "")
			if err != nil {
				http.Error(w, `{"detail":"Invalid path"}`, http.StatusBadRequest)
				return
			}
			file, err := os.Open(resolved)
			if err != nil {
				http.Error(w, `{"detail":"File not found"}`, http.StatusNotFound)
				return
			}
			defer file.Close()

			stat, err := file.Stat()
			if err != nil || stat.IsDir() {
				http.Error(w, `{"detail":"Invalid file"}`, http.StatusBadRequest)
				return
			}

			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, stat.Name()))
			w.Header().Set("Accept-Ranges", "bytes")
			http.ServeContent(w, r, stat.Name(), stat.ModTime(), file)
		})

		// ── Cloud Saves ──────────────────────────────────────────────────────
		authed.Post("/api/v1/saves/upload", func(w http.ResponseWriter, r *http.Request) {
			// Max 100MB save file
			if err := r.ParseMultipartForm(100 << 20); err != nil {
				http.Error(w, `{"error":"File too large or malformed"}`, http.StatusBadRequest)
				return
			}

			file, header, err := r.FormFile("file")
			if err != nil {
				http.Error(w, `{"error":"Missing file in request"}`, http.StatusBadRequest)
				return
			}
			defer file.Close()

			gameID := r.FormValue("game_id")
			gameTitle := r.FormValue("game_title")
			if gameTitle == "" {
				gameTitle = gameID
			}

			fileBytes, err := io.ReadAll(file)
			if err != nil {
				http.Error(w, `{"error":"Failed to read file"}`, http.StatusInternalServerError)
				return
			}

			snap, err := s.savesMgr.SaveSnapshot(gameID, gameTitle, fileBytes, header.Filename)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
				return
			}

			jsonResponse(w, http.StatusOK, snap)
		})

		authed.Get("/api/v1/saves/{game_id}", func(w http.ResponseWriter, r *http.Request) {
			gameID := chi.URLParam(r, "game_id")
			jsonResponse(w, http.StatusOK, s.savesMgr.ListSnapshots(gameID))
		})

		authed.Get("/api/v1/saves/{game_id}/{snapshot_id}/download", func(w http.ResponseWriter, r *http.Request) {
			gameID := chi.URLParam(r, "game_id")
			snapID := chi.URLParam(r, "snapshot_id")
			path := s.savesMgr.GetSnapshotPath(gameID, snapID)
			if path == "" {
				http.Error(w, `{"detail":"Snapshot not found"}`, http.StatusNotFound)
				return
			}

			file, err := os.Open(path)
			if err != nil {
				http.Error(w, `{"detail":"Snapshot file missing"}`, http.StatusNotFound)
				return
			}
			defer file.Close()

			stat, _ := file.Stat()
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, stat.Name()))
			http.ServeContent(w, r, stat.Name(), stat.ModTime(), file)
		})

		// ── Epic Games Vault & Scanner ────────────────────────────────────────
		authed.Get("/api/v1/epic/status", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, s.epicClient.Status())
		})

		authed.Post("/api/v1/epic/auth", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Code string `json:"code"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"detail":"Invalid request body"}`, http.StatusBadRequest)
				return
			}

			code, err := epic.ParseAuthorizationCode(req.Code)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}

			secrets, err := s.epicClient.ExchangeCode(code)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}

			jsonResponse(w, http.StatusOK, map[string]interface{}{
				"status":       "authenticated",
				"account_id":   secrets.AccountID,
				"display_name": secrets.DisplayName,
			})
		})

		authed.Delete("/api/v1/epic/auth", func(w http.ResponseWriter, r *http.Request) {
			_ = s.epicClient.DeleteSecrets()
			jsonResponse(w, http.StatusOK, map[string]string{"status": "disconnected"})
		})

		authed.Post("/api/v1/epic/scan", func(w http.ResponseWriter, r *http.Request) {
			games, err := s.epicClient.CompleteScan()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, games)
		})

		// ── Providers & Downloads ─────────────────────────────────────────────
		authed.Get("/api/v1/providers", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, s.providersMgr.ListProviders())
		})

		authed.Post("/api/v1/providers/{provider_type}/{name}/test", func(w http.ResponseWriter, r *http.Request) {
			ptype := chi.URLParam(r, "provider_type")
			name := chi.URLParam(r, "name")
			res, err := s.providersMgr.TestProvider(ptype, name)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, res)
		})

		authed.Get("/api/v1/downloads/search", func(w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query().Get("query")
			releases, err := s.providersMgr.Search(q, nil)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, releases)
		})

		authed.Post("/api/v1/downloads/add", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Title       string `json:"title"`
				DownloadURL string `json:"download_url"`
				Category    string `json:"category"`
				Protocol    string `json:"protocol"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}

			nzoID, err := s.providersMgr.AddDownload(req.DownloadURL, req.Title, req.Category, req.Protocol)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}

			jsonResponse(w, http.StatusOK, map[string]string{
				"status": "queued",
				"nzo_id": nzoID,
				"title":  req.Title,
			})
		})

		authed.Get("/api/v1/downloads/queue", func(w http.ResponseWriter, r *http.Request) {
			q, err := s.providersMgr.GetQueue()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, q)
		})

		authed.Get("/api/v1/downloads/history", func(w http.ResponseWriter, r *http.Request) {
			h, err := s.providersMgr.GetHistory(50)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, h)
		})

		authed.Delete("/api/v1/downloads/queue/{download_id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "download_id")
			err := s.providersMgr.DeleteDownload(id)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]string{"status": "deleted", "download_id": id})
		})

		// ── Usenet Aliases (SABnzbd & Prowlarr) ────────────────────────────────
		authed.Get("/api/v1/usenet/config", func(w http.ResponseWriter, r *http.Request) {
			sab := s.cfg.Usenet.Sabnzbd
			prow := s.cfg.Usenet.Prowlarr
			sabConfigured := sab.Host != "" && sab.APIKey != ""
			prowConfigured := prow.Host != "" && prow.APIKey != ""

			type enrichedSabnzbd struct {
				config.SabnzbdConfig
				Configured   bool   `json:"configured"`
				HasAPIKey    bool   `json:"has_api_key"`
				HasApiKey    bool   `json:"hasApiKey"`
				ProviderType string `json:"provider_type"`
			}
			type enrichedProwlarr struct {
				config.ProwlarrConfig
				Configured   bool   `json:"configured"`
				HasAPIKey    bool   `json:"has_api_key"`
				HasApiKey    bool   `json:"hasApiKey"`
				ProviderType string `json:"provider_type"`
			}
			resp := struct {
				Enabled  bool             `json:"enabled"`
				Sabnzbd  enrichedSabnzbd  `json:"sabnzbd"`
				Prowlarr enrichedProwlarr `json:"prowlarr"`
			}{
				Enabled: s.cfg.Usenet.Enabled,
				Sabnzbd: enrichedSabnzbd{
					SabnzbdConfig: sab,
					Configured:    sabConfigured,
					HasAPIKey:     sab.APIKey != "",
					HasApiKey:     sab.APIKey != "",
					ProviderType:   "downloader",
				},
				Prowlarr: enrichedProwlarr{
					ProwlarrConfig: prow,
					Configured:     prowConfigured,
					HasAPIKey:      prow.APIKey != "",
					HasApiKey:      prow.APIKey != "",
					ProviderType:   "indexer-provider",
				},
			}
			jsonResponse(w, http.StatusOK, resp)
		})

		authed.Post("/api/v1/usenet/config", func(w http.ResponseWriter, r *http.Request) {
			bodyBytes, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			var raw map[string]json.RawMessage
			if err := json.Unmarshal(bodyBytes, &raw); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}

			if sabRaw, ok := raw["sabnzbd"]; ok {
				var sab config.SabnzbdConfig
				if err := json.Unmarshal(sabRaw, &sab); err == nil {
					var rawMap map[string]interface{}
					if json.Unmarshal(sabRaw, &rawMap) == nil {
						if k, ok := rawMap["apiKey"].(string); ok && k != "" && sab.APIKey == "" {
							sab.APIKey = k
						}
						if u, ok := rawMap["urlBase"].(string); ok && u != "" && sab.URLBase == "" {
							sab.URLBase = u
						}
						if ssl, ok := rawMap["useSsl"].(bool); ok && !sab.UseSSL {
							sab.UseSSL = ssl
						}
					}
					if sab.APIKey == "" && s.cfg.Usenet.Sabnzbd.APIKey != "" {
						sab.APIKey = s.cfg.Usenet.Sabnzbd.APIKey
					}
					s.cfg.Usenet.Sabnzbd = sab
				}
			}
			if prowRaw, ok := raw["prowlarr"]; ok {
				var prow config.ProwlarrConfig
				if err := json.Unmarshal(prowRaw, &prow); err == nil {
					var rawMap map[string]interface{}
					if json.Unmarshal(prowRaw, &rawMap) == nil {
						if k, ok := rawMap["apiKey"].(string); ok && k != "" && prow.APIKey == "" {
							prow.APIKey = k
						}
						if u, ok := rawMap["urlBase"].(string); ok && u != "" && prow.URLBase == "" {
							prow.URLBase = u
						}
						if ssl, ok := rawMap["useSsl"].(bool); ok && !prow.UseSSL {
							prow.UseSSL = ssl
						}
					}
					if prow.APIKey == "" && s.cfg.Usenet.Prowlarr.APIKey != "" {
						prow.APIKey = s.cfg.Usenet.Prowlarr.APIKey
					}
					s.cfg.Usenet.Prowlarr = prow
				}
			}
			if enRaw, ok := raw["enabled"]; ok {
				var en bool
				if err := json.Unmarshal(enRaw, &en); err == nil {
					s.cfg.Usenet.Enabled = en
				}
			} else {
				s.cfg.Usenet.Enabled = (s.cfg.Usenet.Sabnzbd.Host != "" && s.cfg.Usenet.Sabnzbd.APIKey != "") ||
					(s.cfg.Usenet.Prowlarr.Host != "" && s.cfg.Usenet.Prowlarr.APIKey != "")
			}
			_ = s.cfg.Save("")
			jsonResponse(w, http.StatusOK, map[string]string{"status": "saved"})
		})

		authed.Post("/api/v1/usenet/test-sabnzbd", func(w http.ResponseWriter, r *http.Request) {
			sabCfg := s.cfg.Usenet.Sabnzbd
			var req struct {
				Host    string `json:"host"`
				Port    int    `json:"port"`
				APIKey  string `json:"api_key"`
				ApiKey  string `json:"apiKey"`
				UseSSL  bool   `json:"use_ssl"`
				UseSsl  bool   `json:"useSsl"`
				URLBase string `json:"url_base"`
				UrlBase string `json:"urlBase"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
				if req.Host != "" {
					sabCfg.Host = req.Host
				}
				if req.Port > 0 {
					sabCfg.Port = req.Port
				}
				if req.APIKey == "" && req.ApiKey != "" {
					req.APIKey = req.ApiKey
				}
				if req.APIKey != "" {
					sabCfg.APIKey = req.APIKey
				}
				sabCfg.UseSSL = req.UseSSL || req.UseSsl
				if req.URLBase == "" && req.UrlBase != "" {
					req.URLBase = req.UrlBase
				}
				if req.URLBase != "" {
					sabCfg.URLBase = req.URLBase
				}
			}
			client := usenet.NewSabnzbdClient(sabCfg)
			ok, msg := client.TestConnection()
			jsonResponse(w, http.StatusOK, map[string]interface{}{"ok": ok, "message": msg})
		})

		authed.Post("/api/v1/usenet/test-prowlarr", func(w http.ResponseWriter, r *http.Request) {
			prowCfg := s.cfg.Usenet.Prowlarr
			var req struct {
				Host    string `json:"host"`
				Port    int    `json:"port"`
				APIKey  string `json:"api_key"`
				ApiKey  string `json:"apiKey"`
				UseSSL  bool   `json:"use_ssl"`
				UseSsl  bool   `json:"useSsl"`
				URLBase string `json:"url_base"`
				UrlBase string `json:"urlBase"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
				if req.Host != "" {
					prowCfg.Host = req.Host
				}
				if req.Port > 0 {
					prowCfg.Port = req.Port
				}
				if req.APIKey == "" && req.ApiKey != "" {
					req.APIKey = req.ApiKey
				}
				if req.APIKey != "" {
					prowCfg.APIKey = req.APIKey
				}
				prowCfg.UseSSL = req.UseSSL || req.UseSsl
				if req.URLBase == "" && req.UrlBase != "" {
					req.URLBase = req.UrlBase
				}
				if req.URLBase != "" {
					prowCfg.URLBase = req.URLBase
				}
			}
			client := usenet.NewProwlarrClient(prowCfg)
			ok, msg := client.TestConnection()
			jsonResponse(w, http.StatusOK, map[string]interface{}{"ok": ok, "message": msg})
		})

		authed.Get("/api/v1/usenet/search", func(w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query().Get("query")
			client := usenet.NewProwlarrClient(s.cfg.Usenet.Prowlarr)
			releases, err := client.Search(q, nil)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, releases)
		})

		authed.Post("/api/v1/usenet/download", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Title       string `json:"title"`
				DownloadURL string `json:"download_url"`
				Category    string `json:"category"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			client := usenet.NewSabnzbdClient(s.cfg.Usenet.Sabnzbd)
			nzoID, err := client.AddDownload(req.DownloadURL, req.Title, req.Category)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]string{
				"status": "queued",
				"nzo_id": nzoID,
				"title":  req.Title,
			})
		})

		authed.Get("/api/v1/usenet/queue", func(w http.ResponseWriter, r *http.Request) {
			client := usenet.NewSabnzbdClient(s.cfg.Usenet.Sabnzbd)
			q, err := client.GetQueue()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, q)
		})

		authed.Get("/api/v1/usenet/history", func(w http.ResponseWriter, r *http.Request) {
			client := usenet.NewSabnzbdClient(s.cfg.Usenet.Sabnzbd)
			h, err := client.GetHistory(50)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, h)
		})

		authed.Delete("/api/v1/usenet/queue/{nzo_id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "nzo_id")
			client := usenet.NewSabnzbdClient(s.cfg.Usenet.Sabnzbd)
			_ = client.DeleteSlot(id)
			jsonResponse(w, http.StatusOK, map[string]string{"status": "deleted", "nzo_id": id})
		})

		authed.Get("/api/v1/prowlarr/indexers", func(w http.ResponseWriter, r *http.Request) {
			client := usenet.NewProwlarrClient(s.cfg.Usenet.Prowlarr)
			res, err := client.GetIndexers()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, res)
		})

		authed.Post("/api/v1/prowlarr/sync", func(w http.ResponseWriter, r *http.Request) {
			client := usenet.NewProwlarrClient(s.cfg.Usenet.Prowlarr)
			_, _ = client.SyncIndexers()
			indexers, err := client.GetIndexers()
			if err != nil {
				jsonResponse(w, http.StatusOK, map[string]interface{}{
					"ok":       true,
					"message":  "Sync command triggered",
					"indexers": []interface{}{},
				})
				return
			}
			jsonResponse(w, http.StatusOK, map[string]interface{}{
				"ok":       true,
				"message":  "Indexers synced successfully",
				"indexers": indexers,
			})
		})

		authed.Post("/api/v1/sabnzbd/pause", func(w http.ResponseWriter, r *http.Request) {
			client := usenet.NewSabnzbdClient(s.cfg.Usenet.Sabnzbd)
			_ = client.PauseQueue()
			jsonResponse(w, http.StatusOK, map[string]string{"status": "paused"})
		})

		authed.Post("/api/v1/sabnzbd/resume", func(w http.ResponseWriter, r *http.Request) {
			client := usenet.NewSabnzbdClient(s.cfg.Usenet.Sabnzbd)
			_ = client.ResumeQueue()
			jsonResponse(w, http.StatusOK, map[string]string{"status": "resumed"})
		})

		// ── Radarr ────────────────────────────────────────────────────────────
		authed.Get("/api/v1/radarr/config", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, s.cfg.Radarr)
		})

		authed.Post("/api/v1/radarr/config", func(w http.ResponseWriter, r *http.Request) {
			var rc config.RadarrConfig
			if err := json.NewDecoder(r.Body).Decode(&rc); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			s.cfg.Radarr = rc
			_ = s.cfg.Save("")
			jsonResponse(w, http.StatusOK, map[string]string{"status": "saved"})
		})

		authed.Post("/api/v1/radarr/test", func(w http.ResponseWriter, r *http.Request) {
			inst := s.cfg.Radarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewRadarrClient(inst)
			jsonResponse(w, http.StatusOK, client.TestConnection())
		})

		authed.Get("/api/v1/radarr/rootfolders", func(w http.ResponseWriter, r *http.Request) {
			inst := s.cfg.Radarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewRadarrClient(inst)
			folders, err := client.GetRootFolders()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, folders)
		})

		authed.Get("/api/v1/radarr/qualityprofiles", func(w http.ResponseWriter, r *http.Request) {
			inst := s.cfg.Radarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewRadarrClient(inst)
			profiles, err := client.GetQualityProfiles()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, profiles)
		})

		authed.Get("/api/v1/radarr/movies", func(w http.ResponseWriter, r *http.Request) {
			inst := s.cfg.Radarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewRadarrClient(inst)
			movies, err := client.GetMovies()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, movies)
		})

		authed.Get("/api/v1/radarr/lookup", func(w http.ResponseWriter, r *http.Request) {
			term := r.URL.Query().Get("term")
			inst := s.cfg.Radarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewRadarrClient(inst)
			res, err := client.Lookup(term)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, res)
		})

		authed.Post("/api/v1/radarr/movies", func(w http.ResponseWriter, r *http.Request) {
			var payload interface{}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			inst := s.cfg.Radarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewRadarrClient(inst)
			res, err := client.AddMovie(payload)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, res)
		})

		authed.Get("/api/v1/radarr/queue", func(w http.ResponseWriter, r *http.Request) {
			page, _ := strconv.Atoi(r.URL.Query().Get("page"))
			pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
			if page <= 0 {
				page = 1
			}
			if pageSize <= 0 {
				pageSize = 50
			}

			inst := s.cfg.Radarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewRadarrClient(inst)
			q, err := client.GetQueue(page, pageSize)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, q)
		})

		authed.Delete("/api/v1/radarr/queue/{queue_id}", func(w http.ResponseWriter, r *http.Request) {
			id, _ := strconv.Atoi(chi.URLParam(r, "queue_id"))
			removeClient := r.URL.Query().Get("remove_from_client") != "false"
			blocklist := r.URL.Query().Get("blocklist") == "true"
			inst := s.cfg.Radarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewRadarrClient(inst)
			err := client.DeleteQueue(id, removeClient, blocklist)
			status := "deleted"
			if err != nil {
				status = "failed"
			}
			jsonResponse(w, http.StatusOK, map[string]interface{}{"status": status, "queue_id": id})
		})

		authed.Get("/api/v1/radarr/history", func(w http.ResponseWriter, r *http.Request) {
			page, _ := strconv.Atoi(r.URL.Query().Get("page"))
			pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
			if page <= 0 {
				page = 1
			}
			if pageSize <= 0 {
				pageSize = 50
			}

			inst := s.cfg.Radarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewRadarrClient(inst)
			h, err := client.GetHistory(page, pageSize)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, h)
		})

		// ── Sonarr ────────────────────────────────────────────────────────────
		authed.Get("/api/v1/sonarr/config", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, s.cfg.Sonarr)
		})

		authed.Post("/api/v1/sonarr/config", func(w http.ResponseWriter, r *http.Request) {
			var sc config.SonarrConfig
			if err := json.NewDecoder(r.Body).Decode(&sc); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			s.cfg.Sonarr = sc
			_ = s.cfg.Save("")
			jsonResponse(w, http.StatusOK, map[string]string{"status": "saved"})
		})

		authed.Post("/api/v1/sonarr/test", func(w http.ResponseWriter, r *http.Request) {
			inst := s.cfg.Sonarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewSonarrClient(inst)
			jsonResponse(w, http.StatusOK, client.TestConnection())
		})

		authed.Get("/api/v1/sonarr/rootfolders", func(w http.ResponseWriter, r *http.Request) {
			inst := s.cfg.Sonarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewSonarrClient(inst)
			folders, err := client.GetRootFolders()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, folders)
		})

		authed.Get("/api/v1/sonarr/qualityprofiles", func(w http.ResponseWriter, r *http.Request) {
			inst := s.cfg.Sonarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewSonarrClient(inst)
			profiles, err := client.GetQualityProfiles()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, profiles)
		})

		authed.Get("/api/v1/sonarr/series", func(w http.ResponseWriter, r *http.Request) {
			inst := s.cfg.Sonarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewSonarrClient(inst)
			series, err := client.GetSeries()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, series)
		})

		authed.Get("/api/v1/sonarr/lookup", func(w http.ResponseWriter, r *http.Request) {
			term := r.URL.Query().Get("term")
			inst := s.cfg.Sonarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewSonarrClient(inst)
			res, err := client.Lookup(term)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, res)
		})

		authed.Post("/api/v1/sonarr/series", func(w http.ResponseWriter, r *http.Request) {
			var payload interface{}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			inst := s.cfg.Sonarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewSonarrClient(inst)
			res, err := client.AddSeries(payload)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, res)
		})

		authed.Get("/api/v1/sonarr/queue", func(w http.ResponseWriter, r *http.Request) {
			page, _ := strconv.Atoi(r.URL.Query().Get("page"))
			pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
			if page <= 0 {
				page = 1
			}
			if pageSize <= 0 {
				pageSize = 50
			}

			inst := s.cfg.Sonarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewSonarrClient(inst)
			q, err := client.GetQueue(page, pageSize)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, q)
		})

		authed.Delete("/api/v1/sonarr/queue/{queue_id}", func(w http.ResponseWriter, r *http.Request) {
			id, _ := strconv.Atoi(chi.URLParam(r, "queue_id"))
			removeClient := r.URL.Query().Get("remove_from_client") != "false"
			blocklist := r.URL.Query().Get("blocklist") == "true"
			inst := s.cfg.Sonarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewSonarrClient(inst)
			err := client.DeleteQueue(id, removeClient, blocklist)
			status := "deleted"
			if err != nil {
				status = "failed"
			}
			jsonResponse(w, http.StatusOK, map[string]interface{}{"status": status, "queue_id": id})
		})

		authed.Get("/api/v1/sonarr/history", func(w http.ResponseWriter, r *http.Request) {
			page, _ := strconv.Atoi(r.URL.Query().Get("page"))
			pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
			if page <= 0 {
				page = 1
			}
			if pageSize <= 0 {
				pageSize = 50
			}

			inst := s.cfg.Sonarr.Resolve(r.URL.Query().Get("instance_id"))
			client := arr.NewSonarrClient(inst)
			h, err := client.GetHistory(page, pageSize)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			jsonResponse(w, http.StatusOK, h)
		})

		// ── Desktop & Organize ────────────────────────────────────────────────
		authed.Get("/api/v1/desktop/settings", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, desktop.GetDesktopSettings(s.cfg))
		})

		authed.Post("/api/v1/desktop/settings", func(w http.ResponseWriter, r *http.Request) {
			var payload map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, desktop.ApplyDesktopSettings(s.cfg, payload))
		})

		authed.Get("/api/v1/organize", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, desktop.GetOrganizeSettings(s.cfg))
		})

		authed.Post("/api/v1/organize", func(w http.ResponseWriter, r *http.Request) {
			var payload map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, desktop.ApplyOrganizeSettings(s.cfg, payload))
		})

		// ── Headless Node Plugins (Deals) ─────────────────────────────────────
		authed.Get("/api/v1/plugins/deals", func(w http.ResponseWriter, r *http.Request) {
			deals := s.dealsMonitor.GetDeals()
			jsonResponse(w, http.StatusOK, map[string]interface{}{
				"deals":        deals,
				"total":        len(deals),
				"last_checked": s.dealsMonitor.LastChecked().UTC().Format(time.RFC3339),
			})
		})

		authed.Post("/api/v1/plugins/deals/refresh", func(w http.ResponseWriter, r *http.Request) {
			err := s.dealsMonitor.Refresh()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadGateway)
				return
			}
			deals := s.dealsMonitor.GetDeals()
			jsonResponse(w, http.StatusOK, map[string]interface{}{
				"status": "refreshed",
				"total":  len(deals),
			})
		})
	})
}

func (s *Server) triggerBackendSync() {
	if !s.cfg.Server.WriteOtixAfterScan {
		return
	}
	registryURL := heartbeat.ResolveRegistryURL(s.cfg)
	if registryURL == "" {
		return
	}
	go func() {
		client := &http.Client{Timeout: 30 * time.Second}
		targetURL := fmt.Sprintf("%s/v1/servers/scan-complete", registryURL)
		localIP := heartbeat.GetLocalIP()
		payload := map[string]any{
			"server_name": s.cfg.Server.Name,
			"port":        s.cfg.Server.Port,
			"auth_token":  s.cfg.Server.AuthToken,
			"local_endpoints": []string{
				fmt.Sprintf("http://%s:%d", localIP, s.cfg.Server.Port),
				fmt.Sprintf("http://127.0.0.1:%d", s.cfg.Server.Port),
			},
			"download_images": s.cfg.Server.DownloadOtixImages,
			"write_otix":      s.cfg.Server.WriteOtixAfterScan,
		}
		data, err := json.Marshal(payload)
		if err != nil {
			return
		}
		req, err := http.NewRequest("POST", targetURL, bytes.NewReader(data))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		if s.cfg.Server.AuthToken != "" {
			req.Header.Set("Authorization", "Bearer "+s.cfg.Server.AuthToken)
		}
		resp, err := client.Do(req)
		if err != nil {
			return
		}
		_ = resp.Body.Close()
	}()
}

