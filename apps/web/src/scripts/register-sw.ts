// Registers the service worker in production builds only (dev servers have no /sw.js).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
