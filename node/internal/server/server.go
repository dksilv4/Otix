package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
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
	"github.com/dksilv4/otix/node/internal/gog"
	"github.com/dksilv4/otix/node/internal/hardware"
	"github.com/dksilv4/otix/node/internal/heartbeat"
	"github.com/dksilv4/otix/node/internal/indexer"
	"github.com/dksilv4/otix/node/internal/jdownloader"
	"github.com/dksilv4/otix/node/internal/organize"
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
	hbRunner     *heartbeat.HeartbeatRunner
	indexer      *indexer.StorageIndexer
	savesMgr     *saves.SaveCloudManager
	epicClient   *epic.EpicClient
	gogClient    *gog.GOGClient
	providersMgr *providers.ProviderManager
	dealsMonitor *plugins.DealsMonitor
	gamesStore   *games.SessionStore
	gamesTracker *games.GameTracker
	fpsCollector games.FpsCollector
	overlayMgr   *games.OverlayManager
	trayMgr      *desktop.TrayManager
	startTime    time.Time
	router       *chi.Mux
	stopOnce     sync.Once
}

func NewServer(cfg *config.AppConfig, claimMgr *claim.ClaimManager) *Server {
	storageDir := cfg.ResolveStorageDir()
	_ = os.MkdirAll(storageDir, 0755)

	idx := indexer.NewStorageIndexer(cfg.GameLibraries)
	cacheDB := filepath.Join(storageDir, "indexer_cache.db")
	if store, err := indexer.OpenStore(cacheDB); err == nil {
		_ = idx.SetStore(store)
	}
	if watcher, err := indexer.NewWatcher(func(changedPath string) {
		if !idx.IsScanning() {
			go idx.ScanAll()
		}
	}); err == nil {
		idx.AttachWatcher(watcher)
	}
	go idx.ScanAll()

	savesPath := cfg.ResolveSavesPath()
	_ = os.MkdirAll(savesPath, 0755)

	_ = os.MkdirAll(cfg.ResolveDownloadsPath(), 0755)

	savesMgr := saves.NewSaveCloudManager(savesPath, cfg.Saves.MaxSnapshotsPerGame)
	epicClient := epic.NewEpicClient(storageDir)
	gogClient := gog.NewGOGClient(storageDir)
	provMgr := providers.NewProviderManager(cfg)
	dealsMon := plugins.NewDealsMonitor()

	gamesStore, err := games.NewSessionStore(storageDir)
	if err != nil {
		fmt.Printf("[Server] Warning: failed to init games store: %v\n", err)
	}
	fpsCollector := games.NewPresentMonCollector(storageDir)
	gamesTracker := games.NewGameTracker(gamesStore, fpsCollector, idx)
	gamesTracker.SetNodeInfo(cfg.Server.Name, cfg.Server.Port)
	gamesTracker.SetOnlyTrackScanned(gamesStore.GetOverlaySettings().OnlyTrackScanned)
	overlayMgr := games.NewOverlayManager(gamesStore, gamesTracker, fpsCollector)
	gamesTracker.Start()
	overlayMgr.Start()

	trayMgr := desktop.NewTrayManager(cfg, claimMgr, gamesStore, overlayMgr, gamesTracker, idx)
	trayMgr.Start()

	s := &Server{
		cfg:          cfg,
		claimMgr:     claimMgr,
		indexer:      idx,
		savesMgr:     savesMgr,
		epicClient:   epicClient,
		gogClient:    gogClient,
		providersMgr: provMgr,
		dealsMonitor: dealsMon,
		gamesStore:   gamesStore,
		gamesTracker: gamesTracker,
		fpsCollector: fpsCollector,
		overlayMgr:   overlayMgr,
		trayMgr:      trayMgr,
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

func (s *Server) TrayManager() *desktop.TrayManager {
	return s.trayMgr
}

func (s *Server) Router() http.Handler {
	return s.router
}

// Indexer exposes the storage indexer for tests and internal tooling.
func (s *Server) Indexer() *indexer.StorageIndexer {
	return s.indexer
}

func (s *Server) SetHeartbeatRunner(hb *heartbeat.HeartbeatRunner) {
	s.hbRunner = hb
}

func (s *Server) announceHeartbeat() {
	if s.hbRunner != nil {
		s.hbRunner.TriggerNow()
	}
}

// Stop cleanly shuts down all background loops and closes storage/DB handles.
func (s *Server) Stop() {
	s.stopOnce.Do(func() {
		if s.gamesTracker != nil {
			s.gamesTracker.Stop()
		}
		if s.overlayMgr != nil {
			s.overlayMgr.Stop()
		}
		if s.trayMgr != nil {
			s.trayMgr.Stop()
		}
		if s.indexer != nil {
			_ = s.indexer.Close()
		}
		if s.hbRunner != nil {
			s.hbRunner.Stop()
		}
		if s.dealsMonitor != nil {
			s.dealsMonitor.Stop()
		}
	})
}

// Close is an alias for Stop implementing io.Closer.
func (s *Server) Close() error {
	s.Stop()
	return nil
}

type serverContextKey string

const rawRemoteAddrCtxKey serverContextKey = "otix.rawRemoteAddr"

func rawRemoteAddrMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), rawRemoteAddrCtxKey, r.RemoteAddr)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func isLoopbackHost(host string) bool {
	if host == "" {
		return false
	}
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil && ip4.IsLoopback() {
		return true
	}
	return false
}

func isLoopbackAddr(addr string) bool {
	if strings.TrimSpace(addr) == "" {
		return false
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	return isLoopbackHost(host)
}

func isLoopback(r *http.Request) bool {
	if r == nil {
		return false
	}

	// 1. Verify the physical socket address before any reverse-proxy rewrites
	rawAddr := r.RemoteAddr
	if val, ok := r.Context().Value(rawRemoteAddrCtxKey).(string); ok && val != "" {
		rawAddr = val
	}
	if !isLoopbackAddr(rawAddr) {
		return false
	}

	// 2. Reject requests bearing proxy forwarding headers.
	// Loopback-restricted management endpoints must be called directly from the local host,
	// never routed through external proxies or reverse proxies that forward client identities.
	if r.Header.Get("X-Forwarded-For") != "" ||
		r.Header.Get("X-Real-IP") != "" ||
		r.Header.Get("Forwarded") != "" ||
		r.Header.Get("Client-IP") != "" ||
		r.Header.Get("CF-Connecting-IP") != "" ||
		r.Header.Get("True-Client-IP") != "" ||
		r.Header.Get("X-Cluster-Client-IP") != "" {
		return false
	}

	// 3. Current RemoteAddr check (in case middleware or transport set it to non-loopback)
	if !isLoopbackAddr(r.RemoteAddr) {
		return false
	}

	return true
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

	r.Use(rawRemoteAddrMiddleware)
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

	// Private Network Access (PNA) support for browser direct node queries
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
				w.Header().Set("Access-Control-Allow-Private-Network", "true")
			}
			if r.Method == http.MethodOptions {
				w.Header().Set("Access-Control-Allow-Private-Network", "true")
			}
			next.ServeHTTP(w, r)
		})
	})

	// Root WebUI
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		uptime := int(time.Since(s.startTime).Seconds())
		htmlContent := webui.RenderHome(s.cfg, s.claimMgr, s.indexer, uptime)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(htmlContent))
	})

	// Public Health & Claim APIs
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

	// Authenticated routes
	r.Group(func(authed chi.Router) {
		authed.Use(s.verifyToken)

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
	})
}

var (
	lastSyncMu   sync.Mutex
	lastSyncTime time.Time
)

// ResetLastSyncTimeForTesting resets the debounce timer for tests.
func ResetLastSyncTimeForTesting() {
	lastSyncMu.Lock()
	lastSyncTime = time.Time{}
	lastSyncMu.Unlock()
}

func (s *Server) triggerBackendSync() {
	s.TriggerBackendSync()
}

// TriggerBackendSync transmits indexed files directly to the backend manifest ingest endpoint in 500-item chunks.
func (s *Server) TriggerBackendSync() {
	lastSyncMu.Lock()
	if time.Since(lastSyncTime) < 30*time.Second {
		lastSyncMu.Unlock()
		return
	}
	lastSyncTime = time.Now()
	lastSyncMu.Unlock()

	if s.cfg == nil {
		return
	}
	registryURL := heartbeat.ResolveRegistryURL(s.cfg)
	if registryURL == "" {
		return
	}
	nodeID := s.cfg.Server.NodeID
	if nodeID == "" {
		return
	}
	authToken := s.cfg.Server.AuthToken

	var files []indexer.HostedFile
	if s.indexer != nil {
		files = s.indexer.Files()
	}

	go func() {
		client := &http.Client{Timeout: 30 * time.Second}
		baseAPI := heartbeat.NormalizeBaseAPI(registryURL)
		manifestURL := fmt.Sprintf("%s/v1/nodes/%s/manifest/", baseAPI, nodeID)
		_ = TransmitManifest(client, manifestURL, authToken, files)
	}()
}

// TransmitManifest sends indexed files to the backend manifest ingest endpoint in chunks of 500 items.
func TransmitManifest(client *http.Client, manifestURL, authToken string, files []indexer.HostedFile) error {
	const chunkSize = 500
	if len(files) == 0 {
		payload := map[string]any{
			"auth_token": authToken,
			"files":      []indexer.HostedFile{},
			"prune":      true,
		}
		return SendManifestPayload(client, manifestURL, authToken, payload)
	}

	for i := 0; i < len(files); i += chunkSize {
		end := i + chunkSize
		if end > len(files) {
			end = len(files)
		}
		chunk := files[i:end]
		isFirst := (i == 0)
		isLast := (end == len(files))

		payload := map[string]any{
			"auth_token": authToken,
			"files":      chunk,
			"append":     !isFirst,
			"prune":      isLast,
		}
		if err := SendManifestPayload(client, manifestURL, authToken, payload); err != nil {
			return err
		}
	}
	return nil
}

// SendManifestPayload transmits a JSON payload to the manifest endpoint with Bearer auth.
func SendManifestPayload(client *http.Client, targetURL, authToken string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("POST", targetURL, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if authToken != "" {
		req.Header.Set("Authorization", "Bearer "+authToken)
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}


