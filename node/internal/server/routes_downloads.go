package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/dksilv4/otix/node/internal/epic"
	"github.com/dksilv4/otix/node/internal/gog"
	"github.com/go-chi/chi/v5"
)

func (s *Server) registerDownloadsRoutes(authed chi.Router) {
		// â”€â”€ Epic Games Vault & Scanner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

		// â”€â”€ GOG Vault & Scanner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
		authed.Get("/api/v1/gog/status", func(w http.ResponseWriter, r *http.Request) {
			jsonResponse(w, http.StatusOK, s.gogClient.Status())
		})

		authed.Post("/api/v1/gog/auth", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Code string `json:"code"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"detail":"Invalid request body"}`, http.StatusBadRequest)
				return
			}

			code, err := gog.ParseAuthorizationCode(req.Code)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}

			secrets, err := s.gogClient.ExchangeCode(code)
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

		authed.Delete("/api/v1/gog/auth", func(w http.ResponseWriter, r *http.Request) {
			_ = s.gogClient.DeleteSecrets()
			jsonResponse(w, http.StatusOK, map[string]string{"status": "disconnected"})
		})

		authed.Post("/api/v1/gog/scan", func(w http.ResponseWriter, r *http.Request) {
			games, err := s.gogClient.CompleteScan()
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, games)
		})

		// â”€â”€ Providers & Downloads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
			var rawMap map[string]interface{}
			bodyBytes, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			_ = json.Unmarshal(bodyBytes, &rawMap)

			var req struct {
				Title       string `json:"title"`
				DownloadURL string `json:"download_url"`
				Category    string `json:"category"`
				Protocol    string `json:"protocol"`
				Downloader  string `json:"downloader"`
			}
			_ = json.Unmarshal(bodyBytes, &req)

			if dlURL, ok := rawMap["downloadUrl"].(string); ok && dlURL != "" {
				req.DownloadURL = dlURL
			} else if dlURL, ok := rawMap["url"].(string); ok && dlURL != "" {
				req.DownloadURL = dlURL
			}
			if dl, ok := rawMap["downloader"].(string); ok && dl != "" {
				req.Downloader = dl
			}

			if qDownloader := r.URL.Query().Get("downloader"); qDownloader != "" && req.Downloader == "" {
				req.Downloader = qDownloader
			}
			if qProto := r.URL.Query().Get("protocol"); qProto != "" && req.Protocol == "" {
				req.Protocol = qProto
			}

			protocol := req.Protocol
			if protocol == "" && req.Downloader != "" {
				if req.Downloader == "jdownloader" || req.Downloader == "jd2" {
					protocol = "jdownloader"
				} else if req.Downloader == "sabnzbd" || req.Downloader == "usenet" {
					protocol = "usenet"
				}
			}

			nzoID, err := s.providersMgr.AddDownload(req.DownloadURL, req.Title, req.Category, protocol)
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


}
