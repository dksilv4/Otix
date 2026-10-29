package providers

import (
	"fmt"
	"strings"
	"sync"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/jdownloader"
	"github.com/dksilv4/otix/node/internal/usenet"
)

type ProviderInfo struct {
	Name         string `json:"name"`
	DisplayName  string `json:"display_name"`
	Type         string `json:"type"`
	ProviderType string `json:"provider_type"`
	Protocol     string `json:"protocol"`
	Configured   bool   `json:"configured"`
	Connected    bool   `json:"connected"`
	IsActive     bool   `json:"is_active"`
	StatusText   string `json:"status_text"`
}

type ProviderManager struct {
	mu  sync.RWMutex
	cfg *config.AppConfig
}

func NewProviderManager(cfg *config.AppConfig) *ProviderManager {
	return &ProviderManager{cfg: cfg}
}

func InferDownloadProtocol(downloadURL string) string {
	lower := strings.ToLower(strings.TrimSpace(downloadURL))
	if strings.HasPrefix(lower, "magnet:") || strings.HasSuffix(lower, ".torrent") || strings.Contains(lower, ".torrent?") {
		return "torrent"
	}
	if strings.HasSuffix(lower, ".nzb") || strings.Contains(lower, ".nzb?") {
		return "usenet"
	}
	// Direct download links / cyberlockers / containers / DLC
	if strings.HasSuffix(lower, ".dlc") || strings.Contains(lower, "rapidgator.net") || strings.Contains(lower, "1fichier.com") ||
		strings.Contains(lower, "mega.nz") || strings.Contains(lower, "mediafire.com") || strings.Contains(lower, "ddownload.com") ||
		strings.Contains(lower, "pixeldrain.com") || strings.Contains(lower, "gdrive") || strings.Contains(lower, "drive.google.com") {
		return "direct"
	}
	return "usenet"
}

func (pm *ProviderManager) ListProviders() map[string]interface{} {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	sabClient := usenet.NewSabnzbdClient(pm.cfg.Usenet.Sabnzbd)
	sabConfigured := pm.cfg.Usenet.Sabnzbd.Host != "" && pm.cfg.Usenet.Sabnzbd.APIKey != ""
	sabConnected, sabMsg := false, "Not configured"
	if sabConfigured {
		sabConnected, sabMsg = sabClient.TestConnection()
	}

	jdClient := jdownloader.NewClient(pm.cfg.JDownloader)
	jdConfigured := pm.cfg.JDownloader.Enabled || pm.cfg.JDownloader.Email != "" || (pm.cfg.JDownloader.DirectHost != "" && pm.cfg.JDownloader.DirectPort > 0)
	jdConnected, jdMsg := false, "Not configured"
	if jdConfigured {
		jdConnected, jdMsg = jdClient.TestConnection()
	}

	prowClient := usenet.NewProwlarrClient(pm.cfg.Usenet.Prowlarr)
	prowConfigured := pm.cfg.Usenet.Prowlarr.Host != "" && pm.cfg.Usenet.Prowlarr.APIKey != ""
	prowConnected, prowMsg := false, "Not configured"
	if prowConfigured {
		prowConnected, prowMsg = prowClient.TestConnection()
	}

	g4uClient := usenet.NewG4UClient(pm.cfg.Usenet.G4U)
	g4uConfigured := pm.cfg.Usenet.G4U.APIKey != ""
	g4uConnected, g4uMsg := false, "Not configured"
	if g4uConfigured {
		g4uConnected, g4uMsg = g4uClient.TestConnection()
	}

	downloaders := []ProviderInfo{
		{
			Name:         "sabnzbd",
			DisplayName:  "SABnzbd",
			Type:         "downloader",
			ProviderType: "downloader-provider",
			Protocol:     "usenet",
			Configured:   sabConfigured,
			Connected:    sabConnected,
			IsActive:     true,
			StatusText:   sabMsg,
		},
		{
			Name:         "jdownloader",
			DisplayName:  "JDownloader",
			Type:         "downloader",
			ProviderType: "downloader-provider",
			Protocol:     "direct",
			Configured:   jdConfigured,
			Connected:    jdConnected,
			IsActive:     jdConfigured,
			StatusText:   jdMsg,
		},
	}

	searchProviders := []ProviderInfo{
		{
			Name:         "prowlarr",
			DisplayName:  "Prowlarr",
			Type:         "indexer",
			ProviderType: "indexer-provider",
			Protocol:     "multi",
			Configured:   prowConfigured,
			Connected:    prowConnected,
			IsActive:     true,
			StatusText:   prowMsg,
		},
		{
			Name:         "g4u",
			DisplayName:  "g4u (Games 4 You)",
			Type:         "indexer",
			ProviderType: "indexer-provider",
			Protocol:     "usenet",
			Configured:   g4uConfigured,
			Connected:    g4uConnected,
			IsActive:     g4uConfigured,
			StatusText:   g4uMsg,
		},
	}

	activeDownloader := "sabnzbd"
	if !sabConfigured && jdConfigured {
		activeDownloader = "jdownloader"
	}

	return map[string]interface{}{
		"downloaders":            downloaders,
		"search_providers":       searchProviders,
		"indexers":               searchProviders,
		"indexer_providers":      searchProviders,
		"active_downloader":      activeDownloader,
		"active_search_provider": "prowlarr",
		"active_indexer":         "prowlarr",
	}
}

func (pm *ProviderManager) TestProvider(providerType, name string) (map[string]interface{}, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	ptype := strings.ToLower(providerType)
	pname := strings.ToLower(name)

	if ptype == "downloader" || ptype == "downloaders" {
		if pname == "sabnzbd" {
			client := usenet.NewSabnzbdClient(pm.cfg.Usenet.Sabnzbd)
			ok, msg := client.TestConnection()
			return map[string]interface{}{"ok": ok, "message": msg}, nil
		}
		if pname == "jdownloader" || pname == "jd2" {
			client := jdownloader.NewClient(pm.cfg.JDownloader)
			ok, msg := client.TestConnection()
			return map[string]interface{}{"ok": ok, "message": msg}, nil
		}
		return nil, fmt.Errorf("downloader '%s' not supported", name)
	}

	if ptype == "search_provider" || ptype == "search-provider" || ptype == "search" ||
		ptype == "indexer" || ptype == "indexers" || ptype == "indexer_provider" || ptype == "indexer-provider" {
		if pname == "prowlarr" {
			client := usenet.NewProwlarrClient(pm.cfg.Usenet.Prowlarr)
			ok, msg := client.TestConnection()
			return map[string]interface{}{"ok": ok, "message": msg}, nil
		}
		if pname == "g4u" || pname == "g4u.to" {
			client := usenet.NewG4UClient(pm.cfg.Usenet.G4U)
			ok, msg := client.TestConnection()
			return map[string]interface{}{"ok": ok, "message": msg}, nil
		}
		return nil, fmt.Errorf("indexer provider '%s' not supported", name)
	}

	return nil, fmt.Errorf("unknown provider type '%s'", providerType)
}

func (pm *ProviderManager) Search(query string, categories []int) ([]usenet.ProwlarrRelease, error) {
	pm.mu.RLock()
	prowCfg := pm.cfg.Usenet.Prowlarr
	g4uCfg := pm.cfg.Usenet.G4U
	pm.mu.RUnlock()

	prowConfigured := prowCfg.Host != "" && prowCfg.APIKey != ""
	g4uConfigured := g4uCfg.APIKey != ""

	if !prowConfigured && !g4uConfigured {
		return nil, fmt.Errorf("no search providers configured (configure Prowlarr or g4u)")
	}

	var combined []usenet.ProwlarrRelease
	seen := make(map[string]bool)

	if g4uConfigured {
		client := usenet.NewG4UClient(g4uCfg)
		releases, err := client.Search(query, 50)
		if err == nil {
			for _, r := range releases {
				key := strings.ToLower(r.Title) + "|" + r.Indexer
				if !seen[key] {
					seen[key] = true
					combined = append(combined, r)
				}
			}
		}
	}

	if prowConfigured {
		client := usenet.NewProwlarrClient(prowCfg)
		releases, err := client.Search(query, categories)
		if err == nil {
			for _, r := range releases {
				key := strings.ToLower(r.Title) + "|" + r.Indexer
				if !seen[key] {
					seen[key] = true
					combined = append(combined, r)
				}
			}
		}
	}

	return combined, nil
}

func (pm *ProviderManager) AddDownload(downloadURL, title, category, protocol string) (string, error) {
	proto := strings.ToLower(protocol)
	if proto == "" {
		proto = InferDownloadProtocol(downloadURL)
	}
	if proto == "torrent" {
		return "", fmt.Errorf("no torrent download client configured on this node")
	}
	if proto == "direct" || proto == "ddl" || proto == "jdownloader" {
		pm.mu.RLock()
		client := jdownloader.NewClient(pm.cfg.JDownloader)
		pm.mu.RUnlock()
		return client.AddDownload(downloadURL, title, category)
	}

	pm.mu.RLock()
	client := usenet.NewSabnzbdClient(pm.cfg.Usenet.Sabnzbd)
	pm.mu.RUnlock()
	return client.AddDownload(downloadURL, title, category)
}

func (pm *ProviderManager) GetQueue() (*usenet.ServerDownloadQueue, error) {
	pm.mu.RLock()
	sabCfg := pm.cfg.Usenet.Sabnzbd
	jdCfg := pm.cfg.JDownloader
	pm.mu.RUnlock()

	combined := &usenet.ServerDownloadQueue{
		Status:   "Idle",
		Speed:    "0 B/s",
		TimeLeft: "0:00:00",
		Items:    []usenet.QueueItem{},
	}

	sabConfigured := sabCfg.Host != "" && sabCfg.APIKey != ""
	if sabConfigured {
		sabClient := usenet.NewSabnzbdClient(sabCfg)
		if q, err := sabClient.GetQueue(); err == nil && q != nil {
			if len(q.Items) > 0 {
				combined.Items = append(combined.Items, q.Items...)
				combined.Status = q.Status
				combined.Speed = q.Speed
				combined.TimeLeft = q.TimeLeft
			}
		}
	}

	jdConfigured := jdCfg.Enabled || jdCfg.Email != "" || (jdCfg.DirectHost != "" && jdCfg.DirectPort > 0)
	if jdConfigured {
		jdClient := jdownloader.NewClient(jdCfg)
		if q, err := jdClient.GetQueue(); err == nil && q != nil {
			if len(q.Items) > 0 {
				combined.Items = append(combined.Items, q.Items...)
				if combined.Status == "Idle" || combined.Status == "" {
					combined.Status = q.Status
					combined.Speed = q.Speed
					combined.TimeLeft = q.TimeLeft
				}
			}
		}
	}

	return combined, nil
}

func (pm *ProviderManager) GetHistory(limit int) (*usenet.ServerDownloadHistory, error) {
	pm.mu.RLock()
	sabCfg := pm.cfg.Usenet.Sabnzbd
	jdCfg := pm.cfg.JDownloader
	pm.mu.RUnlock()

	combined := &usenet.ServerDownloadHistory{
		Items: []usenet.HistoryItem{},
	}

	sabConfigured := sabCfg.Host != "" && sabCfg.APIKey != ""
	if sabConfigured {
		sabClient := usenet.NewSabnzbdClient(sabCfg)
		if h, err := sabClient.GetHistory(limit); err == nil && h != nil {
			combined.Items = append(combined.Items, h.Items...)
		}
	}

	jdConfigured := jdCfg.Enabled || jdCfg.Email != "" || (jdCfg.DirectHost != "" && jdCfg.DirectPort > 0)
	if jdConfigured {
		jdClient := jdownloader.NewClient(jdCfg)
		if h, err := jdClient.GetHistory(limit); err == nil && h != nil {
			combined.Items = append(combined.Items, h.Items...)
		}
	}

	return combined, nil
}

func (pm *ProviderManager) DeleteDownload(id string) error {
	pm.mu.RLock()
	sabClient := usenet.NewSabnzbdClient(pm.cfg.Usenet.Sabnzbd)
	jdClient := jdownloader.NewClient(pm.cfg.JDownloader)
	pm.mu.RUnlock()

	errSab := sabClient.DeleteSlot(id)
	if errSab == nil {
		return nil
	}
	errJD := jdClient.DeleteSlot(id)
	if errJD == nil {
		return nil
	}
	return errSab
}
