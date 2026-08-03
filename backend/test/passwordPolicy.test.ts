import { describe, expect, it } from 'vitest';
import { validatePasswordStrength } from '../src/lib/passwordPolicy';

describe('validatePasswordStrength', () => {
  it('accepts a password meeting all requirements', () => {
    expect(() => validatePasswordStrength('Str0ng!Pass')).not.toThrow();
  });

  it('rejects a password shorter than 10 characters', () => {
    expect(() => validatePasswordStrength('Sh0rt!')).toThrow(/10 caractères/);
  });

  it('rejects a password with no uppercase letter', () => {
    expect(() => validatePasswordStrength('str0ng!pass')).toThrow(/majuscule/);
  });

  it('rejects a password with no lowercase letter', () => {
    expect(() => validatePasswordStrength('STR0NG!PASS')).toThrow(/minuscule/);
  });

  it('rejects a password with no digit', () => {
    expect(() => validatePasswordStrength('Strong!Pass')).toThrow(/chiffre/);
  });

  it('rejects a password with no special character', () => {
    expect(() => validatePasswordStrength('Str0ngPassword')).toThrow(/caractère spécial/);
  });

  it('lists every missing requirement at once', () => {
    expect(() => validatePasswordStrength('short')).toThrow(
      /10 caractères.*majuscule.*chiffre.*caractère spécial/,
    );
  });
});
