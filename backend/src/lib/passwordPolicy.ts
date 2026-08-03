const MIN_LENGTH = 10;
const SPECIAL_CHAR_RE = /[^A-Za-z0-9]/;

export const PASSWORD_POLICY_DESCRIPTION =
  'au moins 10 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial';

// Appliquée partout où un mot de passe est défini : création de compte par
// l'admin, modification par l'admin, changement par l'utilisateur lui-même.
export function validatePasswordStrength(password: string): void {
  const missing: string[] = [];
  if (password.length < MIN_LENGTH) missing.push(`${MIN_LENGTH} caractères minimum`);
  if (!/[a-z]/.test(password)) missing.push('une lettre minuscule');
  if (!/[A-Z]/.test(password)) missing.push('une lettre majuscule');
  if (!/[0-9]/.test(password)) missing.push('un chiffre');
  if (!SPECIAL_CHAR_RE.test(password)) missing.push('un caractère spécial');

  if (missing.length > 0) {
    throw new Error(`Le mot de passe doit contenir : ${missing.join(', ')}`);
  }
}
