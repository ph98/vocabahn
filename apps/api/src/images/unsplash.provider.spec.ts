import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsplashProvider } from './unsplash.provider';

// The access key is read into a field when the provider is constructed, so each
// test sets the environment it wants and then builds its own instance.
function providerWithKey(key: string | undefined): UnsplashProvider {
  if (key === undefined) delete process.env.UNSPLASH_ACCESS_KEY;
  else process.env.UNSPLASH_ACCESS_KEY = key;
  return new UnsplashProvider();
}

function photoResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        results: [
          {
            urls: { regular: 'https://images.unsplash.com/photo-1' },
            links: {
              html: 'https://unsplash.com/photos/abc',
              download_location: 'https://api.unsplash.com/photos/abc/download',
            },
            user: { name: 'Ada Fotograf', links: { html: 'https://unsplash.com/@ada' } },
            ...overrides,
          },
        ],
      }),
  };
}

describe('UnsplashProvider', () => {
  const originalKey = process.env.UNSPLASH_ACCESS_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY;
    else process.env.UNSPLASH_ACCESS_KEY = originalKey;
  });

  it('is disabled and returns nothing when the key is unset', async () => {
    const provider = providerWithKey(undefined);

    expect(provider.enabled).toBe(false);
    // A missing key is a normal state, not an error: no throw, no request.
    await expect(provider.search('train station platform')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches squarish by default and landscape on request', async () => {
    const provider = providerWithKey('key-1');
    fetchMock.mockResolvedValue(photoResponse());

    await provider.search('a green house');
    expect(new URL(fetchMock.mock.calls[0]![0] as URL).searchParams.get('orientation')).toBe(
      'squarish',
    );

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(photoResponse());

    await provider.search('train station platform', 'landscape');
    const url = new URL(fetchMock.mock.calls[0]![0] as URL);
    expect(url.searchParams.get('orientation')).toBe('landscape');
    expect(url.searchParams.get('query')).toBe('train station platform');
  });

  it('returns the photo with the attribution the caller must store', async () => {
    const provider = providerWithKey('key-1');
    fetchMock.mockResolvedValue(photoResponse());

    await expect(provider.search('a green house')).resolves.toEqual({
      imageUrl: 'https://images.unsplash.com/photo-1',
      authorName: 'Ada Fotograf',
      authorUrl: 'https://unsplash.com/@ada',
      sourceUrl: 'https://unsplash.com/photos/abc',
    });
  });

  it("pings the photo's download_location, which is how Unsplash counts a use", async () => {
    const provider = providerWithKey('key-1');
    fetchMock.mockResolvedValue(photoResponse());

    await provider.search('a green house');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://api.unsplash.com/photos/abc/download');
    expect(init.headers.Authorization).toBe('Client-ID key-1');
  });

  it('still returns the photo when the download ping fails', async () => {
    const provider = providerWithKey('key-1');
    fetchMock
      .mockResolvedValueOnce(photoResponse())
      .mockRejectedValueOnce(new Error('network down'));

    // The ping is bookkeeping owed to Unsplash; losing it must not lose the
    // image we already have in hand.
    await expect(provider.search('a green house')).resolves.toMatchObject({
      imageUrl: 'https://images.unsplash.com/photo-1',
    });
  });

  it('returns nothing when the search matched no photos', async () => {
    const provider = providerWithKey('key-1');
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ results: [] }) });

    await expect(provider.search('nothing at all like this')).resolves.toBeNull();
  });

  it('throws on an API error so the caller can log it and move on', async () => {
    const provider = providerWithKey('key-1');
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: 'Rate Limit Exceeded' });

    await expect(provider.search('a green house')).rejects.toThrow(/403/);
  });
});
