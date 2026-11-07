// desktop/db/migrations/downloads/016_purge_scanned_anomalies.ts
// Purge anomalous, duplicate, and corrupted game scan records (such as internal Factorio simulation archives,
// mod packages, plugin executables, misidentified console dumps, and encoding artifacts).

import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 16,
  name: 'purge_scanned_anomalies',
  up(sql: SqlRunner) {
    sql.exec(`
      DELETE FROM scanned_games WHERE
        title LIKE 'Menu Simulation %'
        OR title = 'Nauvis River Bridge'
        OR title LIKE 'Nauvis %'
        OR title = 'App 0'
        OR title = 'Plugins'
        OR title = 'Cleaner'
        OR title = 'Legacy'
        OR title = 'Sheep'
        OR title = 'Distribution'
        OR exe_path LIKE '%menu-simulation%'
        OR exe_path LIKE '%Mods%BigAmbitionsMP%'
        OR (id LIKE 'pc_file_%' AND exe_path LIKE '%PS5%')
        OR (id LIKE 'rom_file_%' AND platform = 'rom' AND (exe_path LIKE '%.xci' OR exe_path LIKE '%.nsp%'))
        OR (id LIKE 'pc_file_%' AND exe_path IN (SELECT local_exe_path FROM scanned_games WHERE id LIKE 'steam_%' AND local_exe_path IS NOT NULL));

      UPDATE scanned_games
      SET title = REPLACE(REPLACE(title, char(65533), ''), '™', '')
      WHERE title LIKE '%' || char(65533) || '%' OR title LIKE '%™%';
    `)
  },
}

export default migration
