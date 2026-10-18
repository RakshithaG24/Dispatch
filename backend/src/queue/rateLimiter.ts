import { redis } from '../redis';

const HOUR_MS = 3_600_000;

/**
 * Atomic slot reservation, executed inside Redis so that any number of
 * workers or server instances share one view of each sender's capacity.
 *
 * KEYS[1]  next-free-slot key for the sender (epoch ms)
 * ARGV[1]  now (epoch ms)
 * ARGV[2]  minimum gap between sends from this sender (ms)
 * ARGV[3]  max sends per clock hour for this sender
 * ARGV[4]  prefix of the per-hour counter keys, e.g. "rl:count:<sender>:"
 *
 * Algorithm: start at the later of "now" and the sender's next free slot.
 * If that clock hour already holds `limit` sends, jump to the start of the
 * following hour and test again. Take the first hour with room, increment its
 * counter, and push the sender's next free slot forward by the gap.
 * Returns { slot, hitLimit } where hitLimit is 1 if any hour was full.
 */
const RESERVE_SCRIPT = `
local now = tonumber(ARGV[1])
local gap = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local prefix = ARGV[4]
local HOUR = 3600000

local nextFree = tonumber(redis.call('GET', KEYS[1]) or '0')
local slot = math.max(now, nextFree)
local window = math.floor(slot / HOUR)
local hitLimit = 0

while true do
  local count = tonumber(redis.call('GET', prefix .. window) or '0')
  if count < limit then
    redis.call('SET', prefix .. window, count + 1)
    redis.call('PEXPIRE', prefix .. window, (window + 2) * HOUR - now)
    break
  end
  hitLimit = 1
  window = window + 1
  slot = window * HOUR
end

redis.call('SET', KEYS[1], slot + gap, 'PX', (slot + gap - now) + HOUR)
return { slot, hitLimit }
`;

redis.defineCommand('reserveSendSlot', { numberOfKeys: 1, lua: RESERVE_SCRIPT });

declare module 'ioredis' {
  interface RedisCommander<Context> {
    reserveSendSlot(key: string, now: number, gapMs: number, limit: number, prefix: string): Promise<[number, number]>;
  }
}

export interface SlotReservation {
  /** Epoch ms at which the send may happen. */
  slotAt: number;
  /** True when the sender's hourly limit forced the slot into a later hour. */
  hitHourlyLimit: boolean;
}

export async function reserveSendSlot(params: {
  senderId: string;
  now: number;
  gapMs: number;
  hourlyLimit: number;
}): Promise<SlotReservation> {
  const [slotAt, hit] = await redis.reserveSendSlot(
    `rl:next:${params.senderId}`,
    params.now,
    params.gapMs,
    params.hourlyLimit,
    `rl:count:${params.senderId}:`,
  );
  return { slotAt: Number(slotAt), hitHourlyLimit: Number(hit) === 1 };
}

/** Start of the clock hour that contains the given epoch ms. */
export function hourWindowStart(epochMs: number): number {
  return Math.floor(epochMs / HOUR_MS) * HOUR_MS;
}
