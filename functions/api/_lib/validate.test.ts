import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  escapeHtml,
  validateEmail,
  validateId,
  validateEnum,
  validateLength,
} from './validate';

describe('sanitizeString', () => {
  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('strips control characters but keeps newlines and tabs', () => {
    expect(sanitizeString('hello\x00world')).toBe('helloworld');
    expect(sanitizeString('line1\nline2')).toBe('line1\nline2');
    expect(sanitizeString('col1\tcol2')).toBe('col1\tcol2');
  });

  it('enforces max length', () => {
    expect(sanitizeString('abcdef', 3)).toBe('abc');
  });

  it('uses default max length of 1000', () => {
    const long = 'a'.repeat(1500);
    expect(sanitizeString(long).length).toBe(1000);
  });
});

describe('escapeHtml', () => {
  it('escapes all five critical characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#x27;');
  });

  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('escapes a script tag', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });
});

describe('validateEmail', () => {
  it('accepts valid emails', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('a@b.co')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('noatsign')).toBe(false);
    expect(validateEmail('no@domain')).toBe(false);
    expect(validateEmail('@no-local.com')).toBe(false);
  });
});

describe('validateId', () => {
  it('accepts positive integers', () => {
    expect(validateId(1)).toBe(true);
    expect(validateId(999)).toBe(true);
    expect(validateId('42')).toBe(true);
  });

  it('rejects zero, negatives, and non-integers', () => {
    expect(validateId(0)).toBe(false);
    expect(validateId(-1)).toBe(false);
    expect(validateId(1.5)).toBe(false);
    expect(validateId('abc')).toBe(false);
    expect(validateId(null)).toBe(false);
  });
});

describe('validateEnum', () => {
  const allowed = ['a', 'b', 'c'] as const;

  it('accepts values in the allowed list', () => {
    expect(validateEnum('a', allowed)).toBe(true);
  });

  it('rejects values not in the allowed list', () => {
    expect(validateEnum('d', allowed)).toBe(false);
  });
});

describe('validateLength', () => {
  it('accepts strings within range', () => {
    expect(validateLength('abc', 1, 5)).toBe(true);
    expect(validateLength('a', 1, 1)).toBe(true);
  });

  it('rejects strings outside range', () => {
    expect(validateLength('', 1, 5)).toBe(false);
    expect(validateLength('toolong', 1, 3)).toBe(false);
  });
});
