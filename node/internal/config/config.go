package config

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

var (
	GameExtensions = []string{".iso", ".img", ".exe", ".zip", ".7z", ".rar"}
	IsoExtensions  = []string{".iso", ".img", ".chd", ".rvz", ".nkit", ".cso"}
)

type ServerSettings struct {
	Name            string `yaml:"name" json:"name"`
	Port            int    `yaml:"port" json:"port"`
	Host            string `yaml:"host" json:"host"`
	AuthToken       string `yaml:"auth_token" json:"auth_token"`
	RegistryURL     string `yaml:"registry_url" json:"registry_url"`
	EnableUPnP      bool   `yaml:"enable_upnp" json:"enable_upnp"`
	EnableHeartbeat bool   `yaml:"enable_heartbeat" json:"enable_heartbeat"`
	DownloadsPath   string `yaml:"downloads_path" json:"downloads_path"`
	Claimed         bool   `yaml:"claimed,omitempty" json:"claimed"`
}

type LibraryConfig struct {
	Name              string   `yaml:"name" json:"name"`
	Path              string   `yaml:"path" json:"path"`
	Kind              string   `yaml:"kind" json:"kind"` // "game" | "iso"
	AllowedExtensions []string `yaml:"allowed_extensions" json:"allowed_extensions"`
}

type SavesConfig struct {
	StoragePath         string `yaml:"storage_path" json:"storage_path"`
	MaxSnapshotsPerGame int    `yaml:"max_snapshots_per_game" json:"max_snapshots_per_game"`
	AutoBackupOnExit    bool   `yaml:"auto_backup_on_exit" json:"auto_backup_on_exit"`
}

type DownloadPathMapping struct {
	RemotePath string `yaml:"remote_path" json:"remote_path"`
	HostPath   string `yaml:"host_path" json:"host_path"`
}

type SabnzbdConfig struct {
	Host              string                `yaml:"host" json:"host"`
	Port              int                   `yaml:"port" json:"port"`
	URLBase           string                `yaml:"url_base" json:"url_base"`
	APIKey            string                `yaml:"api_key" json:"api_key"`
	UseSSL            bool                  `yaml:"use_ssl" json:"use_ssl"`
	Category          string                `yaml:"category" json:"category"`
	CompleteDir       string                `yaml:"complete_dir" json:"complete_dir"`
	LocalCompleteDir  string                `yaml:"local_complete_dir" json:"local_complete_dir"`
	RemotePath        string                `yaml:"remote_path" json:"remote_path"`
	HostPath          string                `yaml:"host_path" json:"host_path"`
	LinkedLibraryPath string                `yaml:"linked_library_path" json:"linked_library_path"`
	PathMappings      []DownloadPathMapping `yaml:"path_mappings" json:"path_mappings"`
}

type ProwlarrConfig struct {
	Host       string `yaml:"host" json:"host"`
	Port       int    `yaml:"port" json:"port"`
	URLBase    string `yaml:"url_base" json:"url_base"`
	APIKey     string `yaml:"api_key" json:"api_key"`
	UseSSL     bool   `yaml:"use_ssl" json:"use_ssl"`
	Categories []int  `yaml:"categories" json:"categories"`
}

type UsenetConfig struct {
	Enabled  bool           `yaml:"enabled" json:"enabled"`
	Sabnzbd  SabnzbdConfig  `yaml:"sabnzbd" json:"sabnzbd"`
	Prowlarr ProwlarrConfig `yaml:"prowlarr" json:"prowlarr"`
}

type RadarrInstance struct {
	ID                  string `yaml:"id" json:"id"`
	Name                string `yaml:"name" json:"name"`
	Enabled             bool   `yaml:"enabled" json:"enabled"`
	Host                string `yaml:"host" json:"host"`
	Port                int    `yaml:"port" json:"port"`
	URLBase             string `yaml:"url_base" json:"url_base"`
	APIKey              string `yaml:"api_key" json:"api_key"`
	UseSSL              bool   `yaml:"use_ssl" json:"use_ssl"`
	QualityProfileID    *int   `yaml:"quality_profile_id" json:"quality_profile_id"`
	RootFolderPath      string `yaml:"root_folder_path" json:"root_folder_path"`
	MinimumAvailability string `yaml:"minimum_availability" json:"minimum_availability"`
}

type RadarrConfig struct {
	Enabled             bool             `yaml:"enabled" json:"enabled"`
	Host                string           `yaml:"host" json:"host"`
	Port                int              `yaml:"port" json:"port"`
	URLBase             string           `yaml:"url_base" json:"url_base"`
	APIKey              string           `yaml:"api_key" json:"api_key"`
	UseSSL              bool             `yaml:"use_ssl" json:"use_ssl"`
	QualityProfileID    *int             `yaml:"quality_profile_id" json:"quality_profile_id"`
	RootFolderPath      string           `yaml:"root_folder_path" json:"root_folder_path"`
	MinimumAvailability string           `yaml:"minimum_availability" json:"minimum_availability"`
	Instances           []RadarrInstance `yaml:"instances" json:"instances"`
}

func (r *RadarrConfig) Resolve(instanceID string) RadarrInstance {
	if len(r.Instances) == 0 {
		return RadarrInstance{
			ID:                  "default",
			Name:                "Default",
			Enabled:             r.Enabled,
			Host:                r.Host,
			Port:                r.Port,
			URLBase:             r.URLBase,
			APIKey:              r.APIKey,
			UseSSL:              r.UseSSL,
			QualityProfileID:    r.QualityProfileID,
			RootFolderPath:      r.RootFolderPath,
			MinimumAvailability: r.MinimumAvailability,
		}
	}
	if instanceID != "" {
		for _, inst := range r.Instances {
			if inst.ID == instanceID {
				return inst
			}
		}
	}
	for _, inst := range r.Instances {
		if inst.Enabled {
			return inst
		}
	}
	return r.Instances[0]
}

type SonarrInstance struct {
	ID                string `yaml:"id" json:"id"`
	Name              string `yaml:"name" json:"name"`
	Enabled           bool   `yaml:"enabled" json:"enabled"`
	Host              string `yaml:"host" json:"host"`
	Port              int    `yaml:"port" json:"port"`
	URLBase           string `yaml:"url_base" json:"url_base"`
	APIKey            string `yaml:"api_key" json:"api_key"`
	UseSSL            bool   `yaml:"use_ssl" json:"use_ssl"`
	QualityProfileID  *int   `yaml:"quality_profile_id" json:"quality_profile_id"`
	RootFolderPath    string `yaml:"root_folder_path" json:"root_folder_path"`
	SeriesType        string `yaml:"series_type" json:"series_type"`
	SeasonFolder      bool   `yaml:"season_folder" json:"season_folder"`
	LanguageProfileID *int   `yaml:"language_profile_id" json:"language_profile_id"`
}

type SonarrConfig struct {
	Enabled           bool             `yaml:"enabled" json:"enabled"`
	Host              string           `yaml:"host" json:"host"`
	Port              int              `yaml:"port" json:"port"`
	URLBase           string           `yaml:"url_base" json:"url_base"`
	APIKey            string           `yaml:"api_key" json:"api_key"`
	UseSSL            bool             `yaml:"use_ssl" json:"use_ssl"`
	QualityProfileID  *int             `yaml:"quality_profile_id" json:"quality_profile_id"`
	RootFolderPath    string           `yaml:"root_folder_path" json:"root_folder_path"`
	SeriesType        string           `yaml:"series_type" json:"series_type"`
	SeasonFolder      bool             `yaml:"season_folder" json:"season_folder"`
	LanguageProfileID *int             `yaml:"language_profile_id" json:"language_profile_id"`
	Instances         []SonarrInstance `yaml:"instances" json:"instances"`
}

func (s *SonarrConfig) Resolve(instanceID string) SonarrInstance {
	if len(s.Instances) == 0 {
		return SonarrInstance{
			ID:                "default",
			Name:              "Default",
			Enabled:           s.Enabled,
			Host:              s.Host,
			Port:              s.Port,
			URLBase:           s.URLBase,
			APIKey:            s.APIKey,
			UseSSL:            s.UseSSL,
			QualityProfileID:  s.QualityProfileID,
			RootFolderPath:    s.RootFolderPath,
			SeriesType:        s.SeriesType,
			SeasonFolder:      s.SeasonFolder,
			LanguageProfileID: s.LanguageProfileID,
		}
	}
	if instanceID != "" {
		for _, inst := range s.Instances {
			if inst.ID == instanceID {
				return inst
			}
		}
	}
	for _, inst := range s.Instances {
		if inst.Enabled {
			return inst
		}
	}
	return s.Instances[0]
}

type DesktopSettings struct {
	LaunchOnStartup   bool   `yaml:"launch_on_startup" json:"launch_on_startup"`
	MinimizeToTray    bool   `yaml:"minimize_to_tray" json:"minimize_to_tray"`
	CloseToTray       bool   `yaml:"close_to_tray" json:"close_to_tray"`
	AlwaysOnTop       bool   `yaml:"always_on_top" json:"always_on_top"`
	StartMinimized    bool   `yaml:"start_minimized" json:"start_minimized"`
	GamesDownloadPath string `yaml:"games_download_path" json:"games_download_path"`
	GamesInstallPath  string `yaml:"games_install_path" json:"games_install_path"`
	ScanOnLaunch      bool   `yaml:"scan_on_launch" json:"scan_on_launch"`
}

type OrganizeSettings struct {
	PostProcessEnabled    bool   `yaml:"post_process_enabled" json:"post_process_enabled"`
	AutoSearchWishlist    bool   `yaml:"auto_search_wishlist" json:"auto_search_wishlist"`
	WishlistIntervalHours int    `yaml:"wishlist_interval_hours" json:"wishlist_interval_hours"`
	PreferredRepackers    string `yaml:"preferred_repackers" json:"preferred_repackers"`
	AllowHypervisor       bool   `yaml:"allow_hypervisor" json:"allow_hypervisor"`
	AutoOrganizeEnabled   bool   `yaml:"auto_organize_enabled" json:"auto_organize_enabled"`
	NamingTemplate        string `yaml:"naming_template" json:"naming_template"`
	ISODownloadPath       string `yaml:"iso_download_path" json:"iso_download_path"`
}

type AppConfig struct {
	Server        ServerSettings   `yaml:"server" json:"server"`
	GameLibraries []LibraryConfig  `yaml:"game_libraries" json:"game_libraries"`
	Saves         SavesConfig      `yaml:"saves" json:"saves"`
	Usenet        UsenetConfig     `yaml:"usenet" json:"usenet"`
	Radarr        RadarrConfig     `yaml:"radarr" json:"radarr"`
	Sonarr        SonarrConfig     `yaml:"sonarr" json:"sonarr"`
	Desktop       DesktopSettings  `yaml:"desktop" json:"desktop"`
	Organize      OrganizeSettings `yaml:"organize" json:"organize"`

	mu         sync.RWMutex `yaml:"-" json:"-"`
	configPath string       `yaml:"-" json:"-"`
}

func DefaultConfig() *AppConfig {
	return &AppConfig{
		Server: ServerSettings{
			Name:            "Otix Game Server",
			Port:            8090,
			Host:            "0.0.0.0",
			AuthToken:       "",
			RegistryURL:     "http://127.0.0.1:8000/api",
			EnableUPnP:      false,
			EnableHeartbeat: true,
			DownloadsPath:   "./storage/downloads",
		},
		GameLibraries: []LibraryConfig{},
		Saves: SavesConfig{
			StoragePath:         "./storage/saves",
			MaxSnapshotsPerGame: 10,
			AutoBackupOnExit:    true,
		},
		Usenet: UsenetConfig{
			Enabled: false,
			Sabnzbd: SabnzbdConfig{
				Host:     "127.0.0.1",
				Port:     8080,
				Category: "games",
			},
			Prowlarr: ProwlarrConfig{
				Host:       "127.0.0.1",
				Port:       9696,
				Categories: []int{1000, 4000},
			},
		},
		Radarr: RadarrConfig{
			Host:                "127.0.0.1",
			Port:                7878,
			MinimumAvailability: "announced",
		},
		Sonarr: SonarrConfig{
			Host:         "127.0.0.1",
			Port:         8989,
			SeriesType:   "standard",
			SeasonFolder: true,
		},
		Desktop: DesktopSettings{},
		Organize: OrganizeSettings{
			PostProcessEnabled:    true,
			WishlistIntervalHours: 12,
			NamingTemplate:        "{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}",
		},
	}
}

func FindDefaultConfigPath() string {
	if env := os.Getenv("CONFIG_PATH"); env != "" {
		return env
	}
	// 1. Current working directory
	if _, err := os.Stat("config.yaml"); err == nil {
		return "config.yaml"
	}
	// 2. User config directory (macOS: ~/Library/Application Support/otix/config.yaml, Linux: ~/.config/otix/config.yaml)
	if userConfig, err := os.UserConfigDir(); err == nil {
		standardPath := filepath.Join(userConfig, "otix", "config.yaml")
		if _, err := os.Stat(standardPath); err == nil {
			return standardPath
		}
	}
	// 3. System-wide /etc/otix/config.yaml
	if _, err := os.Stat("/etc/otix/config.yaml"); err == nil {
		return "/etc/otix/config.yaml"
	}
	return "config.yaml"
}

func LoadConfig(customPath string) *AppConfig {
	path := customPath
	if path == "" {
		path = FindDefaultConfigPath()
	}

	cfg := DefaultConfig()
	cfg.configPath = path

	if _, err := os.Stat(path); os.IsNotExist(err) {
		// Try example file if available
		examplePath := filepath.Join(filepath.Dir(path), "config.example.yaml")
		if _, errEx := os.Stat(examplePath); errEx == nil {
			path = examplePath
		} else {
			return cfg
		}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Printf("[Warning] Failed to read config from %s: %v. Using defaults.\n", path, err)
		return cfg
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		fmt.Printf("[Warning] Failed to parse config YAML: %v. Using defaults.\n", err)
		return cfg
	}

	cfg.configPath = path
	return cfg
}

func (c *AppConfig) Save(customPath string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	targetPath := customPath
	if targetPath == "" {
		targetPath = c.configPath
		if targetPath == "" {
			targetPath = os.Getenv("CONFIG_PATH")
			if targetPath == "" {
				targetPath = "config.yaml"
			}
		}
	}

	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("failed to create directory for config: %w", err)
	}

	data, err := yaml.Marshal(c)
	if err != nil {
		return fmt.Errorf("failed to marshal config to yaml: %w", err)
	}

	if err := os.WriteFile(targetPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file %s: %w", targetPath, err)
	}

	c.configPath = targetPath
	return nil
}
