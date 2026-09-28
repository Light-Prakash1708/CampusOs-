import { describe, it, expect, afterEach, vi } from 'vitest';
import { demoEntryHref } from '@/lib/demo';

describe('"View demo" link', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is hidden when this server has no demo and none is configured', () => {
    vi.stubEnv('DEMO_TENANT_ENABLED', 'false');
    vi.stubEnv('PUBLIC_DEMO_URL', '');
    expect(demoEntryHref()).toBeNull();
  });

  it('opens this server’s own demo when the demo tenant is on here', () => {
    vi.stubEnv('DEMO_TENANT_ENABLED', 'true');
    vi.stubEnv('PUBLIC_DEMO_URL', 'https://demo.example.com');
    expect(demoEntryHref()).toBe('/demo');
  });

  it('points a pilot server at the separate demo service', () => {
    vi.stubEnv('DEMO_TENANT_ENABLED', 'false');
    vi.stubEnv('PUBLIC_DEMO_URL', 'https://demo.example.com/');
    expect(demoEntryHref()).toBe('https://demo.example.com/demo');
  });

  it('ignores a value that is not an http(s) URL', () => {
    vi.stubEnv('DEMO_TENANT_ENABLED', 'false');
    vi.stubEnv('PUBLIC_DEMO_URL', 'javascript:alert(1)');
    expect(demoEntryHref()).toBeNull();
  });
});
