package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultAllowedExtensions(t *testing.T) {
	isoExts := DefaultAllowedExtensions("iso")
	if len(isoExts) == 0 {
		t.Fatal("expected non-empty ISO extensions")
	}
	foundIso := false
	for _, ext := range isoExts {
		if ext == ".iso" {
			foundIso = true
			break
		}
	}
	if !foundIso {
		t.Error("expected .iso in default ISO extensions")
	}

	gameExts := DefaultAllowedExtensions("game")
	if len(gameExts) == 0 {
		t.Fatal("expected non-empty game extensions")
	}
	foundExe := false
	for _, ext := range gameExts {
		if ext == ".exe" {
			foundExe = true
			break
		}
	}
	if !foundExe {
		t.Error("expected .exe in default game extensions")
	}
}

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.Server.Port != 8090 {
		t.Errorf("expected default port 8090, got %d", cfg.Server.Port)
	}
	if cfg.Server.Name != "Otix Node" {
		t.Errorf("expected default name 'Otix Node', got %s", cfg.Server.Name)
	}
	if cfg.Usenet.Sabnzbd.Port != 8080 {
		t.Errorf("expected default SABnzbd port 8080, got %d", cfg.Usenet.Sabnzbd.Port)
	}
	if cfg.Usenet.Prowlarr.Port != 9696 {
		t.Errorf("expected default Prowlarr port 9696, got %d", cfg.Usenet.Prowlarr.Port)
	}
}

func TestLoadAndSaveConfig(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")

	// 1. Loading non-existent config should return DefaultConfig
	cfg := LoadConfig(configPath)
	if cfg.Server.Port != 8090 {
		t.Fatalf("expected default port 8090, got %d", cfg.Server.Port)
	}

	// 2. Modify and Save using empty string (uses configPath)
	cfg.SetConfigPath(configPath)
	cfg.Server.Name = "Test Server"
	cfg.Server.AuthToken = "super-secret-token"
	cfg.Usenet.Prowlarr.APIKey = "prowlarr-key"
	cfg.GameLibraries = append(cfg.GameLibraries, LibraryConfig{
		Name:              "Main",
		Path:              "/games",
		Kind:              "game",
		AllowedExtensions: []string{".iso"},
	})

	err := cfg.Save("")
	if err != nil {
		t.Fatalf("failed to save config: %v", err)
	}

	// 3. Reload from disk and verify
	reloaded := LoadConfig(configPath)
	if reloaded.Server.Name != "Test Server" {
		t.Errorf("expected 'Test Server', got %s", reloaded.Server.Name)
	}
	if reloaded.Server.AuthToken != "super-secret-token" {
		t.Errorf("expected 'super-secret-token', got %s", reloaded.Server.AuthToken)
	}
	if len(reloaded.GameLibraries) != 1 || reloaded.GameLibraries[0].Name != "Main" {
		t.Errorf("expected 1 library named 'Main', got %v", reloaded.GameLibraries)
	}

	// 4. Save to custom path
	customPath := filepath.Join(tmpDir, "custom.yaml")
	err = cfg.Save(customPath)
	if err != nil {
		t.Fatalf("failed to save to custom path: %v", err)
	}
	customReloaded := LoadConfig(customPath)
	if customReloaded.Server.Name != "Test Server" {
		t.Errorf("expected 'Test Server', got %s", customReloaded.Server.Name)
	}

	// 5. Corrupted YAML file returns default config gracefully
	corruptPath := filepath.Join(tmpDir, "corrupt.yaml")
	_ = os.WriteFile(corruptPath, []byte("invalid: yaml: [unclosed"), 0644)
	corruptCfg := LoadConfig(corruptPath)
	if corruptCfg.Server.Port != 8090 {
		t.Errorf("expected fallback to default config on parse error, got %d", corruptCfg.Server.Port)
	}

	// 6. Fallback to config.example.yaml if main config missing
	subDir := filepath.Join(tmpDir, "example_test")
	_ = os.MkdirAll(subDir, 0755)
	exPath := filepath.Join(subDir, "config.example.yaml")
	_ = os.WriteFile(exPath, []byte("server:\n  name: Example Node\n  port: 8099\n"), 0644)
	exLoaded := LoadConfig(filepath.Join(subDir, "config.yaml"))
	if exLoaded.Server.Name != "Example Node" || exLoaded.Server.Port != 8099 {
		t.Errorf("expected fallback to example config, got name=%s port=%d", exLoaded.Server.Name, exLoaded.Server.Port)
	}
}

func TestFindDefaultConfigPath(t *testing.T) {
	// With env var
	t.Setenv("CONFIG_PATH", "/custom/test/config.yaml")
	if p := FindDefaultConfigPath(); p != "/custom/test/config.yaml" {
		t.Errorf("expected /custom/test/config.yaml, got %s", p)
	}

	// Without env var
	_ = os.Unsetenv("CONFIG_PATH")
	p := FindDefaultConfigPath()
	if p == "" {
		t.Error("expected non-empty default config path")
	}
}
