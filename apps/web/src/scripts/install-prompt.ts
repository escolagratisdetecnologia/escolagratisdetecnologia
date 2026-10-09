import { detectPlatform } from '../lib/platform.ts';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

// Android: the browser's install prompt. iPhone: the Add to Home Screen steps.
const section = document.querySelector<HTMLElement>('[data-install]');
if (section) {
  const android = section.querySelector<HTMLButtonElement>('[data-install-android]');
  const ios = section.querySelector<HTMLButtonElement>('[data-install-ios]');
  const steps = section.querySelector<HTMLElement>('#instalar-iphone');
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (
    !standalone &&
    ios &&
    steps &&
    detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === 'ios'
  ) {
    section.hidden = false;
    ios.hidden = false;
    ios.addEventListener('click', () => {
      const open = steps.hidden;
      steps.hidden = !open;
      ios.setAttribute('aria-expanded', String(open));
    });
  }

  let deferred: InstallEvent | undefined;
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    if (android) {
      section.hidden = false;
      android.hidden = false;
    }
  });
  android?.addEventListener('click', async () => {
    if (!deferred) return;
    await deferred.prompt();
    deferred = undefined;
    android.hidden = true;
    section.hidden = true;
  });

  section.dataset.ready = 'true';
}
