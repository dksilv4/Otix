package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/heartbeat"
	"github.com/dksilv4/otix/node/internal/server"
)

var (
	Version   = "0.1.0"
	BuildTime = "2026-10-27"
)

func openBrowser(targetURL string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", targetURL)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", targetURL)
	case "linux":
		cmd = exec.Command("xdg-open", targetURL)
	default:
		return
	}
	if err := cmd.Start(); err != nil && runtime.GOOS == "windows" {
		_ = exec.Command("explorer.exe", targetURL).Start()
	}
}

func main() {
	configPathFlag := flag.String("config", "", "Path to config.yaml")
	portFlag := flag.Int("port", 0, "Server port (overrides config)")
	versionFlag := flag.Bool("version", false, "Print version and exit")
	openBrowserFlag := flag.Bool("open", true, "Open setup WebUI in default browser on launch")
	headlessFlag := flag.Bool("headless", false, "Run in headless daemon mode (do not open browser)")
	noTrayFlag := flag.Bool("no-tray", false, "Disable taskbar tray notification icon")
	flag.Parse()

	if *versionFlag {
		fmt.Printf("Otix Node v%s (%s)\n", Version, BuildTime)
		os.Exit(0)
	}

	if *headlessFlag {
		_ = os.Setenv("OTIX_HEADLESS", "1")
	}
	if *noTrayFlag {
		_ = os.Setenv("OTIX_NO_TRAY", "1")
	}

	cfg := config.LoadConfig(*configPathFlag)
	if *noTrayFlag || os.Getenv("OTIX_NO_TRAY") == "1" {
		cfg.Server.DisableTray = true
	}

	// Check environment variable for port
	if envPort := os.Getenv("PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			cfg.Server.Port = p
		}
	}
	if *portFlag > 0 {
		cfg.Server.Port = *portFlag
	}
	if cfg.Server.Port <= 0 {
		cfg.Server.Port = 8090
	}

	// Try binding to configured port with SO_REUSEADDR; fallback up to 10 ports if busy
	var listener net.Listener
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)

	for attempt := 0; attempt < 10; attempt++ {
		candidatePort := cfg.Server.Port + attempt
		testAddr := fmt.Sprintf("%s:%d", cfg.Server.Host, candidatePort)
		lc := net.ListenConfig{
			Control: func(network, address string, c syscall.RawConn) error {
				return c.Control(func(fd uintptr) {
					_ = setReuseAddr(fd)
				})
			},
		}
		l, err := lc.Listen(context.Background(), "tcp", testAddr)
		if err == nil {
			listener = l
			cfg.Server.Port = candidatePort
			addr = testAddr
			break
		}
	}
	if listener == nil {
		fmt.Fprintf(os.Stderr, "Server failed: could not bind to %s or next 10 ports\n", addr)
		os.Exit(1)
	}
	defer listener.Close()

	claimMgr := claim.NewClaimManager(cfg)
	hbRunner := heartbeat.NewHeartbeatRunner(cfg, claimMgr)
	srv := server.NewServer(cfg, claimMgr)
	defer srv.Stop()
	srv.SetHeartbeatRunner(hbRunner)
	hbRunner.SetRunningGameProvider(func() interface{} {
		return srv.GamesTracker().GetRunningGame()
	})
	hbRunner.Start()
	defer hbRunner.Stop()

	httpServer := &http.Server{
		Addr:         addr,
		Handler:      srv.Router(),
		ReadTimeout:  30 * time.Minute, // Long timeout for large ISO range streaming
		WriteTimeout: 30 * time.Minute,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown handling
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		fmt.Printf("====================================================\n")
		fmt.Printf("  Otix Node v%s (Go Daemon)\n", Version)
		fmt.Printf("  Server Name: %s\n", cfg.Server.Name)
		fmt.Printf("  Listening:   http://%s\n", addr)
		if claimMgr.IsClaimed() {
			fmt.Printf("  Status:      🟢 Claimed & Linked\n")
		} else {
			fmt.Printf("  Status:      🟡 Unclaimed\n")
			fmt.Printf("  Claim PIN:   %s\n", claimMgr.CurrentCode())
			fmt.Printf("  Setup WebUI: http://%s/\n", addr)
		}
		fmt.Printf("====================================================\n")

		if *openBrowserFlag && !*headlessFlag && os.Getenv("OTIX_HEADLESS") != "1" {
			go func() {
				time.Sleep(250 * time.Millisecond)
				openBrowser(fmt.Sprintf("http://127.0.0.1:%d/", cfg.Server.Port))
			}()
		}

		if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "Server failed: %v\n", err)
			os.Exit(1)
		}
	}()

	<-stopChan
	fmt.Println("\nShutting down Otix Node gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "Server shutdown error: %v\n", err)
	}

	fmt.Println("Otix Node stopped.")
}
