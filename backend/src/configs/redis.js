import { Redis } from 'ioredis'

// Redis connections for BullMQ.
// Set REDIS_URL in .env, for example redis://localhost:6379
// or rediss://user:password@host:6380 for a hosted Redis with TLS.
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// The API side. If Redis is down, fail fast instead of making the request hang.
export const createQueueConnection = () => new Redis(REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1
})

// The worker side. BullMQ requires maxRetriesPerRequest to be null for workers,
// so the worker keeps waiting for jobs and reconnects by itself.
export const createWorkerConnection = () => new Redis(REDIS_URL, {
    maxRetriesPerRequest: null
})
