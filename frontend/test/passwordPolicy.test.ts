import { describe, expect, it } from 'vitest';
import { validatePasswordStrength } from '../src/lib/passwordPolicy';

describe('validatePasswordStrength (frontend)', () => {
  it('returns null for a password meeting all requirements', () => {
    expect(validatePasswordStrength('Str0ng!Pass')).toBeNull();
  });

  it('lists what is missing for a weak password', () => {
    const message = validatePasswordStrength('weak');
    expect(message).toMatch(/10 caractères/);
    expect(message).toMatch(/majuscule/);
    expect(message).toMatch(/chiffre/);
    expect(message).toMatch(/caractère spécial/);
  });
});
