package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/explorer"
	"github.com/go-chi/chi/v5"
)

func (s *Server) registerExplorerSavesRoutes(authed chi.Router) {
		// â”€â”€ Explorer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

		authed.Post("/api/v1/explorer/connect-share", func(w http.ResponseWriter, r *http.Request) {
			var req explorer.ConnectShareRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			res, err := explorer.ConnectShare(req)
			if err != nil {
				jsonResponse(w, http.StatusBadRequest, map[string]interface{}{
					"error":  err.Error(),
					"detail": err.Error(),
				})
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

		// â”€â”€ Cloud Saves â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


}
