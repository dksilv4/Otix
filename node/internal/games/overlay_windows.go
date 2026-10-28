//go:build windows

package games

import (
	"fmt"
	"math"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/dksilv4/otix/node/internal/hardware"
)

var (
	modKernel32 = syscall.NewLazyDLL("kernel32.dll")
	modUser32   = syscall.NewLazyDLL("user32.dll")
	modGdi32    = syscall.NewLazyDLL("gdi32.dll")

	procCreateMutexW               = modKernel32.NewProc("CreateMutexW")
	procCloseHandle                = modKernel32.NewProc("CloseHandle")
	procGetLastError               = modKernel32.NewProc("GetLastError")
	procCreateWindowExW            = modUser32.NewProc("CreateWindowExW")
	procDefWindowProcW             = modUser32.NewProc("DefWindowProcW")
	procRegisterClassExW          = modUser32.NewProc("RegisterClassExW")
	procShowWindow                 = modUser32.NewProc("ShowWindow")
	procUpdateWindow               = modUser32.NewProc("UpdateWindow")
	procDestroyWindow              = modUser32.NewProc("DestroyWindow")
	procSetWindowPos               = modUser32.NewProc("SetWindowPos")
	procGetSystemMetrics           = modUser32.NewProc("GetSystemMetrics")
	procRegisterHotKey             = modUser32.NewProc("RegisterHotKey")
	procUnregisterHotKey           = modUser32.NewProc("UnregisterHotKey")
	procGetMessageW                = modUser32.NewProc("GetMessageW")
	procTranslateMessage           = modUser32.NewProc("TranslateMessage")
	procDispatchMessageW           = modUser32.NewProc("DispatchMessageW")
	procPostMessageW               = modUser32.NewProc("PostMessageW")
	procPostThreadMessageW         = modUser32.NewProc("PostThreadMessageW")
	procPostQuitMessage            = modUser32.NewProc("PostQuitMessage")
	procGetCurrentThreadId         = modKernel32.NewProc("GetCurrentThreadId")
	procInvalidateRect             = modUser32.NewProc("InvalidateRect")
	procBeginPaint                 = modUser32.NewProc("BeginPaint")
	procEndPaint                   = modUser32.NewProc("EndPaint")
	procSetLayeredWindowAttributes = modUser32.NewProc("SetLayeredWindowAttributes")
	procSetTextColor              = modGdi32.NewProc("SetTextColor")
	procSetBkMode                  = modGdi32.NewProc("SetBkMode")
	procCreateSolidBrush           = modGdi32.NewProc("CreateSolidBrush")
	procCreateFontW                = modGdi32.NewProc("CreateFontW")
	procSelectObject               = modGdi32.NewProc("SelectObject")
	procDeleteObject               = modGdi32.NewProc("DeleteObject")
	procFillRect                   = modUser32.NewProc("FillRect")
	procDrawTextW                  = modUser32.NewProc("DrawTextW")
	procOpenDesktopW               = modUser32.NewProc("OpenDesktopW")
	procSetThreadDesktop           = modUser32.NewProc("SetThreadDesktop")
	procGetWindowRect              = modUser32.NewProc("GetWindowRect")
	procGetWindowThreadProcessId   = modUser32.NewProc("GetWindowThreadProcessId")
	procEnumWindows                = modUser32.NewProc("EnumWindows")
	procIsWindowVisible            = modUser32.NewProc("IsWindowVisible")
	procMonitorFromWindow          = modUser32.NewProc("MonitorFromWindow")
	procGetMonitorInfoW            = modUser32.NewProc("GetMonitorInfoW")
	procEnumDisplayMonitors        = modUser32.NewProc("EnumDisplayMonitors")
	procGetClientRect              = modUser32.NewProc("GetClientRect")
)

const (
	wsExTopmost     = 0x00000008
	wsExTransparent = 0x00000020
	wsExLayered     = 0x00080000
	wsExNoActivate  = 0x08000000
	wsExToolWindow  = 0x00000080

	wsPopup = 0x80000000

	swHide           = 0
	swShowNoActivate = 4

	lwaAlpha = 0x00000002

	modAlt     = 0x0001
	modControl = 0x0002
	modShift   = 0x0004

	wmDestroy = 0x0002
	wmClose   = 0x0010
	wmQuit    = 0x0012
	wmPaint   = 0x000F
	wmHotKey  = 0x0312
	wmUser    = 0x0400
	wmUpdate  = wmUser + 1
	wmShow    = wmUser + 2
	wmHide    = wmUser + 3
	wmCycle   = wmUser + 4

	dtLeft     = 0x00000000
	dtCenter   = 0x00000001
	dtRight    = 0x00000002
	dtVCenter  = 0x00000004
	dtSingle   = 0x00000020
	dtNoClip   = 0x00000100

	barHeight     = 36
	overlayWidth  = 220
	overlayHeight = 60
)

type monitorInfo struct {
	cbSize    uint32
	rcMonitor rect
	rcWork    rect
	dwFlags   uint32
}

type monitorInfoExW struct {
	cbSize    uint32
	rcMonitor rect
	rcWork    rect
	dwFlags   uint32
	szDevice  [32]uint16
}

type wndClassExW struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type point struct {
	x, y int32
}

type msg struct {
	hwnd     uintptr
	message  uint32
	wParam   uintptr
	lParam   uintptr
	time     uint32
	pt       point
	lPrivate uint32
}

type rect struct {
	left, top, right, bottom int32
}

type paintStruct struct {
	hdc         uintptr
	fErase      int32
	rcPaint     rect
	fRestore    int32
	fIncUpdate  int32
	rgbReserved [32]byte
}

// OverlayManager manages the native Windows transparent HUD.
type OverlayManager struct {
	mu           sync.RWMutex
	store        *SessionStore
	tracker      *GameTracker
	collector    FpsCollector
	hwnd         uintptr
	hMutex       uintptr
	isPrimary    bool
	visible      bool
	corner       string // "top-wide", "bottom-wide", "top-left", "top-right", "hidden"
	monitor      string // "auto", "1", "2", "3", etc.
	gameTitle    string
	playtimeSec  int
	currentFps   float64
	low1Fps      float64
	avgFps       float64
	lastX        int32
	lastY        int32
	lastW        int32
	lastH        int32
	gameHwnd     uintptr
	threadID     uintptr
	stopChan     chan struct{}
	stopOnce     sync.Once
}

var globalOverlayManager *OverlayManager

type rawMonOverlay struct {
	left      int32
	top       int32
	width     int32
	height    int32
	isPrimary bool
	device    string
}

var (
	wndProcCallback = syscall.NewCallback(wndProc)

	overlayMonMu     sync.Mutex
	overlayMonList   []rawMonOverlay
	overlayMonEnumCb = syscall.NewCallback(func(hMon, hdc, lprc, lParam uintptr) uintptr {
		var mi monitorInfoExW
		mi.cbSize = uint32(unsafe.Sizeof(mi))
		ok, _, _ := procGetMonitorInfoW.Call(hMon, uintptr(unsafe.Pointer(&mi)))
		if ok != 0 {
			w := mi.rcMonitor.right - mi.rcMonitor.left
			h := mi.rcMonitor.bottom - mi.rcMonitor.top
			isPrimary := (mi.dwFlags & 1) != 0
			device := syscall.UTF16ToString(mi.szDevice[:])
			overlayMonList = append(overlayMonList, rawMonOverlay{
				left:      mi.rcMonitor.left,
				top:       mi.rcMonitor.top,
				width:     w,
				height:    h,
				isPrimary: isPrimary,
				device:    device,
			})
		}
		return 1
	})

	enumWindowMu        sync.Mutex
	enumWindowTargetPID int
	enumWindowFoundHwnd uintptr
	enumWindowCb        = syscall.NewCallback(func(hwnd, lParam uintptr) uintptr {
		vis, _, _ := procIsWindowVisible.Call(hwnd)
		if vis == 0 {
			return 1
		}
		var pid uint32
		procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
		if int(pid) == enumWindowTargetPID {
			var r rect
			procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&r)))
			if r.right-r.left > 150 && r.bottom-r.top > 150 {
				enumWindowFoundHwnd = hwnd
				return 0 // stop enumeration
			}
		}
		return 1
	})
)

func wndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	switch msg {
	case 0x0084: // WM_NCHITTEST
		return ^uintptr(0) // HTTRANSPARENT = -1: clicks pass through cleanly to game

	case wmHotKey:
		fmt.Printf("[Overlay] Hotkey pressed (id=%v) -> Toggle\n", wParam)
		if globalOverlayManager != nil {
			globalOverlayManager.Toggle()
		}
		return 0

	case wmShow:
		fmt.Printf("[Overlay] wndProc received wmShow\n")
		if globalOverlayManager != nil {
			globalOverlayManager.mu.RLock()
			corner := globalOverlayManager.corner
			globalOverlayManager.mu.RUnlock()
			x, y, w, h := globalOverlayManager.calculatePosition(corner)
			procSetWindowPos.Call(
				hwnd,
				^uintptr(0), // HWND_TOPMOST
				uintptr(x), uintptr(y),
				uintptr(w), uintptr(h),
				0x0010|0x0040, // SWP_NOACTIVATE | SWP_SHOWWINDOW
			)
		}
		procShowWindow.Call(hwnd, swShowNoActivate)
		procInvalidateRect.Call(hwnd, 0, 1)
		procUpdateWindow.Call(hwnd)
		return 0

	case wmHide:
		fmt.Printf("[Overlay] wndProc received wmHide\n")
		procShowWindow.Call(hwnd, swHide)
		return 0

	case wmCycle:
		fmt.Printf("[Overlay] wndProc received wmCycle\n")
		if globalOverlayManager != nil {
			globalOverlayManager.doCyclePosition(hwnd)
		}
		return 0

	case wmUpdate:
		procInvalidateRect.Call(hwnd, 0, 1)
		procUpdateWindow.Call(hwnd)
		return 0

	case wmPaint:
		if globalOverlayManager != nil {
			globalOverlayManager.paint(hwnd)
		}
		return 0

	case wmClose:
		procDestroyWindow.Call(hwnd)
		return 0

	case wmDestroy:
		procPostQuitMessage.Call(0)
		return 0
	}

	ret, _, _ := procDefWindowProcW.Call(hwnd, msg, wParam, lParam)
	return ret
}

// NewOverlayManager creates a new native overlay manager on Windows.
func NewOverlayManager(store *SessionStore, tracker *GameTracker, collector FpsCollector) *OverlayManager {
	settings := store.GetOverlaySettings()
	corner := settings.Corner
	if corner == "" || corner == "top-left" || corner == "top-right" {
		corner = "top-wide"
	}
	mon := settings.Monitor
	if mon == "" {
		mon = "auto"
	}
	om := &OverlayManager{
		store:     store,
		tracker:   tracker,
		collector: collector,
		corner:    corner,
		monitor:   mon,
		visible:   false,
		gameTitle: "Standby",
		stopChan:  make(chan struct{}),
	}
	globalOverlayManager = om

	// Check if an active game is ALREADY running right now
	if tracker != nil {
		if active := tracker.GetActiveGame(); active != nil {
			om.gameTitle = active.Title
			om.playtimeSec = active.CurrentDurationSec
			om.visible = settings.Enabled
			fmt.Printf("[Overlay] Active game detected on init: %s (PID %d)\n", active.Title, active.PID)
		}
	}

	// Hook active game changed callback
	tracker.SetActiveGameCallback(func(game *RunningGame) {
		fmt.Printf("[Overlay] Active game switched to: %s (PID %d)\n", game.Title, game.PID)
		om.mu.Lock()
		om.gameTitle = game.Title
		om.playtimeSec = game.CurrentDurationSec
		om.currentFps = 0
		om.low1Fps = 0
		om.avgFps = 0
		om.gameHwnd = 0
		hwnd := om.hwnd
		corner := om.corner
		enabled := om.store != nil && om.store.GetOverlaySettings().Enabled
		om.visible = enabled
		vis := om.visible
		om.mu.Unlock()

		if hwnd != 0 {
			if vis {
				newX, newY, newW, newH := om.calculatePosition(corner)
				procSetWindowPos.Call(
					hwnd,
					^uintptr(0), // HWND_TOPMOST
					uintptr(newX), uintptr(newY),
					uintptr(newW), uintptr(newH),
					0x0010|0x0040, // SWP_NOACTIVATE | SWP_SHOWWINDOW
				)
				procPostMessageW.Call(hwnd, wmUpdate, 0, 0)
			} else {
				procShowWindow.Call(hwnd, swHide)
			}
		}
	})

	// Hook tracker callbacks
	tracker.SetCallbacks(func(game *RunningGame) {
		fmt.Printf("[Overlay] onGameStarted callback triggered for: %s\n", game.Title)
		om.mu.Lock()
		active := om.tracker.GetActiveGame()
		if active == nil || active.ID == game.ID || om.gameTitle == "Standby" {
			om.gameTitle = game.Title
			om.playtimeSec = game.CurrentDurationSec
			om.currentFps = 0
			om.low1Fps = 0
			om.avgFps = 0
			om.gameHwnd = 0
		}
		enabled := om.store != nil && om.store.GetOverlaySettings().Enabled
		om.mu.Unlock()
		if enabled {
			om.Show()
		} else {
			om.Hide()
		}
	}, func(session *PlaySession) {
		fmt.Printf("[Overlay] onGameStopped callback triggered\n")
		om.mu.Lock()
		active := om.tracker.GetActiveGame()
		if active != nil {
			om.gameTitle = active.Title
			om.playtimeSec = active.CurrentDurationSec
			om.currentFps = 0
			om.low1Fps = 0
			om.avgFps = 0
			om.gameHwnd = 0
		} else {
			om.gameTitle = "Standby"
			om.currentFps = 0
			om.low1Fps = 0
			om.avgFps = 0
			om.gameHwnd = 0
			om.visible = false
		}
		hwnd := om.hwnd
		corner := om.corner
		vis := om.visible
		om.mu.Unlock()
		if hwnd != 0 {
			if vis {
				newX, newY, newW, newH := om.calculatePosition(corner)
				procSetWindowPos.Call(
					hwnd,
					^uintptr(0),
					uintptr(newX), uintptr(newY),
					uintptr(newW), uintptr(newH),
					0x0010|0x0040,
				)
				procPostMessageW.Call(hwnd, wmUpdate, 0, 0)
			} else {
				procShowWindow.Call(hwnd, swHide)
			}
		}
	})

	return om
}

// Start spawns the Windows message pump on a dedicated OS thread.
func (om *OverlayManager) Start() {
	go om.runWin32Thread()

	// Subscribe to live FPS events
	if om.collector != nil {
		go om.listenFpsStream()
	}

	// Update playtime ticker
	go om.playtimeTicker()
}

func (om *OverlayManager) listenFpsStream() {
	ch := om.collector.Subscribe()
	defer om.collector.Unsubscribe(ch)

	for {
		select {
		case <-om.stopChan:
			return
		case snap, ok := <-ch:
			if !ok {
				return
			}
			om.mu.Lock()
			// If tracker has an active game, ignore snapshots from a previous game
			if om.tracker != nil {
				if active := om.tracker.GetActiveGame(); active != nil && snap.GameID != "" && snap.GameID != active.ID {
					om.mu.Unlock()
					continue
				}
			}
			om.currentFps = snap.FPS
			om.low1Fps = snap.Low1Percent
			om.avgFps = snap.AvgFPS
			hwnd := om.hwnd
			om.mu.Unlock()

			if hwnd != 0 {
				procPostMessageW.Call(hwnd, wmUpdate, 0, 0)
			}
		}
	}
}

func (om *OverlayManager) playtimeTicker() {
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	tickCount := 0

	for {
		select {
		case <-om.stopChan:
			return
		case <-ticker.C:
			tickCount++
			om.mu.RLock()
			vis := om.visible
			hwnd := om.hwnd
			corner := om.corner
			om.mu.RUnlock()

			if vis && corner != "hidden" && hwnd != 0 {
				newX, newY, newW, newH := om.calculatePosition(corner)
				om.mu.Lock()
				moved := newX != om.lastX || newY != om.lastY || newW != om.lastW || newH != om.lastH
				if moved {
					om.lastX = newX
					om.lastY = newY
					om.lastW = newW
					om.lastH = newH
				}
				if tickCount%5 == 0 && om.gameTitle != "Standby" && om.gameTitle != "" {
					if om.tracker != nil {
						if active := om.tracker.GetActiveGame(); active != nil {
							om.playtimeSec = active.CurrentDurationSec
						} else {
							om.playtimeSec++
						}
					} else {
						om.playtimeSec++
					}
				}
				om.mu.Unlock()

				if moved {
					procSetWindowPos.Call(
						hwnd,
						^uintptr(0), // HWND_TOPMOST
						uintptr(newX), uintptr(newY),
						uintptr(newW), uintptr(newH),
						0x0010|0x0040, // SWP_NOACTIVATE | SWP_SHOWWINDOW
					)
					procInvalidateRect.Call(hwnd, 0, 1)
					procUpdateWindow.Call(hwnd)
				} else if tickCount%5 == 0 {
					// Every second, re-assert HWND_TOPMOST and refresh playtime
					procSetWindowPos.Call(
						hwnd,
						^uintptr(0), // HWND_TOPMOST
						0, 0, 0, 0,
						0x0001|0x0002|0x0010, // SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE
					)
					procPostMessageW.Call(hwnd, wmUpdate, 0, 0)
				}
			}
		}
	}
}

func (om *OverlayManager) runWin32Thread() {
	// Must lock OS thread for Win32 message loop
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	tid, _, _ := procGetCurrentThreadId.Call()
	om.mu.Lock()
	om.threadID = tid
	om.mu.Unlock()

	// Try acquiring named mutex to ensure only ONE instance manages the Win32 overlay on the host
	mutexName, _ := syscall.UTF16PtrFromString("Local\\OtixGameOverlayInstanceMutex")
	hMutex, _, _ := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(mutexName)))
	lastErr, _, _ := procGetLastError.Call()
	const errorAlreadyExists = 183

	if hMutex != 0 && lastErr == errorAlreadyExists {
		fmt.Printf("[Overlay] Another Otix instance is already managing the Win32 HUD overlay; running in passive mode\n")
		om.mu.Lock()
		om.isPrimary = false
		om.hMutex = hMutex
		om.mu.Unlock()
		return
	}

	om.mu.Lock()
	om.isPrimary = true
	om.hMutex = hMutex
	om.mu.Unlock()

	// Ensure the overlay thread attaches to the interactive "Default" desktop
	// (critical when launched via background runners, services, or dev terminals)
	desktopDefault, _ := syscall.UTF16PtrFromString("Default")
	hDefault, _, _ := procOpenDesktopW.Call(
		uintptr(unsafe.Pointer(desktopDefault)),
		0,
		0,
		0x01FF, // DESKTOP_ALL_ACCESS
	)
	if hDefault != 0 {
		setOk, _, setErr := procSetThreadDesktop.Call(hDefault)
		fmt.Printf("[Overlay] SetThreadDesktop('Default') ret=%v (err=%v)\n", setOk, setErr)
	}

	className, _ := syscall.UTF16PtrFromString("OtixGameOverlayClass")
	windowTitle, _ := syscall.UTF16PtrFromString("Otix Game Overlay")

	wc := wndClassExW{
		cbSize:        uint32(unsafe.Sizeof(wndClassExW{})),
		lpfnWndProc:   wndProcCallback,
		lpszClassName: className,
	}

	regRet, _, regErr := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	fmt.Printf("[Overlay] RegisterClassExW ret=%v err=%v\n", regRet, regErr)

	x, y, w, h := om.calculatePosition(om.corner)

	// Note: wsExTransparent is omitted here because WM_NCHITTEST returning HTTRANSPARENT handles
	// click-through without causing GDI repaint delays.
	exStyle := uintptr(wsExTopmost | wsExLayered | wsExNoActivate | wsExToolWindow)
	style := uintptr(wsPopup)

	hwnd, _, createErr := procCreateWindowExW.Call(
		exStyle,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(windowTitle)),
		style,
		uintptr(x), uintptr(y),
		uintptr(w), uintptr(h),
		0, 0, 0, 0,
	)

	fmt.Printf("[Overlay] CreateWindowExW hwnd=0x%x err=%v\n", hwnd, createErr)

	if hwnd == 0 {
		fmt.Printf("[Overlay] Failed to create overlay window!\n")
		return
	}

	om.mu.Lock()
	om.hwnd = hwnd
	om.lastX = x
	om.lastY = y
	om.lastW = w
	om.lastH = h
	om.mu.Unlock()

	// Set layered window opacity: ~92% (alpha = 235 out of 255)
	procSetLayeredWindowAttributes.Call(hwnd, 0, 235, lwaAlpha)

	// Register global hotkey: Ctrl + ` (VK_OEM_3 = 0xC0) (ID 1 - US layout)
	hkRet1, _, hkErr1 := procRegisterHotKey.Call(hwnd, 1, uintptr(modControl), uintptr(0xC0))
	// ID 2: Ctrl + ` on ISO/European/UK/PT key under Esc / left of 1 (VK_OEM_5 = 0xDC)
	hkRet2, _, hkErr2 := procRegisterHotKey.Call(hwnd, 2, uintptr(modControl), uintptr(0xDC))
	// ID 3: Ctrl + ` on secondary layouts (VK_OEM_7 = 0xDE)
	hkRet3, _, _ := procRegisterHotKey.Call(hwnd, 3, uintptr(modControl), uintptr(0xDE))
	// ID 4: Ctrl + Shift + ` (VK_OEM_3 = 0xC0)
	procRegisterHotKey.Call(hwnd, 4, uintptr(modControl|modShift), uintptr(0xC0))
	// ID 5: Ctrl + Shift + ` (VK_OEM_5 = 0xDC)
	procRegisterHotKey.Call(hwnd, 5, uintptr(modControl|modShift), uintptr(0xDC))
	// ID 6: Ctrl + Shift + O
	hkRet6, _, _ := procRegisterHotKey.Call(hwnd, 6, uintptr(modControl|modShift), uintptr('O'))
	// ID 7: Alt + F12 (VK_F12 = 0x7B)
	procRegisterHotKey.Call(hwnd, 7, uintptr(modAlt), uintptr(0x7B))
	// ID 8: Ctrl + F11 (VK_F11 = 0x7A)
	procRegisterHotKey.Call(hwnd, 8, uintptr(modControl), uintptr(0x7A))

	fmt.Printf("[Overlay] Hotkeys: Ctrl+` (0xC0) ret=%v (%v), Ctrl+` (0xDC) ret=%v (%v), Ctrl+` (0xDE) ret=%v, Ctrl+Shift+O ret=%v\n",
		hkRet1, hkErr1, hkRet2, hkErr2, hkRet3, hkRet6)

	// If overlay is enabled AND an active game is running, position as HWND_TOPMOST and show
	om.mu.RLock()
	vis := om.visible
	corner := om.corner
	hasActiveGame := om.tracker != nil && om.tracker.GetActiveGame() != nil
	om.mu.RUnlock()

	if vis && hasActiveGame && corner != "hidden" {
		xInit, yInit, wInit, hInit := om.calculatePosition(corner)
		fmt.Printf("[Overlay] Auto-showing overlay on startup at %s (%d, %d, %dx%d)\n", corner, xInit, yInit, wInit, hInit)
		procSetWindowPos.Call(
			hwnd,
			^uintptr(0), // HWND_TOPMOST
			uintptr(xInit), uintptr(yInit),
			uintptr(wInit), uintptr(hInit),
			0x0010|0x0040, // SWP_NOACTIVATE | SWP_SHOWWINDOW
		)
		procShowWindow.Call(hwnd, swShowNoActivate)
		procInvalidateRect.Call(hwnd, 0, 1)
		procUpdateWindow.Call(hwnd)
	}

	// Standard Win32 Message Loop
	var m msg
	for {
		ret, _, err := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(ret) <= 0 {
			fmt.Printf("[Overlay] GetMessageW terminated: ret=%v err=%v\n", ret, err)
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
	fmt.Printf("[Overlay] runWin32Thread unregistering hotkeys and exiting\n")

	for id := uintptr(1); id <= 8; id++ {
		procUnregisterHotKey.Call(hwnd, id)
	}
	if hwnd != 0 {
		procDestroyWindow.Call(hwnd)
	}
	om.mu.Lock()
	om.hwnd = 0
	if om.hMutex != 0 {
		procCloseHandle.Call(om.hMutex)
		om.hMutex = 0
	}
	om.mu.Unlock()
}

// GetAvailableMonitors enumerates all attached physical display monitors.
func (om *OverlayManager) GetAvailableMonitors() []MonitorInfo {
	monitors := make([]MonitorInfo, 0)

	// Always provide Auto option first
	monitors = append(monitors, MonitorInfo{
		ID:        "auto",
		Name:      "Auto (Follow Active Game)",
		IsPrimary: false,
	})

	hw := hardware.GetMachineHardware(false)
	dispNameMap := make(map[string]string)
	if hw != nil {
		for _, d := range hw.Displays {
			dispNameMap[strings.ToLower(d.DeviceName)] = d.Name
		}
	}

	overlayMonMu.Lock()
	overlayMonList = nil
	procEnumDisplayMonitors.Call(0, 0, overlayMonEnumCb, 0)
	raws := make([]rawMonOverlay, len(overlayMonList))
	copy(raws, overlayMonList)
	overlayMonList = nil
	overlayMonMu.Unlock()

	for idx, m := range raws {
		monIdx := idx + 1
		name := fmt.Sprintf("Monitor %d: %dx%d", monIdx, m.width, m.height)
		if friendly, ok := dispNameMap[strings.ToLower(m.device)]; ok && friendly != "" {
			name = fmt.Sprintf("Monitor %d: %s (%dx%d)", monIdx, friendly, m.width, m.height)
		}
		if m.isPrimary {
			name += " (Primary)"
		}

		monitors = append(monitors, MonitorInfo{
			ID:        strconv.Itoa(monIdx),
			Name:      name,
			Device:    m.device,
			Width:     m.width,
			Height:    m.height,
			IsPrimary: m.isPrimary,
			Left:      m.left,
			Top:       m.top,
		})
	}

	return monitors
}

func (om *OverlayManager) getGameMonitorRect() rect {
	om.mu.RLock()
	targetPID := 0
	cachedHwnd := om.gameHwnd
	prefMon := om.monitor
	if om.tracker != nil {
		if running := om.tracker.GetRunningGame(); running != nil {
			targetPID = running.PID
		}
	}
	om.mu.RUnlock()

	// 1. If assigned to a specific monitor (e.g. "1", "2", "3", or "\\.\DISPLAY1"), use it!
	if prefMon != "" && prefMon != "auto" {
		available := om.GetAvailableMonitors()
		for _, m := range available {
			if m.ID == prefMon || strings.EqualFold(m.Device, prefMon) || strings.EqualFold(strings.TrimPrefix(m.Device, `\\.\`), prefMon) {
				return rect{
					left:   m.Left,
					top:    m.Top,
					right:  m.Left + m.Width,
					bottom: m.Top + m.Height,
				}
			}
		}
	}

	var hMon uintptr

	// 2. Fast path: check cached game window handle (~200ns)
	if cachedHwnd != 0 && targetPID != 0 {
		var pid uint32
		procGetWindowThreadProcessId.Call(cachedHwnd, uintptr(unsafe.Pointer(&pid)))
		if int(pid) == targetPID {
			ret, _, _ := procMonitorFromWindow.Call(cachedHwnd, 2 /* MONITOR_DEFAULTTONEAREST */)
			hMon = ret
		}
	}

	// 3. Slow path: scan top-level windows for target PID
	if hMon == 0 && targetPID != 0 {
		enumWindowMu.Lock()
		enumWindowTargetPID = targetPID
		enumWindowFoundHwnd = 0
		procEnumWindows.Call(enumWindowCb, 0)
		found := enumWindowFoundHwnd
		enumWindowMu.Unlock()

		if found != 0 {
			om.mu.Lock()
			om.gameHwnd = found
			om.mu.Unlock()
			ret, _, _ := procMonitorFromWindow.Call(found, 2)
			hMon = ret
		}
	}

	// 4. Query monitor rectangle
	if hMon != 0 {
		var mi monitorInfo
		mi.cbSize = uint32(unsafe.Sizeof(mi))
		ok, _, _ := procGetMonitorInfoW.Call(hMon, uintptr(unsafe.Pointer(&mi)))
		if ok != 0 && (mi.rcMonitor.right > mi.rcMonitor.left) && (mi.rcMonitor.bottom > mi.rcMonitor.top) {
			return mi.rcMonitor
		}
	}

	// 5. Fallback to primary monitor metrics
	sWidth, _, _ := procGetSystemMetrics.Call(0)  // SM_CXSCREEN
	sHeight, _, _ := procGetSystemMetrics.Call(1) // SM_CYSCREEN
	sw := int32(sWidth)
	sh := int32(sHeight)
	if sw == 0 {
		sw = 1920
	}
	if sh == 0 {
		sh = 1080
	}
	return rect{0, 0, sw, sh}
}

func (om *OverlayManager) calculatePosition(corner string) (int32, int32, int32, int32) {
	mon := om.getGameMonitorRect()
	monW := mon.right - mon.left
	padding := int32(16)

	switch corner {
	case "bottom-wide":
		return mon.left, mon.bottom - barHeight, monW, barHeight
	case "top-right":
		return mon.right - overlayWidth - padding, mon.top + padding, overlayWidth, overlayHeight
	case "bottom-left":
		return mon.left + padding, mon.bottom - overlayHeight - padding, overlayWidth, overlayHeight
	case "bottom-right":
		return mon.right - overlayWidth - padding, mon.bottom - overlayHeight - padding, overlayWidth, overlayHeight
	case "top-left":
		return mon.left + padding, mon.top + padding, overlayWidth, overlayHeight
	case "top-wide":
		fallthrough
	default:
		return mon.left, mon.top, monW, barHeight
	}
}

func (om *OverlayManager) paint(hwnd uintptr) {
	var ps paintStruct
	hdc, _, _ := procBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	if hdc == 0 {
		return
	}
	defer procEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))

	var cr rect
	procGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&cr)))
	w := cr.right - cr.left
	h := cr.bottom - cr.top
	if w <= 0 {
		w = overlayWidth
	}
	if h <= 0 {
		h = overlayHeight
	}

	om.mu.RLock()
	fps := om.currentFps
	low1 := om.low1Fps
	avg := om.avgFps
	playtime := om.playtimeSec
	gameTitle := om.gameTitle
	om.mu.RUnlock()

	// 1. Draw Background: Deep Obsidian Glass (#101115 / RGB: 16, 17, 21)
	bgBrush, _, _ := procCreateSolidBrush.Call(uintptr(0x00151110))
	rFill := rect{0, 0, w, h}
	procFillRect.Call(hdc, uintptr(unsafe.Pointer(&rFill)), bgBrush)
	procDeleteObject.Call(bgBrush)

	// Set background mode to transparent
	procSetBkMode.Call(hdc, 1) // TRANSPARENT = 1

	fontSegoe, _ := syscall.UTF16PtrFromString("Segoe UI")

	if w > 400 {
		// ================= MONITOR-WIDE BAR HUD (w = screen width, h = barHeight) =================
		// Bottom border line (#27272A / RGB: 39, 39, 42)
		borderBrush, _, _ := procCreateSolidBrush.Call(uintptr(0x002A2727))
		rBorder := rect{0, h - 1, w, h}
		procFillRect.Call(hdc, uintptr(unsafe.Pointer(&rBorder)), borderBrush)
		procDeleteObject.Call(borderBrush)

		hFontBrand, _, _ := procCreateFontW.Call(
			15, 0, 0, 0, 800, 0, 0, 0, 1, 0, 0, 0, 0,
			uintptr(unsafe.Pointer(fontSegoe)),
		)
		hFontText, _, _ := procCreateFontW.Call(
			14, 0, 0, 0, 600, 0, 0, 0, 1, 0, 0, 0, 0,
			uintptr(unsafe.Pointer(fontSegoe)),
		)
		hFontFps, _, _ := procCreateFontW.Call(
			18, 0, 0, 0, 800, 0, 0, 0, 1, 0, 0, 0, 0,
			uintptr(unsafe.Pointer(fontSegoe)),
		)
		hFontTiny, _, _ := procCreateFontW.Call(
			11, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0,
			uintptr(unsafe.Pointer(fontSegoe)),
		)

		// Left: Brand "OTIX"
		procSelectObject.Call(hdc, hFontBrand)
		procSetTextColor.Call(hdc, uintptr(0x00EF46D9)) // Crisp purple (BGR: 0x00EF46D9)
		u16Brand, _ := syscall.UTF16FromString("OTIX")
		rBrand := rect{20, 8, 65, h}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Brand[0])), uintptr(len(u16Brand)-1), uintptr(unsafe.Pointer(&rBrand)), dtLeft|dtSingle)

		// Divider "|"
		procSelectObject.Call(hdc, hFontTiny)
		procSetTextColor.Call(hdc, uintptr(0x00505050))
		u16Div, _ := syscall.UTF16FromString("|")
		rDiv := rect{66, 9, 80, h}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Div[0])), uintptr(len(u16Div)-1), uintptr(unsafe.Pointer(&rDiv)), dtLeft|dtSingle)

		// Game Title
		titleText := gameTitle
		if titleText == "" {
			titleText = "Standby"
		}
		procSelectObject.Call(hdc, hFontText)
		procSetTextColor.Call(hdc, uintptr(0x00E4E4E7))
		u16Title, _ := syscall.UTF16FromString(titleText)
		rTitle := rect{82, 8, 450, h}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Title[0])), uintptr(len(u16Title)-1), uintptr(unsafe.Pointer(&rTitle)), dtLeft|dtSingle)

		// Right side stats:
		marginRight := w - 24

		// 1. Hotkey hint on far right: "[Ctrl+`] Toggle"
		procSelectObject.Call(hdc, hFontTiny)
		procSetTextColor.Call(hdc, uintptr(0x0071717A))
		u16Hk, _ := syscall.UTF16FromString("[Ctrl+`] Toggle")
		rHk := rect{marginRight - 120, 11, marginRight, h}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Hk[0])), uintptr(len(u16Hk)-1), uintptr(unsafe.Pointer(&rHk)), dtLeft|dtSingle)

		// 2. Playtime:
		var playtimeStr string
		if playtime > 0 {
			hSec := playtime / 3600
			mSec := (playtime % 3600) / 60
			sSec := playtime % 60
			playtimeStr = fmt.Sprintf("Time: %02d:%02d:%02d", hSec, mSec, sSec)
		} else {
			playtimeStr = "Time: --:--:--"
		}
		u16Time, _ := syscall.UTF16FromString(playtimeStr)
		procSelectObject.Call(hdc, hFontText)
		procSetTextColor.Call(hdc, uintptr(0x00A1A1AA))
		rTime := rect{marginRight - 265, 8, marginRight - 145, h}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Time[0])), uintptr(len(u16Time)-1), uintptr(unsafe.Pointer(&rTime)), dtLeft|dtSingle)

		// 3. 1% Low & Avg FPS
		statsStr := fmt.Sprintf("1%%: %d   Avg: %d", int(math.Round(low1)), int(math.Round(avg)))
		if low1 == 0 && avg == 0 {
			statsStr = "1%: --   Avg: --"
		}
		u16Stats, _ := syscall.UTF16FromString(statsStr)
		procSetTextColor.Call(hdc, uintptr(0x00D4D4D8))
		rStats := rect{marginRight - 440, 8, marginRight - 275, h}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Stats[0])), uintptr(len(u16Stats)-1), uintptr(unsafe.Pointer(&rStats)), dtLeft|dtSingle)

		// 4. Large Live FPS
		procSelectObject.Call(hdc, hFontFps)
		var fpsColor uintptr
		if fps >= 60 {
			fpsColor = 0x0080DE4A // Crisp soft green (BGR)
		} else if fps >= 35 {
			fpsColor = 0x0047E0FD // Warm amber (BGR)
		} else {
			fpsColor = 0x007171F8 // Soft coral red (BGR)
		}
		procSetTextColor.Call(hdc, fpsColor)

		fpsStr := fmt.Sprintf("%d", int(math.Round(fps)))
		if fps == 0 {
			fpsStr = "--"
		}
		u16Fps, _ := syscall.UTF16FromString(fpsStr)
		rFps := rect{marginRight - 530, 6, marginRight - 475, h}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Fps[0])), uintptr(len(u16Fps)-1), uintptr(unsafe.Pointer(&rFps)), dtRight|dtSingle)

		// FPS label next to number
		procSelectObject.Call(hdc, hFontTiny)
		procSetTextColor.Call(hdc, uintptr(0x0071717A))
		u16FpsLbl, _ := syscall.UTF16FromString("FPS")
		rFpsLbl := rect{marginRight - 470, 11, marginRight - 445, h}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16FpsLbl[0])), uintptr(len(u16FpsLbl)-1), uintptr(unsafe.Pointer(&rFpsLbl)), dtLeft|dtSingle)

		procDeleteObject.Call(hFontBrand)
		procDeleteObject.Call(hFontText)
		procDeleteObject.Call(hFontFps)
		procDeleteObject.Call(hFontTiny)

	} else {
		// ================= CORNER PILL HUD (220x60) =================
		hFontBig, _, _ := procCreateFontW.Call(
			28, 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 0, 0,
			uintptr(unsafe.Pointer(fontSegoe)),
		)
		hFontSmall, _, _ := procCreateFontW.Call(
			13, 0, 0, 0, 600, 0, 0, 0, 1, 0, 0, 0, 0,
			uintptr(unsafe.Pointer(fontSegoe)),
		)
		hFontTiny, _, _ := procCreateFontW.Call(
			11, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0,
			uintptr(unsafe.Pointer(fontSegoe)),
		)

		procSelectObject.Call(hdc, hFontBig)
		var fpsColor uintptr
		if fps >= 60 {
			fpsColor = 0x00F5F5F5
		} else if fps >= 35 {
			fpsColor = 0x0047E0FD
		} else {
			fpsColor = 0x007171F8
		}
		procSetTextColor.Call(hdc, fpsColor)

		fpsStr := fmt.Sprintf("%d", int(math.Round(fps)))
		if fps == 0 {
			fpsStr = "--"
		}
		u16Fps, _ := syscall.UTF16FromString(fpsStr)
		rFps := rect{12, 10, 85, 48}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Fps[0])), uintptr(len(u16Fps)-1), uintptr(unsafe.Pointer(&rFps)), dtLeft|dtSingle)

		procSelectObject.Call(hdc, hFontTiny)
		procSetTextColor.Call(hdc, uintptr(0x00666666))
		u16FpsLbl, _ := syscall.UTF16FromString("FPS")
		rFpsLbl := rect{74, 24, 108, 44}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16FpsLbl[0])), uintptr(len(u16FpsLbl)-1), uintptr(unsafe.Pointer(&rFpsLbl)), dtLeft|dtSingle)

		procSelectObject.Call(hdc, hFontSmall)
		procSetTextColor.Call(hdc, uintptr(0x00D0D0D0))
		statsStr := fmt.Sprintf("1%%: %d   Avg: %d", int(math.Round(low1)), int(math.Round(avg)))
		if low1 == 0 && avg == 0 {
			statsStr = "1%: --   Avg: --"
		}
		u16Stats, _ := syscall.UTF16FromString(statsStr)
		rStats := rect{112, 12, overlayWidth - 10, 30}
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Stats[0])), uintptr(len(u16Stats)-1), uintptr(unsafe.Pointer(&rStats)), dtLeft|dtSingle)

		var playtimeStr string
		if playtime > 0 {
			hSec := playtime / 3600
			mSec := (playtime % 3600) / 60
			sSec := playtime % 60
			playtimeStr = fmt.Sprintf("Time: %02d:%02d:%02d", hSec, mSec, sSec)
		} else {
			playtimeStr = "Time: --:--:--"
		}
		u16Time, _ := syscall.UTF16FromString(playtimeStr)
		rTime := rect{112, 34, overlayWidth - 10, 52}
		procSelectObject.Call(hdc, hFontTiny)
		procSetTextColor.Call(hdc, uintptr(0x008E8E8E))
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Time[0])), uintptr(len(u16Time)-1), uintptr(unsafe.Pointer(&rTime)), dtLeft|dtSingle)

		procDeleteObject.Call(hFontBig)
		procDeleteObject.Call(hFontSmall)
		procDeleteObject.Call(hFontTiny)
	}
}

// Show makes the overlay visible above fullscreen/borderless games if enabled and game active.
func (om *OverlayManager) Show() {
	om.mu.Lock()
	if om.store != nil && !om.store.GetOverlaySettings().Enabled {
		om.mu.Unlock()
		return
	}
	hasActiveGame := om.tracker != nil && om.tracker.GetActiveGame() != nil
	if !hasActiveGame {
		om.mu.Unlock()
		return
	}
	om.visible = true
	hwnd := om.hwnd
	om.mu.Unlock()

	fmt.Printf("[Overlay] Show() called (hwnd=0x%x)\n", hwnd)
	if hwnd != 0 {
		procPostMessageW.Call(hwnd, wmShow, 0, 0)
	}
}

// Hide hides the overlay window.
func (om *OverlayManager) Hide() {
	om.mu.Lock()
	om.visible = false
	hwnd := om.hwnd
	om.mu.Unlock()

	fmt.Printf("[Overlay] Hide() called (hwnd=0x%x)\n", hwnd)
	if hwnd != 0 {
		procPostMessageW.Call(hwnd, wmHide, 0, 0)
	}
}

// Toggle toggles overlay visibility and persists state to store.
func (om *OverlayManager) Toggle() {
	if om.store == nil {
		return
	}
	settings := om.store.GetOverlaySettings()
	settings.Enabled = !settings.Enabled
	_ = om.store.SaveOverlaySettings(settings)
	om.ApplySettings(settings)
}

// ApplySettings applies updated overlay configuration (enabled, corner, monitor).
func (om *OverlayManager) ApplySettings(settings OverlaySettings) {
	om.mu.Lock()
	if settings.Corner != "" {
		om.corner = settings.Corner
	}
	if settings.Monitor != "" {
		om.monitor = settings.Monitor
	}
	hasActiveGame := om.tracker != nil && om.tracker.GetActiveGame() != nil
	om.visible = settings.Enabled && hasActiveGame
	vis := om.visible
	corner := om.corner
	hwnd := om.hwnd
	om.mu.Unlock()

	fmt.Printf("[Overlay] ApplySettings: enabled=%v, hasActiveGame=%v, visible=%v, corner=%s, monitor=%s\n", settings.Enabled, hasActiveGame, vis, corner, settings.Monitor)

	if hwnd != 0 {
		if vis {
			x, y, w, h := om.calculatePosition(corner)
			procSetWindowPos.Call(
				hwnd,
				^uintptr(0), // HWND_TOPMOST
				uintptr(x), uintptr(y),
				uintptr(w), uintptr(h),
				0x0010|0x0040, // SWP_NOACTIVATE | SWP_SHOWWINDOW
			)
			procShowWindow.Call(hwnd, swShowNoActivate)
			procInvalidateRect.Call(hwnd, 0, 1)
			procUpdateWindow.Call(hwnd)
		} else {
			procShowWindow.Call(hwnd, swHide)
		}
	}
}

// CyclePosition cycles the HUD through the 4 corners or hides it.
func (om *OverlayManager) CyclePosition() {
	om.mu.RLock()
	hwnd := om.hwnd
	om.mu.RUnlock()

	if hwnd != 0 {
		procPostMessageW.Call(hwnd, wmCycle, 0, 0)
	}
}

func (om *OverlayManager) doCyclePosition(hwnd uintptr) {
	om.mu.Lock()
	switch om.corner {
	case "top-wide":
		om.corner = "bottom-wide"
	case "bottom-wide":
		om.corner = "top-right"
	case "top-right":
		om.corner = "top-left"
	case "top-left":
		om.corner = "hidden"
	default: // "hidden" or any other
		om.corner = "top-wide"
	}

	if om.corner == "hidden" {
		om.visible = false
		om.mu.Unlock()
		fmt.Printf("[Overlay] Overlay hidden via hotkey toggle\n")
		procShowWindow.Call(hwnd, swHide)
		return
	}

	corner := om.corner
	om.visible = true
	om.mu.Unlock()

	x, y, w, h := om.calculatePosition(corner)
	om.mu.Lock()
	om.lastX = x
	om.lastY = y
	om.lastW = w
	om.lastH = h
	om.mu.Unlock()

	fmt.Printf("[Overlay] Position cycled to: %s at (%d, %d, %dx%d)\n", corner, x, y, w, h)
	procSetWindowPos.Call(
		hwnd,
		^uintptr(0), // HWND_TOPMOST
		uintptr(x), uintptr(y),
		uintptr(w), uintptr(h),
		0x0010|0x0040, // SWP_NOACTIVATE | SWP_SHOWWINDOW
	)
	procShowWindow.Call(hwnd, swShowNoActivate)
	procInvalidateRect.Call(hwnd, 0, 1)
	procUpdateWindow.Call(hwnd)
}

// SetCorner positions the overlay explicitly.
func (om *OverlayManager) SetCorner(corner string) {
	om.mu.Lock()
	om.corner = corner
	om.mu.Unlock()

	x, y, w, h := om.calculatePosition(corner)
	om.mu.Lock()
	om.lastX = x
	om.lastY = y
	om.lastW = w
	om.lastH = h
	hwnd := om.hwnd
	om.mu.Unlock()

	if hwnd != 0 {
		procSetWindowPos.Call(
			hwnd,
			^uintptr(0), // HWND_TOPMOST
			uintptr(x), uintptr(y),
			uintptr(w), uintptr(h),
			0x0010|0x0040,
		)
		procUpdateWindow.Call(hwnd)
		procInvalidateRect.Call(hwnd, 0, 1)
	}
}

// Stop terminates the overlay.
func (om *OverlayManager) Stop() {
	om.stopOnce.Do(func() {
		close(om.stopChan)
		om.mu.Lock()
		hwnd := om.hwnd
		threadID := om.threadID
		hMutex := om.hMutex
		om.hwnd = 0
		om.hMutex = 0
		om.mu.Unlock()

		if hwnd != 0 {
			procPostMessageW.Call(hwnd, wmClose, 0, 0)
		}
		if threadID != 0 {
			procPostThreadMessageW.Call(threadID, wmQuit, 0, 0)
		}
		if hMutex != 0 {
			procCloseHandle.Call(hMutex)
		}
	})
}
