package server

import (
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
	"github.com/dksilv4/otix/node/internal/indexer"
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

	s := &Server{
		cfg:          cfg,
		claimMgr:     claimMgr,
		indexer:      idx,
		savesMgr:     savesMgr,
		epicClient:   epicClient,
		providersMgr: provMgr,
		dealsMonitor: dealsMon,
		startTime:    time.Now(),
		router:       chi.NewRouter(),
	}

	s.setupRoutes()
	return s
}

func (s *Server) Router() http.Handler {
	return s.router
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
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"status":      "online",
			"server_name": s.cfg.Server.Name,
			"version":     "0.2.0",
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

		var freeBytes, totalBytes *uint64
		if isAuthed {
			storagePath := s.cfg.Saves.StoragePath
			if len(s.cfg.GameLibraries) > 0 {
				storagePath = s.cfg.GameLibraries[0].Path
			}
			f, t, err := explorer.GetDiskUsage(storagePath)
			if err == nil {
				freeBytes = &f
				totalBytes = &t
			}
		}

		resp := map[string]interface{}{
			"status":          "online",
			"server_name":     s.cfg.Server.Name,
			"version":         "0.2.0",
			"uptime_seconds":  uptime,
			"libraries_count": len(s.cfg.GameLibraries),
			"total_files":     totalFiles,
			"claimed":         s.claimMgr.IsClaimed(),
		}
		if isAuthed {
			resp["total_size_bytes"] = totalSize
			resp["disk_free_bytes"] = freeBytes
			resp["disk_total_bytes"] = totalBytes
		}
		jsonResponse(w, http.StatusOK, resp)
	})

	// Authenticated routes
	r.Group(func(authed chi.Router) {
		authed.Use(s.verifyToken)

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
				if lib.Kind == "iso" {
					lib.AllowedExtensions = config.IsoExtensions
				} else {
					lib.AllowedExtensions = config.GameExtensions
				}
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
			s.cfg.GameLibraries = req.Libraries
			_ = s.cfg.Save("")
			s.indexer.SetLibraries(s.cfg.GameLibraries)
			go s.indexer.ScanAll()

			jsonResponse(w, http.StatusOK, s.cfg.GameLibraries)
		})

		authed.Post("/api/v1/scan", func(w http.ResponseWriter, r *http.Request) {
			go s.indexer.ScanAll()
			jsonResponse(w, http.StatusOK, map[string]string{"status": "scanning_started"})
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
			jsonResponse(w, http.StatusOK, s.cfg.Usenet)
		})

		authed.Post("/api/v1/usenet/config", func(w http.ResponseWriter, r *http.Request) {
			var u config.UsenetConfig
			if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			s.cfg.Usenet = u
			_ = s.cfg.Save("")
			jsonResponse(w, http.StatusOK, map[string]string{"status": "saved"})
		})

		authed.Post("/api/v1/usenet/test-sabnzbd", func(w http.ResponseWriter, r *http.Request) {
			client := usenet.NewSabnzbdClient(s.cfg.Usenet.Sabnzbd)
			ok, msg := client.TestConnection()
			jsonResponse(w, http.StatusOK, map[string]interface{}{"ok": ok, "message": msg})
		})

		authed.Post("/api/v1/usenet/test-prowlarr", func(w http.ResponseWriter, r *http.Request) {
			client := usenet.NewProwlarrClient(s.cfg.Usenet.Prowlarr)
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
			res, err := client.SyncIndexers()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, res)
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
