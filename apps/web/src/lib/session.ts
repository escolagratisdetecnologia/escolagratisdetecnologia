/** The API sets egt_hint=1 with the session (spec §5.2): the pages only need to know it exists. */
export function hasSession(): boolean {
  try {
    return document.cookie.split('; ').includes('egt_hint=1');
  } catch {
    return false;
  }
}
