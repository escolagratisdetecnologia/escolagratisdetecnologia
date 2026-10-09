import { detectPlatform } from '../lib/platform.ts';

// Module 0: shows only the steps for the learner's device, with buttons to switch.
const root = document.querySelector<HTMLElement>('[data-variants]');
if (root) {
  const sections = [...root.querySelectorAll<HTMLElement>('[data-platform]')];
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-show]')];
  const show = (platform: string) => {
    for (const section of sections) section.hidden = section.dataset.platform !== platform;
    for (const button of buttons)
      button.setAttribute('aria-pressed', String(button.dataset.show === platform));
  };

  const available = sections.map((section) => section.dataset.platform ?? '');
  const detected = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  show(detected && available.includes(detected) ? detected : (available[0] ?? ''));
  for (const button of buttons)
    button.addEventListener('click', () => show(button.dataset.show ?? ''));

  const switcher = root.querySelector<HTMLElement>('[data-switcher]');
  if (switcher) switcher.hidden = false;
  root.dataset.ready = 'true';
}
