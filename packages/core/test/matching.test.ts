import { describe, expect, it } from 'vitest';

import { findMatchingProfileRule, urlMatchesRule } from '../src/matching.js';

describe('url matching rules', () => {
  it('matches by domain', () => {
    const result = urlMatchesRule(
      'https://jsonplaceholder.typicode.com/posts/1',
      'jsonplaceholder.typicode.com',
    );
    expect(result).toBe(true);
  });

  it('matches by path', () => {
    const result = urlMatchesRule('https://api.example.com/payments/charge', '/payments');
    expect(result).toBe(true);
  });

  it('matches by substring in full url', () => {
    const result = urlMatchesRule(
      'https://api.example.com/v1/orders?channel=mobile-slow',
      'mobile-slow',
    );
    expect(result).toBe(true);
  });

  it('returns first matching rule', () => {
    const matched = findMatchingProfileRule('https://api.example.com/payments/charge', [
      { match: '/orders', profile: 'slow-3g' },
      { match: '/payments', profile: 'unstable-api' },
    ]);

    expect(matched).toEqual({ match: '/payments', profile: 'unstable-api' });
  });

  it('returns undefined when no rule matches', () => {
    const matched = findMatchingProfileRule('https://api.example.com/health', [
      { match: '/payments', profile: 'unstable-api' },
    ]);

    expect(matched).toBeUndefined();
  });
});
