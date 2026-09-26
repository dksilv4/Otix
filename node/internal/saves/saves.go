package saves

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type SaveSnapshot struct {
	SnapshotID string `json:"snapshot_id"`
	GameID     string `json:"game_id"`
	GameTitle  string `json:"game_title"`
	Timestamp  string `json:"timestamp"`
	Filename   string `json:"filename"`
	Filepath   string `json:"filepath"`
	Filesize   int64  `json:"filesize"`
}

type SaveCloudManager struct {
	mu           sync.RWMutex
	baseDir      string
	maxSnapshots int
}

func NewSaveCloudManager(storagePath string, maxSnapshots int) *SaveCloudManager {
	if maxSnapshots <= 0 {
		maxSnapshots = 10
	}
	_ = os.MkdirAll(storagePath, 0755)
	return &SaveCloudManager{
		baseDir:      storagePath,
		maxSnapshots: maxSnapshots,
	}
}

func (sm *SaveCloudManager) SaveSnapshot(gameID, gameTitle string, data []byte, originalFilename string) (*SaveSnapshot, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	gameDir := filepath.Join(sm.baseDir, gameID)
	if err := os.MkdirAll(gameDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create game save dir: %w", err)
	}

	now := time.Now().UTC()
	snapshotID := fmt.Sprintf("snap_%s", now.Format("20060102_150405"))
	saveFilename := fmt.Sprintf("%s_%s", snapshotID, originalFilename)
	targetPath := filepath.Join(gameDir, saveFilename)

	if err := os.WriteFile(targetPath, data, 0644); err != nil {
		return nil, fmt.Errorf("failed to write save file: %w", err)
	}

	sm.pruneSnapshots(gameDir)

	return &SaveSnapshot{
		SnapshotID: snapshotID,
		GameID:     gameID,
		GameTitle:  gameTitle,
		Timestamp:  now.Format(time.RFC3339),
		Filename:   saveFilename,
		Filepath:   targetPath,
		Filesize:   int64(len(data)),
	}, nil
}

func (sm *SaveCloudManager) ListSnapshots(gameID string) []SaveSnapshot {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	gameDir := filepath.Join(sm.baseDir, gameID)
	entries, err := os.ReadDir(gameDir)
	if err != nil {
		return []SaveSnapshot{}
	}

	var snapshots []SaveSnapshot
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "snap_") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}

		parts := strings.SplitN(entry.Name(), "_", 3)
		snapID := entry.Name()
		if len(parts) >= 2 {
			snapID = fmt.Sprintf("%s_%s", parts[0], parts[1])
		}

		snapshots = append(snapshots, SaveSnapshot{
			SnapshotID: snapID,
			GameID:     gameID,
			GameTitle:  gameID,
			Timestamp:  info.ModTime().UTC().Format(time.RFC3339),
			Filename:   entry.Name(),
			Filepath:   filepath.Join(gameDir, entry.Name()),
			Filesize:   info.Size(),
		})
	}

	// Sort newest first
	sort.Slice(snapshots, func(i, j int) bool {
		return snapshots[i].Timestamp > snapshots[j].Timestamp
	})

	return snapshots
}

func (sm *SaveCloudManager) GetSnapshotPath(gameID, snapshotID string) string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	gameDir := filepath.Join(sm.baseDir, gameID)
	entries, err := os.ReadDir(gameDir)
	if err != nil {
		return ""
	}

	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), snapshotID) {
			return filepath.Join(gameDir, entry.Name())
		}
	}
	return ""
}

func (sm *SaveCloudManager) pruneSnapshots(gameDir string) {
	entries, err := os.ReadDir(gameDir)
	if err != nil {
		return
	}

	var snaps []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasPrefix(entry.Name(), "snap_") {
			snaps = append(snaps, entry.Name())
		}
	}

	sort.Strings(snaps)

	if len(snaps) > sm.maxSnapshots {
		toRemove := snaps[:len(snaps)-sm.maxSnapshots]
		for _, name := range toRemove {
			_ = os.Remove(filepath.Join(gameDir, name))
		}
	}
}
