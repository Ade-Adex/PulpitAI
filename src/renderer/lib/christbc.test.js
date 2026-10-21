import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ChristBCHymnProvider,
  createChristBCProvider,
  ChristBCErrorCode,
} from './christbc.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Builds a fake fetch that records url/headers and returns the handler result. */
function capture(fakeFetch) {
  let capturedUrl;
  let capturedHeaders;
  const fetchImpl = (url, init) => {
    capturedUrl = String(url);
    const rawHeaders = init?.headers;
    capturedHeaders =
      rawHeaders instanceof Headers
        ? Object.fromEntries(rawHeaders.entries())
        : Object.fromEntries(Object.entries(rawHeaders ?? {}));
    return fakeFetch(capturedUrl, capturedHeaders);
  };
  return {
    fetch: fetchImpl,
    get url() {
      return capturedUrl;
    },
    get headers() {
      return capturedHeaders;
    },
  };
}

describe('ChristBCHymnProvider', () => {
  test('listHymns returns normalised hymns + pagination', async () => {
    const cap = capture((u, h) =>
      jsonResponse({
        ok: true,
        data: {
          hymns: [{ number: 1, title: 'Oluwa', category: 'Adoration', verses: ['v1'], author: 'A' }],
          pagination: { page: 1, limit: 20, total: 5, totalPages: 1 },
        },
      }),
    );
    const provider = new ChristBCHymnProvider({
      apiKey: 'chbc_live_abc',
      environment: 'live',
      fetch: cap.fetch,
    });
    const result = await provider.listHymns({ page: 1, limit: 20, q: '', category: '' });
    assert.equal(result.ok, true);
    assert.equal(result.data.hymns.length, 1);
    assert.equal(result.data.hymns[0].number, 1);
    assert.equal(result.data.pagination.total, 5);
    assert.equal(cap.headers['x-christbc-live-key'], 'chbc_live_abc');
    assert.equal(cap.headers['x-christbc-environment'], 'live');
    assert.equal(cap.headers['x-christbc-testing-key'], undefined);
    assert.ok(cap.url.includes('/api/v1/hymns'));
    assert.ok(cap.url.includes('page=1'));
    assert.ok(cap.url.includes('limit=20'));
    assert.ok(!cap.url.includes('q='));
    assert.ok(!cap.url.includes('category='));
  });

  test('getCategories returns string array', async () => {
    const cap = capture((u, h) =>
      jsonResponse({ ok: true, data: ['Adoration', 'Praise', 'Thanksgiving'] }),
    );
    const provider = new ChristBCHymnProvider({ apiKey: 'key', fetch: cap.fetch });
    const result = await provider.getCategories();
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, ['Adoration', 'Praise', 'Thanksgiving']);
    assert.ok(cap.url.includes('/api/v1/hymns/categories'));
  });

  test('getHymn returns a single hymn record', async () => {
    const cap = capture((u, h) =>
      jsonResponse({
        ok: true,
        data: { number: 234, title: 'Oluwa', category: 'Adoration', verses: ['v1'], author: 'A' },
      }),
    );
    const provider = new ChristBCHymnProvider({
      apiKey: 'key',
      environment: 'testing',
      fetch: cap.fetch,
    });
    const result = await provider.getHymn(234);
    assert.equal(result.ok, true);
    assert.equal(result.data.number, 234);
    assert.equal(cap.headers['x-christbc-testing-key'], 'key');
    assert.equal(cap.headers['x-christbc-environment'], 'testing');
    assert.equal(cap.headers['x-christbc-live-key'], undefined);
    assert.ok(cap.url.endsWith('/api/v1/hymns/234'));
  });

  test('omits empty query params', async () => {
    const cap = capture((u, h) => jsonResponse({ ok: true, data: [] }));
    const provider = new ChristBCHymnProvider({ apiKey: 'key', fetch: cap.fetch });
    await provider.listHymns({ page: 1, limit: 20 });
    assert.ok(!cap.url.includes('q='));
    assert.ok(!cap.url.includes('category='));
    assert.ok(cap.url.includes('page=1'));
  });
  test('401 invalid_key -> normalised actionable error', async () => {
    const { fetch } = capture((u, h) =>
      jsonResponse({ ok: false, error: { code: 'invalid_key', message: 'bad key' } }, 401),
    );
    const provider = new ChristBCHymnProvider({ apiKey: 'bad', fetch });
    const result = await provider.getHymn(1);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, ChristBCErrorCode.INVALID_KEY);
    assert.equal(result.error.status, 401);
    assert.equal(result.error.retryable, false);
    assert.ok(result.error.hint.includes('invalid or revoked'));
  });

  test('403 wrong_api -> normalised actionable error', async () => {
    const { fetch } = capture((u, h) =>
      jsonResponse({ ok: false, error: { code: 'wrong_api', message: 'wrong product' } }, 403),
    );
    const provider = new ChristBCHymnProvider({ apiKey: 'key', fetch });
    const result = await provider.listHymns();
    assert.equal(result.ok, false);
    assert.equal(result.error.code, ChristBCErrorCode.WRONG_API);
    assert.equal(result.error.status, 403);
    assert.ok(result.error.hint.includes('Hymn API key'));
  });

  test('429 rate_limited -> retryable error', async () => {
    const { fetch } = capture((u, h) =>
      jsonResponse({ ok: false, error: { code: 'rate_limited' } }, 429),
    );
    const provider = new ChristBCHymnProvider({ apiKey: 'key', fetch });
    const result = await provider.getCategories();
    assert.equal(result.ok, false);
    assert.equal(result.error.code, ChristBCErrorCode.RATE_LIMITED);
    assert.equal(result.error.status, 429);
    assert.equal(result.error.retryable, true);
  });

  test('404 not_found -> not_found error', async () => {
    const { fetch } = capture((u, h) =>
      jsonResponse({ ok: false, error: { code: 'not_found', message: 'missing' } }, 404),
    );
    const provider = new ChristBCHymnProvider({ apiKey: 'key', fetch });
    const result = await provider.getHymn(99999);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, ChristBCErrorCode.NOT_FOUND);
    assert.equal(result.error.status, 404);
  });

  test('network error -> retryable network_error', async () => {
    const { fetch } = capture(() => {
      throw new TypeError('fetch failed: DNS error');
    });
    const provider = new ChristBCHymnProvider({ apiKey: 'key', fetch });
    const result = await provider.getHymn(1);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, ChristBCErrorCode.NETWORK_ERROR);
    assert.equal(result.error.status, 0);
    assert.equal(result.error.retryable, true);
    assert.ok(result.error.hint.includes('Unable to reach'));
  });

  test('non-json body -> unexpected_response error', async () => {
    const { fetch } = capture((u, h) =>
      new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const provider = new ChristBCHymnProvider({ apiKey: 'key', fetch });
    const result = await provider.getCategories();
    assert.equal(result.ok, false);
    assert.equal(result.error.code, ChristBCErrorCode.UNEXPECTED_RESPONSE);
  });

  test('gateway ok:false without error field still normalises', async () => {
    const { fetch } = capture((u, h) =>
      jsonResponse({ ok: false, message: 'something broke' }, 500),
    );
    const provider = new ChristBCHymnProvider({ apiKey: 'key', fetch });
    const result = await provider.getHymn(1);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, ChristBCErrorCode.INTERNAL_ERROR);
    assert.equal(result.error.status, 500);
    assert.equal(result.error.retryable, true);
  });

  test('requests include the PulpitAI production Origin header', async () => {
    const cap = capture((u, h) => jsonResponse({ ok: true, data: { hymns: [], pagination: {} } }));
    const provider = new ChristBCHymnProvider({
      apiKey: 'key',
      environment: 'live',
      fetch: cap.fetch,
    });
    const result = await provider.listHymns();
    assert.equal(result.ok, true);
    assert.equal(cap.headers['Origin'], 'https://pulpitai.app');
  });

  test('origin can be overridden per provider', async () => {
    const cap = capture((u, h) => jsonResponse({ ok: true, data: ['Adoration'] }));
    const provider = new ChristBCHymnProvider({
      apiKey: 'key',
      origin: 'https://example.com',
      fetch: cap.fetch,
    });
    await provider.getCategories();
    assert.equal(cap.headers['Origin'], 'https://example.com');
  });
  test('createChristBCProvider from settings', () => {
    const settings = {
      christbcApiKey: 'ck_live_xyz',
      christbcEnvironment: 'testing',
      christbcBaseUrl: 'https://dev.christbcogbomoso.org',
    };
    const provider = createChristBCProvider(settings);
    assert.ok(provider instanceof ChristBCHymnProvider);
    assert.equal(createChristBCProvider(null) instanceof ChristBCHymnProvider, true);
    assert.equal(createChristBCProvider(undefined) instanceof ChristBCHymnProvider, true);
  });
});

