//go:build windows

package games

import (
	"fmt"
	"math"
	"runtime"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var (
	modUser32 = syscall.NewLazyDLL("user32.dll")
	modGdi32  = syscall.NewLazyDLL("gdi32.dll")

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

	overlayWidth  = 210
	overlayHeight = 60
)

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
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
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
	visible      bool
	corner       string // "top-left", "top-right", "bottom-left", "bottom-right", "hidden"
	gameTitle    string
	playtimeSec  int
	currentFps   float64
	low1Fps      float64
	avgFps       float64
	stopChan     chan struct{}
}

var globalOverlayManager *OverlayManager

func wndProc(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {
	case wmHotKey:
		if globalOverlayManager != nil {
			globalOverlayManager.CyclePosition()
		}
		return 0

	case wmShow:
		procShowWindow.Call(hwnd, swShowNoActivate)
		procUpdateWindow.Call(hwnd)
		procInvalidateRect.Call(hwnd, 0, 1)
		return 0

	case wmHide:
		procShowWindow.Call(hwnd, swHide)
		return 0

	case wmCycle:
		if globalOverlayManager != nil {
			globalOverlayManager.doCyclePosition(hwnd)
		}
		return 0

	case wmUpdate:
		procInvalidateRect.Call(hwnd, 0, 1)
		return 0

	case wmPaint:
		if globalOverlayManager != nil {
			globalOverlayManager.paint(hwnd)
		}
		return 0

	case wmDestroy:
		return 0
	}

	ret, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wParam, lParam)
	return ret
}

// NewOverlayManager creates a new native overlay manager on Windows.
func NewOverlayManager(store *SessionStore, tracker *GameTracker, collector FpsCollector) *OverlayManager {
	settings := store.GetOverlaySettings()
	om := &OverlayManager{
		store:     store,
		tracker:   tracker,
		collector: collector,
		corner:    settings.Corner,
		visible:   false,
		stopChan:  make(chan struct{}),
	}
	globalOverlayManager = om

	// Hook tracker callbacks
	tracker.SetCallbacks(func(game *RunningGame) {
		om.mu.Lock()
		om.gameTitle = game.Title
		om.playtimeSec = 0
		om.currentFps = 0
		om.low1Fps = 0
		om.avgFps = 0
		om.mu.Unlock()
		om.Show()
	}, func(session *PlaySession) {
		om.Hide()
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
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-om.stopChan:
			return
		case <-ticker.C:
			om.mu.RLock()
			vis := om.visible
			hwnd := om.hwnd
			om.mu.RUnlock()

			if vis {
				om.mu.Lock()
				om.playtimeSec++
				om.mu.Unlock()

				if hwnd != 0 {
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

	className, _ := syscall.UTF16PtrFromString("OtixGameOverlayClass")
	windowTitle, _ := syscall.UTF16PtrFromString("Otix Game Overlay")

	wc := wndClassExW{
		cbSize:        uint32(unsafe.Sizeof(wndClassExW{})),
		lpfnWndProc:   syscall.NewCallback(wndProc),
		lpszClassName: className,
	}

	procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))

	x, y := om.calculatePosition(om.corner)

	exStyle := uintptr(wsExTopmost | wsExTransparent | wsExLayered | wsExNoActivate | wsExToolWindow)
	style := uintptr(wsPopup)

	hwnd, _, _ := procCreateWindowExW.Call(
		exStyle,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(windowTitle)),
		style,
		uintptr(x), uintptr(y),
		overlayWidth, overlayHeight,
		0, 0, 0, 0,
	)

	if hwnd == 0 {
		return
	}

	om.mu.Lock()
	om.hwnd = hwnd
	om.mu.Unlock()

	// Set layered window opacity: ~92% (alpha = 235 out of 255)
	procSetLayeredWindowAttributes.Call(hwnd, 0, 235, lwaAlpha)

	// Register global hotkey: Ctrl + Shift + O
	procRegisterHotKey.Call(hwnd, 1, uintptr(modControl|modShift), uintptr('O'))

	// Standard Win32 Message Loop
	var m msg
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(ret) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}

	procUnregisterHotKey.Call(hwnd, 1)
}

func (om *OverlayManager) calculatePosition(corner string) (int32, int32) {
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

	padding := int32(24)

	switch corner {
	case "top-right":
		return sw - overlayWidth - padding, padding
	case "bottom-left":
		return padding, sh - overlayHeight - padding - 40
	case "bottom-right":
		return sw - overlayWidth - padding, sh - overlayHeight - padding - 40
	default: // "top-left"
		return padding, padding
	}
}

func (om *OverlayManager) paint(hwnd uintptr) {
	var ps paintStruct
	hdc, _, _ := procBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	if hdc == 0 {
		return
	}
	defer procEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))

	om.mu.RLock()
	fps := om.currentFps
	low1 := om.low1Fps
	avg := om.avgFps
	playtime := om.playtimeSec
	om.mu.RUnlock()

	// 1. Draw Background: Deep Obsidian Glass (#101115 / RGB: 16, 17, 21)
	bgBrush, _, _ := procCreateSolidBrush.Call(uintptr(0x00151110))
	r := rect{0, 0, overlayWidth, overlayHeight}
	procFillRect.Call(hdc, uintptr(unsafe.Pointer(&r)), bgBrush)
	procDeleteObject.Call(bgBrush)

	// Set background mode to transparent
	procSetBkMode.Call(hdc, 1) // TRANSPARENT = 1

	// Fonts
	fontSegoeBig, _ := syscall.UTF16PtrFromString("Segoe UI")
	hFontBig, _, _ := procCreateFontW.Call(
		28, 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(fontSegoeBig)),
	)
	hFontSmall, _, _ := procCreateFontW.Call(
		13, 0, 0, 0, 600, 0, 0, 0, 1, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(fontSegoeBig)),
	)
	hFontTiny, _, _ := procCreateFontW.Call(
		11, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(fontSegoeBig)),
	)

	// 2. Draw Large FPS: Clean white by default, warm amber on drops
	procSelectObject.Call(hdc, hFontBig)
	var fpsColor uintptr
	if fps >= 60 {
		fpsColor = 0x00F5F5F5 // Crisp white
	} else if fps >= 35 {
		fpsColor = 0x0047E0FD // Warm amber (RGB: 253, 224, 71)
	} else {
		fpsColor = 0x007171F8 // Soft coral red (RGB: 248, 113, 113)
	}
	procSetTextColor.Call(hdc, fpsColor)

	fpsStr := fmt.Sprintf("%d", int(math.Round(fps)))
	if fps == 0 {
		fpsStr = "--"
	}
	u16Fps, _ := syscall.UTF16FromString(fpsStr)
	rFps := rect{12, 10, 85, 48}
	procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Fps[0])), uintptr(len(u16Fps)-1), uintptr(unsafe.Pointer(&rFps)), dtLeft|dtSingle)

	// Label "FPS" next to large number
	procSelectObject.Call(hdc, hFontTiny)
	procSetTextColor.Call(hdc, uintptr(0x00666666)) // Muted label
	u16FpsLbl, _ := syscall.UTF16FromString("FPS")
	rFpsLbl := rect{74, 24, 108, 44}
	procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16FpsLbl[0])), uintptr(len(u16FpsLbl)-1), uintptr(unsafe.Pointer(&rFpsLbl)), dtLeft|dtSingle)

	// 3. Draw 1% Low & Avg FPS
	procSelectObject.Call(hdc, hFontSmall)
	procSetTextColor.Call(hdc, uintptr(0x00D0D0D0)) // Neutral light grey
	statsStr := fmt.Sprintf("1%%: %d   Avg: %d", int(math.Round(low1)), int(math.Round(avg)))
	if low1 == 0 && avg == 0 {
		statsStr = "1%: --   Avg: --"
	}
	u16Stats, _ := syscall.UTF16FromString(statsStr)
	rStats := rect{112, 12, overlayWidth - 10, 30}
	procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Stats[0])), uintptr(len(u16Stats)-1), uintptr(unsafe.Pointer(&rStats)), dtLeft|dtSingle)

	// 4. Draw Session Playtime: "00:15:32"
	h := playtime / 3600
	m := (playtime % 3600) / 60
	s := playtime % 60
	playtimeStr := fmt.Sprintf("Time: %02d:%02d:%02d", h, m, s)
	u16Time, _ := syscall.UTF16FromString(playtimeStr)
	rTime := rect{112, 34, overlayWidth - 10, 52}
	procSelectObject.Call(hdc, hFontTiny)
	procSetTextColor.Call(hdc, uintptr(0x008E8E8E))
	procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u16Time[0])), uintptr(len(u16Time)-1), uintptr(unsafe.Pointer(&rTime)), dtLeft|dtSingle)

	// Clean up GDI fonts
	procDeleteObject.Call(hFontBig)
	procDeleteObject.Call(hFontSmall)
	procDeleteObject.Call(hFontTiny)
}

// Show makes the overlay visible above fullscreen/borderless games.
func (om *OverlayManager) Show() {
	om.mu.Lock()
	om.visible = true
	hwnd := om.hwnd
	om.mu.Unlock()

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

	if hwnd != 0 {
		procPostMessageW.Call(hwnd, wmHide, 0, 0)
	}
}

// Toggle toggles overlay visibility.
func (om *OverlayManager) Toggle() {
	om.mu.RLock()
	vis := om.visible
	om.mu.RUnlock()

	if vis {
		om.Hide()
	} else {
		om.Show()
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
	case "top-left":
		om.corner = "top-right"
	case "top-right":
		om.corner = "bottom-right"
	case "bottom-right":
		om.corner = "bottom-left"
	case "bottom-left":
		om.corner = "hidden"
	default:
		om.corner = "top-left"
	}

	if om.corner == "hidden" {
		om.visible = false
		om.mu.Unlock()
		procShowWindow.Call(hwnd, swHide)
		return
	}

	x, y := om.calculatePosition(om.corner)
	om.visible = true
	om.mu.Unlock()

	procSetWindowPos.Call(
		hwnd,
		0, // HWND_TOP = 0
		uintptr(x), uintptr(y),
		overlayWidth, overlayHeight,
		0x0010|0x0004, // SWP_NOACTIVATE | SWP_NOZORDER
	)
	procShowWindow.Call(hwnd, swShowNoActivate)
	procInvalidateRect.Call(hwnd, 0, 1)
}

// SetCorner positions the overlay explicitly.
func (om *OverlayManager) SetCorner(corner string) {
	om.mu.Lock()
	defer om.mu.Unlock()

	om.corner = corner
	x, y := om.calculatePosition(corner)
	if om.hwnd != 0 {
		procSetWindowPos.Call(
			om.hwnd, 0,
			uintptr(x), uintptr(y),
			overlayWidth, overlayHeight,
			0x0010|0x0004,
		)
		procInvalidateRect.Call(om.hwnd, 0, 1)
	}
}

// Stop terminates the overlay.
func (om *OverlayManager) Stop() {
	close(om.stopChan)
	om.mu.Lock()
	defer om.mu.Unlock()
	if om.hwnd != 0 {
		procDestroyWindow.Call(om.hwnd)
		om.hwnd = 0
	}
}
