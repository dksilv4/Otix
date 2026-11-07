package server

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/dksilv4/otix/node/internal/heartbeat"
	"github.com/go-chi/chi/v5"
)

func (s *Server) registerClaimRoutes(r chi.Router) {
	pingHandler := func(w http.ResponseWriter, r *http.Request) {
		status := s.claimMgr.Status()
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"status":      "online",
			"server_name": s.cfg.Server.Name,
			"version":     "0.0.1",
			"claimed":     status.Claimed,
			"claimed_by":  status.Username,
		})
	}
	r.Get("/api/v1/ping", pingHandler)
	r.Get("/api/v1/status", pingHandler)

	r.Get("/api/v1/claim/status", func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, http.StatusOK, s.claimMgr.Status())
	})

	r.Post("/api/v1/claim/confirm", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ClaimCode   string `json:"claim_code"`
			AuthToken   string `json:"auth_token"`
			ServerName  string `json:"server_name"`
			Username    string `json:"username"`
			RegistryURL string `json:"registry_url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(req.RegistryURL) != "" {
			s.cfg.Server.RegistryURL = strings.TrimSpace(req.RegistryURL)
		}

		err := s.claimMgr.Confirm(req.ClaimCode, req.AuthToken, req.ServerName, req.Username)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}

		s.announceHeartbeat()
		s.triggerBackendSync()

		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"status":  "claimed",
			"message": "Node successfully claimed and assigned to account",
		})
	})

	r.Post("/api/v1/claim/direct", func(w http.ResponseWriter, r *http.Request) {
		if !isLoopback(r) {
			http.Error(w, `{"error":"Direct claim only permitted from loopback"}`, http.StatusForbidden)
			return
		}
		var req struct {
			AuthToken  string `json:"auth_token"`
			ServerName string `json:"server_name"`
			Username   string `json:"username"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}

		if s.claimMgr == nil {
			http.Error(w, `{"error":"Claim manager not available"}`, http.StatusInternalServerError)
			return
		}

		if err := s.claimMgr.ConfirmDirect(req.AuthToken, req.ServerName, req.Username); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}

		s.announceHeartbeat()
		s.triggerBackendSync()

		jsonResponse(w, http.StatusOK, map[string]any{
			"status":      "claimed",
			"server_name": s.cfg.Server.Name,
			"username":    req.Username,
		})
	})

	r.Post("/api/v1/claim/unclaim", func(w http.ResponseWriter, r *http.Request) {
		if !isLoopback(r) && !s.isTokenValid(r) {
			http.Error(w, `{"error":"Unauthorized: unclaim must be called from loopback or with a valid token"}`, http.StatusUnauthorized)
			return
		}
		tokenToUnclaim := s.cfg.Server.AuthToken
		registryURL := heartbeat.ResolveRegistryURL(s.cfg)

		if err := s.claimMgr.Unclaim(); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
			return
		}

		if tokenToUnclaim != "" && registryURL != "" {
			go func() {
				client := &http.Client{Timeout: 5 * time.Second}
				baseAPI := heartbeat.NormalizeBaseAPI(registryURL)
				targetURL := fmt.Sprintf("%s/v1/nodes/%s/unclaim/", baseAPI, s.cfg.Server.NodeID)
				payload := map[string]any{
					"node_id":            s.cfg.Server.NodeID,
					"auth_token":         tokenToUnclaim,
					"local_url":          fmt.Sprintf("http://127.0.0.1:%d", s.cfg.Server.Port),
					"local_endpoints":    heartbeat.GetRoutableEndpoints(s.cfg.Server.Port),
					"network_interfaces": heartbeat.EnumerateInterfaces(),
				}
				data, err := json.Marshal(payload)
				if err == nil {
					req, err := http.NewRequest("POST", targetURL, bytes.NewReader(data))
					if err == nil {
						req.Header.Set("Content-Type", "application/json")
						req.Header.Set("Authorization", "Bearer "+tokenToUnclaim)
						resp, err := client.Do(req)
						if err == nil {
							_ = resp.Body.Close()
						}
					}
				}
				s.announceHeartbeat()
			}()
		} else {
			s.announceHeartbeat()
		}

		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"status":  "unclaimed",
			"message": "Node successfully unclaimed and reset",
		})
	})

	r.Post("/api/v1/claim/backend", func(w http.ResponseWriter, r *http.Request) {
		if !isLoopback(r) && !s.isTokenValid(r) {
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
			return
		}
		var req struct {
			RegistryURL string `json:"registry_url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}
		reg := strings.TrimSpace(req.RegistryURL)
		if reg == "" {
			reg = heartbeat.DefaultRegistryURL
		}
		reg = strings.TrimRight(reg, "/")
		if !strings.HasPrefix(reg, "http://") && !strings.HasPrefix(reg, "https://") {
			if strings.HasPrefix(reg, "localhost") || strings.HasPrefix(reg, "127.0.0.1") {
				reg = "http://" + reg
			} else {
				reg = "https://" + reg
			}
		}
		if strings.HasSuffix(reg, "/api/v1") {
			reg = strings.TrimSuffix(reg, "/v1")
		} else if !strings.HasSuffix(reg, "/api") {
			reg = reg + "/api"
		}
		s.cfg.Server.RegistryURL = reg
		if err := s.cfg.Save(""); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Failed to save config: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
		s.announceHeartbeat()
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"status":       "ok",
			"registry_url": reg,
		})
	})

	r.Post("/api/v1/claim/login", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Username    string `json:"username"`
			Password    string `json:"password"`
			RegistryURL string `json:"registry_url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}

		req.Username = strings.TrimSpace(req.Username)
		req.Password = strings.TrimSpace(req.Password)
		if req.Username == "" || req.Password == "" {
			http.Error(w, `{"error":"Username/Email and password are required"}`, http.StatusBadRequest)
			return
		}

		registryURL := strings.TrimSpace(req.RegistryURL)
		if registryURL == "" {
			registryURL = heartbeat.ResolveRegistryURL(s.cfg)
		}
		if registryURL == "" {
			registryURL = "https://otix.app/api"
		}
		registryURL = strings.TrimRight(registryURL, "/")

		// Auto-prepend scheme if omitted (e.g. "otix.app/api" -> "https://otix.app/api")
		if !strings.HasPrefix(registryURL, "http://") && !strings.HasPrefix(registryURL, "https://") {
			if strings.HasPrefix(registryURL, "localhost") || strings.HasPrefix(registryURL, "127.0.0.1") {
				registryURL = "http://" + registryURL
			} else {
				registryURL = "https://" + registryURL
			}
		}

		// Normalize base API URL
		baseAPI := heartbeat.NormalizeBaseAPI(registryURL)

		loginURL := fmt.Sprintf("%s/v1/auth/login", baseAPI)
		claimURL := fmt.Sprintf("%s/v1/nodes/claim-direct/", baseAPI)

		// 1. Authenticate with Otix backend
		loginPayload := map[string]string{
			"identity": req.Username,
			"password": req.Password,
		}
		loginData, err := json.Marshal(loginPayload)
		if err != nil {
			http.Error(w, `{"error":"Failed to marshal login request"}`, http.StatusInternalServerError)
			return
		}

		httpClient := &http.Client{Timeout: 15 * time.Second}
		loginReq, err := http.NewRequestWithContext(r.Context(), "POST", loginURL, bytes.NewReader(loginData))
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Failed to create login request: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
		loginReq.Header.Set("Content-Type", "application/json")

		loginResp, err := httpClient.Do(loginReq)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Could not connect to Otix backend at %s: %s"}`, loginURL, err.Error()), http.StatusBadGateway)
			return
		}
		defer loginResp.Body.Close()

		loginBody, _ := io.ReadAll(loginResp.Body)
		if loginResp.StatusCode != http.StatusOK {
			var errMap map[string]any
			errMsg := fmt.Sprintf("Authentication failed (HTTP %d)", loginResp.StatusCode)
			if err := json.Unmarshal(loginBody, &errMap); err == nil {
				if d, ok := errMap["detail"].(string); ok && d != "" {
					errMsg = d
				} else if e, ok := errMap["error"].(string); ok && e != "" {
					errMsg = e
				}
			}
			http.Error(w, fmt.Sprintf(`{"error":%q}`, errMsg), http.StatusUnauthorized)
			return
		}

		var loginResult struct {
			AccessToken       string `json:"access_token"`
			TwoFactorRequired bool   `json:"two_factor_required"`
		}
		if err := json.Unmarshal(loginBody, &loginResult); err != nil {
			http.Error(w, `{"error":"Failed to parse login response"}`, http.StatusInternalServerError)
			return
		}

		if loginResult.TwoFactorRequired || loginResult.AccessToken == "" {
			http.Error(w, `{"error":"Two-factor authentication is required. Please claim via PIN in the Otix Web interface or disable 2FA temporarily."}`, http.StatusForbidden)
			return
		}

		// 2. Prepare auth token for the node
		authToken := strings.TrimSpace(s.cfg.Server.AuthToken)
		if authToken == "" || authToken == "otix_secret_token" {
			tokenBytes := make([]byte, 24)
			if _, err := rand.Read(tokenBytes); err == nil {
				authToken = hex.EncodeToString(tokenBytes)
			} else {
				authToken = fmt.Sprintf("otix_tok_%d", time.Now().UnixNano())
			}
		}

		// 3. Perform direct claim with Otix backend
		claimPayload := map[string]any{
			"node_id":            s.cfg.Server.NodeID,
			"server_name":        s.cfg.Server.Name,
			"auth_token":         authToken,
			"port":               s.cfg.Server.Port,
			"local_endpoints":    heartbeat.GetRoutableEndpoints(s.cfg.Server.Port),
			"network_interfaces": heartbeat.EnumerateInterfaces(),
		}
		claimData, err := json.Marshal(claimPayload)
		if err != nil {
			http.Error(w, `{"error":"Failed to marshal claim request"}`, http.StatusInternalServerError)
			return
		}

		claimReq, err := http.NewRequestWithContext(r.Context(), "POST", claimURL, bytes.NewReader(claimData))
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Failed to create claim request: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
		claimReq.Header.Set("Content-Type", "application/json")
		claimReq.Header.Set("Authorization", "Bearer "+loginResult.AccessToken)

		claimResp, err := httpClient.Do(claimReq)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Failed to reach Otix claim endpoint: %s"}`, err.Error()), http.StatusBadGateway)
			return
		}
		defer claimResp.Body.Close()

		claimBody, _ := io.ReadAll(claimResp.Body)
		if claimResp.StatusCode != http.StatusOK && claimResp.StatusCode != http.StatusCreated {
			var errMap map[string]any
			errMsg := fmt.Sprintf("Server claim failed (HTTP %d)", claimResp.StatusCode)
			if err := json.Unmarshal(claimBody, &errMap); err == nil {
				if e, ok := errMap["error"].(string); ok && e != "" {
					errMsg = e
				} else if d, ok := errMap["detail"].(string); ok && d != "" {
					errMsg = d
				}
			}
			http.Error(w, fmt.Sprintf(`{"error":%q}`, errMsg), http.StatusBadRequest)
			return
		}

		// Update registry URL to the normalized baseAPI
		s.cfg.Server.RegistryURL = baseAPI

		// 4. Confirm direct claim locally and save config
		if err := s.claimMgr.ConfirmDirect(authToken, s.cfg.Server.Name, req.Username); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
			return
		}

		// Trigger background synchronization and heartbeat
		s.announceHeartbeat()
		s.triggerBackendSync()

		jsonResponse(w, http.StatusOK, map[string]any{
			"status":       "claimed",
			"username":     req.Username,
			"server_name":  s.cfg.Server.Name,
			"registry_url": s.cfg.Server.RegistryURL,
			"message":      "Successfully logged in and claimed Otix node",
		})
	})



}
