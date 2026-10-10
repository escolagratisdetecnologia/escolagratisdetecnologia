import { useEffect, useRef, useState } from 'preact/hooks';
import { leaveSignUp, type SignUpExit } from '../lib/account-actions.ts';

/**
 * "Sair" and "Cancelar cadastro" for someone who signed in but did not finish sign-up. Shared by
 * the Eu tab and the sign-up page; this device's progress stays (it never reached the account).
 */
export default function LeaveSignUp({
  onError,
  disabled = false,
}: {
  onError: (message: string) => void;
  /** The sign-up form is submitting: leaving now could sign out a just-completed account. */
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const leave = async (exit: SignUpExit) => {
    setBusy(true);
    onError('');
    const message = await leaveSignUp(exit);
    if (message !== null) {
      setBusy(false);
      onError(message);
    }
  };

  return (
    <>
      <div class="form-actions">
        <button
          type="button"
          class="button button-secondary"
          disabled={busy || disabled}
          onClick={() => void leave('sign-out')}
        >
          Sair
        </button>
        {!confirming && (
          <button
            type="button"
            class="button button-secondary"
            disabled={disabled}
            onClick={() => setConfirming(true)}
          >
            Cancelar cadastro
          </button>
        )}
      </div>
      {confirming && (
        <div class="confirm" role="group" aria-labelledby="cancelar-pergunta">
          <p id="cancelar-pergunta">
            Isso apaga a conta que você começou a criar. O progresso deste aparelho continua aqui.
            Quer mesmo cancelar?
          </p>
          <div class="confirm-actions">
            <button
              type="button"
              class="button button-danger"
              ref={confirmButton}
              disabled={busy || disabled}
              onClick={() => void leave('cancel')}
            >
              Cancelar cadastro
            </button>
            <button
              type="button"
              class="button button-secondary"
              onClick={() => setConfirming(false)}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
