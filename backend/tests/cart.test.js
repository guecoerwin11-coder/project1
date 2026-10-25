import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import jwt from 'jsonwebtoken'

// Fake database: only the functions the cart controller and order service use
const prismaMock = {
    cartItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn()
    },
    product: {
        findUnique: jest.fn(),
        updateMany: jest.fn()
    },
    order: {
        create: jest.fn()
    },
    // Runs the transaction callback with the same fake database
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

const token = jwt.sign({ id: 'user-1', roles: 'CUSTOMER' }, process.env.JWT_PASS)
const auth = { Authorization: `Bearer ${token}` }

const mouse = { id: 'prod-1', name: 'Mouse', price: '19.99', stock: 10 }
const pad = { id: 'prod-2', name: 'Mousepad', price: '5.50', stock: 3 }

// A cart row as the database returns it, with the product included
const line = (product, quantity, id = `line-${product.id}`) => ({
    id, userId: 'user-1', productId: product.id, quantity,
    createdAt: '2026-10-25T00:00:00.000Z', product
})

beforeEach(() => {
    // After any change, the controller reloads the cart. Default to empty.
    prismaMock.cartItem.findMany.mockResolvedValue([])
})

describe('GET /api/cart', () => {
    it('returns 401 without a token', async () => {
        const res = await request(app).get('/api/cart')

        expect(res.status).toBe(401)
    })

    it('returns an empty cart with a total of 0.00', async () => {
        const res = await request(app).get('/api/cart').set(auth)

        expect(res.status).toBe(200)
        expect(res.body.cart).toEqual({ items: [], itemCount: 0, total: '0.00' })
    })

    it('loads only the logged-in user\'s cart', async () => {
        await request(app).get('/api/cart').set(auth)

        expect(prismaMock.cartItem.findMany.mock.calls[0][0].where).toEqual({ userId: 'user-1' })
    })

    it('calculates subtotals, item count and total', async () => {
        prismaMock.cartItem.findMany.mockResolvedValue([line(mouse, 2), line(pad, 1)])

        const res = await request(app).get('/api/cart').set(auth)

        expect(res.body.cart.items[0].subtotal).toBe('39.98')
        expect(res.body.cart.itemCount).toBe(3)
        expect(res.body.cart.total).toBe('45.48')
    })

    it('flags a line whose quantity is now above the stock', async () => {
        prismaMock.cartItem.findMany.mockResolvedValue([line({ ...pad, stock: 1 }, 2)])

        const res = await request(app).get('/api/cart').set(auth)

        expect(res.body.cart.items[0].inStock).toBe(false)
    })
})

describe('POST /api/cart/items', () => {
    beforeEach(() => {
        prismaMock.product.findUnique.mockResolvedValue(mouse)
        prismaMock.cartItem.findUnique.mockResolvedValue(null)
        prismaMock.cartItem.count.mockResolvedValue(0)
        prismaMock.cartItem.upsert.mockResolvedValue({})
    })

    it('adds a new product with 201', async () => {
        prismaMock.cartItem.findMany.mockResolvedValue([line(mouse, 2)])

        const res = await request(app)
            .post('/api/cart/items')
            .set(auth)
            .send({ productId: 'prod-1', quantity: 2 })

        expect(res.status).toBe(201)
        expect(res.body.cart.total).toBe('39.98')
        expect(prismaMock.cartItem.upsert).toHaveBeenCalledWith({
            where: { userId_productId: { userId: 'user-1', productId: 'prod-1' } },
            create: { userId: 'user-1', productId: 'prod-1', quantity: 2 },
            update: { quantity: 2 }
        })
    })

    it('uses quantity 1 when none is sent', async () => {
        await request(app).post('/api/cart/items').set(auth).send({ productId: 'prod-1' })

        expect(prismaMock.cartItem.upsert.mock.calls[0][0].create.quantity).toBe(1)
    })

    it('raises the quantity with 200 when the product is already in the cart', async () => {
        prismaMock.cartItem.findUnique.mockResolvedValue(line(mouse, 3))

        const res = await request(app)
            .post('/api/cart/items')
            .set(auth)
            .send({ productId: 'prod-1', quantity: 2 })

        expect(res.status).toBe(200)
        expect(prismaMock.cartItem.upsert.mock.calls[0][0].update).toEqual({ quantity: 5 })
    })

    it('uses the user id from the token, not from the body', async () => {
        await request(app)
            .post('/api/cart/items')
            .set(auth)
            .send({ productId: 'prod-1', userId: 'someone-else' })

        expect(prismaMock.cartItem.upsert.mock.calls[0][0].create.userId).toBe('user-1')
    })

    it('returns 400 when the combined quantity is above the stock', async () => {
        prismaMock.cartItem.findUnique.mockResolvedValue(line(mouse, 9))

        const res = await request(app)
            .post('/api/cart/items')
            .set(auth)
            .send({ productId: 'prod-1', quantity: 2 })

        expect(res.status).toBe(400)
        expect(res.body.error.message).toBe('not enough stock for Mouse, only 10 left')
        expect(prismaMock.cartItem.upsert).not.toHaveBeenCalled()
    })

    it('returns 404 when the product does not exist', async () => {
        prismaMock.product.findUnique.mockResolvedValue(null)

        const res = await request(app)
            .post('/api/cart/items')
            .set(auth)
            .send({ productId: 'missing' })

        expect(res.status).toBe(404)
    })

    it('returns 404 when the product is archived', async () => {
        prismaMock.product.findUnique.mockResolvedValue({ ...mouse, archivedAt: '2026-10-25T00:00:00.000Z' })

        const res = await request(app)
            .post('/api/cart/items')
            .set(auth)
            .send({ productId: 'prod-1' })

        expect(res.status).toBe(404)
        expect(prismaMock.cartItem.upsert).not.toHaveBeenCalled()
    })

    it('returns 400 when productId is missing', async () => {
        const res = await request(app).post('/api/cart/items').set(auth).send({ quantity: 1 })

        expect(res.status).toBe(400)
    })

    it.each([0, -1, 2.5, 101, '2'])('returns 400 for quantity %p', async (quantity) => {
        const res = await request(app)
            .post('/api/cart/items')
            .set(auth)
            .send({ productId: 'prod-1', quantity })

        expect(res.status).toBe(400)
        expect(prismaMock.cartItem.upsert).not.toHaveBeenCalled()
    })

    it('returns 400 when the cart already has 50 different products', async () => {
        prismaMock.cartItem.count.mockResolvedValue(50)

        const res = await request(app)
            .post('/api/cart/items')
            .set(auth)
            .send({ productId: 'prod-1' })

        expect(res.status).toBe(400)
        expect(prismaMock.cartItem.upsert).not.toHaveBeenCalled()
    })
})

describe('PATCH /api/cart/items/:productId', () => {
    beforeEach(() => {
        prismaMock.cartItem.findUnique.mockResolvedValue(line(mouse, 2))
        prismaMock.cartItem.update.mockResolvedValue({})
    })

    it('sets the quantity to exactly the number sent', async () => {
        const res = await request(app)
            .patch('/api/cart/items/prod-1')
            .set(auth)
            .send({ quantity: 7 })

        expect(res.status).toBe(200)
        expect(prismaMock.cartItem.update).toHaveBeenCalledWith({
            where: { id: 'line-prod-1' },
            data: { quantity: 7 }
        })
    })

    it('returns 404 when the product is not in the cart', async () => {
        prismaMock.cartItem.findUnique.mockResolvedValue(null)

        const res = await request(app)
            .patch('/api/cart/items/prod-9')
            .set(auth)
            .send({ quantity: 1 })

        expect(res.status).toBe(404)
        expect(res.body.error.message).toBe('item not in cart')
    })

    it('returns 400 when the quantity is above the stock', async () => {
        const res = await request(app)
            .patch('/api/cart/items/prod-1')
            .set(auth)
            .send({ quantity: 11 })

        expect(res.status).toBe(400)
        expect(prismaMock.cartItem.update).not.toHaveBeenCalled()
    })

    it('returns 400 when the quantity is missing', async () => {
        const res = await request(app).patch('/api/cart/items/prod-1').set(auth).send({})

        expect(res.status).toBe(400)
    })
})

describe('DELETE /api/cart/items/:productId', () => {
    it('removes only that product from the user\'s cart', async () => {
        prismaMock.cartItem.deleteMany.mockResolvedValue({ count: 1 })

        const res = await request(app).delete('/api/cart/items/prod-1').set(auth)

        expect(res.status).toBe(200)
        expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({
            where: { userId: 'user-1', productId: 'prod-1' }
        })
    })

    it('returns 404 when the product is not in the cart', async () => {
        prismaMock.cartItem.deleteMany.mockResolvedValue({ count: 0 })

        const res = await request(app).delete('/api/cart/items/prod-9').set(auth)

        expect(res.status).toBe(404)
    })
})

describe('DELETE /api/cart', () => {
    it('empties only the logged-in user\'s cart', async () => {
        prismaMock.cartItem.deleteMany.mockResolvedValue({ count: 3 })

        const res = await request(app).delete('/api/cart').set(auth)

        expect(res.status).toBe(200)
        expect(res.body.cart.items).toEqual([])
        expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    })
})

describe('POST /api/cart/checkout', () => {
    beforeEach(() => {
        queueMock.enqueueOrder.mockResolvedValue({ job: { id: 'job-7' }, alreadyQueued: false })
        queueMock.describeOrderJob.mockResolvedValue({ jobId: 'job-7', status: 'waiting', position: 2 })
    })

    it('queues the cart contents and answers 202', async () => {
        prismaMock.cartItem.findMany.mockResolvedValue([line(mouse, 2), line(pad, 1)])

        const res = await request(app).post('/api/cart/checkout').set(auth)

        expect(res.status).toBe(202)
        expect(res.body).toMatchObject({
            message: 'order queued',
            jobId: 'job-7',
            status: 'waiting',
            position: 2,
            statusUrl: '/api/orders/jobs/job-7'
        })
        expect(queueMock.enqueueOrder).toHaveBeenCalledWith({
            userId: 'user-1',
            items: [{ productId: 'prod-1', quantity: 2 }, { productId: 'prod-2', quantity: 1 }],
            source: 'cart'
        })
    })

    it('leaves the cart and stock alone, the worker does that', async () => {
        prismaMock.cartItem.findMany.mockResolvedValue([line(mouse, 2)])

        await request(app).post('/api/cart/checkout').set(auth)

        expect(prismaMock.cartItem.deleteMany).not.toHaveBeenCalled()
        expect(prismaMock.product.updateMany).not.toHaveBeenCalled()
        expect(prismaMock.order.create).not.toHaveBeenCalled()
    })

    it('says so when the same checkout is already waiting', async () => {
        prismaMock.cartItem.findMany.mockResolvedValue([line(mouse, 2)])
        queueMock.enqueueOrder.mockResolvedValue({ job: { id: 'job-7' }, alreadyQueued: true })

        const res = await request(app).post('/api/cart/checkout').set(auth)

        expect(res.status).toBe(202)
        expect(res.body.message).toBe('your checkout is already in the queue')
        expect(res.body.jobId).toBe('job-7')
    })

    it('returns 400 when the cart is empty, without queueing', async () => {
        const res = await request(app).post('/api/cart/checkout').set(auth)

        expect(res.status).toBe(400)
        expect(res.body.error.message).toBe('cart is empty')
        expect(queueMock.enqueueOrder).not.toHaveBeenCalled()
    })

    it('returns 503 when the queue is down', async () => {
        prismaMock.cartItem.findMany.mockResolvedValue([line(mouse, 2)])
        queueMock.enqueueOrder.mockRejectedValue(new ServiceUnavailable('order queue is unavailable, please try again'))

        const res = await request(app).post('/api/cart/checkout').set(auth)

        expect(res.status).toBe(503)
    })
})
