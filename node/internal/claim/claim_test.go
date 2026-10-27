package claim_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
)

func TestClaimManagerFlow(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.SetConfigPath(filepath.Join(t.TempDir(), "config.yaml"))
	cfg.Server.AuthToken = ""
	cfg.Server.Claimed = false

	cm := claim.NewClaimManager(cfg)
	if cm.IsClaimed() {
		t.Fatal("expected server to be unclaimed initially")
	}

	status := cm.Status()
	if status.Claimed {
		t.Fatal("status should report claimed=false")
	}
	if len(status.ClaimCode) < 6 {
		t.Fatalf("expected claim code starting with OTX-, got %s", status.ClaimCode)
	}

	// Bad code
	err := cm.Confirm("WRONG-CODE", "secret123", "My Node", "testuser")
	if err == nil {
		t.Fatal("expected error on wrong claim code")
	}

	// Correct code
	code := cm.CurrentCode()
	err = cm.Confirm(code, "my_new_auth_token", "Living Room Node", "testuser")
	if err != nil {
		t.Fatalf("confirm failed: %v", err)
	}

	if !cm.IsClaimed() {
		t.Fatal("expected server to be claimed now")
	}

	newStatus := cm.Status()
	if !newStatus.Claimed {
		t.Fatal("new status should report claimed=true")
	}
	if cfg.Server.AuthToken != "my_new_auth_token" {
		t.Fatalf("auth token not updated: %s", cfg.Server.AuthToken)
	}
	if cfg.Server.Name != "Living Room Node" {
		t.Fatalf("server name not updated: %s", cfg.Server.Name)
	}
}

func TestClaimCodeFormat(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Server.AuthToken = ""
	cm := claim.NewClaimManager(cfg)

	code := cm.CurrentCode()
	if len(code) != 8 || code[:4] != "OTX-" {
		t.Fatalf("unexpected code format: %s", code)
	}
}

func TestClaimPreservesCustomServerName(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.SetConfigPath(filepath.Join(t.TempDir(), "config.yaml"))
	cfg.Server.Name = "GAMING PC"
	cfg.Server.AuthToken = ""
	cfg.Server.Claimed = false

	cm := claim.NewClaimManager(cfg)
	code := cm.CurrentCode()

	// Claiming with generic fallback "Node ID:1" should not overwrite "GAMING PC"
	err := cm.Confirm(code, "token_123", "Node ID:1", "admin")
	if err != nil {
		t.Fatalf("confirm failed: %v", err)
	}
	if cfg.Server.Name != "GAMING PC" {
		t.Fatalf("expected server name GAMING PC to be preserved, got: %s", cfg.Server.Name)
	}
}

func TestClaimManagerValidateToken(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.SetConfigPath(filepath.Join(t.TempDir(), "config.yaml"))
	cfg.Server.AuthToken = ""
	cfg.Server.Claimed = false

	cm := claim.NewClaimManager(cfg)

	// Unclaimed daemon should reject any token
	if cm.ValidateToken("secret_token") {
		t.Fatal("expected ValidateToken to return false when daemon is unclaimed")
	}
	if cm.ValidateToken("") {
		t.Fatal("expected ValidateToken to return false for empty string")
	}
	if cm.ValidateToken("   ") {
		t.Fatal("expected ValidateToken to return false for whitespace string")
	}

	// Claim daemon directly
	if err := cm.ConfirmDirect("auth_tok_xyz789", "Desktop Node", "testuser"); err != nil {
		t.Fatalf("ConfirmDirect failed: %v", err)
	}

	// Correct token should validate
	if !cm.ValidateToken("auth_tok_xyz789") {
		t.Fatal("expected ValidateToken to return true for exact matching token")
	}

	// Whitespace-padded matching token should validate
	if !cm.ValidateToken("  auth_tok_xyz789  \n") {
		t.Fatal("expected ValidateToken to return true for whitespace-padded matching token")
	}

	// Incorrect token should fail
	if cm.ValidateToken("wrong_token") {
		t.Fatal("expected ValidateToken to return false for mismatched token")
	}

	// Empty / whitespace should fail
	if cm.ValidateToken("") {
		t.Fatal("expected ValidateToken to return false for empty token")
	}

	// After unclaiming, previously valid token should be rejected
	if err := cm.Unclaim(); err != nil {
		t.Fatalf("Unclaim failed: %v", err)
	}
	if cm.ValidateToken("auth_tok_xyz789") {
		t.Fatal("expected ValidateToken to return false after unclaiming")
	}
}

func TestClaimManagerConfirmDirect(t *testing.T) {
	configDir := t.TempDir()
	configPath := filepath.Join(configDir, "config.yaml")

	cfg := config.DefaultConfig()
	cfg.SetConfigPath(configPath)
	cfg.Server.Name = "Default Node"
	cfg.Server.AuthToken = ""
	cfg.Server.Claimed = false

	cm := claim.NewClaimManager(cfg)
	if cm.IsClaimed() {
		t.Fatal("expected node to start unclaimed")
	}

	// 1. ConfirmDirect requires non-empty auth token
	if err := cm.ConfirmDirect("", "Living Room", "gamer1"); err == nil {
		t.Fatal("expected error when authToken is empty")
	}
	if err := cm.ConfirmDirect("   \t", "Living Room", "gamer1"); err == nil {
		t.Fatal("expected error when authToken is whitespace only")
	}

	// 2. Successful direct claim with custom name
	err := cm.ConfirmDirect("desktop_secret_token_456", "Living Room Station", "gamer1")
	if err != nil {
		t.Fatalf("expected ConfirmDirect to succeed, got: %v", err)
	}

	if !cm.IsClaimed() {
		t.Fatal("expected cm.IsClaimed() to be true")
	}

	status := cm.Status()
	if !status.Claimed {
		t.Fatal("expected status.Claimed to be true")
	}
	if status.ClaimCode != "" {
		t.Fatalf("expected empty claim code when claimed, got: %s", status.ClaimCode)
	}
	if status.Username != "gamer1" {
		t.Fatalf("expected username gamer1, got: %s", status.Username)
	}
	if status.ServerName != "Living Room Station" {
		t.Fatalf("expected server name 'Living Room Station', got: %s", status.ServerName)
	}

	// 3. Verify state persistence by reading config file from disk
	diskCfg := config.LoadConfig(configPath)
	if !diskCfg.Server.Claimed {
		t.Fatal("expected disk config to have Claimed=true")
	}
	if diskCfg.Server.AuthToken != "desktop_secret_token_456" {
		t.Fatalf("expected disk config token 'desktop_secret_token_456', got: %s", diskCfg.Server.AuthToken)
	}
	if diskCfg.Server.ClaimedBy != "gamer1" {
		t.Fatalf("expected disk config ClaimedBy 'gamer1', got: %s", diskCfg.Server.ClaimedBy)
	}
	if diskCfg.Server.Name != "Living Room Station" {
		t.Fatalf("expected disk config Name 'Living Room Station', got: %s", diskCfg.Server.Name)
	}

	// 4. ConfirmDirect with generic name should preserve custom name
	err = cm.ConfirmDirect("new_token_789", "Node ID:99", "gamer1")
	if err != nil {
		t.Fatalf("second ConfirmDirect failed: %v", err)
	}
	if cfg.Server.Name != "Living Room Station" {
		t.Fatalf("expected custom server name to be preserved, got: %s", cfg.Server.Name)
	}
	if cfg.Server.AuthToken != "new_token_789" {
		t.Fatalf("expected token to be updated, got: %s", cfg.Server.AuthToken)
	}
}

func TestClaimManagerConfirmDirectRollbackOnSaveFailure(t *testing.T) {
	// Create a file blocking directory creation for the config path
	tmpDir := t.TempDir()
	blockingFile := filepath.Join(tmpDir, "blocking_file")
	if err := os.WriteFile(blockingFile, []byte("blocking"), 0o644); err != nil {
		t.Fatal(err)
	}
	unwritableConfigPath := filepath.Join(blockingFile, "subpath", "config.yaml")

	cfg := config.DefaultConfig()
	cfg.SetConfigPath(unwritableConfigPath)
	cfg.Server.Name = "Original Server"
	cfg.Server.AuthToken = ""
	cfg.Server.Claimed = false
	cfg.Server.ClaimedBy = ""

	cm := claim.NewClaimManager(cfg)
	if cm.IsClaimed() {
		t.Fatal("expected server to start unclaimed")
	}

	// Attempt ConfirmDirect which must fail saving
	err := cm.ConfirmDirect("new_attempted_token", "New Server Name", "new_user")
	if err == nil {
		t.Fatal("expected error due to unwritable config path")
	}

	// Verify rollback of cfg and claim manager state
	if cfg.Server.AuthToken != "" {
		t.Fatalf("expected AuthToken to rollback to empty, got: %s", cfg.Server.AuthToken)
	}
	if cfg.Server.Name != "Original Server" {
		t.Fatalf("expected Name to rollback to 'Original Server', got: %s", cfg.Server.Name)
	}
	if cfg.Server.Claimed != false {
		t.Fatalf("expected Claimed to rollback to false, got: %v", cfg.Server.Claimed)
	}
	if cfg.Server.ClaimedBy != "" {
		t.Fatalf("expected ClaimedBy to rollback to empty, got: %s", cfg.Server.ClaimedBy)
	}
	if cm.IsClaimed() {
		t.Fatal("expected ClaimManager to not be marked claimed after save failure")
	}
}
