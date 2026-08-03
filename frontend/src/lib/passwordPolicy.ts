export const PASSWORD_POLICY_HINT = 'Minimum 10 caractères, avec majuscule, minuscule, chiffre et caractère spécial.';

// Miroir de la validation backend (backend/src/lib/passwordPolicy.ts), pour
// un retour immédiat côté formulaire. Le serveur reste la source de vérité.
export function validatePasswordStrength(password: string): string | null {
  const missing: string[] = [];
  if (password.length < 10) missing.push('10 caractères minimum');
  if (!/[a-z]/.test(password)) missing.push('une lettre minuscule');
  if (!/[A-Z]/.test(password)) missing.push('une lettre majuscule');
  if (!/[0-9]/.test(password)) missing.push('un chiffre');
  if (!/[^A-Za-z0-9]/.test(password)) missing.push('un caractère spécial');

  if (missing.length === 0) return null;
  return `Le mot de passe doit contenir : ${missing.join(', ')}`;
}
