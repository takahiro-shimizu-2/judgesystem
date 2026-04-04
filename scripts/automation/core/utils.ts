import * as fs from 'fs';

export function ensureDirectory(pathname: string) {
  fs.mkdirSync(pathname, { recursive: true });
  return pathname;
}

export function slugify(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'task';
}

export function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function unique<T>(values: T[]) {
  return [...new Set(values)];
}
