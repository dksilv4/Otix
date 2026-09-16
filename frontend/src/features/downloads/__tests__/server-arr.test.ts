import { describe, it, expect } from 'vitest';
import { arrKeys } from '../use-server-arr';
import type {
  ServerRadarrConfig,
  ServerSonarrConfig,
  ServerRadarrMovie,
  ServerSonarrSeries,
  ServerArrQueueItem,
  ServerArrQueueResponse,
  AddRadarrMoviePayload,
  AddSonarrSeriesPayload,
} from '../arr-types';

describe('arrKeys query keys', () => {
  it('generates correct radarr query keys', () => {
    expect(arrKeys.all).toEqual(['server-arr']);
    expect(arrKeys.radarr.all).toEqual(['server-radarr']);
    expect(arrKeys.radarr.config(1)).toEqual(['server-radarr', 1, 'config']);
    expect(arrKeys.radarr.rootFolders(1)).toEqual(['server-radarr', 1, 'rootfolders']);
    expect(arrKeys.radarr.qualityProfiles(1)).toEqual(['server-radarr', 1, 'qualityprofiles']);
    expect(arrKeys.radarr.movies(1)).toEqual(['server-radarr', 1, 'movies']);
    expect(arrKeys.radarr.lookup(1, 'Matrix')).toEqual(['server-radarr', 1, 'lookup', 'Matrix']);
    expect(arrKeys.radarr.queue(1)).toEqual(['server-radarr', 1, 'queue']);
    expect(arrKeys.radarr.history(1)).toEqual(['server-radarr', 1, 'history']);
  });

  it('generates correct sonarr query keys', () => {
    expect(arrKeys.sonarr.all).toEqual(['server-sonarr']);
    expect(arrKeys.sonarr.config(2)).toEqual(['server-sonarr', 2, 'config']);
    expect(arrKeys.sonarr.rootFolders(2)).toEqual(['server-sonarr', 2, 'rootfolders']);
    expect(arrKeys.sonarr.qualityProfiles(2)).toEqual(['server-sonarr', 2, 'qualityprofiles']);
    expect(arrKeys.sonarr.series(2)).toEqual(['server-sonarr', 2, 'series']);
    expect(arrKeys.sonarr.lookup(2, 'Breaking Bad')).toEqual(['server-sonarr', 2, 'lookup', 'Breaking Bad']);
    expect(arrKeys.sonarr.queue(2)).toEqual(['server-sonarr', 2, 'queue']);
    expect(arrKeys.sonarr.history(2)).toEqual(['server-sonarr', 2, 'history']);
  });
});

describe('arr-types data contract models', () => {
  it('correctly models Radarr and Sonarr configurations', () => {
    const radarrConfig: ServerRadarrConfig = {
      enabled: true,
      host: '192.168.1.50',
      port: 7878,
      api_key: 'radarr-api-token',
      use_ssl: false,
      quality_profile_id: 1,
      root_folder_path: '/data/movies',
      minimum_availability: 'announced',
      configured: true,
    };

    expect(radarrConfig.port).toBe(7878);
    expect(radarrConfig.configured).toBe(true);

    const sonarrConfig: ServerSonarrConfig = {
      enabled: true,
      host: '192.168.1.50',
      port: 8989,
      api_key: 'sonarr-api-token',
      use_ssl: false,
      quality_profile_id: 1,
      root_folder_path: '/data/tv',
      series_type: 'standard',
      season_folder: true,
      configured: true,
    };

    expect(sonarrConfig.port).toBe(8989);
    expect(sonarrConfig.series_type).toBe('standard');
    expect(sonarrConfig.season_folder).toBe(true);
  });

  it('correctly models Radarr movie and Sonarr series items', () => {
    const movie: ServerRadarrMovie = {
      id: 10,
      title: 'Inception',
      year: 2010,
      tmdb_id: 27205,
      monitored: true,
      has_file: true,
      size_on_disk: 15_000_000_000,
    };

    expect(movie.title).toBe('Inception');
    expect(movie.tmdb_id).toBe(27205);
    expect(movie.has_file).toBe(true);

    const series: ServerSonarrSeries = {
      id: 20,
      title: 'Severance',
      year: 2022,
      tvdb_id: 371980,
      monitored: true,
      episode_count: 9,
      episode_file_count: 9,
    };

    expect(series.title).toBe('Severance');
    expect(series.tvdb_id).toBe(371980);
    expect(series.episode_file_count).toBe(9);
  });

  it('correctly models queue and payloads', () => {
    const queueItem: ServerArrQueueItem = {
      id: 100,
      title: 'Inception.2010.1080p.BluRay',
      status: 'downloading',
      size: 10_000_000_000,
      size_left: 2_000_000_000,
      timeleft: '00:05:00',
    };

    const queueResponse: ServerArrQueueResponse = {
      page: 1,
      pageSize: 50,
      totalRecords: 1,
      records: [queueItem],
    };

    expect(queueResponse.totalRecords).toBe(1);
    expect(queueResponse.records[0].title).toContain('Inception');

    const addMoviePayload: AddRadarrMoviePayload = {
      title: 'The Dark Knight',
      tmdb_id: 155,
      search_for_movie: true,
    };
    expect(addMoviePayload.tmdb_id).toBe(155);

    const addSeriesPayload: AddSonarrSeriesPayload = {
      title: 'Succession',
      tvdb_id: 343360,
      search_for_missing_episodes: true,
    };
    expect(addSeriesPayload.tvdb_id).toBe(343360);
  });
});
