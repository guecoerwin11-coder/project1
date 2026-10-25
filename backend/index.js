import 'dotenv/config'
import app from './src/app.js'
import prisma from './src/configs/postgres.js'
import { closeOrderQueue } from './src/queues/orderQueue.js'

const PORT = process.env.PORT || 3000

const server = app.listen(PORT, () => {
    console.log(`server run on: http://localhost:${PORT}`)
})

// Docker sends SIGTERM when it stops a container. Stop taking new requests,
// let open ones finish, then close the database and Redis connections.
const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`)
    server.close(async () => {
        await closeOrderQueue()
        await prisma.$disconnect()
        process.exit(0)
    })
    // If something hangs, force exit after 10 seconds
    setTimeout(() => process.exit(1), 10000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
