import { describe, expect, it } from 'vitest';
import { protectedFileUrl } from './protected-file-url';

describe('protectedFileUrl', () => {
  it('builds an encoded protected Directus file URL', () => {
    const url = protectedFileUrl('https://dash.example.test/', 'file/id 1');
    expect(url).toBe('https://dash.example.test/wellar/files/file%2Fid%201');
    expect(url).not.toContain('/assets/');
  });
});
