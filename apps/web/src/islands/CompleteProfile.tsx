import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api.ts';
import { finishSignIn, nextPath } from '../lib/sign-in.ts';

/** Last step of sign-up: birth year (under 12 cannot have an account) and the terms (spec §5.5). */
export default function CompleteProfile() {
  const [birthYear, setBirthYear] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    // Signed out, or sign-up already complete: nothing to do here.
    void api<{ profile: unknown }>('/api/me').then((res) => {
      const next = nextPath(location.search);
      if (!res.ok && res.status === 401)
        location.assign(`/entrar/?next=${encodeURIComponent(next)}`);
      if (res.ok && res.data.profile !== null) void finishSignIn(true, next);
    });
  }, []);

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const res = await api('/api/me', {
      method: 'PATCH',
      body: { birthYear: Number(birthYear), acceptTerms: accepted },
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error.message);
      setRefused(res.error.code === 'too_young');
      return;
    }
    await finishSignIn(true, nextPath(location.search));
  };

  if (refused) {
    return (
      <div class="complete-profile">
        <p class="form-error" role="alert">
          {error}
        </p>
        <p>
          Você ainda pode ver as aulas sem conta. <a href="/cursos/">Ver os cursos</a>
        </p>
      </div>
    );
  }

  return (
    <div class="complete-profile">
      <form class="form" onSubmit={submit}>
        <label for="birth-year">Ano em que você nasceu</label>
        <p class="hint" id="birth-year-hint">
          Só o ano, por exemplo 2007. A Escola é para quem tem 12 anos ou mais.
        </p>
        <input
          id="birth-year"
          type="text"
          inputMode="numeric"
          autoComplete="bday-year"
          pattern="[0-9]{4}"
          maxLength={4}
          required
          aria-describedby="birth-year-hint"
          value={birthYear}
          onInput={(event) => setBirthYear(event.currentTarget.value)}
        />
        <label class="check">
          <input
            type="checkbox"
            required
            checked={accepted}
            onChange={(event) => setAccepted(event.currentTarget.checked)}
          />
          <span>
            Li e aceito os <a href="/termos/">termos de uso</a> e a{' '}
            <a href="/privacidade/">política de privacidade</a>.
          </span>
        </label>
        <button type="submit" class="button button-block" disabled={busy}>
          Concluir cadastro
        </button>
      </form>
      <p class="form-error" role="alert">
        {error}
      </p>
    </div>
  );
}
