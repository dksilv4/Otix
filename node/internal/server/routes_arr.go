package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/dksilv4/otix/node/internal/arr"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/go-chi/chi/v5"
)

func (s *Server) registerArrRoutes(authed chi.Router) {
		// â”€â”€ Radarr â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
		authed.Get("/api/v1/radarr/config", func(w http.ResponseWriter, r *http.Request) {
			cfg := s.cfg.Radarr
			cfg.HasAPIKey = cfg.APIKey != ""
			cfg.Configured = cfg.Host != "" && cfg.APIKey != ""
			for i := range cfg.Instances {
				cfg.Instances[i].HasAPIKey = cfg.Instances[i].APIKey != ""
				cfg.Instances[i].Configured = cfg.Instances[i].Host != "" && cfg.Instances[i].APIKey != ""
				if cfg.Instances[i].HasAPIKey {
					cfg.HasAPIKey = true
				}
				if cfg.Instances[i].Configured {
					cfg.Configured = true
				}
			}
			jsonResponse(w, http.StatusOK, cfg)
		})

		authed.Post("/api/v1/radarr/config", func(w http.ResponseWriter, r *http.Request) {
			bodyBytes, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			var rc config.RadarrConfig
			if err := json.Unmarshal(bodyBytes, &rc); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			var rawMap map[string]interface{}
			_ = json.Unmarshal(bodyBytes, &rawMap)

			if rc.APIKey == "" {
				if k, ok := rawMap["apiKey"].(string); ok && k != "" {
					rc.APIKey = k
				}
			}
			if rc.APIKey == "" && s.cfg.Radarr.APIKey != "" {
				rc.APIKey = s.cfg.Radarr.APIKey
			}
			if rc.Host == "" && s.cfg.Radarr.Host != "" {
				rc.Host = s.cfg.Radarr.Host
			}
			if rc.Port == 0 && s.cfg.Radarr.Port != 0 {
				rc.Port = s.cfg.Radarr.Port
			}
			if rc.URLBase == "" && s.cfg.Radarr.URLBase != "" {
				rc.URLBase = s.cfg.Radarr.URLBase
			}
			if rc.QualityProfileID == nil && s.cfg.Radarr.QualityProfileID != nil {
				rc.QualityProfileID = s.cfg.Radarr.QualityProfileID
			}
			if rc.RootFolderPath == "" && s.cfg.Radarr.RootFolderPath != "" {
				rc.RootFolderPath = s.cfg.Radarr.RootFolderPath
			}
			if len(rc.Instances) == 0 && len(s.cfg.Radarr.Instances) > 0 {
				rc.Instances = s.cfg.Radarr.Instances
			}
			if !rc.AutoRequestWatchlist {
				if v, ok := rawMap["autoRequestWatchlist"].(bool); ok && v {
					rc.AutoRequestWatchlist = true
				} else if v, ok := rawMap["auto_request_watchlist"].(bool); ok && v {
					rc.AutoRequestWatchlist = true
				}
			}

			if rawInsts, ok := rawMap["instances"].([]interface{}); ok && len(rawInsts) == len(rc.Instances) {
				for i, rawInst := range rawInsts {
					if m, ok := rawInst.(map[string]interface{}); ok {
						if rc.Instances[i].APIKey == "" {
							if k, ok := m["apiKey"].(string); ok && k != "" {
								rc.Instances[i].APIKey = k
							}
						}
						if !rc.Instances[i].AutoRequestWatchlist {
							if v, ok := m["autoRequestWatchlist"].(bool); ok && v {
								rc.Instances[i].AutoRequestWatchlist = true
							} else if v, ok := m["auto_request_watchlist"].(bool); ok && v {
								rc.Instances[i].AutoRequestWatchlist = true
							}
						}
					}
				}
			}
			for i := range rc.Instances {
				if rc.Instances[i].APIKey == "" {
					existing := s.cfg.Radarr.Resolve(rc.Instances[i].ID)
					if existing.APIKey != "" {
						rc.Instances[i].APIKey = existing.APIKey
					} else if rc.APIKey != "" {
						rc.Instances[i].APIKey = rc.APIKey
					}
				}
			}

			if len(rc.Instances) > 0 {
				primary := rc.Instances[0]
				for _, inst := range rc.Instances {
					if inst.Enabled {
						primary = inst
						break
					}
				}
				if rc.Host == "" {
					rc.Host = primary.Host
				}
				if rc.Port == 0 {
					rc.Port = primary.Port
				}
				if rc.APIKey == "" {
					rc.APIKey = primary.APIKey
				}
				if rc.URLBase == "" {
					rc.URLBase = primary.URLBase
				}
				if !rc.AutoRequestWatchlist && primary.AutoRequestWatchlist {
					rc.AutoRequestWatchlist = true
				}
			}

			rc.HasAPIKey = rc.APIKey != ""
			rc.Configured = rc.Host != "" && rc.APIKey != ""
			s.cfg.Radarr = rc
			_ = s.cfg.Save("")
			jsonResponse(w, http.StatusOK, map[string]string{"status": "saved"})
		})

		authed.Post("/api/v1/radarr/test", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				InstanceID string `json:"instance_id"`
				InstanceId string `json:"instanceId"`
				Host       string `json:"host"`
				Port       int    `json:"port"`
				APIKey     string `json:"api_key"`
				ApiKey     string `json:"apiKey"`
				UseSSL     bool   `json:"use_ssl"`
				UseSsl     bool   `json:"useSsl"`
				URLBase    string `json:"url_base"`
				UrlBase    string `json:"urlBase"`
			}
			bodyBytes, _ := io.ReadAll(r.Body)
			if len(bodyBytes) > 0 {
				_ = json.Unmarshal(bodyBytes, &req)
			}

			targetID := r.URL.Query().Get("instance_id")
			if targetID == "" {
				targetID = req.InstanceID
			}
			if targetID == "" {
				targetID = req.InstanceId
			}

			inst := s.cfg.Radarr.Resolve(targetID)
			if req.Host != "" {
				inst.Host = req.Host
			}
			if req.Port > 0 {
				inst.Port = req.Port
			}
			key := req.APIKey
			if key == "" {
				key = req.ApiKey
			}
			if key != "" {
				inst.APIKey = key
			}
			if req.UseSSL || req.UseSsl {
				inst.UseSSL = true
			} else if len(bodyBytes) > 0 && (bytes.Contains(bodyBytes, []byte(`"use_ssl"`)) || bytes.Contains(bodyBytes, []byte(`"useSsl"`))) {
				inst.UseSSL = req.UseSSL || req.UseSsl
			}
			urlBase := req.URLBase
			if urlBase == "" {
				urlBase = req.UrlBase
			}
			if urlBase != "" || (len(bodyBytes) > 0 && (bytes.Contains(bodyBytes, []byte(`"url_base"`)) || bytes.Contains(bodyBytes, []byte(`"urlBase"`)))) {
				inst.URLBase = urlBase
			}

			inst.Host = strings.TrimSpace(inst.Host)
			inst.APIKey = strings.TrimSpace(inst.APIKey)
			inst.URLBase = strings.TrimSpace(inst.URLBase)

			client := arr.NewRadarrClient(inst)
			res := client.TestConnection()

			if res.OK && inst.Host != "" && inst.APIKey != "" {
				if res.DetectedURLBase != "" && inst.URLBase == "" {
					inst.URLBase = res.DetectedURLBase
				}
				if len(s.cfg.Radarr.Instances) == 0 {
					s.cfg.Radarr.Host = inst.Host
					s.cfg.Radarr.Port = inst.Port
					s.cfg.Radarr.APIKey = inst.APIKey
					s.cfg.Radarr.UseSSL = inst.UseSSL
					s.cfg.Radarr.URLBase = inst.URLBase
				} else {
					matched := false
					for i, existing := range s.cfg.Radarr.Instances {
						if existing.ID == inst.ID {
							s.cfg.Radarr.Instances[i] = inst
							matched = true
							break
					}
				}
					if !matched {
						s.cfg.Radarr.Instances = append(s.cfg.Radarr.Instances, inst)
					}
				}
			}

			jsonResponse(w, http.StatusOK, res)
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

		// â”€â”€ Sonarr â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
		authed.Get("/api/v1/sonarr/config", func(w http.ResponseWriter, r *http.Request) {
			cfg := s.cfg.Sonarr
			cfg.HasAPIKey = cfg.APIKey != ""
			cfg.Configured = cfg.Host != "" && cfg.APIKey != ""
			for i := range cfg.Instances {
				cfg.Instances[i].HasAPIKey = cfg.Instances[i].APIKey != ""
				cfg.Instances[i].Configured = cfg.Instances[i].Host != "" && cfg.Instances[i].APIKey != ""
				if cfg.Instances[i].HasAPIKey {
					cfg.HasAPIKey = true
				}
				if cfg.Instances[i].Configured {
					cfg.Configured = true
				}
			}
			jsonResponse(w, http.StatusOK, cfg)
		})

		authed.Post("/api/v1/sonarr/config", func(w http.ResponseWriter, r *http.Request) {
			bodyBytes, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			var sc config.SonarrConfig
			if err := json.Unmarshal(bodyBytes, &sc); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			var rawMap map[string]interface{}
			_ = json.Unmarshal(bodyBytes, &rawMap)

			if sc.APIKey == "" {
				if k, ok := rawMap["apiKey"].(string); ok && k != "" {
					sc.APIKey = k
				}
			}
			if sc.APIKey == "" && s.cfg.Sonarr.APIKey != "" {
				sc.APIKey = s.cfg.Sonarr.APIKey
			}
			if sc.Host == "" && s.cfg.Sonarr.Host != "" {
				sc.Host = s.cfg.Sonarr.Host
			}
			if sc.Port == 0 && s.cfg.Sonarr.Port != 0 {
				sc.Port = s.cfg.Sonarr.Port
			}
			if sc.URLBase == "" && s.cfg.Sonarr.URLBase != "" {
				sc.URLBase = s.cfg.Sonarr.URLBase
			}
			if sc.QualityProfileID == nil && s.cfg.Sonarr.QualityProfileID != nil {
				sc.QualityProfileID = s.cfg.Sonarr.QualityProfileID
			}
			if sc.RootFolderPath == "" && s.cfg.Sonarr.RootFolderPath != "" {
				sc.RootFolderPath = s.cfg.Sonarr.RootFolderPath
			}
			if sc.SeriesType == "" && s.cfg.Sonarr.SeriesType != "" {
				sc.SeriesType = s.cfg.Sonarr.SeriesType
			}
			if len(sc.Instances) == 0 && len(s.cfg.Sonarr.Instances) > 0 {
				sc.Instances = s.cfg.Sonarr.Instances
			}
			if !sc.AutoRequestWatchlist {
				if v, ok := rawMap["autoRequestWatchlist"].(bool); ok && v {
					sc.AutoRequestWatchlist = true
				} else if v, ok := rawMap["auto_request_watchlist"].(bool); ok && v {
					sc.AutoRequestWatchlist = true
				}
			}

			if rawInsts, ok := rawMap["instances"].([]interface{}); ok && len(rawInsts) == len(sc.Instances) {
				for i, rawInst := range rawInsts {
					if m, ok := rawInst.(map[string]interface{}); ok {
						if sc.Instances[i].APIKey == "" {
							if k, ok := m["apiKey"].(string); ok && k != "" {
								sc.Instances[i].APIKey = k
							}
						}
						if !sc.Instances[i].AutoRequestWatchlist {
							if v, ok := m["autoRequestWatchlist"].(bool); ok && v {
								sc.Instances[i].AutoRequestWatchlist = true
							} else if v, ok := m["auto_request_watchlist"].(bool); ok && v {
								sc.Instances[i].AutoRequestWatchlist = true
							}
						}
					}
				}
			}
			for i := range sc.Instances {
				if sc.Instances[i].APIKey == "" {
					existing := s.cfg.Sonarr.Resolve(sc.Instances[i].ID)
					if existing.APIKey != "" {
						sc.Instances[i].APIKey = existing.APIKey
					} else if sc.APIKey != "" {
						sc.Instances[i].APIKey = sc.APIKey
					}
				}
			}

			if len(sc.Instances) > 0 {
				primary := sc.Instances[0]
				for _, inst := range sc.Instances {
					if inst.Enabled {
						primary = inst
						break
					}
				}
				if sc.Host == "" {
					sc.Host = primary.Host
				}
				if sc.Port == 0 {
					sc.Port = primary.Port
				}
				if sc.APIKey == "" {
					sc.APIKey = primary.APIKey
				}
				if sc.URLBase == "" {
					sc.URLBase = primary.URLBase
				}
				if !sc.AutoRequestWatchlist && primary.AutoRequestWatchlist {
					sc.AutoRequestWatchlist = true
				}
			}

			sc.HasAPIKey = sc.APIKey != ""
			sc.Configured = sc.Host != "" && sc.APIKey != ""
			s.cfg.Sonarr = sc
			_ = s.cfg.Save("")
			jsonResponse(w, http.StatusOK, map[string]string{"status": "saved"})
		})

		authed.Post("/api/v1/sonarr/test", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				InstanceID string `json:"instance_id"`
				InstanceId string `json:"instanceId"`
				Host       string `json:"host"`
				Port       int    `json:"port"`
				APIKey     string `json:"api_key"`
				ApiKey     string `json:"apiKey"`
				UseSSL     bool   `json:"use_ssl"`
				UseSsl     bool   `json:"useSsl"`
				URLBase    string `json:"url_base"`
				UrlBase    string `json:"urlBase"`
			}
			bodyBytes, _ := io.ReadAll(r.Body)
			if len(bodyBytes) > 0 {
				_ = json.Unmarshal(bodyBytes, &req)
			}

			targetID := r.URL.Query().Get("instance_id")
			if targetID == "" {
				targetID = req.InstanceID
			}
			if targetID == "" {
				targetID = req.InstanceId
			}

			inst := s.cfg.Sonarr.Resolve(targetID)
			if req.Host != "" {
				inst.Host = req.Host
			}
			if req.Port > 0 {
				inst.Port = req.Port
			}
			key := req.APIKey
			if key == "" {
				key = req.ApiKey
			}
			if key != "" {
				inst.APIKey = key
			}
			if req.UseSSL || req.UseSsl {
				inst.UseSSL = true
			} else if len(bodyBytes) > 0 && (bytes.Contains(bodyBytes, []byte(`"use_ssl"`)) || bytes.Contains(bodyBytes, []byte(`"useSsl"`))) {
				inst.UseSSL = req.UseSSL || req.UseSsl
			}
			urlBase := req.URLBase
			if urlBase == "" {
				urlBase = req.UrlBase
			}
			if urlBase != "" || (len(bodyBytes) > 0 && (bytes.Contains(bodyBytes, []byte(`"url_base"`)) || bytes.Contains(bodyBytes, []byte(`"urlBase"`)))) {
				inst.URLBase = urlBase
			}

			inst.Host = strings.TrimSpace(inst.Host)
			inst.APIKey = strings.TrimSpace(inst.APIKey)
			inst.URLBase = strings.TrimSpace(inst.URLBase)

			client := arr.NewSonarrClient(inst)
			res := client.TestConnection()

			if res.OK && inst.Host != "" && inst.APIKey != "" {
				if res.DetectedURLBase != "" && inst.URLBase == "" {
					inst.URLBase = res.DetectedURLBase
				}
				if len(s.cfg.Sonarr.Instances) == 0 {
					s.cfg.Sonarr.Host = inst.Host
					s.cfg.Sonarr.Port = inst.Port
					s.cfg.Sonarr.APIKey = inst.APIKey
					s.cfg.Sonarr.UseSSL = inst.UseSSL
					s.cfg.Sonarr.URLBase = inst.URLBase
				} else {
					matched := false
					for i, existing := range s.cfg.Sonarr.Instances {
						if existing.ID == inst.ID {
							s.cfg.Sonarr.Instances[i] = inst
							matched = true
							break
					}
				}
					if !matched {
						s.cfg.Sonarr.Instances = append(s.cfg.Sonarr.Instances, inst)
					}
				}
			}

			jsonResponse(w, http.StatusOK, res)
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


}
