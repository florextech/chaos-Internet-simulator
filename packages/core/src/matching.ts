import type { ChaosProfileRule } from './types.js';

export const normalizeUrlForMatching = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    return new URL(trimmed).toString().toLowerCase();
  } catch {
    try {
      return new URL(trimmed, 'http://local.test').toString().toLowerCase();
    } catch {
      return trimmed.toLowerCase();
    }
  }
};

export const urlMatchesRule = (urlValue: string, match: string): boolean => {
  const normalizedUrl = normalizeUrlForMatching(urlValue);
  const normalizedMatch = match.trim().toLowerCase();
  if (!normalizedMatch) return false;

  try {
    const parsed = new URL(normalizedUrl);
    return (
      parsed.hostname.includes(normalizedMatch) ||
      parsed.pathname.includes(normalizedMatch) ||
      normalizedUrl.includes(normalizedMatch)
    );
  } catch {
    return normalizedUrl.includes(normalizedMatch);
  }
};

export const findMatchingProfileRule = (
  urlValue: string,
  rules: ChaosProfileRule[],
): ChaosProfileRule | undefined => rules.find((rule) => urlMatchesRule(urlValue, rule.match));
