package indexer

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

type Watcher struct {
	mu           sync.Mutex
	fsWatcher    *fsnotify.Watcher
	paths        []string
	onChange     func(changedPath string)
	debounceMap  map[string]*time.Timer
	debounceTime time.Duration
	stopChan     chan struct{}
	stopped      bool
}

func NewWatcher(onChange func(changedPath string)) (*Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("failed to create fsnotify watcher: %w", err)
	}

	w := &Watcher{
		fsWatcher:    fsw,
		onChange:     onChange,
		debounceMap:  make(map[string]*time.Timer),
		debounceTime: 1500 * time.Millisecond,
		stopChan:     make(chan struct{}),
	}

	go w.eventLoop()
	return w, nil
}

func (w *Watcher) SetPaths(paths []string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Clear current watches
	for _, p := range w.paths {
		_ = w.removeRecursive(p)
	}

	w.paths = paths
	for _, p := range paths {
		if p != "" {
			_ = w.addRecursive(p)
		}
	}
}

func (w *Watcher) addRecursive(root string) error {
	isUNC := strings.HasPrefix(root, `\\`) || strings.HasPrefix(root, "//")
	if isUNC {
		return w.fsWatcher.Add(root)
	}
	return filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			name := d.Name()
			if strings.HasPrefix(name, ".") || NoiseDirectoryNames[strings.ToLower(name)] {
				return filepath.SkipDir
			}
			return w.fsWatcher.Add(path)
		}
		return nil
	})
}

func (w *Watcher) removeRecursive(root string) error {
	isUNC := strings.HasPrefix(root, `\\`) || strings.HasPrefix(root, "//")
	if isUNC {
		return w.fsWatcher.Remove(root)
	}
	return filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			return w.fsWatcher.Remove(path)
		}
		return nil
	})
}

func (w *Watcher) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.stopped {
		return nil
	}
	w.stopped = true
	close(w.stopChan)
	return w.fsWatcher.Close()
}

func (w *Watcher) eventLoop() {
	for {
		select {
		case <-w.stopChan:
			return
		case err, ok := <-w.fsWatcher.Errors:
			if !ok {
				return
			}
			_ = err
		case event, ok := <-w.fsWatcher.Events:
			if !ok {
				return
			}

			// If a new directory was created, add it to the watcher
			if event.Has(fsnotify.Create) {
				if fi, err := filepath.Abs(event.Name); err == nil {
					_ = w.addRecursive(fi)
				}
			}

			// Skip temporary or hidden files
			base := filepath.Base(event.Name)
			if strings.HasPrefix(base, ".") || strings.HasSuffix(base, ".tmp") || strings.HasSuffix(base, ".crdownload") {
				continue
			}

			w.triggerDebounced(event.Name)
		}
	}
}

func (w *Watcher) triggerDebounced(path string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Find root library path for this event
	root := ""
	for _, p := range w.paths {
		if strings.HasPrefix(path, p) {
			root = p
			break
		}
	}
	if root == "" {
		root = path
	}

	if timer, exists := w.debounceMap[root]; exists {
		timer.Stop()
	}

	w.debounceMap[root] = time.AfterFunc(w.debounceTime, func() {
		w.mu.Lock()
		delete(w.debounceMap, root)
		w.mu.Unlock()

		if w.onChange != nil {
			w.onChange(root)
		}
	})
}
