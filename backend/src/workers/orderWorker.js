import { Worker } from 'bullmq'
import { createWorkerConnection } from '../configs/redis.js'
import { ORDER_QUEUE } from '../queues/orderQueue.js'
import { processOrderJob } from './orderProcessor.js'
import logger from '../logger/logger.js'

// Starts pulling order jobs from the queue.
// ORDER_WORKER_CONCURRENCY = how many orders are processed at the same time.
// 1 means strict first come, first served. Stock stays correct with any number,
// because each order reduces stock with a safe database update.
export const startOrderWorker = () => {
    const concurrency = Number(process.env.ORDER_WORKER_CONCURRENCY) || 1

    const connection = createWorkerConnection()
    connection.on('error', (err) => logger.error({ message: 'Redis connection error', error: err.message }))

    const worker = new Worker(ORDER_QUEUE, processOrderJob, {
        connection,
        concurrency
    })

    worker.on('ready', () => {
        logger.info({ message: 'Order worker ready', concurrency })
    })

    worker.on('completed', (job, result) => {
        logger.info({ message: 'Order job completed', jobId: job.id, orderId: result.orderId, userId: job.data.userId })
    })

    worker.on('failed', (job, err) => {
        logger.warn({ message: 'Order job failed', jobId: job?.id, attempt: job?.attemptsMade, userId: job?.data?.userId, error: err.message })
    })

    worker.on('error', (err) => {
        logger.error({ message: 'Order worker error', error: err.message })
    })

    return worker
}
