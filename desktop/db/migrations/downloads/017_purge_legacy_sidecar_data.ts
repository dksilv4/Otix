// desktop/db/migrations/downloads/017_purge_legacy_sidecar_data.ts
// Purge legacy .otix sidecar metadata and matches across scanned_games and game_matches.

import type { Migration, SqlRunner } from '../../migration-service'

const migration: Migration = {
  id: 17,
  name: 'purge_legacy_sidecar_data',
  up(sql: SqlRunner) {
    sql.exec(`
      UPDATE scanned_games SET
        otix_media_id = NULL,
        otix_media_title = NULL,
        otix_media_slug = NULL,
        otix_confidence = NULL,
        otix_match_suggestion = NULL,
        otix_poster_url = NULL,
        otix_backdrop_url = NULL,
        otix_icon_url = NULL,
        otix_textless_poster_url = NULL,
        otix_logo_url = NULL,
        otix_data = NULL;

      DELETE FROM game_matches;
    `)
  },
}

export default migration
