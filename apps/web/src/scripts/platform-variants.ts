// Module 0: wires the device buttons. Which variant is visible is decided by CSS from
// <html data-device>, which device-early.js sets in <head> before first paint.
const root = document.querySelector<HTMLElement>('[data-variants]');
if (root) {
  const html = document.documentElement;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-show]')];
  const press = (platform: string | undefined) => {
    for (const button of buttons)
      button.setAttribute('aria-pressed', String(button.dataset.show === platform));
  };

  // Without data-device (the head script did not run) the no-JS layout stays as it is.
  if (html.dataset.device) press(html.dataset.device);
  for (const button of buttons) {
    button.addEventListener('click', () => {
      html.dataset.device = button.dataset.show ?? '';
      press(html.dataset.device);
    });
  }
  root.dataset.ready = 'true';
}
