//go:build windows

package games

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/windows/svc"
)

const (
	CaptureServiceName        = "OtixCapture"
	CaptureServiceDisplayName = "Otix Capture Service"
	CaptureServiceDesc        = "Background capture helper for Otix in-game performance overlay"
	CaptureServicePort        = 8093
	CaptureServiceAddr        = "127.0.0.1:8093"
)

// CaptureServer manages running PresentMon under LocalSystem for zero-reboot capture.
type CaptureServer struct {
	mu        sync.Mutex
	activeCmd *exec.Cmd
	server    *http.Server
	collector *PresentMonCollector
}

// NewCaptureServer creates a new instance of CaptureServer.
func NewCaptureServer() *CaptureServer {
	return &CaptureServer{
		collector: NewPresentMonCollector(""),
	}
}

// Start launches the capture HTTP server on 127.0.0.1:8093.
func (s *CaptureServer) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/stream", s.handleStream)
	mux.HandleFunc("/stop", s.handleStop)

	s.server = &http.Server{
		Addr:         CaptureServiceAddr,
		Handler:      mux,
		ReadTimeout:  0, // Infinite read/write for live streaming
		WriteTimeout: 0,
	}

	listener, err := net.Listen("tcp", CaptureServiceAddr)
	if err != nil {
		return fmt.Errorf("failed to bind capture service on %s: %w", CaptureServiceAddr, err)
	}

	go func() {
		if err := s.server.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Printf("[OtixCapture] Server error: %v\n", err)
		}
	}()

	fmt.Printf("[OtixCapture] Running on http://%s\n", CaptureServiceAddr)
	return nil
}

// Stop shuts down the capture HTTP server and any active PresentMon session.
func (s *CaptureServer) Stop() {
	s.mu.Lock()
	if s.activeCmd != nil && s.activeCmd.Process != nil {
		_ = s.activeCmd.Process.Kill()
		_ = s.activeCmd.Wait()
		s.activeCmd = nil
	}
	s.mu.Unlock()

	cleanupInterferingEtwSessions()

	if s.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = s.server.Shutdown(ctx)
	}
}

func (s *CaptureServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"service": CaptureServiceName,
		"version": "1.0.0",
		"time":    time.Now().UnixMilli(),
	})
}

func (s *CaptureServer) handleStop(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	if s.activeCmd != nil && s.activeCmd.Process != nil {
		_ = s.activeCmd.Process.Kill()
		_ = s.activeCmd.Wait()
		s.activeCmd = nil
	}
	s.mu.Unlock()

	cleanupInterferingEtwSessions()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "stopped",
	})
}

func (s *CaptureServer) handleStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	pidStr := r.URL.Query().Get("pid")
	processName := r.URL.Query().Get("name")
	var pid int
	if pidStr != "" && pidStr != "all" && pidStr != "0" {
		var err error
		pid, err = strconv.Atoi(pidStr)
		if err != nil || pid < 0 {
			http.Error(w, "Invalid or missing pid", http.StatusBadRequest)
			return
		}
	}

	exe := s.collector.FindPresentMon()
	if exe == "" {
		http.Error(w, "PresentMon.exe not found on system", http.StatusInternalServerError)
		return
	}

	s.mu.Lock()
	if s.activeCmd != nil && s.activeCmd.Process != nil {
		_ = s.activeCmd.Process.Kill()
		_ = s.activeCmd.Wait()
		s.activeCmd = nil
	}

	cleanupInterferingEtwSessions()

	args := []string{
		"--output_stdout",
		"--session_name", "OtixPresentMon",
		"--stop_existing_session",
		"--no_console_stats",
	}
	if pid > 0 {
		args = append(args, "--process_id", strconv.Itoa(pid))
	}
	if processName != "" && strings.HasSuffix(strings.ToLower(processName), ".exe") {
		args = append(args, "--process_name", processName)
	}

	cmd := exec.Command(exe, args...)
	configureCmdForProcess(cmd)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		s.mu.Unlock()
		http.Error(w, fmt.Sprintf("Failed to open PresentMon stdout: %v", err), http.StatusInternalServerError)
		return
	}
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		s.mu.Unlock()
		http.Error(w, fmt.Sprintf("Failed to start PresentMon: %v", err), http.StatusInternalServerError)
		return
	}

	s.activeCmd = cmd
	s.mu.Unlock()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Transfer-Encoding", "chunked")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	// Drain stderr in background to avoid pipe blocking
	go func() {
		if stderr != nil {
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				// discard or log
			}
		}
	}()

	clientDone := r.Context().Done()
	streamDone := make(chan struct{})

	go func() {
		select {
		case <-clientDone:
			s.mu.Lock()
			if s.activeCmd == cmd && cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
			s.mu.Unlock()
		case <-streamDone:
		}
	}()

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if _, err := fmt.Fprintf(w, "%s\n", line); err != nil {
			break
		}
		flusher.Flush()
	}

	close(streamDone)

	s.mu.Lock()
	if s.activeCmd == cmd {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
		s.activeCmd = nil
	}
	s.mu.Unlock()
}

// captureService implements svc.Handler for Windows Service Control Manager.
type captureService struct {
	server *CaptureServer
}

func (m *captureService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown
	changes <- svc.Status{State: svc.StartPending}

	m.server = NewCaptureServer()
	if err := m.server.Start(); err != nil {
		fmt.Printf("[OtixCapture] Failed to start server: %v\n", err)
		return true, 1
	}

	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}

	for c := range r {
		switch c.Cmd {
		case svc.Interrogate:
			changes <- c.CurrentStatus
		case svc.Stop, svc.Shutdown:
			changes <- svc.Status{State: svc.StopPending}
			m.server.Stop()
			return false, 0
		}
	}
	return false, 0
}

// RunCaptureServiceMode starts the service either under SCM or in console mode.
func RunCaptureServiceMode(debug bool) error {
	isSvc, err := svc.IsWindowsService()
	if err != nil {
		return fmt.Errorf("failed to determine service status: %w", err)
	}

	if isSvc && !debug {
		return svc.Run(CaptureServiceName, &captureService{})
	}

	// Interactive / console mode
	fmt.Printf("[OtixCapture] Running interactively (Console/Debug mode)...\n")
	server := NewCaptureServer()
	if err := server.Start(); err != nil {
		return err
	}
	defer server.Stop()

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)
	<-stopChan
	fmt.Println("\n[OtixCapture] Stopping interactive capture server...")
	return nil
}

// IsCaptureServiceAvailable tests whether the capture service is listening on localhost.
func IsCaptureServiceAvailable() bool {
	client := http.Client{Timeout: 350 * time.Millisecond}
	resp, err := client.Get(fmt.Sprintf("http://%s/health", CaptureServiceAddr))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// StartServiceStream requests the local capture service to start streaming PresentMon output.
func StartServiceStream(pid int, processName string) (io.ReadCloser, error) {
	reqUrl := fmt.Sprintf("http://%s/stream?pid=%d&name=%s", CaptureServiceAddr, pid, url.QueryEscape(processName))
	resp, err := http.Get(reqUrl)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to capture service: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("capture service error (%d): %s", resp.StatusCode, string(body))
	}
	return resp.Body, nil
}

// StopServiceCapture requests the local capture service to stop capturing.
func StopServiceCapture() {
	client := http.Client{Timeout: 1 * time.Second}
	resp, err := client.Post(fmt.Sprintf("http://%s/stop", CaptureServiceAddr), "application/json", nil)
	if err == nil && resp != nil {
		_ = resp.Body.Close()
	}
}
