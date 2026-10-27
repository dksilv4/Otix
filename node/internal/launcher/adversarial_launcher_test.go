package launcher

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

// ============================================================================
// 1. ADVERSARIAL TEST: PROCESS EXIT CODE TRAPPING
// ============================================================================

func TestAdversarialExitCodeTrapping_MockAndReal(t *testing.T) {
	ctx := context.Background()

	testCases := []struct {
		name          string
		exitCode      int
		waitErr       error
		expectedState ProcessState
		expectedCode  int
		expectErrMsg  bool
	}{
		{
			name:          "Clean exit code 0",
			exitCode:      0,
			waitErr:       nil,
			expectedState: StateTerminated,
			expectedCode:  0,
			expectErrMsg:  false,
		},
		{
			name:          "Crash exit code 1",
			exitCode:      1,
			waitErr:       errors.New("exit status 1"),
			expectedState: StateFailed,
			expectedCode:  1,
			expectErrMsg:  true,
		},
		{
			name:          "Crash exit code 137 (OOM / SIGKILL standard bash exit code)",
			exitCode:      137,
			waitErr:       errors.New("exit status 137"),
			expectedState: StateFailed,
			expectedCode:  137,
			expectErrMsg:  true,
		},
		{
			name:          "Terminated by SIGKILL (signal 9 -> ExitCode -1 in Go)",
			exitCode:      -1,
			waitErr:       errors.New("signal: killed"),
			expectedState: StateFailed,
			expectedCode:  -1,
			expectErrMsg:  true,
		},
		{
			name:          "Terminated by SIGSEGV (signal 11 -> ExitCode -1 in Go)",
			exitCode:      -1,
			waitErr:       errors.New("signal: segmentation fault"),
			expectedState: StateFailed,
			expectedCode:  -1,
			expectErrMsg:  true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mockRunner := NewMockCommandRunner()
			mockRunner.NextExitCode = tc.exitCode
			mockRunner.NextWaitErr = tc.waitErr

			launcher := NewLauncher(WithCommandRunner(mockRunner))

			session, err := launcher.LaunchExecutable(ctx, LaunchRequest{
				GameID:         "test-game-" + tc.name,
				Title:          "Test Game",
				ExecutablePath: "/usr/bin/game",
			})
			if err != nil {
				t.Fatalf("unexpected launch error: %v", err)
			}

			// Find handle and trigger termination
			launcher.mu.Lock()
			handle := launcher.activeProcesses[session.ID]
			launcher.mu.Unlock()

			if handle == nil {
				t.Fatal("expected process handle in activeProcesses")
			}

			if mockHandle, ok := handle.(*mockProcessHandle); ok {
				mockHandle.TriggerExit()
			} else {
				t.Fatal("expected handle to be mockProcessHandle")
			}

			// Wait for async termination goroutine to end session
			var endedSess *ProcessSession
			deadline := time.Now().Add(500 * time.Millisecond)
			for time.Now().Before(deadline) {
				s, found := launcher.GetSession(session.ID)
				if found && !s.IsActive() {
					endedSess = s
					break
				}
				time.Sleep(10 * time.Millisecond)
			}

			if endedSess == nil {
				t.Fatalf("session %s did not terminate in time", session.ID)
			}

			if endedSess.State != tc.expectedState {
				t.Errorf("expected state %s, got %s", tc.expectedState, endedSess.State)
			}
			if endedSess.ExitCode != tc.expectedCode {
				t.Errorf("expected exit code %d, got %d", tc.expectedCode, endedSess.ExitCode)
			}
			if tc.expectErrMsg && endedSess.ErrorMessage == "" {
				t.Errorf("expected error message for failure exit, got empty")
			}
			if !tc.expectErrMsg && endedSess.ErrorMessage != "" {
				t.Errorf("expected empty error message for clean exit, got %s", endedSess.ErrorMessage)
			}
		})
	}
}

func TestAdversarialExitCodeTrapping_RealOSProcesses(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("skipping Unix shell tests on Windows")
	}

	ctx := context.Background()
	shPath, err := exec.LookPath("sh")
	if err != nil {
		t.Skip("sh not available on host")
	}

	testCases := []struct {
		name          string
		args          []string
		expectedState ProcessState
		checkCode     func(t *testing.T, code int, msg string)
	}{
		{
			name:          "Real OS clean exit (exit 0)",
			args:          []string{"-c", "exit 0"},
			expectedState: StateTerminated,
			checkCode: func(t *testing.T, code int, msg string) {
				if code != 0 {
					t.Errorf("expected exit code 0, got %d", code)
				}
			},
		},
		{
			name:          "Real OS crash exit (exit 1)",
			args:          []string{"-c", "exit 1"},
			expectedState: StateFailed,
			checkCode: func(t *testing.T, code int, msg string) {
				if code != 1 {
					t.Errorf("expected exit code 1, got %d", code)
				}
			},
		},
		{
			name:          "Real OS crash exit (exit 137)",
			args:          []string{"-c", "exit 137"},
			expectedState: StateFailed,
			checkCode: func(t *testing.T, code int, msg string) {
				if code != 137 {
					t.Errorf("expected exit code 137, got %d", code)
				}
			},
		},
		{
			name:          "Real OS SIGKILL self-termination",
			args:          []string{"-c", "kill -9 $$"},
			expectedState: StateFailed,
			checkCode: func(t *testing.T, code int, msg string) {
				// Go os/exec returns -1 for signal terminations
				if code != -1 {
					t.Errorf("expected exit code -1 for SIGKILL in Go, got %d", code)
				}
				if !strings.Contains(strings.ToLower(msg), "killed") {
					t.Errorf("expected message to contain 'killed', got %q", msg)
				}
			},
		},
		{
			name:          "Real OS SIGSEGV self-termination",
			args:          []string{"-c", "kill -11 $$"},
			expectedState: StateFailed,
			checkCode: func(t *testing.T, code int, msg string) {
				if code != -1 {
					t.Errorf("expected exit code -1 for SIGSEGV in Go, got %d", code)
				}
				if !strings.Contains(strings.ToLower(msg), "segmentation fault") {
					t.Errorf("expected message to contain 'segmentation fault', got %q", msg)
				}
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			launcher := NewLauncher(WithCommandRunner(&OSCommandRunner{}))
			session, err := launcher.LaunchExecutable(ctx, LaunchRequest{
				GameID:         "os-test-" + tc.name,
				Title:          "OS Test",
				ExecutablePath: shPath,
				Arguments:      tc.args,
			})
			if err != nil {
				t.Fatalf("unexpected launch error: %v", err)
			}

			var ended *ProcessSession
			deadline := time.Now().Add(3 * time.Second)
			for time.Now().Before(deadline) {
				s, found := launcher.GetSession(session.ID)
				if found && !s.IsActive() {
					ended = s
					break
				}
				time.Sleep(20 * time.Millisecond)
			}

			if ended == nil {
				t.Fatalf("real OS process did not terminate within deadline")
			}

			if ended.State != tc.expectedState {
				t.Errorf("expected state %s, got %s", tc.expectedState, ended.State)
			}
			tc.checkCode(t, ended.ExitCode, ended.ErrorMessage)
		})
	}
}

func TestAdversarialExitCodeTrapping_SpawnError(t *testing.T) {
	ctx := context.Background()
	launcher := NewLauncher(WithCommandRunner(&OSCommandRunner{}))

	missingBin := "/opt/otix/non_existent_binary_directory/definitely_not_a_binary_12345"
	session, err := launcher.LaunchExecutable(ctx, LaunchRequest{
		GameID:         "missing-game",
		Title:          "Missing Game",
		ExecutablePath: missingBin,
	})

	if err == nil {
		t.Fatalf("expected launch error for missing binary, got nil session: %+v", session)
	}

	if !errors.Is(err, ErrProcessLaunchFailed) {
		t.Errorf("expected error wrapping ErrProcessLaunchFailed, got %v", err)
	}

	// Verify no active sessions were registered
	if len(launcher.ActiveSessions()) != 0 {
		t.Errorf("expected 0 active sessions after spawn error, got %d", len(launcher.ActiveSessions()))
	}
}

func TestAdversarialStopSession_Concurrency(t *testing.T) {
	ctx := context.Background()
	mockRunner := NewMockCommandRunner()
	launcher := NewLauncher(WithCommandRunner(mockRunner))

	session, err := launcher.LaunchExecutable(ctx, LaunchRequest{
		GameID:         "stop-game",
		ExecutablePath: "/bin/sleep",
	})
	if err != nil {
		t.Fatalf("unexpected launch error: %v", err)
	}

	// Concurrent StopSession calls on the same session
	var wg sync.WaitGroup
	errs := make([]error, 10)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			errs[idx] = launcher.StopSession(session.ID)
		}(i)
	}
	wg.Wait()

	// At least one call should succeed or gracefully report ended
	ended, found := launcher.GetSession(session.ID)
	if !found {
		t.Fatal("expected session to exist in history")
	}
	if ended.IsActive() {
		t.Fatal("expected session to not be active after StopSession")
	}
}

// ============================================================================
// 2. ADVERSARIAL TEST: SESSION DURATION & CLOCK SKEW
// ============================================================================

func TestAdversarialSessionDuration_ClockSkewBackwards(t *testing.T) {
	// Scenario: Process started, but system clock stepped back by 30 minutes before termination
	start := time.Date(2026, 10, 26, 12, 30, 0, 0, time.UTC)
	endSkewed := time.Date(2026, 10, 26, 12, 0, 0, 0, time.UTC) // 30 minutes earlier!

	session := &ProcessSession{
		ID:              "skewed-session",
		GameID:          "game-skew",
		StartTime:       start,
		EndTime:         &endSkewed,
		DurationSeconds: int(math.Max(0, endSkewed.Sub(start).Seconds())),
		State:           StateTerminated,
	}

	// DurationSeconds was clamped to 0
	if session.DurationSeconds != 0 {
		t.Errorf("expected DurationSeconds 0, got %d", session.DurationSeconds)
	}

	dur := session.Duration()
	mins := session.DurationMinutes()
	playMins := session.PlaytimeMinutes()

	t.Logf("[Clock Skew Anomaly Analysis] DurationSeconds: %d, Duration(): %v, DurationMinutes(): %f, PlaytimeMinutes(): %d",
		session.DurationSeconds, dur, mins, playMins)

	// EMPIRICAL BUG FINDING:
	// If clock skew occurs (end < start), session.Duration() returns negative duration (-30m0s)
	// and session.PlaytimeMinutes() returns negative (-30), despite DurationSeconds being clamped to 0.
	if dur < 0 {
		t.Logf("FINDING CONFIRMED: session.Duration() is negative (%v) when EndTime < StartTime!", dur)
	}
	if playMins < 0 {
		t.Logf("FINDING CONFIRMED: session.PlaytimeMinutes() is negative (%d) when EndTime < StartTime!", playMins)
	}
}

func TestAdversarialSessionDuration_EndTimeEqualsStartTime(t *testing.T) {
	now := time.Now().UTC()
	s := &ProcessSession{
		ID:              "zero-duration-session",
		GameID:          "zero-game",
		StartTime:       now,
		EndTime:         &now,
		DurationSeconds: 0,
		State:           StateTerminated,
	}

	if s.Duration() != 0 {
		t.Errorf("expected 0 duration when endTime == startTime, got %v", s.Duration())
	}
	if s.DurationMinutes() != 0 {
		t.Errorf("expected 0 duration minutes, got %f", s.DurationMinutes())
	}
	if s.PlaytimeMinutes() != 0 {
		t.Errorf("expected 0 playtime minutes, got %d", s.PlaytimeMinutes())
	}
}

func TestAdversarialSessionDuration_MinuteRoundingBoundaries(t *testing.T) {
	testCases := []struct {
		durationSec     int
		expectedMinutes int
		description     string
	}{
		{0, 0, "0s -> 0m"},
		{15, 0, "15s (0.25m) -> 0m"},
		{29, 0, "29s (0.483m) -> 0m"},
		{30, 1, "30s (0.5m) -> 1m (half-up)"},
		{45, 1, "45s (0.75m) -> 1m"},
		{59, 1, "59s (0.983m) -> 1m"},
		{60, 1, "60s (1.0m) -> 1m"},
		{89, 1, "89s (1.483m) -> 1m"},
		{90, 2, "90s (1.5m) -> 2m (half-up)"},
		{119, 2, "119s (1.983m) -> 2m"},
		{120, 2, "120s (2.0m) -> 2m"},
		{149, 2, "149s (2.483m) -> 2m"},
		{150, 3, "150s (2.5m) -> 3m (half-up)"},
	}

	baseTime := time.Date(2026, 10, 26, 12, 0, 0, 0, time.UTC)
	for _, tc := range testCases {
		t.Run(tc.description, func(t *testing.T) {
			endTime := baseTime.Add(time.Duration(tc.durationSec) * time.Second)
			sess := &ProcessSession{
				StartTime: baseTime,
				EndTime:   &endTime,
			}
			playtime := sess.PlaytimeMinutes()
			if playtime != tc.expectedMinutes {
				t.Errorf("[%s] expected %d minutes, got %d (raw minutes: %f)",
					tc.description, tc.expectedMinutes, playtime, sess.DurationMinutes())
			}
		})
	}
}

func TestAdversarialSessionDuration_MultiSessionPersistence(t *testing.T) {
	tmpDir := t.TempDir()
	sessionPath := filepath.Join(tmpDir, "play-sessions.json")
	persister := NewFileSessionPersister(sessionPath)

	// Create 15 historical sessions across 3 games with varied durations
	games := []string{"game-a", "game-b", "game-c"}
	durations := []int{25, 45, 90, 120, 300}

	var sessionsToSave []*ProcessSession
	sessionCount := 0
	baseTime := time.Date(2026, 10, 26, 10, 0, 0, 0, time.UTC)

	for _, g := range games {
		for _, d := range durations {
			start := baseTime.Add(time.Duration(sessionCount*600) * time.Second)
			end := start.Add(time.Duration(d) * time.Second)
			s := &ProcessSession{
				ID:              fmt.Sprintf("sess-%d", sessionCount),
				GameID:          g,
				Title:           "Title " + g,
				ExecutablePath:  "/path/" + g + ".exe",
				PID:             9000 + sessionCount,
				State:           StateTerminated,
				StartTime:       start,
				EndTime:         &end,
				DurationSeconds: d,
				ExitCode:        0,
			}
			sessionsToSave = append(sessionsToSave, s)
			sessionCount++
		}
	}

	// Save to disk
	if err := persister.Save(sessionsToSave); err != nil {
		t.Fatalf("failed to save sessions: %v", err)
	}

	// Reload from persister into a brand new tracker
	trackerReloaded := NewSessionTracker(persister)
	reloaded := trackerReloaded.SessionHistory(100)

	if len(reloaded) != sessionCount {
		t.Fatalf("expected %d reloaded sessions, got %d", sessionCount, len(reloaded))
	}

	// Verify order and integrity
	for i, s := range reloaded {
		if s.ID != fmt.Sprintf("sess-%d", i) {
			t.Errorf("session %d ID mismatch: got %s", i, s.ID)
		}
		expectedDur := durations[i%len(durations)]
		if s.DurationSeconds != expectedDur {
			t.Errorf("session %d expected duration %d, got %d", i, expectedDur, s.DurationSeconds)
		}
	}
}

// ============================================================================
// 3. ADVERSARIAL TEST: EMULATOR COMMAND INJECTION ATTEMPTS
// ============================================================================

func TestAdversarialEmulatorCommandInjection_Payloads(t *testing.T) {
	reg := NewEmulatorRegistry()

	// Malicious ROM filename injection payloads
	maliciousROMs := []struct {
		name    string
		romPath string
	}{
		{"Semicolon command chaining", "game; rm -rf /; .nes"},
		{"Double quotes with flags", `--custom-flag "quoted" .sfc`},
		{"Single quotes with flags", `'--injected' 'arg' .z64`},
		{"Command substitution $()", "game$(whoami).nes"},
		{"Command substitution backticks", "game`whoami`.nes"},
		{"Pipe shell operator", "game | cat /etc/passwd | .nes"},
		{"Background ampersand operator", "game & echo injected & .nes"},
		{"Logical AND operator", "game && touch /tmp/pwned.nes"},
		{"Newline injection", "game\nrm -rf /\n.nes"},
		{"Unclosed quote and semicolon", `"game; echo pwned.nes`},
		{"Environment variable injection", "$PATH/game.nes"},
	}

	profiles := reg.All()

	for _, p := range profiles {
		for _, tc := range maliciousROMs {
			t.Run(fmt.Sprintf("%s/%s", p.ID, tc.name), func(t *testing.T) {
				req := EmulatorLaunchRequest{
					EmulatorID: p.ID,
					ROMPath:    tc.romPath,
					Fullscreen: true,
					ExtraArgs:  []string{"--extra-arg; rm -rf /"},
				}

				inv, err := BuildEmulatorInvocation(p, req)
				if err != nil {
					// Some emulators may require a specific core or platform; if error is core required, provide one
					if errors.Is(err, ErrCoreRequired) && len(p.Cores) > 0 {
						for _, core := range p.Cores {
							req.Core = core
							break
						}
						inv, err = BuildEmulatorInvocation(p, req)
					}
					if err != nil {
						// Profile didn't accept format, which is safe rejection
						return
					}
				}

				// CRITICAL ASSERTION: The malicious ROM path must be contained
				// as an intact discrete element in inv.Args, NOT split across multiple arguments
				var foundROM bool
				for _, arg := range inv.Args {
					if strings.Contains(arg, tc.romPath) {
						foundROM = true
						// The argument must equal the template formatted value, without shell expansion
						t.Logf("[%s] Safely parameterized arg: %q", p.ID, arg)
					}
				}

				if !foundROM {
					t.Errorf("[%s/%s] Expected ROM path to be present in args, got: %v", p.ID, tc.name, inv.Args)
				}

				// Verify ExtraArgs with shell characters are also preserved intact as discrete elements
				var foundExtra bool
				for _, arg := range inv.Args {
					if arg == "--extra-arg; rm -rf /" {
						foundExtra = true
					}
				}
				if !foundExtra {
					t.Errorf("[%s/%s] Expected extra arg to be discrete element, got: %v", p.ID, tc.name, inv.Args)
				}
			})
		}
	}
}

func TestAdversarialEmulatorCommandInjection_RealOSExecSafety(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("skipping Unix exec safety test on Windows")
	}

	echoPath, err := exec.LookPath("echo")
	if err != nil {
		t.Skip("echo not available on host")
	}

	// Verify that passing malicious shell payloads to CommandRunner passes them
	// literally to argv and does NOT interpret them as shell syntax.
	// We create a temporary script or run echo directly.
	tmpDir := t.TempDir()
	canaryFile := filepath.Join(tmpDir, "pwned.txt")

	maliciousROM := fmt.Sprintf("game; touch %s; .nes", canaryFile)

	reg := NewEmulatorRegistry()
	profile, ok := reg.Get("retroarch")
	if !ok {
		t.Fatal("retroarch profile not found")
	}

	req := EmulatorLaunchRequest{
		EmulatorID:     "retroarch",
		ROMPath:        maliciousROM,
		ExecutablePath: echoPath, // replace retroarch with /bin/echo
		Core:           "cores/mesen_libretro.dll",
	}

	inv, err := BuildEmulatorInvocation(profile, req)
	if err != nil {
		t.Fatalf("unexpected invocation build error: %v", err)
	}

	// Launch via real OSCommandRunner
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	runner := &OSCommandRunner{}
	proc, err := runner.Run(ctx, inv.Executable, inv.Args, tmpDir, nil)
	if err != nil {
		t.Fatalf("unexpected OS runner error: %v", err)
	}

	exitCode, waitErr := proc.Wait()
	if waitErr != nil || exitCode != 0 {
		t.Fatalf("echo exited with code %d, err %v", exitCode, waitErr)
	}

	// ASSERTION: The canary file MUST NOT exist!
	// If shell injection occurred, `touch <canaryFile>` would have executed!
	if _, statErr := os.Stat(canaryFile); statErr == nil {
		t.Fatalf("CRITICAL SECURITY VULNERABILITY: Shell command injection succeeded! %s was created", canaryFile)
	}
}
