package claim_test

import (
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
