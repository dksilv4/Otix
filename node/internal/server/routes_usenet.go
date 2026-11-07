package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/jdownloader"
	"github.com/dksilv4/otix/node/internal/usenet"
	"github.com/go-chi/chi/v5"
)

func (s *Server) registerUsenetRoutes(authed chi.Router) {
		// â”€â”€ Usenet Aliases (SABnzbd & Prowlarr & g4u) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
		authed.Get("/api/v1/usenet/config", func(w http.ResponseWriter, r *http.Request) {
			sab := s.cfg.Usenet.Sabnzbd
			prow := s.cfg.Usenet.Prowlarr
			g4u := s.cfg.Usenet.G4U
			sabConfigured := sab.Host != "" && sab.APIKey != ""
			prowConfigured := prow.Host != "" && prow.APIKey != ""
			g4uConfigured := g4u.APIKey != ""

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
			type enrichedG4U struct {
				config.G4UConfig
				Configured   bool   `json:"configured"`
				HasAPIKey    bool   `json:"has_api_key"`
				HasApiKey    bool   `json:"hasApiKey"`
				ProviderType string `json:"provider_type"`
			}
			resp := struct {
				Enabled  bool             `json:"enabled"`
				Sabnzbd  enrichedSabnzbd  `json:"sabnzbd"`
				Prowlarr enrichedProwlarr `json:"prowlarr"`
				G4U      enrichedG4U      `json:"g4u"`
			}{
				Enabled: s.cfg.Usenet.Enabled,
				Sabnzbd: enrichedSabnzbd{
					SabnzbdConfig: sab,
					Configured:    sabConfigured,
					HasAPIKey:     sab.APIKey != "",
					HasApiKey:     sab.APIKey != "",
					ProviderType:   "downloader-provider",
				},
				Prowlarr: enrichedProwlarr{
					ProwlarrConfig: prow,
					Configured:     prowConfigured,
					HasAPIKey:      prow.APIKey != "",
					HasApiKey:      prow.APIKey != "",
					ProviderType:   "indexer-provider",
				},
				G4U: enrichedG4U{
					G4UConfig:    g4u,
					Configured:   g4uConfigured,
					HasAPIKey:    g4u.APIKey != "",
					HasApiKey:    g4u.APIKey != "",
					ProviderType: "indexer-provider",
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
			if g4uRaw, ok := raw["g4u"]; ok {
				var g4u config.G4UConfig
				if err := json.Unmarshal(g4uRaw, &g4u); err == nil {
					var rawMap map[string]interface{}
					if json.Unmarshal(g4uRaw, &rawMap) == nil {
						if k, ok := rawMap["apiKey"].(string); ok && k != "" && g4u.APIKey == "" {
							g4u.APIKey = k
						}
						if u, ok := rawMap["url"].(string); ok && u != "" {
							g4u.URL = u
						}
						if en, ok := rawMap["enabled"].(bool); ok {
							g4u.Enabled = en
						}
					}
					if g4u.APIKey == "" && s.cfg.Usenet.G4U.APIKey != "" {
						g4u.APIKey = s.cfg.Usenet.G4U.APIKey
					}
					if g4u.URL == "" {
						g4u.URL = "https://g4u.to/api/"
					}
					s.cfg.Usenet.G4U = g4u
				}
			}
			if enRaw, ok := raw["enabled"]; ok {
				var en bool
				if err := json.Unmarshal(enRaw, &en); err == nil {
					s.cfg.Usenet.Enabled = en
				}
			} else {
				s.cfg.Usenet.Enabled = (s.cfg.Usenet.Sabnzbd.Host != "" && s.cfg.Usenet.Sabnzbd.APIKey != "") ||
					(s.cfg.Usenet.Prowlarr.Host != "" && s.cfg.Usenet.Prowlarr.APIKey != "") ||
					(s.cfg.Usenet.G4U.APIKey != "")
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

		authed.Post("/api/v1/usenet/test-g4u", func(w http.ResponseWriter, r *http.Request) {
			g4uCfg := s.cfg.Usenet.G4U
			var req struct {
				URL    string `json:"url"`
				APIKey string `json:"api_key"`
				ApiKey string `json:"apiKey"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
				if req.URL != "" {
					g4uCfg.URL = req.URL
				}
				key := req.APIKey
				if key == "" {
					key = req.ApiKey
				}
				if key != "" {
					g4uCfg.APIKey = key
				}
			}
			client := usenet.NewG4UClient(g4uCfg)
			ok, msg := client.TestConnection()
			jsonResponse(w, http.StatusOK, map[string]interface{}{"ok": ok, "message": msg})
		})

		// â”€â”€ JDownloader Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
		authed.Get("/api/v1/jdownloader/config", func(w http.ResponseWriter, r *http.Request) {
			jd := s.cfg.JDownloader
			configured := (jd.Enabled && (jd.Email != "" || (jd.DirectHost != "" && jd.DirectPort > 0))) || (jd.Email != "" && jd.Password != "")
			resp := struct {
				config.JDownloaderConfig
				Configured       bool   `json:"configured"`
				HasPassword      bool   `json:"has_password"`
				HasPasswordCamel bool   `json:"hasPassword"`
				ProviderType     string `json:"provider_type"`
			}{
				JDownloaderConfig: jd,
				Configured:        configured,
				HasPassword:       jd.Password != "",
				HasPasswordCamel:  jd.Password != "",
				ProviderType:      "downloader-provider",
			}
			jsonResponse(w, http.StatusOK, resp)
		})

		authed.Post("/api/v1/jdownloader/config", func(w http.ResponseWriter, r *http.Request) {
			var rawMap map[string]interface{}
			bodyBytes, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			if err := json.Unmarshal(bodyBytes, &rawMap); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}

			var jd config.JDownloaderConfig
			_ = json.Unmarshal(bodyBytes, &jd)

			// Support camelCase overrides
			if email, ok := rawMap["email"].(string); ok && email != "" {
				jd.Email = email
			}
			if pass, ok := rawMap["password"].(string); ok && pass != "" {
				jd.Password = pass
			} else if jd.Password == "" && s.cfg.JDownloader.Password != "" {
				jd.Password = s.cfg.JDownloader.Password
			}
			if devName, ok := rawMap["deviceName"].(string); ok && devName != "" {
				jd.DeviceName = devName
			}
			if devID, ok := rawMap["deviceId"].(string); ok && devID != "" {
				jd.DeviceID = devID
			}
			if dHost, ok := rawMap["directHost"].(string); ok && dHost != "" {
				jd.DirectHost = dHost
			}
			if dPort, ok := rawMap["directPort"].(float64); ok && dPort > 0 {
				jd.DirectPort = int(dPort)
			}
			if dlPath, ok := rawMap["downloadPath"].(string); ok && dlPath != "" {
				jd.DownloadPath = dlPath
			}
			if en, ok := rawMap["enabled"].(bool); ok {
				jd.Enabled = en
			} else {
				jd.Enabled = jd.Email != "" || (jd.DirectHost != "" && jd.DirectPort > 0)
			}

			s.cfg.JDownloader = jd
			_ = s.cfg.Save("")
			jsonResponse(w, http.StatusOK, map[string]string{"status": "saved"})
		})

		authed.Post("/api/v1/jdownloader/test", func(w http.ResponseWriter, r *http.Request) {
			jdCfg := s.cfg.JDownloader
			var rawMap map[string]interface{}
			bodyBytes, err := io.ReadAll(r.Body)
			if err == nil && len(bodyBytes) > 0 {
				_ = json.Unmarshal(bodyBytes, &rawMap)
			}

			email, _ := rawMap["email"].(string)
			password, _ := rawMap["password"].(string)
			deviceName, _ := rawMap["deviceName"].(string)
			if deviceName == "" {
				deviceName, _ = rawMap["device_name"].(string)
			}
			deviceID, _ := rawMap["deviceId"].(string)
			if deviceID == "" {
				deviceID, _ = rawMap["device_id"].(string)
			}
			directHost, _ := rawMap["directHost"].(string)
			if directHost == "" {
				directHost, _ = rawMap["direct_host"].(string)
			}
			var directPort int
			if dp, ok := rawMap["directPort"].(float64); ok && dp > 0 {
				directPort = int(dp)
			} else if dp, ok := rawMap["direct_port"].(float64); ok && dp > 0 {
				directPort = int(dp)
			}

			if email != "" {
				jdCfg.Email = email
				jdCfg.DirectHost = ""
				jdCfg.DirectPort = 0
			}
			if password != "" {
				jdCfg.Password = password
			}
			if deviceName != "" {
				jdCfg.DeviceName = deviceName
			}
			if deviceID != "" {
				jdCfg.DeviceID = deviceID
			}
			if directHost != "" {
				jdCfg.DirectHost = directHost
				jdCfg.Email = ""
			}
			if directPort > 0 {
				jdCfg.DirectPort = directPort
			}

			client := jdownloader.NewClient(jdCfg)
			ok, msg := client.TestConnection()
			jsonResponse(w, http.StatusOK, map[string]interface{}{"ok": ok, "message": msg})
		})

		authed.Get("/api/v1/usenet/search", func(w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query().Get("query")
			releases, err := s.providersMgr.Search(q, nil)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			jsonResponse(w, http.StatusOK, releases)
		})

		authed.Get("/api/v1/g4u/nzb/{id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			client := usenet.NewG4UClient(s.cfg.Usenet.G4U)
			nzbBytes, err := client.GetNZB(id)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/x-nzb")
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.nzb"`, id))
			_, _ = w.Write(nzbBytes)
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


}
