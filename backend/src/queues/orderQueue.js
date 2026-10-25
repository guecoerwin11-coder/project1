import { Queue } from 'bullmq'
import { createQueueConnection } from '../configs/redis.js'
import { ServiceUnavailable } from '../utils/errorClass.js'
import logger from '../logger/logger.js'

export const ORDER_QUEUE = 'orders'

let queue
let connection

// If Redis is down, BullMQ waits for it to come back. A user should not wait
// that long, so every queue call gets a time limit and then fails with 503.
const QUEUE_TIMEOUT_MS = Number(process.env.QUEUE_TIMEOUT_MS) || 3000

const withTimeout = (promise) => {
    let timer
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`queue did not answer within ${QUEUE_TIMEOUT_MS}ms`)), QUEUE_TIMEOUT_MS)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Created on first use, so the API can start (and tests can run) without Redis.
const getQueue = () => {
    if(!queue){
        connection = createQueueConnection()
        // Without this listener, a Redis outage would crash the API process
        connection.on('error', (err) => logger.error({ message: 'Redis connection error', error: err.message }))

        queue = new Queue(ORDER_QUEUE, {
            connection,
            defaultJobOptions: {
                // Retry unexpected failures, like a database hiccup, up to 3 times.
                // Business failures, like no stock, are never retried.
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                // Keep finished jobs for a while, so users can still check their status
                removeOnComplete: { age: 24 * 3600, count: 1000 },
                removeOnFail: { age: 7 * 24 * 3600 }
            }
        })
        queue.on('error', (err) => logger.error({ message: 'Order queue error', error: err.message }))
    }
    return queue
}

// Adds an order to the back of the line.
// For cart checkout, only one job per user can wait at a time. A second click
// while the first is still waiting returns the same job, so a double click never
// creates two orders. Direct orders are never merged, because each can be different.
export const enqueueOrder = async ({ userId, items, source }) => {
    const options = source === 'cart'
        ? { deduplication: { id: `checkout:${userId}` } }
        : {}

    try{
        const added = await withTimeout(getQueue().add('place-order', { userId, items, source }, options))

        // When a job is merged into an existing one, BullMQ returns the existing id
        // but keeps the NEW data in memory. Re-read the stored job to get the truth.
        const stored = await withTimeout(getQueue().getJob(added.id))
        const job = stored || added
        return { job, alreadyQueued: job.timestamp !== added.timestamp }
    }catch(err){
        logger.error({ message: 'Could not add order to queue', userId, error: err.message })
        throw new ServiceUnavailable('order queue is unavailable, please try again')
    }
}

export const getOrderJob = async (jobId) => {
    try{
        return await withTimeout(getQueue().getJob(jobId))
    }catch(err){
        logger.error({ message: 'Could not read order job', jobId, error: err.message })
        throw new ServiceUnavailable('order queue is unavailable, please try again')
    }
}

// The job's place in line, starting at 1 for the next job to be processed.
// Reads the whole waiting list, which is fine for thousands of jobs.
// For millions, store a counter instead.
export const getQueuePosition = async (job) => {
    const waiting = await withTimeout(getQueue().getJobs(['waiting'], 0, -1, true))
    const index = waiting.findIndex(waitingJob => waitingJob.id === job.id)
    return index === -1 ? null : index + 1
}

// BullMQ has more states than the frontend needs. These are the ones we show.
//   waiting    in line, not started yet
//   processing a worker is placing the order right now
//   retrying   failed for an unexpected reason, will try again soon
//   completed  the order was placed
//   failed     the order could not be placed, see error
const STATUS_NAMES = {
    waiting: 'waiting',
    prioritized: 'waiting',
    active: 'processing',
    delayed: 'retrying',
    completed: 'completed',
    failed: 'failed'
}

// A short summary of a job: its id, status, and place in line if it is waiting
export const describeOrderJob = async (job) => {
    let state
    let position
    try{
        state = await withTimeout(job.getState())
        if(STATUS_NAMES[state] === 'waiting'){
            position = await getQueuePosition(job)
        }
    }catch(err){
        logger.error({ message: 'Could not read order job status', jobId: job.id, error: err.message })
        throw new ServiceUnavailable('order queue is unavailable, please try again')
    }

    const status = STATUS_NAMES[state] || 'unknown'

    const summary = { jobId: job.id, status }
    if(status === 'waiting'){
        summary.position = position
    }
    if(status === 'completed'){
        summary.orderId = job.returnvalue?.orderId
    }
    if(status === 'failed'){
        summary.error = job.failedReason
    }
    return summary
}

export const closeOrderQueue = async () => {
    if(queue){
        await queue.close()
        await connection.quit()
        queue = undefined
        connection = undefined
    }
}
