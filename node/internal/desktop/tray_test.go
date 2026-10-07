package desktop

import (
	"os"
	"testing"
	"time"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/games"
	"github.com/dksilv4/otix/node/internal/indexer"
)

func TestTrayManagerLifecycle(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "otix-tray-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	cfg := config.DefaultConfig()
	cfg.Server.Name = "Test-Tray-Node"
	cfg.Server.Port = 18099

	claimMgr := claim.NewClaimManager(cfg)
	gamesStore, err := games.NewSessionStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create games store: %v", err)
	}

	idx := indexer.NewStorageIndexer(cfg.GameLibraries)

	tm := NewTrayManager(cfg, claimMgr, gamesStore, nil, nil, idx)
	if tm == nil {
		t.Fatalf("expected non-nil TrayManager")
	}

	// Test Start
	tm.Start()
	time.Sleep(50 * time.Millisecond)

	// Test UpdateTooltip
	tm.UpdateTooltip()

	// Test Stop
	tm.Stop()
	time.Sleep(20 * time.Millisecond)
}
