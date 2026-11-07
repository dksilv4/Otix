package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/desktop"
	"github.com/dksilv4/otix/node/internal/epic"
	"github.com/dksilv4/otix/node/internal/games"
	"github.com/dksilv4/otix/node/internal/gog"
	"github.com/dksilv4/otix/node/internal/heartbeat"
	"github.com/dksilv4/otix/node/internal/indexer"
	"github.com/dksilv4/otix/node/internal/plugins"
	"github.com/dksilv4/otix/node/internal/providers"
	"github.com/dksilv4/otix/node/internal/saves"
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

	// Public Health, Claim & Hardware APIs
	s.registerClaimRoutes(r)
	s.registerGamesRoutes(r)

	// Authenticated routes
	r.Group(func(authed chi.Router) {
		authed.Use(s.verifyToken)

		s.registerLibraryScanRoutes(authed)
		s.registerExplorerSavesRoutes(authed)
		s.registerDownloadsRoutes(authed)
		s.registerUsenetRoutes(authed)
		s.registerArrRoutes(authed)
		s.registerDesktopOrganizeRoutes(authed)
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


