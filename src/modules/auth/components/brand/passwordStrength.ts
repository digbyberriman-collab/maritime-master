/**
 * A simple, local password strength hint for the sign-up and reset forms.
 * It never blocks submission beyond the 8-character minimum; Supabase Auth
 * applies the real policy.
 */
export type PasswordStrengthLevel = 'weak' | 'medium' | 'strong';

export interface PasswordStrength {
  /** 0–5: one point each for ≥ 8 chars, ≥ 12 chars, an upper-case letter, a digit, a symbol. */
  score: number;
  level: PasswordStrengthLevel;
  label: string;
}

export const PASSWORD_MIN_LENGTH = 8;

export function passwordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 2) return { score, level: 'weak', label: 'Weak' };
  if (score === 3) return { score, level: 'medium', label: 'Medium' };
  return { score, level: 'strong', label: 'Strong' };
}
