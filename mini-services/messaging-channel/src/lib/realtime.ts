/**
 * Real-time layer (socket.io). Clients authenticate with a userId, join
 * conversation rooms, and exchange typing indicators, receipts, presence and
 * in-app notifications. Path/query contract follows the gateway rules:
 * clients connect with io('/?XTransformPort=3010') and never embed a port.
 */
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { db } from '../db';

let io: Server | null = null;
const socketUser = new Map<string, string>(); // socketId -> userId

export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    socket.on('auth', async ({ userId }: { userId: string }) => {
      try {
        const user = await db.messagingUser.findUnique({ where: { id: userId } });
        if (!user || user.isBanned) {
          socket.emit('auth:error', { reason: user ? 'banned' : 'unknown_user' });
          return;
        }
        socketUser.set(socket.id, userId);
        socket.data.userId = userId;
        socket.data.tenantId = user.tenantId;
        await socket.join(`tenant:${user.tenantId}`);
        // presence (catalogue: "Last Seen")
        await db.messagingUser.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
        io!.emit('presence', { userId, online: true, lastSeenAt: new Date().toISOString() });

        // Auto-join the user's conversation rooms so receipts/typing work
        const parts = await db.conversationParticipant.findMany({
          where: { userId },
          select: { conversationId: true },
        });
        for (const p of parts) await socket.join(`conv:${p.conversationId}`);

        socket.emit('auth:ok', { userId, tenantId: user.tenantId, rooms: parts.map((p) => p.conversationId) });
      } catch (err) {
        socket.emit('auth:error', { reason: String(err).slice(0, 200) });
      }
    });

    socket.on('conversation:join', async ({ conversationId }: { conversationId: string }) => {
      const userId = socket.data.userId as string | undefined;
      if (!userId) return;
      const member = await db.conversationParticipant.findFirst({
        where: { conversationId, userId },
      });
      if (!member) return; // never join non-members
      await socket.join(`conv:${conversationId}`);
    });

    // Typing indicators (catalogue: "Typing Indicators")
    socket.on('typing', ({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) => {
      const userId = socket.data.userId as string | undefined;
      if (!userId) return;
      socket.to(`conv:${conversationId}`).emit('typing', { conversationId, userId, isTyping });
    });

    socket.on('disconnect', async () => {
      const userId = socketUser.get(socket.id);
      if (userId) {
        const lastSeenAt = new Date();
        await db.messagingUser.update({ where: { id: userId }, data: { lastSeenAt } }).catch(() => {});
        io?.emit('presence', { userId, online: false, lastSeenAt: lastSeenAt.toISOString() });
        socketUser.delete(socket.id);
      }
    });
  });

  return io;
}

export function getIo(): Server {
  if (!io) throw new Error('Realtime not initialised');
  return io;
}

export function onlineUserIds(): string[] {
  return [...new Set(socketUser.values())];
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(`conv:${conversationId}`).emit(event, payload);
}

export function emitToTenant(tenantId: string, event: string, payload: unknown): void {
  io?.to(`tenant:${tenantId}`).emit(event, payload);
}
