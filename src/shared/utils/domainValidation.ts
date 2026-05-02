/**
 * Domain validation for Inkfish and Krakenfleet organizations.
 * Only users with approved email domains can register and sign in.
 */

const ALLOWED_DOMAINS = ['ink.fish', 'krakenfleet.co'] as const;

export type AllowedDomain = (typeof ALLOWED_DOMAINS)[number];

export function getEmailDomain(email: string): string {
  const parts = email.trim().toLowerCase().split('@');
  return parts[1] ?? '';
}

export function isAllowedDomain(email: string): boolean {
  const domain = getEmailDomain(email);
  return ALLOWED_DOMAINS.includes(domain as AllowedDomain);
}

export function getAllowedDomains(): readonly string[] {
  return ALLOWED_DOMAINS;
}

export function getDomainValidationError(email: string): string | null {
  if (!email.includes('@')) return null; // Let the email format validator handle this
  if (isAllowedDomain(email)) return null;
  return `Access is restricted to ${ALLOWED_DOMAINS.map((d) => `@${d}`).join(' and ')} email addresses.`;
}
