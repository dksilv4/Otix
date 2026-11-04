import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getApiBaseUrl, getApiUrl, getApiV1Url } from '../config';

describe('desktop/config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OTIX_BACKEND_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('respects OTIX_BACKEND_URL when provided', () => {
    process.env.OTIX_BACKEND_URL = 'http://192.168.1.150:8000';
    expect(getApiBaseUrl()).toBe('http://192.168.1.150:8000');
    expect(getApiUrl('/test')).toBe('http://192.168.1.150:8000/api/test');
    expect(getApiV1Url('/library')).toBe('http://192.168.1.150:8000/api/v1/library');
  });

  it('returns local backend in development mode', () => {
    process.env.NODE_ENV = 'development';
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:8000');
    expect(getApiUrl('/status')).toBe('http://127.0.0.1:8000/api/status');
    expect(getApiV1Url('/status')).toBe('http://127.0.0.1:8000/api/v1/status');
  });

  it('returns production backend in production mode', () => {
    process.env.NODE_ENV = 'production';
    expect(getApiBaseUrl()).toBe('https://otix.app');
    expect(getApiUrl('/status')).toBe('https://otix.app/api/status');
    expect(getApiV1Url('/status')).toBe('https://otix.app/api/v1/status');
  });
});
