import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api.ts', () => ({ api: vi.fn() }));
const { api } = await import('./api.ts');
const { leaveSignUp } = await import('./account-actions.ts');

const assign = vi.fn();
vi.stubGlobal('location', { assign });

afterEach(() => {
  vi.mocked(api).mockReset();
  assign.mockReset();
});

describe('leaveSignUp', () => {
  it('signs out and goes to the Eu tab with its own notice', async () => {
    vi.mocked(api).mockResolvedValue({ ok: true, status: 200, data: {} });

    expect(await leaveSignUp('sign-out')).toBeNull();

    expect(api).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(assign).toHaveBeenCalledWith('/eu/?conta=saiu-cadastro');
  });

  it('cancels the sign-up by deleting the account', async () => {
    vi.mocked(api).mockResolvedValue({ ok: true, status: 200, data: {} });

    expect(await leaveSignUp('cancel')).toBeNull();

    expect(api).toHaveBeenCalledWith('/api/me', { method: 'DELETE' });
    expect(assign).toHaveBeenCalledWith('/eu/?conta=cadastro-cancelado');
  });

  it('returns the error and stays put when the request fails', async () => {
    vi.mocked(api).mockResolvedValue({
      ok: false,
      status: 500,
      error: { code: 'unavailable', message: 'Deu ruim.' },
    });

    expect(await leaveSignUp('cancel')).toBe('Deu ruim.');
    expect(assign).not.toHaveBeenCalled();
  });
});
