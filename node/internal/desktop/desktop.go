package desktop

import (
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/hardware"
)

var NodeStartTime = time.Now()

type DesktopSettingsResponse struct {
	Platform          string                    `json:"platform"`
	Supported         bool                      `json:"supported"`
	Hostname          string                    `json:"hostname"`
	ServerName        string                    `json:"serverName"`
	Arch              string                    `json:"arch"`
	NumCPU            int                       `json:"numCpu"`
	GoVersion         string                    `json:"goVersion"`
	UptimeSeconds     int                       `json:"uptimeSeconds"`
	Capabilities      map[string]bool           `json:"capabilities"`
	Hardware          *hardware.MachineHardware `json:"hardware,omitempty"`
	LaunchOnStartup   bool                      `json:"launchOnStartup"`
	MinimizeToTray    bool            `json:"minimizeToTray"`
	CloseToTray       bool            `json:"closeToTray"`
	AlwaysOnTop       bool            `json:"alwaysOnTop"`
	StartMinimized    bool            `json:"startMinimized"`
	GamesDownloadPath string          `json:"gamesDownloadPath"`
	GamesInstallPath  string          `json:"gamesInstallPath"`
	ScanOnLaunch      bool            `json:"scanOnLaunch"`
	GameTracking      bool            `json:"gameTracking"`
	OverlayEnabled    bool            `json:"overlayEnabled"`
	OverlayCorner     string          `json:"overlayCorner"`
	AutoBackupOnExit  bool            `json:"autoBackupOnExit"`
}

type OrganizeSettingsResponse struct {
	PostProcessEnabled    bool   `json:"postProcessEnabled"`
	AutoSearchWishlist    bool   `json:"autoSearchWishlist"`
	WishlistIntervalHours int    `json:"wishlistIntervalHours"`
	PreferredRepackers    string `json:"preferredRepackers"`
	AllowHypervisor       bool   `json:"allowHypervisor"`
	AutoOrganizeEnabled   bool   `json:"autoOrganizeEnabled"`
	NamingTemplate        string `json:"namingTemplate"`
	ISODownloadPath       string `json:"isoDownloadPath"`
	ScanOnLaunch          bool   `json:"scanOnLaunch"`
	GamesDownloadPath     string `json:"gamesDownloadPath"`
	GamesInstallPath      string `json:"gamesInstallPath"`
}

func GetPlatform() string {
	switch runtime.GOOS {
	case "windows":
		return "windows"
	case "linux":
		return "linux"
	case "darwin":
		return "darwin"
	default:
		return runtime.GOOS
	}
}

func IsSupported() bool {
	p := GetPlatform()
	return p == "windows" || p == "linux"
}

func GetDesktopSettings(cfg *config.AppConfig, refresh ...bool) DesktopSettingsResponse {
	doRefresh := len(refresh) > 0 && refresh[0]
	dlPath := cfg.Desktop.GamesDownloadPath
	if dlPath == "" {
		dlPath = cfg.Server.DownloadsPath
	}
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "otix-node"
	}

	p := GetPlatform()
	caps := map[string]bool{
		"game_tracking":       p == "windows" || p == "linux",
		"in_game_overlay":     p == "windows",
		"web_overlay":         true,
		"silent_install":      p == "windows",
		"saves_backup":        true,
		"downloader_provider": cfg.Usenet.Enabled || cfg.Usenet.Sabnzbd.Host != "",
		"hypervisor":          cfg.Organize.AllowHypervisor,
	}

	return DesktopSettingsResponse{
		Platform:          p,
		Supported:         IsSupported(),
		Hostname:          hostname,
		ServerName:        cfg.Server.Name,
		Arch:              runtime.GOARCH,
		NumCPU:            runtime.NumCPU(),
		GoVersion:         runtime.Version(),
		UptimeSeconds:     int(time.Since(NodeStartTime).Seconds()),
		Capabilities:      caps,
		Hardware:          hardware.GetMachineHardware(doRefresh),
		LaunchOnStartup:   cfg.Desktop.LaunchOnStartup,
		MinimizeToTray:    cfg.Desktop.MinimizeToTray,
		CloseToTray:       cfg.Desktop.CloseToTray,
		AlwaysOnTop:       cfg.Desktop.AlwaysOnTop,
		StartMinimized:    cfg.Desktop.StartMinimized,
		GamesDownloadPath: dlPath,
		GamesInstallPath:  cfg.Desktop.GamesInstallPath,
		ScanOnLaunch:      cfg.Desktop.ScanOnLaunch,
		GameTracking:      true,
		OverlayEnabled:    true,
		OverlayCorner:     "top-left",
		AutoBackupOnExit:  cfg.Saves.AutoBackupOnExit,
	}
}

func ApplyDesktopSettings(cfg *config.AppConfig, payload map[string]interface{}) DesktopSettingsResponse {
	if v, ok := payload["launchOnStartup"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.LaunchOnStartup = b
		}
	} else if v, ok := payload["launch_on_startup"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.LaunchOnStartup = b
		}
	}

	if v, ok := payload["minimizeToTray"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.MinimizeToTray = b
		}
	} else if v, ok := payload["minimize_to_tray"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.MinimizeToTray = b
		}
	}

	if v, ok := payload["closeToTray"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.CloseToTray = b
		}
	} else if v, ok := payload["close_to_tray"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.CloseToTray = b
		}
	}

	if v, ok := payload["alwaysOnTop"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.AlwaysOnTop = b
		}
	} else if v, ok := payload["always_on_top"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.AlwaysOnTop = b
		}
	}

	if v, ok := payload["startMinimized"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.StartMinimized = b
		}
	} else if v, ok := payload["start_minimized"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.StartMinimized = b
		}
	}

	if v, ok := payload["gamesDownloadPath"]; ok {
		if s, okS := v.(string); okS {
			cfg.Desktop.GamesDownloadPath = strings.TrimSpace(s)
			cfg.Server.DownloadsPath = strings.TrimSpace(s)
		}
	} else if v, ok := payload["games_download_path"]; ok {
		if s, okS := v.(string); okS {
			cfg.Desktop.GamesDownloadPath = strings.TrimSpace(s)
			cfg.Server.DownloadsPath = strings.TrimSpace(s)
		}
	}

	if v, ok := payload["gamesInstallPath"]; ok {
		if s, okS := v.(string); okS {
			cfg.Desktop.GamesInstallPath = strings.TrimSpace(s)
		}
	} else if v, ok := payload["games_install_path"]; ok {
		if s, okS := v.(string); okS {
			cfg.Desktop.GamesInstallPath = strings.TrimSpace(s)
		}
	}

	if v, ok := payload["scanOnLaunch"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.ScanOnLaunch = b
		}
	} else if v, ok := payload["scan_on_launch"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.ScanOnLaunch = b
		}
	}

	if v, ok := payload["autoBackupOnExit"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Saves.AutoBackupOnExit = b
		}
	} else if v, ok := payload["auto_backup_on_exit"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Saves.AutoBackupOnExit = b
		}
	}

	if v, ok := payload["server_name"]; ok {
		if s, okS := v.(string); okS && strings.TrimSpace(s) != "" {
			cfg.Server.Name = strings.TrimSpace(s)
		}
	} else if v, ok := payload["name"]; ok {
		if s, okS := v.(string); okS && strings.TrimSpace(s) != "" {
			cfg.Server.Name = strings.TrimSpace(s)
		}
	}

	_ = cfg.Save("")
	return GetDesktopSettings(cfg)
}

func GetOrganizeSettings(cfg *config.AppConfig) OrganizeSettingsResponse {
	dlPath := cfg.Desktop.GamesDownloadPath
	if dlPath == "" {
		dlPath = cfg.Server.DownloadsPath
	}
	return OrganizeSettingsResponse{
		PostProcessEnabled:    cfg.Organize.PostProcessEnabled,
		AutoSearchWishlist:    cfg.Organize.AutoSearchWishlist,
		WishlistIntervalHours: cfg.Organize.WishlistIntervalHours,
		PreferredRepackers:    cfg.Organize.PreferredRepackers,
		AllowHypervisor:       cfg.Organize.AllowHypervisor,
		AutoOrganizeEnabled:   cfg.Organize.AutoOrganizeEnabled,
		NamingTemplate:        cfg.Organize.NamingTemplate,
		ISODownloadPath:       cfg.Organize.ISODownloadPath,
		ScanOnLaunch:          cfg.Desktop.ScanOnLaunch,
		GamesDownloadPath:     dlPath,
		GamesInstallPath:      cfg.Desktop.GamesInstallPath,
	}
}

func ApplyOrganizeSettings(cfg *config.AppConfig, payload map[string]interface{}) OrganizeSettingsResponse {
	if v, ok := payload["postProcessEnabled"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Organize.PostProcessEnabled = b
		}
	} else if v, ok := payload["post_process_enabled"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Organize.PostProcessEnabled = b
		}
	}

	if v, ok := payload["autoSearchWishlist"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Organize.AutoSearchWishlist = b
		}
	} else if v, ok := payload["auto_search_wishlist"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Organize.AutoSearchWishlist = b
		}
	}

	if v, ok := payload["wishlistIntervalHours"]; ok {
		if n, okN := v.(float64); okN {
			cfg.Organize.WishlistIntervalHours = int(n)
		}
	} else if v, ok := payload["wishlist_interval_hours"]; ok {
		if n, okN := v.(float64); okN {
			cfg.Organize.WishlistIntervalHours = int(n)
		}
	}

	if v, ok := payload["preferredRepackers"]; ok {
		if s, okS := v.(string); okS {
			cfg.Organize.PreferredRepackers = strings.TrimSpace(s)
		}
	} else if v, ok := payload["preferred_repackers"]; ok {
		if s, okS := v.(string); okS {
			cfg.Organize.PreferredRepackers = strings.TrimSpace(s)
		}
	}

	if v, ok := payload["allowHypervisor"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Organize.AllowHypervisor = b
		}
	} else if v, ok := payload["allow_hypervisor"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Organize.AllowHypervisor = b
		}
	}

	if v, ok := payload["autoOrganizeEnabled"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Organize.AutoOrganizeEnabled = b
		}
	} else if v, ok := payload["auto_organize_enabled"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Organize.AutoOrganizeEnabled = b
		}
	}

	if v, ok := payload["namingTemplate"]; ok {
		if s, okS := v.(string); okS {
			cfg.Organize.NamingTemplate = strings.TrimSpace(s)
		}
	} else if v, ok := payload["naming_template"]; ok {
		if s, okS := v.(string); okS {
			cfg.Organize.NamingTemplate = strings.TrimSpace(s)
		}
	}

	if v, ok := payload["isoDownloadPath"]; ok {
		if s, okS := v.(string); okS {
			cfg.Organize.ISODownloadPath = strings.TrimSpace(s)
		}
	} else if v, ok := payload["iso_download_path"]; ok {
		if s, okS := v.(string); okS {
			cfg.Organize.ISODownloadPath = strings.TrimSpace(s)
		}
	}

	if v, ok := payload["scanOnLaunch"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.ScanOnLaunch = b
		}
	} else if v, ok := payload["scan_on_launch"]; ok {
		if b, okB := v.(bool); okB {
			cfg.Desktop.ScanOnLaunch = b
		}
	}

	_ = cfg.Save("")
	return GetOrganizeSettings(cfg)
}
