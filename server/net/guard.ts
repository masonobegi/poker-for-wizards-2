/**
 * Abuse protection.
 *
 * A public game server is an open socket that strangers can hold. Without
 * this, one script can open a thousand tables, or flood a room with a million
 * chat messages, and every real player's game stops. None of it is clever — it
 * is a token bucket and two counters — but it is the difference between a
 * server that survives being linked somewhere and one that does not.
 */
import type { Socket } from 'socket.io';
import { config } from '../config';

interface Bucket {
  tokens: number;
  last: number;
  strikes: number;
}

const buckets = new WeakMap<Socket, Bucket>();
const socketsByIp = new Map<string, number>();
const roomsByIp = new Map<string, number[]>();

export function addressOf(socket: Socket): string {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return socket.handshake.address ?? 'unknown';
}

/** Returns false when this address already holds too many sockets. */
export function acceptSocket(socket: Socket): boolean {
  const ip = addressOf(socket);
  const n = socketsByIp.get(ip) ?? 0;
  if (n >= config.limits.maxSocketsPerIp) return false;
  socketsByIp.set(ip, n + 1);
  return true;
}

export function releaseSocket(socket: Socket): void {
  const ip = addressOf(socket);
  const n = socketsByIp.get(ip) ?? 0;
  if (n <= 1) socketsByIp.delete(ip);
  else socketsByIp.set(ip, n - 1);
}

/** Token bucket. Returns false when this socket is going too fast. */
export function allowMessage(socket: Socket): boolean {
  const now = Date.now();
  let b = buckets.get(socket);
  if (!b) {
    b = { tokens: config.limits.messagesPerSecond, last: now, strikes: 0 };
    buckets.set(socket, b);
  }

  const refill = ((now - b.last) / 1000) * config.limits.messagesPerSecond;
  b.tokens = Math.min(config.limits.messagesPerSecond, b.tokens + refill);
  b.last = now;

  if (b.tokens < 1) {
    b.strikes += 1;
    if (b.strikes > config.limits.floodStrikes) {
      socket.emit('kicked', { reason: 'Too many requests' });
      socket.disconnect(true);
    }
    return false;
  }

  b.tokens -= 1;
  // Behaving again slowly forgives past strikes.
  if (b.strikes > 0 && b.tokens > config.limits.messagesPerSecond * 0.8) b.strikes -= 1;
  return true;
}

/** Returns false when this address has created too many rooms recently. */
export function allowRoomCreate(socket: Socket): boolean {
  const ip = addressOf(socket);
  const now = Date.now();
  const hourAgo = now - 3_600_000;
  const recent = (roomsByIp.get(ip) ?? []).filter((t) => t > hourAgo);
  if (recent.length >= config.limits.roomsPerIpPerHour) {
    roomsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  roomsByIp.set(ip, recent);
  return true;
}

/**
 * Wrap every handler on a socket so the rate limit applies once, centrally,
 * instead of being remembered at three dozen call sites.
 */
export function rateLimit(socket: Socket): void {
  socket.use((_event, next) => {
    if (!allowMessage(socket)) {
      next(new Error('rate limited'));
      return;
    }
    next();
  });
  // A rejected packet must not tear the socket down.
  socket.on('error', () => { /* already handled above */ });
}

/** Periodic cleanup so the per-IP maps cannot grow without bound. */
export function startGuardSweep(): NodeJS.Timeout {
  const timer = setInterval(() => {
    const hourAgo = Date.now() - 3_600_000;
    for (const [ip, times] of roomsByIp) {
      const recent = times.filter((t) => t > hourAgo);
      if (recent.length === 0) roomsByIp.delete(ip);
      else roomsByIp.set(ip, recent);
    }
  }, 10 * 60_000);
  timer.unref?.();
  return timer;
}

export const guardStats = () => ({
  addresses: socketsByIp.size,
  sockets: [...socketsByIp.values()].reduce((a, b) => a + b, 0),
});
