import { hasSession } from './session.ts';

export interface ApiError {
  code: string;
  message: string;
}

export type ApiResult<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Lets the request finish after the page changes (lesson completed, then the next one). */
  keepalive?: boolean;
}

/** Shown when the answer is not the API's JSON: no internet, or a page from the CDN or the WAF. */
export const UNAVAILABLE: ApiError = {
  code: 'unavailable',
  message: 'Não conseguimos falar com a Escola agora. Confira sua internet e tente de novo.',
};

async function send(path: string, request: ApiRequest): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: request.method ?? 'GET',
      credentials: 'same-origin',
      keepalive: request.keepalive ?? false,
      ...(request.body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.body) }),
    });
  } catch {
    return null;
  }
}

function isApiError(value: unknown): value is { error: ApiError } {
  const error = (value as { error?: Partial<ApiError> } | null)?.error;
  return typeof error?.code === 'string' && typeof error.message === 'string';
}

async function read<T>(res: Response | null): Promise<ApiResult<T>> {
  if (res === null) return { ok: false, status: 0, error: UNAVAILABLE };
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    return { ok: false, status: res.status, error: UNAVAILABLE };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  return { ok: false, status: res.status, error: isApiError(body) ? body.error : UNAVAILABLE };
}

/**
 * Calls the API on the same site, with the session cookies. When the access token has expired,
 * renews the session once and tries again.
 */
export async function api<T>(path: string, request: ApiRequest = {}): Promise<ApiResult<T>> {
  const first = await send(path, request);
  if (first?.status === 401 && hasSession()) {
    const refreshed = await send('/api/auth/refresh', { method: 'POST' });
    if (refreshed?.ok) return read<T>(await send(path, request));
  }
  return read<T>(first);
}
