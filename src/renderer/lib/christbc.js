/**
 * Christ Baptist Church (Christ BC) Developer Portal — Hymn API client.
 *
 * Reusable provider for the public hymnbook API (read-only, no user data):
 *   GET /api/v1/hymns?page=&limit=&q=&category=
 *   GET /api/v1/hymns/categories
 *   GET /api/v1/hymns/[number]
 *
 * Authentication is per the portal gateway (app/lib/services/gateway.ts):
 *   - x-christbc-live-key      (when environment === 'live')
 *   - x-christbc-testing-key   (otherwise)
 *   - x-christbc-environment   ('live' | 'testing' | 'integration')
 *
 * Keys are scoped per product (`api: "hymns"`). A key issued for the
 * countries/dial-codes API cannot access hymns and vice versa.
 *
 * Every method returns a normalised result:
 *   { ok: true, data }                                           success
 *   { ok: false, error: { code, status, message, hint, retryable } } failure
 *
 * Errors are actionable so callers can surface a useful message instead of
 * a raw HTTP status. Retryable errors (429, 5xx, network) can be retried by
 * the caller after a backoff.
 */

const DEFAULT_BASE_URL = 'https://dev.christbcogbomoso.org';

export const CHRISTBC_BASE_URL_DEFAULT = DEFAULT_BASE_URL;
export const CHRISTBC_ENVIRONMENTS = ['live', 'testing', 'integration'];

/** Error codes the gateway (or this client) can produce. */
export const ChristBCErrorCode = {
  INVALID_KEY: 'invalid_key',
  WRONG_ENVIRONMENT: 'wrong_environment',
  WRONG_API: 'wrong_api',
  RATE_LIMITED: 'rate_limited',
  ORIGIN_NOT_ALLOWED: 'origin_not_allowed',
  NOT_FOUND: 'not_found',
  INTERNAL_ERROR: 'internal_error',
  NETWORK_ERROR: 'network_error',
  UNEXPECTED_RESPONSE: 'unexpected_response',
};

/** User-facing hint for each error code. */
export const ERROR_HINTS = {
  [ChristBCErrorCode.INVALID_KEY]:
    'The Christ BC API key is invalid or revoked. Issue a new Hymn API key at the developer portal.',
  [ChristBCErrorCode.WRONG_ENVIRONMENT]:
    'The key was issued for a different environment (live/testing). Match the environment in Settings.',
  [ChristBCErrorCode.WRONG_API]:
    'This key is not issued for the Hymn API. Issue a Hymn API key (api: "hymns") from the portal.',
  [ChristBCErrorCode.RATE_LIMITED]:
    'Too many requests to the Christ BC API. Retry shortly.',
  [ChristBCErrorCode.ORIGIN_NOT_ALLOWED]:
    'This key is restricted to specific website origins. Desktop (PulpitAI) requests are allowed; if you still see this, the key may be invalid or revoked.',
  [ChristBCErrorCode.NOT_FOUND]:
    'The requested hymn was not found.',
  [ChristBCErrorCode.INTERNAL_ERROR]:
    'The Christ BC API encountered an error. Retry shortly.',
  [ChristBCErrorCode.NETWORK_ERROR]:
    'Unable to reach the Christ BC API. Check your internet connection and the portal base URL in Settings.',
  [ChristBCErrorCode.UNEXPECTED_RESPONSE]:
    'Unexpected response from the Christ BC API.',
};

function ok(data) {
  return { ok: true, data };
}

function error({ code, status = 0, message, hint, retryable = false }) {
  return { ok: false, error: { code, status, message, hint, retryable } };
}

/** Normalise a gateway error response (any shape) into a ChristBCError. */
function normaliseError(status, body) {
  const err =
    (body && body.error) ||
    (body && body.ok === false && body.error) ||
    (body && body.message) ||
    {};
  let code = err.code;
  if (!code) {
    if (status === 401) code = ChristBCErrorCode.INVALID_KEY;
    else if (status === 403) code = ChristBCErrorCode.WRONG_API;
    else if (status === 429) code = ChristBCErrorCode.RATE_LIMITED;
    else if (status === 404) code = ChristBCErrorCode.NOT_FOUND;
    else if (status >= 500) code = ChristBCErrorCode.INTERNAL_ERROR;
    else code = ChristBCErrorCode.UNEXPECTED_RESPONSE;
  }
  return error({
    code,
    status,
    message: err.message || `Request failed with HTTP ${status}.`,
    hint: ERROR_HINTS[code] || ERROR_HINTS[ChristBCErrorCode.UNEXPECTED_RESPONSE],
    retryable: status === 429 || status >= 500 || status === 0,
  });

}

/**
 * Christ BC Hymn API provider.
 *
 * Construct with the resolved settings, then call listHymns / getCategories /
 * getHymn. The instance is lightweight and safe to recreate per use.
 */
export class ChristBCHymnProvider {
  #baseUrl;
  #apiKey;
  #environment;
  #fetch;

  constructor({
    baseUrl = DEFAULT_BASE_URL,
    apiKey = '',
    environment = 'live',
    fetch,
  } = {}) {
    this.#baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#apiKey = String(apiKey || '');
    this.#environment = environment;
    this.#fetch = fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Headers the gateway expects for a keyed request. */
  #authHeaders() {
    const isLive = this.#environment === 'live';
    const secretHeader = isLive ? 'x-christbc-live-key' : 'x-christbc-testing-key';
    return {
      [secretHeader]: this.#apiKey,
      'x-christbc-environment': this.#environment,
      Accept: 'application/json',
    };
  }

  #url(path, params = {}) {
    const url = new URL(
      `${this.#baseUrl}/api/v1/${path.replace(/^\/+/, '')}`,
    );
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  async #request(path, params = {}) {
    let response;
    try {
      response = await this.#fetch(this.#url(path, params).toString(), {
        method: 'GET',
        headers: this.#authHeaders(),
        // The desktop app sends no browser Origin/Referer. The gateway treats
        // a key with no allowedOrigins as unrestricted, so server-to-server
        // calls from Electron succeed without an origin header.
      });
    } catch (err) {
      return error({
        code: ChristBCErrorCode.NETWORK_ERROR,
        status: 0,
        message: err.message || 'Network request failed.',
        hint: ERROR_HINTS[ChristBCErrorCode.NETWORK_ERROR],
        retryable: true,
      });
    }

    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || (body && body.ok === false)) {
      return normaliseError(response.status, body);
    }
    if (body === null) {
      return error({
        code: ChristBCErrorCode.UNEXPECTED_RESPONSE,
        status: response.status,
        message: 'Non-JSON response from Christ BC API.',
        hint: ERROR_HINTS[ChristBCErrorCode.UNEXPECTED_RESPONSE],
        retryable: false,
      });
    }
    return ok(body.data ?? body);
  }

  /** Paginated hymn list. Options: page, limit, q (search), category. */
  async listHymns({ page = 1, limit = 20, q, category } = {}) {
    return this.#request('hymns', {
      page: String(page),
      limit: String(limit),
      q,
      category,
    });
  }

  /** All hymn categories. */
  async getCategories() {
    return this.#request('hymns/categories');
  }

  /** Single hymn by hymbook number. */
  async getHymn(number) {
    return this.#request(`hymns/${String(number)}`);
  }
}

/** Build a provider from per-church overrides (key/env/baseUrl). */
export function createChristBCProvider(overrides) {
  if (!overrides) {
    return new ChristBCHymnProvider({ apiKey: '' });
  }
  return new ChristBCHymnProvider({
    baseUrl: overrides.christbcBaseUrl,
    apiKey: overrides.christbcApiKey,
    environment: overrides.christbcEnvironment,
  });
}

