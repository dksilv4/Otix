//go:build !windows

package desktop

import (
	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/games"
	"github.com/dksilv4/otix/node/internal/indexer"
)

// TrayManager is a no-op placeholder on non-Windows platforms.
type TrayManager struct{}

// NewTrayManager returns a no-op TrayManager on non-Windows platforms.
func NewTrayManager(
	cfg *config.AppConfig,
	claimMgr *claim.ClaimManager,
	gamesStore *games.SessionStore,
	overlayMgr *games.OverlayManager,
	tracker *games.GameTracker,
	idx *indexer.StorageIndexer,
) *TrayManager {
	return &TrayManager{}
}

// Start is a no-op on non-Windows platforms.
func (tm *TrayManager) Start() {}

// Stop is a no-op on non-Windows platforms.
func (tm *TrayManager) Stop() {}

// UpdateTooltip is a no-op on non-Windows platforms.
func (tm *TrayManager) UpdateTooltip() {}
