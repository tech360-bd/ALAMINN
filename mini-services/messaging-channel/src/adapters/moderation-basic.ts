/**
 * Built-in ModerationService: per-tenant configurable wordlist with two
 * severities — `block` (message rejected) and `flag` (message delivered but
 * recorded). Tenant admins manage the list; screening is deterministic and
 * self-hosted. A licensed vendor moderation adapter can replace this behind
 * the same interface only after the Phase 3 owner-approval gate.
 */
import type { ModerationService, ModerationVerdict } from './types';
import { db } from '../db';

export class WordlistModerationService implements ModerationService {
  readonly provider = 'builtin-wordlist';

  async screen(content: {
    tenantId: string;
    senderId: string;
    text: string;
  }): Promise<ModerationVerdict> {
    const words = await db.moderationWord.findMany({
      where: { tenantId: content.tenantId },
    });
    if (words.length === 0) return { action: 'allow' };

    const haystack = content.text.toLowerCase();
    const categories: string[] = [];
    for (const w of words) {
      if (haystack.includes(w.word.toLowerCase())) {
        if (w.severity === 'block') {
          return { action: 'block', reason: `blocked term (${w.word})`, categories: [w.word] };
        }
        categories.push(w.word);
      }
    }
    if (categories.length > 0) return { action: 'flag', categories, reason: 'flagged terms present' };
    return { action: 'allow' };
  }
}
