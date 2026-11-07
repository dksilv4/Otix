package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/dksilv4/otix/node/internal/desktop"
	"github.com/dksilv4/otix/node/internal/hardware"
	"github.com/dksilv4/otix/node/internal/organize"
	"github.com/go-chi/chi/v5"
)

func (s *Server) registerDesktopOrganizeRoutes(authed chi.Router) {
		// â”€â”€ Desktop & Organize â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
		authed.Get("/api/v1/desktop/settings", func(w http.ResponseWriter, r *http.Request) {
			refresh := r.URL.Query().Get("refresh") == "true"
			resp := desktop.GetDesktopSettings(s.cfg, refresh)
			if s.gamesStore != nil {
				ov := s.gamesStore.GetOverlaySettings()
				resp.OverlayEnabled = ov.Enabled
				resp.OverlayCorner = ov.Corner
				resp.OverlayMonitor = ov.Monitor
				resp.OverlayHotkey = ov.Hotkey
				resp.OverlayShowFps = ov.ShowFps
				resp.OverlayShowPercentiles = ov.ShowPercentiles
				resp.OverlayShowPlaytime = ov.ShowPlaytime
				resp.OverlayShowTitle = ov.ShowTitle
				resp.OverlayOpacity = ov.Opacity
				resp.OverlayScale = ov.Scale
			}
			if resp.OverlayMonitor == "" {
				resp.OverlayMonitor = "auto"
			}
			if resp.OverlayCorner == "" {
				resp.OverlayCorner = "top-wide"
			}
			if resp.OverlayHotkey == "" {
				resp.OverlayHotkey = "Ctrl+`"
			}
			if s.overlayMgr != nil {
				resp.OverlayMonitors = s.overlayMgr.GetAvailableMonitors()
			}
			jsonResponse(w, http.StatusOK, resp)
		})

		authed.Get("/api/v1/desktop/hardware", func(w http.ResponseWriter, r *http.Request) {
			refresh := r.URL.Query().Get("refresh") == "true"
			jsonResponse(w, http.StatusOK, hardware.GetMachineHardware(refresh))
		})

		authed.Post("/api/v1/desktop/settings", func(w http.ResponseWriter, r *http.Request) {
			var payload map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			resp := desktop.ApplyDesktopSettings(s.cfg, payload)
			if s.gamesStore != nil {
				ov := s.gamesStore.GetOverlaySettings()
				changed := false
				if v, ok := payload["overlayEnabled"]; ok {
					if b, okB := v.(bool); okB {
						ov.Enabled = b
						changed = true
					}
				} else if v, ok := payload["overlay_enabled"]; ok {
					if b, okB := v.(bool); okB {
						ov.Enabled = b
						changed = true
					}
				}
				if v, ok := payload["overlayCorner"]; ok {
					if sVal, okS := v.(string); okS && sVal != "" {
						ov.Corner = sVal
						changed = true
					}
				} else if v, ok := payload["overlay_corner"]; ok {
					if sVal, okS := v.(string); okS && sVal != "" {
						ov.Corner = sVal
						changed = true
					}
				}
				if v, ok := payload["overlayMonitor"]; ok {
					if sVal, okS := v.(string); okS && sVal != "" {
						ov.Monitor = sVal
						changed = true
					}
				} else if v, ok := payload["overlay_monitor"]; ok {
					if sVal, okS := v.(string); okS && sVal != "" {
						ov.Monitor = sVal
						changed = true
					}
				}
				if v, ok := payload["overlayHotkey"]; ok {
					if sVal, okS := v.(string); okS && sVal != "" {
						ov.Hotkey = sVal
						changed = true
					}
				} else if v, ok := payload["overlay_hotkey"]; ok {
					if sVal, okS := v.(string); okS && sVal != "" {
						ov.Hotkey = sVal
						changed = true
					}
				}
				if v, ok := payload["overlayShowFps"]; ok {
					if b, okB := v.(bool); okB {
						ov.ShowFps = b
						changed = true
					}
				} else if v, ok := payload["overlay_show_fps"]; ok {
					if b, okB := v.(bool); okB {
						ov.ShowFps = b
						changed = true
					}
				}
				if v, ok := payload["overlayShowPercentiles"]; ok {
					if b, okB := v.(bool); okB {
						ov.ShowPercentiles = b
						changed = true
					}
				} else if v, ok := payload["overlay_show_percentiles"]; ok {
					if b, okB := v.(bool); okB {
						ov.ShowPercentiles = b
						changed = true
					}
				}
				if v, ok := payload["overlayShowPlaytime"]; ok {
					if b, okB := v.(bool); okB {
						ov.ShowPlaytime = b
						changed = true
					}
				} else if v, ok := payload["overlay_show_playtime"]; ok {
					if b, okB := v.(bool); okB {
						ov.ShowPlaytime = b
						changed = true
					}
				}
				if v, ok := payload["overlayShowTitle"]; ok {
					if b, okB := v.(bool); okB {
						ov.ShowTitle = b
						changed = true
					}
				} else if v, ok := payload["overlay_show_title"]; ok {
					if b, okB := v.(bool); okB {
						ov.ShowTitle = b
						changed = true
					}
				}
				if v, ok := payload["overlayOpacity"]; ok {
					if fVal, okF := v.(float64); okF && fVal > 0 {
						ov.Opacity = fVal
						changed = true
					}
				} else if v, ok := payload["overlay_opacity"]; ok {
					if fVal, okF := v.(float64); okF && fVal > 0 {
						ov.Opacity = fVal
						changed = true
					}
				}
				if changed {
					_ = s.gamesStore.SaveOverlaySettings(ov)
					if s.overlayMgr != nil {
						s.overlayMgr.ApplySettings(ov)
					}
				}
				resp.OverlayEnabled = ov.Enabled
				resp.OverlayCorner = ov.Corner
				resp.OverlayMonitor = ov.Monitor
				resp.OverlayHotkey = ov.Hotkey
				resp.OverlayShowFps = ov.ShowFps
				resp.OverlayShowPercentiles = ov.ShowPercentiles
				resp.OverlayShowPlaytime = ov.ShowPlaytime
				resp.OverlayShowTitle = ov.ShowTitle
				resp.OverlayOpacity = ov.Opacity
				resp.OverlayScale = ov.Scale
			}
			if s.overlayMgr != nil {
				resp.OverlayMonitors = s.overlayMgr.GetAvailableMonitors()
			}
			if s.gamesTracker != nil {
				s.gamesTracker.SetNodeInfo(s.cfg.Server.Name, s.cfg.Server.Port)
			}
			if s.trayMgr != nil {
				s.trayMgr.UpdateTooltip()
			}
			s.announceHeartbeat()
			s.triggerBackendSync()
			jsonResponse(w, http.StatusOK, resp)
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

		authed.Post("/api/v1/organize/preview", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Directory string `json:"directory"`
				Template  string `json:"template"`
				Sample    bool   `json:"sample"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			dir := req.Directory
			if dir == "" {
				dir = s.cfg.Organize.ISODownloadPath
			}
			tmpl := req.Template
			if tmpl == "" {
				tmpl = s.cfg.Organize.NamingTemplate
			}
			items, err := organize.PreviewOrganization(dir, tmpl, req.Sample)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, items)
		})

		authed.Post("/api/v1/organize/execute", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Items              []organize.ExecuteItem `json:"items"`
				DeleteEmptyFolders *bool                  `json:"delete_empty_folders"`
				DeleteEmptyCamel   *bool                  `json:"deleteEmptyFolders"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			deleteEmpty := s.cfg.Organize.DeleteEmptyFolders
			if req.DeleteEmptyFolders != nil {
				deleteEmpty = *req.DeleteEmptyFolders
			} else if req.DeleteEmptyCamel != nil {
				deleteEmpty = *req.DeleteEmptyCamel
			}
			results, err := organize.ExecuteOrganization(req.Items, deleteEmpty)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
				return
			}

			// Automatically refresh indexer and notify backend if items were moved
			hasSuccess := false
			for _, res := range results {
				if res.Success {
					hasSuccess = true
					break
				}
			}
			if hasSuccess {
				go func() {
					s.indexer.ScanAll()
					s.triggerBackendSync()
				}()
			}

			jsonResponse(w, http.StatusOK, map[string]interface{}{
				"success": true,
				"results": results,
			})
		})

		// â”€â”€ Headless Node Plugins (Deals) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

}
