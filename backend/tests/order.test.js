import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import jwt from 'jsonwebtoken'

// Fake database: only the functions the order controller uses
const prismaMock = {
    order: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn()
    },
    product: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn()
    },
    // A real transaction runs the callback with a transaction client.
    // Here the "transaction client" is just the same fake database.
    $transaction: jest.fn(async (callback) => callback(prismaMock))
}
jest.unstable_mockModule('../src/configs/postgres.js', () => ({ default: prismaMock }))
jest.unstable_mockModule('../src/logger/logger.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))

// Fake order queue, so tests never need Redis
const queueMock = {
    enqueueOrder: jest.fn(),
    getOrderJob: jest.fn(),
    describeOrderJob: jest.fn()
}
jest.unstable_mockModule('../src/queues/orderQueue.js', () => queueMock)

process.env.JWT_PASS = 'test-access-secret'

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')
const { ServiceUnavailable } = await import('../src/utils/errorClass.js')

const makeAuth = (id, roles) => {
    const token = jwt.sign({ id, userName: id, email: `${id}@example.com`, roles }, process.env.JWT_PASS)
    return { Authorization: `Bearer ${token}` }
}
const customer = makeAuth('customer-1', 'CUSTOMER')
const otherCustomer = makeAuth('customer-2', 'CUSTOMER')
const seller = makeAuth('seller-1', 'SELLER')
const admin = makeAuth('admin-1', 'ADMIN')

// An order owned by customer-1 with 2 x 19.99 and 1 x 5.50.
// The price lives on each item: it is the price at the moment of purchase.
const makeOrder = (overrides = {}) => ({
    id: 'order-1',
    userId: 'customer-1',
    status: 'PENDING',
    createdAt: '2026-10-23T00:00:00.000Z',
    carts: [
        { id: 'c1', quantity: 2, price: '19.99', productId: 'prod-1', orderId: 'order-1', products: { id: 'prod-1', name: 'Mouse' } },
        { id: 'c2', quantity: 1, price: '5.50', productId: 'prod-2', orderId: 'order-1', products: { id: 'prod-2', name: 'Mousepad' } }
    ],
    ...overrides
})

describe('GET /api/orders', () => {
    it('returns 401 without a token', async () => {
        const res = await request(app).get('/api/orders')

        expect(res.status).toBe(401)
        expect(prismaMock.order.findMany).not.toHaveBeenCalled()
    })

    it('shows a customer only their own orders, with totals', async () => {
        prismaMock.order.findMany.mockResolvedValue([makeOrder()])

        const res = await request(app).get('/api/orders').set(customer)

        expect(res.status).toBe(200)
        expect(prismaMock.order.findMany.mock.calls[0][0].where).toEqual({ userId: 'customer-1' })
        expect(res.body.orders[0].total).toBe('45.48')
    })

    it('shows an admin every order', async () => {
        prismaMock.order.findMany.mockResolvedValue([])

        const res = await request(app).get('/api/orders').set(admin)

        expect(res.status).toBe(200)
        expect(prismaMock.order.findMany.mock.calls[0][0].where).toEqual({})
    })
})

describe('GET /api/orders/:id', () => {
    it('returns the order to its owner', async () => {
        prismaMock.order.findUnique.mockResolvedValue(makeOrder())

        const res = await request(app).get('/api/orders/order-1').set(customer)

        expect(res.status).toBe(200)
        expect(res.body.order.id).toBe('order-1')
        expect(res.body.order.total).toBe('45.48')
    })

    it('returns 404 to a different customer, hiding that the order exists', async () => {
        prismaMock.order.findUnique.mockResolvedValue(makeOrder())

        const res = await request(app).get('/api/orders/order-1').set(otherCustomer)

        expect(res.status).toBe(404)
        expect(res.body.error.message).toBe('order not found')
    })

    it('returns any order to an admin', async () => {
        prismaMock.order.findUnique.mockResolvedValue(makeOrder())

        const res = await request(app).get('/api/orders/order-1').set(admin)

        expect(res.status).toBe(200)
    })

    it('returns 404 when the order does not exist', async () => {
        prismaMock.order.findUnique.mockResolvedValue(null)

        const res = await request(app).get('/api/orders/missing').set(admin)

        expect(res.status).toBe(404)
    })
})

describe('POST /api/orders', () => {
    beforeEach(() => {
        queueMock.enqueueOrder.mockResolvedValue({ job: { id: 'job-1' }, alreadyQueued: false })
        queueMock.describeOrderJob.mockResolvedValue({ jobId: 'job-1', status: 'waiting', position: 1 })
    })

    it('queues the order and answers 202 with the job status', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set(customer)
            .send({ items: [{ productId: 'prod-1', quantity: 2 }, { productId: 'prod-2', quantity: 1 }] })

        expect(res.status).toBe(202)
        expect(res.body).toMatchObject({
            message: 'order queued',
            jobId: 'job-1',
            status: 'waiting',
            position: 1,
            statusUrl: '/api/orders/jobs/job-1'
        })
        expect(queueMock.enqueueOrder).toHaveBeenCalledWith({
            userId: 'customer-1',
            items: [{ productId: 'prod-1', quantity: 2 }, { productId: 'prod-2', quantity: 1 }],
            source: 'direct'
        })
    })

    it('does not touch the database, the worker does that', async () => {
        await request(app)
            .post('/api/orders')
            .set(customer)
            .send({ items: [{ productId: 'prod-1', quantity: 1 }] })

        expect(prismaMock.$transaction).not.toHaveBeenCalled()
        expect(prismaMock.order.create).not.toHaveBeenCalled()
    })

    it('takes the user id from the token, not from the body', async () => {
        await request(app)
            .post('/api/orders')
            .set(customer)
            .send({ userId: 'someone-else', items: [{ productId: 'prod-1', quantity: 1 }] })

        expect(queueMock.enqueueOrder.mock.calls[0][0].userId).toBe('customer-1')
    })

    it('combines duplicate products into one line', async () => {
        await request(app)
            .post('/api/orders')
            .set(customer)
            .send({ items: [{ productId: 'prod-1', quantity: 2 }, { productId: 'prod-1', quantity: 3 }] })

        expect(queueMock.enqueueOrder.mock.calls[0][0].items).toEqual([
            { productId: 'prod-1', quantity: 5 }
        ])
    })

    it('returns 400 when items is empty, without queueing', async () => {
        const res = await request(app).post('/api/orders').set(customer).send({ items: [] })

        expect(res.status).toBe(400)
        expect(queueMock.enqueueOrder).not.toHaveBeenCalled()
    })

    it('returns 400 when a quantity is not a positive whole number', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set(customer)
            .send({ items: [{ productId: 'prod-1', quantity: 0 }] })

        expect(res.status).toBe(400)
        expect(queueMock.enqueueOrder).not.toHaveBeenCalled()
    })

    it('returns 400 when combined quantity is over 100', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set(customer)
            .send({ items: [{ productId: 'prod-1', quantity: 60 }, { productId: 'prod-1', quantity: 60 }] })

        expect(res.status).toBe(400)
    })

    it('returns 503 when the queue is down', async () => {
        queueMock.enqueueOrder.mockRejectedValue(new ServiceUnavailable('order queue is unavailable, please try again'))

        const res = await request(app)
            .post('/api/orders')
            .set(customer)
            .send({ items: [{ productId: 'prod-1', quantity: 1 }] })

        expect(res.status).toBe(503)
        expect(res.body.error.message).toBe('order queue is unavailable, please try again')
    })
})

describe('GET /api/orders/jobs/:jobId', () => {
    // A fake BullMQ job owned by customer-1
    const job = { id: 'job-1', data: { userId: 'customer-1' } }

    it('returns 401 without a token', async () => {
        const res = await request(app).get('/api/orders/jobs/job-1')

        expect(res.status).toBe(401)
    })

    it('shows the owner their place in line', async () => {
        queueMock.getOrderJob.mockResolvedValue(job)
        queueMock.describeOrderJob.mockResolvedValue({ jobId: 'job-1', status: 'waiting', position: 4 })

        const res = await request(app).get('/api/orders/jobs/job-1').set(customer)

        expect(res.status).toBe(200)
        expect(res.body).toEqual({ jobId: 'job-1', status: 'waiting', position: 4 })
    })

    it('includes the full order once completed', async () => {
        queueMock.getOrderJob.mockResolvedValue(job)
        queueMock.describeOrderJob.mockResolvedValue({ jobId: 'job-1', status: 'completed', orderId: 'order-1' })
        prismaMock.order.findUnique.mockResolvedValue(makeOrder())

        const res = await request(app).get('/api/orders/jobs/job-1').set(customer)

        expect(res.status).toBe(200)
        expect(res.body.order.id).toBe('order-1')
        expect(res.body.order.total).toBe('45.48')
    })

    it('shows the reason when the job failed', async () => {
        queueMock.getOrderJob.mockResolvedValue(job)
        queueMock.describeOrderJob.mockResolvedValue({ jobId: 'job-1', status: 'failed', error: 'not enough stock for Mouse, only 1 left' })

        const res = await request(app).get('/api/orders/jobs/job-1').set(customer)

        expect(res.status).toBe(200)
        expect(res.body.error).toBe('not enough stock for Mouse, only 1 left')
        expect(prismaMock.order.findUnique).not.toHaveBeenCalled()
    })

    it('returns 404 to a different customer', async () => {
        queueMock.getOrderJob.mockResolvedValue(job)

        const res = await request(app).get('/api/orders/jobs/job-1').set(otherCustomer)

        expect(res.status).toBe(404)
        expect(queueMock.describeOrderJob).not.toHaveBeenCalled()
    })

    it('lets an admin see any job', async () => {
        queueMock.getOrderJob.mockResolvedValue(job)
        queueMock.describeOrderJob.mockResolvedValue({ jobId: 'job-1', status: 'processing' })

        const res = await request(app).get('/api/orders/jobs/job-1').set(admin)

        expect(res.status).toBe(200)
        expect(res.body.status).toBe('processing')
    })

    it('returns 404 when the job does not exist or expired', async () => {
        queueMock.getOrderJob.mockResolvedValue(null)

        const res = await request(app).get('/api/orders/jobs/old-job').set(customer)

        expect(res.status).toBe(404)
    })
})

describe('PATCH /api/orders/:id/status', () => {
    beforeEach(() => {
        prismaMock.order.updateMany.mockResolvedValue({ count: 1 })
    })

    it('returns 403 for a customer', async () => {
        const res = await request(app)
            .patch('/api/orders/order-1/status')
            .set(customer)
            .send({ status: 'SHIPPED' })

        expect(res.status).toBe(403)
        expect(prismaMock.order.updateMany).not.toHaveBeenCalled()
    })

    it('lets a seller ship a pending order without touching stock', async () => {
        prismaMock.order.findUnique
            .mockResolvedValueOnce(makeOrder())
            .mockResolvedValueOnce(makeOrder({ status: 'SHIPPED' }))

        const res = await request(app)
            .patch('/api/orders/order-1/status')
            .set(seller)
            .send({ status: 'SHIPPED' })

        expect(res.status).toBe(200)
        expect(res.body.order.status).toBe('SHIPPED')
        expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
            where: { id: 'order-1', status: 'PENDING' },
            data: { status: 'SHIPPED' }
        })
        expect(prismaMock.product.update).not.toHaveBeenCalled()
    })

    it('puts the stock back when staff cancel an order', async () => {
        prismaMock.order.findUnique
            .mockResolvedValueOnce(makeOrder())
            .mockResolvedValueOnce(makeOrder({ status: 'CANCEL' }))

        const res = await request(app)
            .patch('/api/orders/order-1/status')
            .set(admin)
            .send({ status: 'CANCEL' })

        expect(res.status).toBe(200)
        expect(prismaMock.product.update).toHaveBeenCalledWith({
            where: { id: 'prod-1' },
            data: { stock: { increment: 2 } }
        })
        expect(prismaMock.product.update).toHaveBeenCalledTimes(2)
    })

    it('returns 400 for an unknown status', async () => {
        const res = await request(app)
            .patch('/api/orders/order-1/status')
            .set(admin)
            .send({ status: 'LOST' })

        expect(res.status).toBe(400)
    })

    it('returns 400 for a change that skips a step', async () => {
        prismaMock.order.findUnique.mockResolvedValue(makeOrder())

        const res = await request(app)
            .patch('/api/orders/order-1/status')
            .set(admin)
            .send({ status: 'RECEIVE' })

        expect(res.status).toBe(400)
        expect(res.body.error.message).toBe('cannot change order from PENDING to RECEIVE')
    })

    it('returns 400 when another request changed the order first', async () => {
        prismaMock.order.findUnique.mockResolvedValue(makeOrder())
        prismaMock.order.updateMany.mockResolvedValue({ count: 0 })

        const res = await request(app)
            .patch('/api/orders/order-1/status')
            .set(admin)
            .send({ status: 'CANCEL' })

        expect(res.status).toBe(400)
        expect(prismaMock.product.update).not.toHaveBeenCalled()
    })

    it('returns 404 when the order does not exist', async () => {
        prismaMock.order.findUnique.mockResolvedValue(null)

        const res = await request(app)
            .patch('/api/orders/missing/status')
            .set(admin)
            .send({ status: 'SHIPPED' })

        expect(res.status).toBe(404)
    })
})

describe('PATCH /api/orders/:id/cancel', () => {
    beforeEach(() => {
        prismaMock.order.updateMany.mockResolvedValue({ count: 1 })
    })

    it('lets the owner cancel a pending order and restocks it', async () => {
        prismaMock.order.findUnique
            .mockResolvedValueOnce(makeOrder())
            .mockResolvedValueOnce(makeOrder({ status: 'CANCEL' }))

        const res = await request(app).patch('/api/orders/order-1/cancel').set(customer)

        expect(res.status).toBe(200)
        expect(res.body.order.status).toBe('CANCEL')
        expect(prismaMock.product.update).toHaveBeenCalledTimes(2)
    })

    it('returns 404 when another customer tries to cancel it', async () => {
        prismaMock.order.findUnique.mockResolvedValue(makeOrder())

        const res = await request(app).patch('/api/orders/order-1/cancel').set(otherCustomer)

        expect(res.status).toBe(404)
        expect(prismaMock.order.updateMany).not.toHaveBeenCalled()
    })

    it('returns 400 when the order is already shipped', async () => {
        prismaMock.order.findUnique.mockResolvedValue(makeOrder({ status: 'SHIPPED' }))

        const res = await request(app).patch('/api/orders/order-1/cancel').set(customer)

        expect(res.status).toBe(400)
        expect(prismaMock.product.update).not.toHaveBeenCalled()
    })

    it('lets an admin cancel any pending order', async () => {
        prismaMock.order.findUnique
            .mockResolvedValueOnce(makeOrder())
            .mockResolvedValueOnce(makeOrder({ status: 'CANCEL' }))

        const res = await request(app).patch('/api/orders/order-1/cancel').set(admin)

        expect(res.status).toBe(200)
    })
})
