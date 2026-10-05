//go:build !windows

package games

// OverlayManager stub for non-Windows operating systems.
type OverlayManager struct {
	store     *SessionStore
	tracker   *GameTracker
	collector FpsCollector
	visible   bool
	corner    string
}

// NewOverlayManager creates a no-op overlay manager on non-Windows platforms.
func NewOverlayManager(store *SessionStore, tracker *GameTracker, collector FpsCollector) *OverlayManager {
	return &OverlayManager{
		store:     store,
		tracker:   tracker,
		collector: collector,
		corner:    "top-left",
	}
}

func (om *OverlayManager) Start() {}

func (om *OverlayManager) Stop() {}

func (om *OverlayManager) Show() {
	om.visible = true
}

func (om *OverlayManager) Hide() {
	om.visible = false
}

func (om *OverlayManager) Toggle() {
	om.visible = !om.visible
}

func (om *OverlayManager) CyclePosition() {}

func (om *OverlayManager) SetCorner(corner string) {
	om.corner = corner
}

func (om *OverlayManager) ApplySettings(settings OverlaySettings) {
	om.corner = settings.Corner
	om.visible = settings.Enabled
}

func (om *OverlayManager) GetAvailableMonitors() []MonitorInfo {
	return []MonitorInfo{
		{ID: "auto", Name: "Auto (Default Display)", IsPrimary: true},
	}
}
