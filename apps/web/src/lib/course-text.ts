import { REQUIREMENT_LABELS, type Device, type Requirement } from '@egt/content';

/** "a", "a e b", "a, b e c". */
export function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

export const devicesText = (devices: Device[]): string => devices.join(' ou ');
export const requirementsText = (requirements: Requirement[]): string =>
  listText(requirements.map((requirement) => REQUIREMENT_LABELS[requirement]));
export const outcomeResult = (outcome: string): string => outcome.replace(/^Você sai com: /, '');
export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
