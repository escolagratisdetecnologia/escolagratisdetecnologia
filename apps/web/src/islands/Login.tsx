import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../lib/api.ts';
import { finishSignIn, nextPath } from '../lib/sign-in.ts';

type Step = 'email' | 'code' | 'finishing';

const GOOGLE_ERROR = 'Não deu para entrar com o Google. Tente de novo ou use seu e-mail.';

/** Sign-in without a password: a code by e-mail, or Google (spec §5.1). */
export default function Login() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState('/eu/');
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const target = nextPath(location.search);
    setNext(target);
    if (params.get('erro') === 'google') setError(GOOGLE_ERROR);
    if (params.get('entrou') === 'google') {
      // Back from Google with a session: finish sign-in here.
      setStep('finishing');
      void api<{ profile: unknown }>('/api/me').then((res) => {
        if (res.ok) return finishSignIn(res.data.profile !== null, target);
        setStep('email');
        setError(GOOGLE_ERROR);
      });
    }
  }, []);
  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  const askForCode = async (event?: Event) => {
    event?.preventDefault();
    setBusy(true);
    setError('');
    const res = await api('/api/auth/email/start', {
      method: 'POST',
      body: { email: email.trim() },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setCode('');
    setStep('code');
  };

  const checkCode = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const res = await api<{ profileComplete: boolean }>('/api/auth/email/verify', {
      method: 'POST',
      body: { code: code.trim() },
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    setStep('finishing');
    await finishSignIn(res.data.profileComplete, next);
  };

  return (
    <div class="login" data-step={step}>
      {step === 'email' && (
        <>
          <form class="form" onSubmit={askForCode}>
            <label for="login-email">Seu e-mail</label>
            <input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onInput={(event) => setEmail(event.currentTarget.value)}
            />
            <button type="submit" class="button button-block" disabled={busy}>
              Receber código
            </button>
          </form>
          <p class="or">ou</p>
          <a
            class="button button-secondary button-block"
            href={`/api/auth/google?next=${encodeURIComponent(next)}`}
          >
            Entrar com Google
          </a>
        </>
      )}
      {step === 'code' && (
        <>
          <p>
            Enviamos um código para <strong>{email.trim()}</strong>. Ele chega em até um minuto;
            confira também a caixa de spam.
          </p>
          <form class="form" onSubmit={checkCode}>
            <label for="login-code">Código</label>
            <input
              id="login-code"
              ref={codeInput}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              maxLength={8}
              required
              value={code}
              onInput={(event) => setCode(event.currentTarget.value)}
            />
            <button type="submit" class="button button-block" disabled={busy}>
              Entrar
            </button>
          </form>
          <div class="form-actions">
            <button
              type="button"
              class="button button-secondary"
              disabled={busy}
              onClick={() => void askForCode()}
            >
              Enviar outro código
            </button>
            <button
              type="button"
              class="button button-secondary"
              onClick={() => {
                setError('');
                setStep('email');
              }}
            >
              Usar outro e-mail
            </button>
          </div>
        </>
      )}
      {step === 'finishing' && <p class="status">Entrando e juntando seu progresso…</p>}
      <p class="form-error" role="alert">
        {error}
      </p>
    </div>
  );
}
