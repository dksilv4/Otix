package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/indexer"
	"github.com/dksilv4/otix/node/internal/otixmeta"
	"github.com/go-chi/chi/v5"
)

func (s *Server) registerLibraryScanRoutes(authed chi.Router) {
		// â”€â”€ Libraries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
			if r.URL.Query().Get("no_scan") != "true" && r.URL.Query().Get("no_scan") != "1" {
				go s.indexer.ScanAll()
			}

			jsonResponse(w, http.StatusOK, s.cfg.GameLibraries)
		})

		authed.Get("/api/v1/scan/status", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, s.indexer.GetStatus())
		})

		authed.Get("/api/v1/scan/progress", func(w http.ResponseWriter, r *http.Request) {
			flusher, ok := w.(http.Flusher)
			if !ok {
				http.Error(w, `{"error":"Streaming unsupported"}`, http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Connection", "keep-alive")
			w.Header().Set("Access-Control-Allow-Origin", "*")

			ch := s.indexer.SubscribeProgress()
			defer s.indexer.UnsubscribeProgress(ch)

			initStatus, _ := json.Marshal(s.indexer.GetStatus())
			fmt.Fprintf(w, "event: scan_status\ndata: %s\n\n", initStatus)
			flusher.Flush()

			notify := r.Context().Done()
			for {
				select {
				case <-notify:
					return
				case ev, ok := <-ch:
					if !ok {
						return
					}
					data, err := json.Marshal(ev.Data)
					if err == nil {
						fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Event, data)
						flusher.Flush()
					}
				}
			}
		})

		authed.Post("/api/v1/scan", func(w http.ResponseWriter, r *http.Request) {
			wait := r.URL.Query().Get("wait") == "1" || r.URL.Query().Get("wait") == "true"
			deep := r.URL.Query().Get("deep") == "1" || r.URL.Query().Get("deep") == "true" || r.URL.Query().Get("force") == "1"
			skipSync := r.URL.Query().Get("skip_sync") == "1" || r.Header.Get("X-Otix-Skip-Sync") == "true"

			// If specific path or paths provided in query or JSON body, ensure they are indexed
			var targetPaths []string
			if p := r.URL.Query().Get("path"); p != "" {
				targetPaths = append(targetPaths, p)
			}
			if r.Header.Get("Content-Type") == "application/json" || strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
				var bodyReq struct {
					Path  string   `json:"path"`
					Paths []string `json:"paths"`
				}
				if err := json.NewDecoder(r.Body).Decode(&bodyReq); err == nil {
					if bodyReq.Path != "" {
						targetPaths = append(targetPaths, bodyReq.Path)
					}
					targetPaths = append(targetPaths, bodyReq.Paths...)
				}
			}

			if len(targetPaths) > 0 {
				updated := false
				for _, tp := range targetPaths {
					if tp == "" {
						continue
					}
					cleanTp := filepath.Clean(tp)
					exists := false
					for _, lib := range s.cfg.GameLibraries {
						if filepath.Clean(lib.Path) == cleanTp {
							exists = true
							break
						}
					}
					if !exists {
						s.cfg.GameLibraries = append(s.cfg.GameLibraries, config.LibraryConfig{
							Name:              filepath.Base(tp),
							Path:              tp,
							Kind:              "game",
							AllowedExtensions: config.DefaultAllowedExtensions("game"),
						})
						updated = true
					}
				}
				if updated {
					s.indexer.SetLibraries(s.cfg.GameLibraries)
					_ = s.cfg.Save("")
				}
			}

			if wait {
				files := s.indexer.ScanAllWithDeep(deep)
				if !skipSync {
					s.triggerBackendSync()
				}
				jsonResponse(w, http.StatusOK, map[string]any{
					"status": "scanned",
					"count":  len(files),
				})
				return
			}
			go func() {
				s.indexer.ScanAllWithDeep(deep)
				if !skipSync {
					s.triggerBackendSync()
				}
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

		// â”€â”€ Otix sidecars â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
					FileID   string           `json:"file_id"`
					Filepath string           `json:"filepath"`
					Sidecar  otixmeta.Sidecar `json:"sidecar"`
				} `json:"items"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			// Zero-disk sidecar mutation: database-only persistence active
			jsonResponse(w, http.StatusOK, map[string]any{
				"status":  "ok",
				"written": 0,
				"message": "database-only metadata persistence active: disk sidecar mutation disabled",
				"failed":  []any{},
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

		// â”€â”€ Files & HTTP/2 Range Streaming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


}
