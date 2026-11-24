/** Channel-agnostic contact identity matching (pure, unit-testable). */
export interface ContactIdentity {
  email?: string | null;
  phone?: string | null;
  externalRef?: string | null;
  displayName?: string | null;
}

export interface ContactCandidate {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  externalRef: string | null;
}

function normalizedEmail(value?: string | null): string | null {
  const email = value?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

function normalizedPhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 7 ? digits : null;
}

/**
 * Match by externalRef first (strongest), then verified email, then phone.
 * Returns null when identity is too weak or no contact matches.
 */
export function findContactMatch<T extends ContactCandidate>(
  contacts: T[],
  identity: ContactIdentity
): T | null {
  const ref = identity.externalRef?.trim();
  if (ref) {
    const byRef = contacts.find((c) => c.externalRef?.trim() === ref);
    if (byRef) return byRef;
  }
  const email = normalizedEmail(identity.email);
  if (email) {
    const byEmail = contacts.find((c) => c.email?.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const phone = normalizedPhone(identity.phone);
  if (phone) {
    const byPhone = contacts.find(
      (c) => c.phone && c.phone.replace(/[^\d]/g, "") === phone
    );
    if (byPhone) return byPhone;
  }
  return null;
}

/** Deterministic external reference for webhook identities. */
export function makeExternalRef(channel: string, externalId: string): string {
  return `${channel.trim().toLowerCase()}:${externalId.trim().toLowerCase()}`;
}
