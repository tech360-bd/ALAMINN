/**
 * @mention parsing (catalogue: "Chat Mentions").
 * Syntax: @DisplayName or @displayName; matched against conversation
 * participants, so mentions never leak users outside the conversation.
 */
export function parseMentions(body: string, participants: { id: string; displayName: string }[]): string[] {
  const ids: string[] = [];
  for (const p of participants) {
    const esc = p.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|\\s)@${esc}(?=\\s|$|[.,!?।])`, 'iu');
    if (re.test(body)) ids.push(p.id);
  }
  return [...new Set(ids)];
}
