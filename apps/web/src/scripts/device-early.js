// Classic script, runs in <head> before first paint so the right variant is visible from the start.
// Keep the detection in sync with src/lib/platform.ts (device-early.test.ts enforces it).
(function () {
  var meta = document.querySelector('meta[name="egt-variants"]');
  if (!meta) return;
  var available = meta.content.split(' ').filter(Boolean);
  var ua = navigator.userAgent;
  var touch = navigator.maxTouchPoints || 0;
  var detected;
  if (/Android/i.test(ua)) detected = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua)) detected = 'ios';
  else if (/Macintosh/i.test(ua) && touch > 1) detected = 'ios';
  else if (/CrOS/i.test(ua)) detected = 'chromeos';
  else if (/Windows/i.test(ua)) detected = 'windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) detected = 'mac';
  var chosen = detected && available.indexOf(detected) !== -1 ? detected : available[0];
  if (chosen) document.documentElement.dataset.device = chosen;
})();
