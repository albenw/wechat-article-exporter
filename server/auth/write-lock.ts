import { randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';

const LOCK_KEY = 'auth:account-write-lock';
const LOCK_TTL_SECONDS = 15;
const LOCK_RETRY_COUNT = 100;
const RELEASE_LOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

let localTail = Promise.resolve();
let redis: Redis | undefined;

function getRedis(): Redis | null {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  redis ||= new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
  return redis;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function withLocalLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = localTail;
  let release: () => void = () => {};
  localTail = previous.then(
    () =>
      new Promise<void>(resolve => {
        release = resolve;
      })
  );
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

/** Serializes account mutations across Vercel instances and local development. */
export async function withAccountWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const client = getRedis();
  if (!client) return withLocalLock(operation);

  const owner = randomBytes(24).toString('base64url');
  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt++) {
    const acquired = await client.set(LOCK_KEY, owner, { nx: true, ex: LOCK_TTL_SECONDS });
    if (acquired === 'OK') {
      try {
        return await operation();
      } finally {
        await client.eval(RELEASE_LOCK_SCRIPT, [LOCK_KEY], [owner]);
      }
    }
    await sleep(25 + Math.floor(Math.random() * 25));
  }
  throw createError({ statusCode: 503, statusMessage: '账号管理操作繁忙，请稍后重试' });
}
