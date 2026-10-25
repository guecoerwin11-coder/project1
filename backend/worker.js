import 'dotenv/config'
import { startOrderWorker } from './src/workers/orderWorker.js'
import prisma from './src/configs/postgres.js'

// Run with: npm run worker
// The API (index.js) only adds orders to the queue. This process places them.
// In production you can run several workers on different machines.
const worker = startOrderWorker()
console.log('order worker started, waiting for jobs...')

// Finish the current job before stopping, so no order is left half done
const shutdown = async (signal) => {
    console.log(`${signal} received, closing order worker...`)
    await worker.close()
    await prisma.$disconnect()
    process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
