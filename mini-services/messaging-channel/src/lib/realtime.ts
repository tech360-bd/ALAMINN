import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { db } from '../db';
import { conversationMember, messagingStaff, tenantActor } from './access';

let io: Server | null = null;
const actorRoom = (id: string) => `actor:${id}`;

export function initRealtime(httpServer: HttpServer): Server {
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : null;
  const server = new Server(httpServer, {
    path: '/socket.io/umc', addTrailingSlash: false,
    allowRequest: (req, done) => {
      const origin = req.headers.origin;
      try { done(null, !origin || origin === siteOrigin || new URL(origin).host === req.headers.host); }
      catch { done(null, false); }
    },
  });
  io = server;
  server.use(async (socket, next) => {
    try {
      const tenantId = socket.handshake.auth?.tenantId;
      const staff = await messagingStaff(socket.request.headers.cookie);
      const actor = staff && typeof tenantId === 'string' && tenantId.length <= 191 ? await tenantActor(staff, tenantId) : null;
      if (!actor) return next(new Error('Unauthorized'));
      socket.data.userId = actor.id;
      socket.data.tenantId = actor.tenantId;
      next();
    } catch { next(new Error('Unauthorized')); }
  });
  server.on('connection', (socket) => {
    const { userId, tenantId } = socket.data as { userId: string; tenantId: string };
    const refresh = async () => {
      const staff = await messagingStaff(socket.request.headers.cookie);
      if (!staff || (await tenantActor(staff, tenantId))?.id !== userId) {
        socket.disconnect(true);
        return false;
      }
      return true;
    };
    const syncConversationRooms = async () => {
      const parts = await db.conversationParticipant.findMany({ where: { userId, conversation: { tenantId } }, select: { conversationId: true } });
      if (!socket.connected) return;
      const rooms = new Set(parts.map(({ conversationId }) => `conv:${conversationId}`));
      for (const room of socket.rooms) if (room.startsWith('conv:') && !rooms.has(room)) await socket.leave(room);
      await socket.join([...rooms]);
    };
    const timer = setInterval(() => {
      void refresh().then((valid) => valid && syncConversationRooms()).catch(() => socket.disconnect(true));
    }, 10_000);
    socket.on('disconnect', () => {
      clearInterval(timer);
      if (!server.sockets.adapter.rooms.get(actorRoom(userId))?.size) {
        const lastSeenAt = new Date();
        void db.messagingUser.update({ where: { id: userId }, data: { lastSeenAt } }).catch(() => {});
        emitToTenant(tenantId, 'presence', { userId, online: false, lastSeenAt: lastSeenAt.toISOString() });
      }
    });
    const ready = (async () => {
      await socket.join([actorRoom(userId), `tenant:${tenantId}`]);
      await syncConversationRooms();
      if (!socket.connected) return;
      const lastSeenAt = new Date();
      await db.messagingUser.update({ where: { id: userId }, data: { lastSeenAt } });
      emitToTenant(tenantId, 'presence', { userId, online: true, lastSeenAt: lastSeenAt.toISOString() });
      socket.emit('auth:ok', { userId, tenantId });
    })();
    void ready.catch(() => socket.disconnect(true));
    socket.on('conversation:join', (payload?: { conversationId?: string }) => {
      const id = payload?.conversationId;
      if (typeof id !== 'string') return;
      void (async () => {
        await ready;
        if (await refresh() && await conversationMember(id, userId, tenantId)) await socket.join(`conv:${id}`);
      })().catch(() => socket.disconnect(true));
    });
    socket.on('typing', (payload?: { conversationId?: string; isTyping?: boolean }) => {
      const id = payload?.conversationId;
      if (typeof id !== 'string' || typeof payload?.isTyping !== 'boolean') return;
      void (async () => {
        await ready;
        if (await refresh() && await conversationMember(id, userId, tenantId)) {
          socket.to(`conv:${id}`).emit('typing', { conversationId: id, userId, isTyping: payload.isTyping });
        }
      })().catch(() => socket.disconnect(true));
    });
  });
  return server;
}

export function joinConversationSockets(userId: string, conversationId: string): void {
  io?.in(actorRoom(userId)).socketsJoin(`conv:${conversationId}`);
}

export function onlineUserIds(tenantIds?: ReadonlySet<string>): string[] {
  return [...new Set([...io?.sockets.sockets.values() ?? []].filter((socket) => !tenantIds || tenantIds.has(socket.data.tenantId)).map((socket) => socket.data.userId as string))];
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(`conv:${conversationId}`).emit(event, payload);
}

export function emitToTenant(tenantId: string, event: string, payload: unknown): void {
  io?.to(`tenant:${tenantId}`).emit(event, payload);
}
