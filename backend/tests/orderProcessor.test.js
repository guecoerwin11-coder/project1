import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { UnrecoverableError } from 'bullmq'

// Fake database for the worker. No Redis needed: we call the job function directly,
// the same way the BullMQ worker would.
const prismaMock = {
    product: {
        updateMany: jest.fn(),
        findUnique: jest.fn()
    },
    order: {
        create: jest.fn()
    },
    cartItem: {
        deleteMany: jest.fn()
    },
    $transaction: jest.fn(async (callback) => callback(prismaMock))
}
jest.unstable_mockModule('../src/configs/postgres.js', () => ({ default: prismaMock }))

const { processOrderJob } = await import('../src/workers/orderProcessor.js')

// A fake BullMQ job: the worker only reads job.data
const makeJob = (data) => ({
    id: 'job-1',
    data: {
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 2 }, { productId: 'prod-2', quantity: 1 }],
        source: 'direct',
        ...data
    }
})

beforeEach(() => {
    prismaMock.product.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.order.create.mockResolvedValue({ id: 'order-9', carts: [] })
    prismaMock.cartItem.deleteMany.mockResolvedValue({ count: 2 })
})

describe('processOrderJob', () => {
    it('places the order and returns its id as the job result', async () => {
        const result = await processOrderJob(makeJob())

        expect(result).toEqual({ orderId: 'order-9' })
        expect(prismaMock.order.create.mock.calls[0][0].data).toMatchObject({
            userId: 'user-1',
            carts: {
                create: [
                    { productId: 'prod-1', quantity: 2 },
                    { productId: 'prod-2', quantity: 1 }
                ]
            }
        })
    })

    it('reduces stock safely for every product', async () => {
        await processOrderJob(makeJob())

        expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
            where: { id: 'prod-1', stock: { gte: 2 } },
            data: { stock: { decrement: 2 } }
        })
        expect(prismaMock.product.updateMany).toHaveBeenCalledTimes(2)
    })

    it('runs everything in one transaction', async () => {
        await processOrderJob(makeJob())

        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    })

    it('does not touch the cart for a direct order', async () => {
        await processOrderJob(makeJob({ source: 'direct' }))

        expect(prismaMock.cartItem.deleteMany).not.toHaveBeenCalled()
    })

    it('removes only the ordered products from the cart for a checkout', async () => {
        await processOrderJob(makeJob({ source: 'cart' }))

        expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({
            where: { userId: 'user-1', productId: { in: ['prod-1', 'prod-2'] } }
        })
    })

    it('fails without retry when stock ran out, and keeps the cart', async () => {
        prismaMock.product.updateMany.mockResolvedValue({ count: 0 })
        prismaMock.product.findUnique.mockResolvedValue({ name: 'Mouse', stock: 1 })

        const run = processOrderJob(makeJob({ source: 'cart' }))

        await expect(run).rejects.toBeInstanceOf(UnrecoverableError)
        await expect(run).rejects.toThrow('not enough stock for Mouse, only 1 left')
        expect(prismaMock.order.create).not.toHaveBeenCalled()
        expect(prismaMock.cartItem.deleteMany).not.toHaveBeenCalled()
    })

    it('fails without retry when a product was deleted', async () => {
        prismaMock.product.updateMany.mockResolvedValue({ count: 0 })
        prismaMock.product.findUnique.mockResolvedValue(null)

        await expect(processOrderJob(makeJob())).rejects.toBeInstanceOf(UnrecoverableError)
    })

    it('lets unexpected errors through so BullMQ retries them', async () => {
        prismaMock.$transaction.mockRejectedValueOnce(new Error('connection lost'))

        const run = processOrderJob(makeJob())

        await expect(run).rejects.toThrow('connection lost')
        await expect(run).rejects.not.toBeInstanceOf(UnrecoverableError)
    })
})
