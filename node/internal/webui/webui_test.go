package webui

import (
	"strings"
	"testing"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/indexer"
)

func TestCleanPath(t *testing.T) {
	if CleanPath("   /var/data/   ") != "/var/data/" {
		t.Errorf("expected trimmed path, got %q", CleanPath("   /var/data/   "))
	}
}

func TestRenderHomeUnclaimed(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Server.Name = "My-Test-Node"
	claimMgr := claim.NewClaimManager(cfg)

	idx := indexer.NewStorageIndexer(cfg.GameLibraries)

	html := RenderHome(cfg, claimMgr, idx, 3600)
	if !strings.Contains(html, "Unclaimed Server") {
		t.Errorf("expected HTML to contain Unclaimed Server")
	}
	if !strings.Contains(html, "My-Test-Node") {
		t.Errorf("expected HTML to contain server name My-Test-Node")
	}
	if !strings.Contains(html, "Your Claim PIN") {
		t.Errorf("expected HTML to contain Your Claim PIN")
	}
}

func TestRenderHomeClaimed(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Server.Name = "Claimed-Node"
	cfg.Server.Port = 8090
	cfg.Server.AuthToken = "secret-token"
	cfg.Server.Claimed = true
	cfg.Server.ClaimedBy = "alice"

	claimMgr := claim.NewClaimManager(cfg)
	idx := indexer.NewStorageIndexer(cfg.GameLibraries)

	// Add mock file to indexer
	idx.UpsertFile(indexer.HostedFile{
		ID:             "file-1",
		GameTitle:      "Half-Life",
		Filename:       "hl.iso",
		Filesize:       1024 * 1024 * 50, // 50MB
		FormatCategory: "iso",
	})

	html := RenderHome(cfg, claimMgr, idx, 7300) // 2h 1m 40s
	if !strings.Contains(html, "Claimed by <strong>alice</strong>") {
		t.Errorf("expected Claimed by alice in HTML")
	}
	if !strings.Contains(html, "Claimed-Node — Otix Node") {
		t.Errorf("expected page title in HTML")
	}
	if !strings.Contains(html, "2h 1m") {
		t.Errorf("expected uptime 2h 1m in HTML")
	}
	if !strings.Contains(html, "Half-Life") || !strings.Contains(html, "hl.iso") {
		t.Errorf("expected indexed file Half-Life in HTML")
	}
	if !strings.Contains(html, "50.00 MB") {
		t.Errorf("expected 50.00 MB file size in HTML")
	}
}
