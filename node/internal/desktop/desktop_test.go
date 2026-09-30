package desktop

import (
	"path/filepath"
	"testing"

	"github.com/dksilv4/otix/node/internal/config"
)

func TestGetPlatformAndSupported(t *testing.T) {
	plat := GetPlatform()
	if plat == "" {
		t.Errorf("expected non-empty platform")
	}

	supported := IsSupported()
	if plat == "windows" || plat == "linux" {
		if !supported {
			t.Errorf("expected supported to be true for %s", plat)
		}
	} else {
		if supported {
			t.Errorf("expected supported to be false for %s", plat)
		}
	}
}

func TestDesktopSettings(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("CONFIG_PATH", filepath.Join(tmpDir, "config.yaml"))
	cfg := config.DefaultConfig()
	cfg.Server.DownloadsPath = "/default/downloads"

	// Fallback to Server.DownloadsPath
	s1 := GetDesktopSettings(cfg)
	if s1.GamesDownloadPath != "/default/downloads" {
		t.Errorf("expected GamesDownloadPath fallback, got %q", s1.GamesDownloadPath)
	}

	// ApplyDesktopSettings with camelCase
	res1 := ApplyDesktopSettings(cfg, map[string]interface{}{
		"launchOnStartup":   true,
		"minimizeToTray":    true,
		"closeToTray":       true,
		"alwaysOnTop":       true,
		"startMinimized":    true,
		"gamesDownloadPath": "/custom/downloads",
		"gamesInstallPath":  "/custom/games",
		"scanOnLaunch":      true,
	})

	if !res1.LaunchOnStartup || !res1.MinimizeToTray || !res1.CloseToTray ||
		!res1.AlwaysOnTop || !res1.StartMinimized || !res1.ScanOnLaunch ||
		res1.GamesDownloadPath != "/custom/downloads" || res1.GamesInstallPath != "/custom/games" {
		t.Errorf("ApplyDesktopSettings camelCase failed: %+v", res1)
	}

	// ApplyDesktopSettings with snake_case
	res2 := ApplyDesktopSettings(cfg, map[string]interface{}{
		"launch_on_startup":   false,
		"minimize_to_tray":    false,
		"close_to_tray":       false,
		"always_on_top":       false,
		"start_minimized":     false,
		"games_download_path": "/new/downloads",
		"games_install_path":  "/new/games",
		"scan_on_launch":      false,
	})

	if res2.LaunchOnStartup || res2.MinimizeToTray || res2.CloseToTray ||
		res2.AlwaysOnTop || res2.StartMinimized || res2.ScanOnLaunch ||
		res2.GamesDownloadPath != "/new/downloads" || res2.GamesInstallPath != "/new/games" {
		t.Errorf("ApplyDesktopSettings snake_case failed: %+v", res2)
	}
}

func TestOrganizeSettings(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("CONFIG_PATH", filepath.Join(tmpDir, "config.yaml"))
	cfg := config.DefaultConfig()

	// GetOrganizeSettings
	org1 := GetOrganizeSettings(cfg)
	if org1.GamesDownloadPath != cfg.Server.DownloadsPath {
		t.Errorf("expected games download path fallback, got %s", org1.GamesDownloadPath)
	}

	// ApplyOrganizeSettings with camelCase
	res1 := ApplyOrganizeSettings(cfg, map[string]interface{}{
		"postProcessEnabled":    true,
		"autoSearchWishlist":    true,
		"wishlistIntervalHours": float64(12),
		"preferredRepackers":    "FitGirl, Dodi",
		"allowHypervisor":       true,
		"autoOrganizeEnabled":   true,
		"namingTemplate":        "{Title} ({Year})",
		"isoDownloadPath":       "/custom/iso",
		"scanOnLaunch":          true,
	})

	if !res1.PostProcessEnabled || !res1.AutoSearchWishlist || res1.WishlistIntervalHours != 12 ||
		res1.PreferredRepackers != "FitGirl, Dodi" || !res1.AllowHypervisor || !res1.AutoOrganizeEnabled ||
		res1.NamingTemplate != "{Title} ({Year})" || res1.ISODownloadPath != "/custom/iso" || !res1.ScanOnLaunch {
		t.Errorf("ApplyOrganizeSettings camelCase failed: %+v", res1)
	}

	// ApplyOrganizeSettings with snake_case
	res2 := ApplyOrganizeSettings(cfg, map[string]interface{}{
		"post_process_enabled":    false,
		"auto_search_wishlist":    false,
		"wishlist_interval_hours": float64(24),
		"preferred_repackers":     "None",
		"allow_hypervisor":        false,
		"auto_organize_enabled":   false,
		"naming_template":         "{Title}",
		"iso_download_path":       "/iso",
		"scan_on_launch":          false,
	})

	if res2.PostProcessEnabled || res2.AutoSearchWishlist || res2.WishlistIntervalHours != 24 ||
		res2.PreferredRepackers != "None" || res2.AllowHypervisor || res2.AutoOrganizeEnabled ||
		res2.NamingTemplate != "{Title}" || res2.ISODownloadPath != "/iso" || res2.ScanOnLaunch {
		t.Errorf("ApplyOrganizeSettings snake_case failed: %+v", res2)
	}
}
