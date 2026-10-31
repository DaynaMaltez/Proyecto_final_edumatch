export function socketOrigin(apiBaseUrl: string, development: boolean): string | undefined {
  if (development || !/^https?:\/\//i.test(apiBaseUrl)) return undefined;
  try { return new URL(apiBaseUrl).origin; } catch { return undefined; }
}
