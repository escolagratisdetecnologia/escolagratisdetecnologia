import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../lib/api.ts';
import { forgetProgress } from '../lib/progress-sync.ts';
import { hasSession } from '../lib/session.ts';
import LeaveSignUp from './LeaveSignUp.tsx';

type State =
  | { kind: 'signed-out'; notice?: string }
  | { kind: 'loading' }
  | { kind: 'incomplete' }
  | { kind: 'signed-in'; email: string };

const NOTICES: Record<string, string> = {
  saiu: 'Você saiu da conta. O progresso continua salvo nela.',
  excluida: 'Sua conta foi excluída e apagamos os seus dados.',
  'saiu-cadastro': 'Você saiu. O progresso deste aparelho continua aqui.',
  'cadastro-cancelado':
    'Cadastro cancelado: apagamos a conta que você começou. O progresso deste aparelho continua aqui.',
};

/** Eu tab: sign in, or the account with data export, logout and deletion (spec §5.5). */
export default function Account() {
  const [state, setState] = useState<State>({ kind: 'signed-out' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const notice = NOTICES[new URLSearchParams(location.search).get('conta') ?? ''];
    if (!hasSession()) {
      setState({ kind: 'signed-out', ...(notice === undefined ? {} : { notice }) });
      return;
    }
    setState({ kind: 'loading' });
    void api<{ email: string; profile: unknown }>('/api/me').then((res) => {
      if (!res.ok) setState({ kind: 'signed-out' });
      else if (res.data.profile === null) setState({ kind: 'incomplete' });
      else setState({ kind: 'signed-in', email: res.data.email });
    });
  }, []);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const leave = (notice: 'saiu' | 'excluida') => {
    forgetProgress();
    location.assign(`/eu/?conta=${notice}`);
  };

  const signOut = async () => {
    setBusy(true);
    setError('');
    const res = await api('/api/auth/logout', { method: 'POST' });
    if (!res.ok) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    leave('saiu');
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError('');
    const res = await api('/api/me', { method: 'DELETE' });
    if (!res.ok) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    leave('excluida');
  };

  const download = async () => {
    setError('');
    const res = await api<unknown>('/api/me/export');
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'meus-dados-escola-gratis.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section class="card account" aria-labelledby="conta-titulo">
      <h2 id="conta-titulo">Sua conta</h2>
      {state.kind === 'signed-out' && (
        <>
          <p class="account-note">
            {state.notice ??
              'Entre para guardar seu progresso na sua conta e continuar em qualquer aparelho.'}
          </p>
          <a class="button button-block" href="/entrar/?next=%2Feu%2F">
            Entrar
          </a>
        </>
      )}
      {state.kind === 'loading' && <p class="account-note">Carregando sua conta…</p>}
      {state.kind === 'incomplete' && (
        <>
          <p class="account-note">Falta um passo para terminar de criar sua conta.</p>
          <a class="button button-block" href="/entrar/cadastro/?next=%2Feu%2F">
            Completar cadastro
          </a>
          <LeaveSignUp onError={setError} />
        </>
      )}
      {state.kind === 'signed-in' && (
        <>
          <p class="account-note">
            Você entrou como <strong>{state.email}</strong>. Seu progresso fica salvo na conta.
          </p>
          <div class="form-actions">
            <button type="button" class="button button-secondary" onClick={() => void download()}>
              Baixar meus dados
            </button>
            <button
              type="button"
              class="button button-secondary"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sair
            </button>
          </div>
          {!confirming && (
            <button
              type="button"
              class="button button-secondary account-delete"
              onClick={() => setConfirming(true)}
            >
              Excluir conta
            </button>
          )}
          {confirming && (
            <div class="confirm" role="group" aria-labelledby="excluir-pergunta">
              <p id="excluir-pergunta">
                Isso apaga sua conta, seu e-mail, seu ano de nascimento e seu progresso. Não dá para
                desfazer. Quer mesmo excluir?
              </p>
              <div class="confirm-actions">
                <button
                  type="button"
                  class="button button-danger"
                  ref={confirmButton}
                  disabled={busy}
                  onClick={() => void deleteAccount()}
                >
                  Excluir minha conta
                </button>
                <button
                  type="button"
                  class="button button-secondary"
                  onClick={() => setConfirming(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <p class="form-error" role="alert">
        {error}
      </p>
    </section>
  );
}
