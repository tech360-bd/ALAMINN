/**
 * Built-in AgentConsoleBridge: publishes handoff and workspace events over
 * the same socket.io cluster the console UI subscribes to. This is the
 * "event bridge from handoff controller to console" of the merge plan.
 */
import type { AgentConsoleBridge, HandoffPayload } from './types';
import { emitToConversation } from '../lib/realtime';

export class SocketAgentConsoleBridge implements AgentConsoleBridge {
  readonly provider = 'builtin-socket';

  async publishHandoff(payload: HandoffPayload): Promise<void> {
    // Agents listen on the tenant room; participants on the conversation room.
    emitToConversation(payload.conversationId, 'handoff:new', payload);
    emitToConversation(payload.conversationId, 'notify', {
      kind: 'handoff',
      title: 'Human handoff requested',
      body: `Conversation ${payload.conversationId} flagged (${payload.trigger})`,
      conversationId: payload.conversationId,
      handoffId: payload.handoffId,
    });
  }

  async publishHandoffUpdate(payload: HandoffPayload & { status: string }): Promise<void> {
    emitToConversation(payload.conversationId, 'handoff:update', payload);
  }
}
