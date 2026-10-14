//go:build windows

package desktop

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"unsafe"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/games"
	"github.com/dksilv4/otix/node/internal/indexer"
)

//go:embed assets/tray-icon-white.png
var embeddedWhiteTrayIconPNG []byte

var (
	modShell32 = syscall.NewLazyDLL("shell32.dll")
	modUser32  = syscall.NewLazyDLL("user32.dll")
	modGdi32   = syscall.NewLazyDLL("gdi32.dll")
	modKernel32 = syscall.NewLazyDLL("kernel32.dll")

	procShell_NotifyIconW          = modShell32.NewProc("Shell_NotifyIconW")
	procExtractIconW               = modShell32.NewProc("ExtractIconW")
	procCreatePopupMenu            = modUser32.NewProc("CreatePopupMenu")
	procAppendMenuW                = modUser32.NewProc("AppendMenuW")
	procTrackPopupMenu             = modUser32.NewProc("TrackPopupMenu")
	procDestroyMenu                = modUser32.NewProc("DestroyMenu")
	procSetForegroundWindow        = modUser32.NewProc("SetForegroundWindow")
	procGetCursorPos               = modUser32.NewProc("GetCursorPos")
	procRegisterWindowMessageW     = modUser32.NewProc("RegisterWindowMessageW")
	procLoadIconW                  = modUser32.NewProc("LoadIconW")
	procCreateIconFromResourceEx   = modUser32.NewProc("CreateIconFromResourceEx")
	procCreateIconIndirect         = modUser32.NewProc("CreateIconIndirect")
	procDestroyIcon                = modUser32.NewProc("DestroyIcon")
	procOpenDesktopW               = modUser32.NewProc("OpenDesktopW")
	procSetThreadDesktop           = modUser32.NewProc("SetThreadDesktop")
	procDefWindowProcW             = modUser32.NewProc("DefWindowProcW")
	procRegisterClassExW        = modUser32.NewProc("RegisterClassExW")
	procCreateWindowExW         = modUser32.NewProc("CreateWindowExW")
	procDestroyWindow           = modUser32.NewProc("DestroyWindow")
	procPostMessageW            = modUser32.NewProc("PostMessageW")
	procGetMessageW             = modUser32.NewProc("GetMessageW")
	procTranslateMessage        = modUser32.NewProc("TranslateMessage")
	procDispatchMessageW        = modUser32.NewProc("DispatchMessageW")
	procGetModuleHandleW        = modKernel32.NewProc("GetModuleHandleW")
	procGetModuleFileNameW      = modKernel32.NewProc("GetModuleFileNameW")

	procCreateCompatibleDC      = modGdi32.NewProc("CreateCompatibleDC")
	procCreateCompatibleBitmap  = modGdi32.NewProc("CreateCompatibleBitmap")
	procCreateBitmap            = modGdi32.NewProc("CreateBitmap")
	procSelectObject            = modGdi32.NewProc("SelectObject")
	procDeleteObject            = modGdi32.NewProc("DeleteObject")
	procDeleteDC                = modGdi32.NewProc("DeleteDC")
	procCreateSolidBrush        = modGdi32.NewProc("CreateSolidBrush")
	procFillRect                = modUser32.NewProc("FillRect")
)

const (
	nifMessage = 0x00000001
	nifIcon    = 0x00000002
	nifTip     = 0x00000004
	nifState   = 0x00000008
	nifInfo    = 0x00000010

	nimAdd        = 0x00000000
	nimModify     = 0x00000001
	nimDelete     = 0x00000002
	nimSetVersion = 0x00000004

	wmUser          = 0x0400
	wmTrayCallback  = wmUser + 100
	wmDestroy       = 0x0002

	wmLButtonUp     = 0x0202
	wmLButtonDblClk = 0x0203
	wmRButtonUp     = 0x0205
	wmContextMenu   = 0x007B

	mfString    = 0x00000000
	mfGrayed    = 0x00000001
	mfDisabled  = 0x00000002
	mfChecked   = 0x00000008
	mfUnchecked = 0x00000000
	mfPopup     = 0x00000010
	mfSeparator = 0x00000800

	tpmRightButton = 0x0002
	tpmReturnCmd   = 0x0100
)

type notifyIconDataW struct {
	cbSize            uint32
	hWnd              uintptr
	uID               uint32
	uFlags            uint32
	uCallbackMessage  uint32
	hIcon             uintptr
	szTip             [128]uint16
	dwState           uint32
	dwStateMask       uint32
	szInfo            [256]uint16
	uTimeoutOrVersion uint32
	szInfoTitle       [64]uint16
	dwInfoFlags       uint32
	guidItem          [16]byte
	hBalloonIcon      uintptr
}

type iconInfo struct {
	fIcon    int32
	xHotspot uint32
	yHotspot uint32
	hbmMask  uintptr
	hbmColor uintptr
}

type rect struct {
	left, top, right, bottom int32
}

type point struct {
	x, y int32
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

type msg struct {
	hwnd     uintptr
	message  uint32
	wParam   uintptr
	lParam   uintptr
	time     uint32
	pt       point
	lPrivate uint32
}

var (
	globalTrayManager *TrayManager
	wmTaskbarCreated  uint32
)

// TrayManager manages the native Windows Taskbar notification icon and interactive context menu.
type TrayManager struct {
	mu           sync.Mutex
	cfg          *config.AppConfig
	claimMgr     *claim.ClaimManager
	gamesStore   *games.SessionStore
	overlayMgr   *games.OverlayManager
	tracker      *games.GameTracker
	indexer      *indexer.StorageIndexer
	hwnd         uintptr
	hIcon        uintptr
	stopChan     chan struct{}
	running      bool
}

// NewTrayManager creates a Windows taskbar tray manager for the given Otix node.
func NewTrayManager(
	cfg *config.AppConfig,
	claimMgr *claim.ClaimManager,
	gamesStore *games.SessionStore,
	overlayMgr *games.OverlayManager,
	tracker *games.GameTracker,
	idx *indexer.StorageIndexer,
) *TrayManager {
	tm := &TrayManager{
		cfg:        cfg,
		claimMgr:   claimMgr,
		gamesStore: gamesStore,
		overlayMgr: overlayMgr,
		tracker:    tracker,
		indexer:    idx,
		stopChan:   make(chan struct{}),
	}
	globalTrayManager = tm
	return tm
}

// Start spawns the taskbar tray message loop on a dedicated OS thread.
func (tm *TrayManager) Start() {
	tm.mu.Lock()
	if tm.running {
		tm.mu.Unlock()
		return
	}
	tm.running = true
	tm.mu.Unlock()

	go tm.runTrayThread()
}

// Stop cleanly deletes the tray icon from the Windows taskbar and closes the message window.
func (tm *TrayManager) Stop() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if !tm.running {
		return
	}
	tm.running = false
	close(tm.stopChan)

	if tm.hwnd != 0 {
		tm.removeTrayIcon()
		procPostMessageW.Call(tm.hwnd, wmDestroy, 0, 0)
	}
	if tm.hIcon != 0 {
		procDestroyIcon.Call(tm.hIcon)
		tm.hIcon = 0
	}
}

// UpdateTooltip refreshes the taskbar tray tooltip with latest node status and server name.
func (tm *TrayManager) UpdateTooltip() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if tm.hwnd == 0 {
		return
	}
	tm.modifyTrayIconTooltip()
}

func (tm *TrayManager) runTrayThread() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	// Ensure tray thread attaches to the interactive "Default" desktop
	desktopDefault, _ := syscall.UTF16PtrFromString("Default")
	hDefault, _, _ := procOpenDesktopW.Call(
		uintptr(unsafe.Pointer(desktopDefault)),
		0,
		0,
		0x01FF, // DESKTOP_ALL_ACCESS
	)
	if hDefault != 0 {
		procSetThreadDesktop.Call(hDefault)
	}

	// Register TaskbarCreated message in case Windows Explorer restarts
	tbMsg, _ := syscall.UTF16PtrFromString("TaskbarCreated")
	retTb, _, _ := procRegisterWindowMessageW.Call(uintptr(unsafe.Pointer(tbMsg)))
	wmTaskbarCreated = uint32(retTb)

	hInst, _, _ := procGetModuleHandleW.Call(0)
	className, _ := syscall.UTF16PtrFromString(fmt.Sprintf("OtixNodeTrayClass_%d", tm.cfg.Server.Port))

	wcex := wndClassExW{
		cbSize:      uint32(unsafe.Sizeof(wndClassExW{})),
		lpfnWndProc: syscall.NewCallback(trayWndProc),
		hInstance:   hInst,
		lpszClassName: className,
	}

	procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wcex)))

	wTitle, _ := syscall.UTF16PtrFromString(fmt.Sprintf("Otix Node Tray %d", tm.cfg.Server.Port))
	hwndRet, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(wTitle)),
		0, // Hidden window
		0, 0, 0, 0,
		0, 0, hInst, 0,
	)

	if hwndRet == 0 {
		fmt.Printf("[Tray] Warning: failed to create tray window for port %d\n", tm.cfg.Server.Port)
		return
	}

	tm.mu.Lock()
	tm.hwnd = hwndRet
	tm.hIcon = tm.loadOrGenerateIcon(hInst)
	tm.mu.Unlock()

	tm.addTrayIcon()
	fmt.Printf("[Tray] Taskbar tray icon registered for %s (Port %d)\n", tm.cfg.Server.Name, tm.cfg.Server.Port)

	var m msg
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(ret) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}

	tm.removeTrayIcon()
}

func (tm *TrayManager) loadOrGenerateIcon(hInst uintptr) uintptr {
	// 1. Try loading icon resource ID 1 embedded via goversioninfo
	hIconRes, _, _ := procLoadIconW.Call(hInst, uintptr(1))
	if hIconRes != 0 {
		return hIconRes
	}

	// 2. Try extracting embedded icon from current executable
	var exePathBuf [1024]uint16
	procGetModuleFileNameW.Call(0, uintptr(unsafe.Pointer(&exePathBuf[0])), uintptr(len(exePathBuf)))
	hIconExt, _, _ := procExtractIconW.Call(hInst, uintptr(unsafe.Pointer(&exePathBuf[0])), 0)
	if hIconExt != 0 && hIconExt != 1 {
		return hIconExt
	}

	// 3. Try creating icon from embedded white tray PNG
	if len(embeddedWhiteTrayIconPNG) > 0 {
		hIconPng, _, _ := procCreateIconFromResourceEx.Call(
			uintptr(unsafe.Pointer(&embeddedWhiteTrayIconPNG[0])),
			uintptr(len(embeddedWhiteTrayIconPNG)),
			1,          // fIcon = TRUE
			0x00030000, // dwVersion (Windows standard icon format)
			0, 0,       // cx, cy (0 = use source size)
			0,          // LR_DEFAULTCOLOR
		)
		if hIconPng != 0 {
			return hIconPng
		}
	}

	// 4. Fallback: Generate a crisp white Otix mark in memory (16x16)
	hdcScreen, _, _ := procCreateCompatibleDC.Call(0)
	if hdcScreen != 0 {
		hColorBmp, _, _ := procCreateCompatibleBitmap.Call(hdcScreen, 16, 16)
		hMaskBmp, _, _ := procCreateBitmap.Call(16, 16, 1, 1, 0)

		if hColorBmp != 0 && hMaskBmp != 0 {
			hOldBmp, _, _ := procSelectObject.Call(hdcScreen, hColorBmp)

			// Clean white Otix mark (BGR: 0x00FFFFFF)
			whiteBrush, _, _ := procCreateSolidBrush.Call(uintptr(0x00FFFFFF))
			rDot := rect{3, 3, 13, 13}
			procFillRect.Call(hdcScreen, uintptr(unsafe.Pointer(&rDot)), whiteBrush)
			procDeleteObject.Call(whiteBrush)

			procSelectObject.Call(hdcScreen, hOldBmp)
			procDeleteDC.Call(hdcScreen)

			ii := iconInfo{
				fIcon:    1,
				hbmMask:  hMaskBmp,
				hbmColor: hColorBmp,
			}
			hIconNew, _, _ := procCreateIconIndirect.Call(uintptr(unsafe.Pointer(&ii)))

			procDeleteObject.Call(hColorBmp)
			procDeleteObject.Call(hMaskBmp)

			if hIconNew != 0 {
				return hIconNew
			}
		} else {
			procDeleteDC.Call(hdcScreen)
		}
	}

	// 5. Fallback: standard application icon
	hDefault, _, _ := procLoadIconW.Call(0, 32512) // IDI_APPLICATION
	return hDefault
}

func (tm *TrayManager) makeTooltipText() string {
	name := tm.cfg.Server.Name
	if strings.TrimSpace(name) == "" {
		name = fmt.Sprintf("Node:%d", tm.cfg.Server.Port)
	}
	status := "Online"
	if tm.claimMgr != nil && tm.claimMgr.Status().Claimed {
		status = "Linked"
	}
	tip := fmt.Sprintf("Otix Node: %s (Port %d) - %s", name, tm.cfg.Server.Port, status)
	if len(tip) > 120 {
		tip = tip[:120]
	}
	return tip
}

func (tm *TrayManager) addTrayIcon() {
	if tm.hwnd == 0 {
		return
	}
	tipStr := tm.makeTooltipText()
	tipU16, _ := syscall.UTF16FromString(tipStr)

	var nid notifyIconDataW
	nid.cbSize = uint32(unsafe.Sizeof(nid))
	nid.hWnd = tm.hwnd
	nid.uID = uint32(tm.cfg.Server.Port)
	nid.uFlags = nifMessage | nifIcon | nifTip
	nid.uCallbackMessage = wmTrayCallback
	nid.hIcon = tm.hIcon
	copy(nid.szTip[:], tipU16)

	ret, _, _ := procShell_NotifyIconW.Call(nimAdd, uintptr(unsafe.Pointer(&nid)))
	if ret == 0 {
		// Fallback for shell versions expecting V3 or V2 size
		nid.cbSize = 952
		ret, _, _ = procShell_NotifyIconW.Call(nimAdd, uintptr(unsafe.Pointer(&nid)))
		if ret == 0 {
			nid.cbSize = 504
			procShell_NotifyIconW.Call(nimAdd, uintptr(unsafe.Pointer(&nid)))
		}
	}
	nid.uTimeoutOrVersion = 4
	procShell_NotifyIconW.Call(nimSetVersion, uintptr(unsafe.Pointer(&nid)))
}

func (tm *TrayManager) modifyTrayIconTooltip() {
	if tm.hwnd == 0 {
		return
	}
	tipStr := tm.makeTooltipText()
	tipU16, _ := syscall.UTF16FromString(tipStr)

	var nid notifyIconDataW
	nid.cbSize = uint32(unsafe.Sizeof(nid))
	nid.hWnd = tm.hwnd
	nid.uID = uint32(tm.cfg.Server.Port)
	nid.uFlags = nifTip
	copy(nid.szTip[:], tipU16)

	procShell_NotifyIconW.Call(nimModify, uintptr(unsafe.Pointer(&nid)))
}

func (tm *TrayManager) removeTrayIcon() {
	if tm.hwnd == 0 {
		return
	}
	var nid notifyIconDataW
	nid.cbSize = uint32(unsafe.Sizeof(nid))
	nid.hWnd = tm.hwnd
	nid.uID = uint32(tm.cfg.Server.Port)

	procShell_NotifyIconW.Call(nimDelete, uintptr(unsafe.Pointer(&nid)))
}

func trayWndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	switch uint32(msg) {
	case wmTrayCallback:
		const (
			ninSelect    = 0x0400 // WM_USER
			ninKeySelect = 0x0401 // WM_USER + 1
		)
		evt := uint32(lParam & 0xFFFF)
		switch evt {
		case wmLButtonUp, wmLButtonDblClk, ninSelect, ninKeySelect:
			if globalTrayManager != nil {
				globalTrayManager.openWebUI()
			}
			return 0

		case wmRButtonUp, wmContextMenu:
			if globalTrayManager != nil {
				x := int32(int16(wParam & 0xFFFF))
				y := int32(int16((wParam >> 16) & 0xFFFF))
				globalTrayManager.showContextMenu(x, y)
			}
			return 0
		}

	default:
		if wmTaskbarCreated != 0 && uint32(msg) == wmTaskbarCreated {
			// Windows Explorer restarted: restore tray icon
			if globalTrayManager != nil {
				globalTrayManager.addTrayIcon()
			}
			return 0
		}
	}

	ret, _, _ := procDefWindowProcW.Call(hwnd, msg, wParam, lParam)
	return ret
}

func (tm *TrayManager) openWebUI(pathSuffix ...string) {
	suffix := ""
	if len(pathSuffix) > 0 {
		suffix = pathSuffix[0]
	}
	url := fmt.Sprintf("http://127.0.0.1:%d%s", tm.cfg.Server.Port, suffix)
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x08000000,
		HideWindow:    true,
	}
	if err := cmd.Start(); err != nil {
		expCmd := exec.Command("explorer.exe", url)
		expCmd.SysProcAttr = &syscall.SysProcAttr{
			CreationFlags: 0x08000000,
			HideWindow:    true,
		}
		_ = expCmd.Start()
	}
}

func (tm *TrayManager) showContextMenu(cursorX, cursorY int32) {
	tm.mu.Lock()
	hwnd := tm.hwnd
	cfg := tm.cfg
	overlayMgr := tm.overlayMgr
	gamesStore := tm.gamesStore
	idx := tm.indexer
	tm.mu.Unlock()

	if hwnd == 0 {
		return
	}

	var pt point
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	if pt.x == 0 && pt.y == 0 && (cursorX != 0 || cursorY != 0) {
		pt.x = cursorX
		pt.y = cursorY
	}

	// Crucial Win32 focus handling so popup closes on click away
	procSetForegroundWindow.Call(hwnd)

	hMenu, _, _ := procCreatePopupMenu.Call()
	if hMenu == 0 {
		return
	}
	defer procDestroyMenu.Call(hMenu)

	// Item IDs
	const (
		idHeader     = 1000
		idDashboard  = 1001
		idSettings   = 1002
		idRescan     = 1003
		idStorageDir = 1004
		idExit       = 1005

		idOverlayToggle = 2000
		idCornerTopWide = 2010
		idCornerBotWide = 2011
		idCornerTopR    = 2012
		idCornerTopL    = 2013
		idCornerBotR    = 2014
		idCornerBotL    = 2015

		idMonAuto       = 2020
		idMonBase       = 2030 // 2030 + idx
	)

	// 1. Header item: Node Name & Port (Disabled title)
	headerText, _ := syscall.UTF16FromString(fmt.Sprintf("● %s (Port %d)", cfg.Server.Name, cfg.Server.Port))
	procAppendMenuW.Call(hMenu, uintptr(mfString|mfDisabled|mfGrayed), uintptr(idHeader), uintptr(unsafe.Pointer(&headerText[0])))

	// Separator
	procAppendMenuW.Call(hMenu, uintptr(mfSeparator), 0, 0)

	// 2. Open Web Dashboard
	dashText, _ := syscall.UTF16FromString("Open Web Dashboard")
	procAppendMenuW.Call(hMenu, uintptr(mfString), uintptr(idDashboard), uintptr(unsafe.Pointer(&dashText[0])))

	// 3. Node Settings...
	settText, _ := syscall.UTF16FromString("Node Settings...")
	procAppendMenuW.Call(hMenu, uintptr(mfString), uintptr(idSettings), uintptr(unsafe.Pointer(&settText[0])))

	// Separator
	procAppendMenuW.Call(hMenu, uintptr(mfSeparator), 0, 0)

	// 4. Game HUD Overlay Submenu
	var ov games.OverlaySettings
	if gamesStore != nil {
		ov = gamesStore.GetOverlaySettings()
	}

	hOverlayMenu, _, _ := procCreatePopupMenu.Call()

	// Overlay Enabled toggle
	ovToggleFlags := uintptr(mfString)
	if ov.Enabled {
		ovToggleFlags |= mfChecked
	}
	ovToggleText, _ := syscall.UTF16FromString("HUD Overlay Active")
	procAppendMenuW.Call(hOverlayMenu, ovToggleFlags, uintptr(idOverlayToggle), uintptr(unsafe.Pointer(&ovToggleText[0])))

	procAppendMenuW.Call(hOverlayMenu, uintptr(mfSeparator), 0, 0)

	// Position Submenu
	hPosMenu, _, _ := procCreatePopupMenu.Call()
	addPosItem := func(id uintptr, label, cornerVal string) {
		flags := uintptr(mfString)
		if ov.Corner == cornerVal {
			flags |= mfChecked
		}
		uStr, _ := syscall.UTF16FromString(label)
		procAppendMenuW.Call(hPosMenu, flags, id, uintptr(unsafe.Pointer(&uStr[0])))
	}
	addPosItem(idCornerTopWide, "Top Wide (Bar)", "top-wide")
	addPosItem(idCornerBotWide, "Bottom Wide (Bar)", "bottom-wide")
	addPosItem(idCornerTopR, "Top Right", "top-right")
	addPosItem(idCornerTopL, "Top Left", "top-left")
	addPosItem(idCornerBotR, "Bottom Right", "bottom-right")
	addPosItem(idCornerBotL, "Bottom Left", "bottom-left")

	posText, _ := syscall.UTF16FromString("Position")
	procAppendMenuW.Call(hOverlayMenu, uintptr(mfPopup), hPosMenu, uintptr(unsafe.Pointer(&posText[0])))

	// Monitor Submenu
	hMonMenu, _, _ := procCreatePopupMenu.Call()
	autoFlags := uintptr(mfString)
	if ov.Monitor == "" || ov.Monitor == "auto" {
		autoFlags |= mfChecked
	}
	autoText, _ := syscall.UTF16FromString("Auto (Follow Active Game)")
	procAppendMenuW.Call(hMonMenu, autoFlags, uintptr(idMonAuto), uintptr(unsafe.Pointer(&autoText[0])))

	var mons []games.MonitorInfo
	if overlayMgr != nil {
		mons = overlayMgr.GetAvailableMonitors()
	}
	for i, m := range mons {
		if m.ID == "auto" {
			continue
		}
		monFlags := uintptr(mfString)
		if ov.Monitor == m.ID {
			monFlags |= mfChecked
		}
		monLabel, _ := syscall.UTF16FromString(m.Name)
		procAppendMenuW.Call(hMonMenu, monFlags, uintptr(idMonBase+i), uintptr(unsafe.Pointer(&monLabel[0])))
	}

	monText, _ := syscall.UTF16FromString("Display Monitor")
	procAppendMenuW.Call(hOverlayMenu, uintptr(mfPopup), hMonMenu, uintptr(unsafe.Pointer(&monText[0])))

	overlaySubText, _ := syscall.UTF16FromString("Game HUD Overlay")
	procAppendMenuW.Call(hMenu, uintptr(mfPopup), hOverlayMenu, uintptr(unsafe.Pointer(&overlaySubText[0])))

	// Separator
	procAppendMenuW.Call(hMenu, uintptr(mfSeparator), 0, 0)

	// 5. Rescan Libraries Now
	scanText, _ := syscall.UTF16FromString("Rescan Storage Libraries")
	procAppendMenuW.Call(hMenu, uintptr(mfString), uintptr(idRescan), uintptr(unsafe.Pointer(&scanText[0])))

	// 6. Open Storage Folder
	folderText, _ := syscall.UTF16FromString("Open Storage Folder")
	procAppendMenuW.Call(hMenu, uintptr(mfString), uintptr(idStorageDir), uintptr(unsafe.Pointer(&folderText[0])))

	// Separator
	procAppendMenuW.Call(hMenu, uintptr(mfSeparator), 0, 0)

	// 7. Close Otix Node
	exitText, _ := syscall.UTF16FromString("Close Otix Node")
	procAppendMenuW.Call(hMenu, uintptr(mfString), uintptr(idExit), uintptr(unsafe.Pointer(&exitText[0])))

	// Track popup menu
	chosen, _, _ := procTrackPopupMenu.Call(
		hMenu,
		uintptr(tpmRightButton|tpmReturnCmd),
		uintptr(pt.x),
		uintptr(pt.y),
		0,
		hwnd,
		0,
	)

	// Microsoft KB139526: Post WM_NULL to force task switch and ensure clean popup dismissal
	procPostMessageW.Call(hwnd, 0, 0, 0)

	// Handle selection
	switch chosen {
	case idDashboard:
		tm.openWebUI()

	case idSettings:
		tm.openWebUI("#settings")

	case idOverlayToggle:
		if gamesStore != nil {
			ov.Enabled = !ov.Enabled
			_ = gamesStore.SaveOverlaySettings(ov)
			if overlayMgr != nil {
				overlayMgr.ApplySettings(ov)
			}
		}

	case idCornerTopWide:
		tm.applyOverlayCorner("top-wide")
	case idCornerBotWide:
		tm.applyOverlayCorner("bottom-wide")
	case idCornerTopR:
		tm.applyOverlayCorner("top-right")
	case idCornerTopL:
		tm.applyOverlayCorner("top-left")
	case idCornerBotR:
		tm.applyOverlayCorner("bottom-right")
	case idCornerBotL:
		tm.applyOverlayCorner("bottom-left")

	case idMonAuto:
		tm.applyOverlayMonitor("auto")

	case idRescan:
		if idx != nil {
			go idx.ScanAll()
		}

	case idStorageDir:
		storagePath := cfg.ResolveStorageDir()
		abs, err := filepath.Abs(storagePath)
		if err == nil {
			_ = os.MkdirAll(abs, 0755)
			cmd := exec.Command("explorer.exe", abs)
			cmd.SysProcAttr = &syscall.SysProcAttr{
				CreationFlags: 0x08000000,
				HideWindow:    true,
			}
			_ = cmd.Start()
		}

	case idExit:
		tm.Stop()
		os.Exit(0)

	default:
		// Check monitor dynamic IDs
		if chosen >= idMonBase && int(chosen-idMonBase) < len(mons) {
			targetMon := mons[chosen-idMonBase]
			tm.applyOverlayMonitor(targetMon.ID)
		}
	}
}

func (tm *TrayManager) applyOverlayCorner(corner string) {
	if tm.gamesStore == nil {
		return
	}
	ov := tm.gamesStore.GetOverlaySettings()
	ov.Corner = corner
	_ = tm.gamesStore.SaveOverlaySettings(ov)
	if tm.overlayMgr != nil {
		tm.overlayMgr.ApplySettings(ov)
	}
}

func (tm *TrayManager) applyOverlayMonitor(monID string) {
	if tm.gamesStore == nil {
		return
	}
	ov := tm.gamesStore.GetOverlaySettings()
	ov.Monitor = monID
	_ = tm.gamesStore.SaveOverlaySettings(ov)
	if tm.overlayMgr != nil {
		tm.overlayMgr.ApplySettings(ov)
	}
}
