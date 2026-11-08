package indexer

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
	mu sync.Mutex
}

func OpenStore(dbPath string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create db directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	// Optimize SQLite for high concurrency reads / safe writes
	db.SetMaxOpenConns(1)

	schema := `
	CREATE TABLE IF NOT EXISTS indexed_files (
		id TEXT PRIMARY KEY,
		filename TEXT NOT NULL,
		filepath TEXT NOT NULL UNIQUE,
		relative_path TEXT NOT NULL,
		filesize INTEGER NOT NULL,
		sha256_head TEXT NOT NULL,
		extension TEXT NOT NULL,
		format_category TEXT NOT NULL,
		library_name TEXT NOT NULL,
		game_title TEXT NOT NULL,
		modified_at TEXT NOT NULL,
		mtime_unix INTEGER NOT NULL,
		indexed_at TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_files_library ON indexed_files(library_name);
	CREATE INDEX IF NOT EXISTS idx_files_path ON indexed_files(filepath);

	CREATE TABLE IF NOT EXISTS scan_metadata (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
	`
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to execute indexer schema: %w", err)
	}

	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.db.Close()
}

func (s *Store) LoadAll() (map[string]HostedFile, map[string]int64, error) {
	if s == nil || s.db == nil {
		return make(map[string]HostedFile), make(map[string]int64), nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.Query(`
		SELECT id, filename, filepath, relative_path, filesize, sha256_head,
		       extension, format_category, library_name, game_title, modified_at, mtime_unix
		FROM indexed_files
	`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	files := make(map[string]HostedFile)
	mtimes := make(map[string]int64)

	for rows.Next() {
		var f HostedFile
		var mtimeUnix int64
		if err := rows.Scan(
			&f.ID, &f.Filename, &f.Filepath, &f.RelativePath, &f.Filesize, &f.SHA256Head,
			&f.Extension, &f.FormatCategory, &f.LibraryName, &f.GameTitle, &f.ModifiedAt, &mtimeUnix,
		); err != nil {
			return nil, nil, err
		}
		files[f.ID] = f
		mtimes[f.Filepath] = mtimeUnix
	}

	return files, mtimes, rows.Err()
}

func (s *Store) UpsertFiles(files []HostedFile) error {
	if s == nil || s.db == nil || len(files) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	now := time.Now().UTC().Format(time.RFC3339)
	const chunkSize = 50
	for i := 0; i < len(files); i += chunkSize {
		end := i + chunkSize
		if end > len(files) {
			end = len(files)
		}
		batch := files[i:end]

		var query strings.Builder
		query.WriteString(`
			INSERT INTO indexed_files (
				id, filename, filepath, relative_path, filesize, sha256_head,
				extension, format_category, library_name, game_title, modified_at, mtime_unix, indexed_at
			) VALUES `)

		vals := make([]interface{}, 0, len(batch)*13)
		for idx, f := range batch {
			if idx > 0 {
				query.WriteString(", ")
			}
			query.WriteString("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
			var mtimeUnix int64
			if t, err := time.Parse(time.RFC3339, f.ModifiedAt); err == nil {
				mtimeUnix = t.Unix()
			}
			vals = append(vals,
				f.ID, f.Filename, f.Filepath, f.RelativePath, f.Filesize, f.SHA256Head,
				f.Extension, f.FormatCategory, f.LibraryName, f.GameTitle, f.ModifiedAt, mtimeUnix, now,
			)
		}

		query.WriteString(`
			ON CONFLICT(filepath) DO UPDATE SET
				id = excluded.id,
				filename = excluded.filename,
				relative_path = excluded.relative_path,
				filesize = excluded.filesize,
				sha256_head = excluded.sha256_head,
				extension = excluded.extension,
				format_category = excluded.format_category,
				library_name = excluded.library_name,
				game_title = excluded.game_title,
				modified_at = excluded.modified_at,
				mtime_unix = excluded.mtime_unix,
				indexed_at = excluded.indexed_at
		`)

		if _, err := tx.Exec(query.String(), vals...); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) DeleteMissing(activePaths map[string]bool, libraryName string) (int, error) {
	if s == nil || s.db == nil {
		return 0, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.Query(`SELECT filepath FROM indexed_files WHERE library_name = ?`, libraryName)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var toDelete []string
	for rows.Next() {
		var fp string
		if err := rows.Scan(&fp); err == nil {
			if !activePaths[fp] {
				toDelete = append(toDelete, fp)
			}
		}
	}

	if len(toDelete) == 0 {
		return 0, nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	const deleteBatchSize = 100
	for i := 0; i < len(toDelete); i += deleteBatchSize {
		end := i + deleteBatchSize
		if end > len(toDelete) {
			end = len(toDelete)
		}
		batch := toDelete[i:end]

		placeholders := make([]string, len(batch))
		args := make([]interface{}, len(batch))
		for idx, fp := range batch {
			placeholders[idx] = "?"
			args[idx] = fp
		}
		query := fmt.Sprintf("DELETE FROM indexed_files WHERE filepath IN (%s)", strings.Join(placeholders, ", "))
		if _, err := tx.Exec(query, args...); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return len(toDelete), nil
}

func (s *Store) PruneRemovedLibraries(activeLibNames []string) error {
	if s == nil || s.db == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(activeLibNames) == 0 {
		_, err := s.db.Exec(`DELETE FROM indexed_files`)
		return err
	}

	placeholders := make([]string, len(activeLibNames))
	args := make([]interface{}, len(activeLibNames))
	for i, name := range activeLibNames {
		placeholders[i] = "?"
		args[i] = name
	}
	query := fmt.Sprintf(`DELETE FROM indexed_files WHERE library_name NOT IN (%s)`, strings.Join(placeholders, ","))
	_, err := s.db.Exec(query, args...)
	return err
}

func (s *Store) Clear() error {
	if s == nil || s.db == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM indexed_files`)
	return err
}
