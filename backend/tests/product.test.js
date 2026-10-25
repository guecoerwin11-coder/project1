import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import jwt from 'jsonwebtoken'

// Fake database: only the product functions the controller uses
const prismaMock = {
    product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
    },
    // Order items, used to check if a product was ever ordered
    cart: {
        count: jest.fn()
    },
    cartItem: {
        deleteMany: jest.fn()
    },
    // The array form of a transaction: run all the queries, all or nothing
    $transaction: jest.fn(async (queries) => Promise.all(queries))
}
jest.unstable_mockModule('../src/configs/postgres.js', () => ({ default: prismaMock }))
jest.unstable_mockModule('../src/logger/logger.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))

process.env.JWT_PASS = 'test-access-secret'

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')

// Real signed tokens, like the ones login would return, one per role
const makeAuth = (roles) => {
    const token = jwt.sign(
        { id: `user-${roles}`, userName: 'johndoe', email: 'john@example.com', roles },
        process.env.JWT_PASS
    )
    return { Authorization: `Bearer ${token}` }
}
const auth = makeAuth('ADMIN')
const sellerAuth = makeAuth('SELLER')
const customerAuth = makeAuth('CUSTOMER')

const sampleProduct = {
    id: 'prod-1',
    name: 'Wireless Mouse',
    description: 'Ergonomic mouse',
    price: '19.99',
    stock: 50
}

describe('GET /api/products', () => {
    it('returns all products without needing a token', async () => {
        prismaMock.product.findMany.mockResolvedValue([sampleProduct])

        const res = await request(app).get('/api/products')

        expect(res.status).toBe(200)
        expect(res.body.products).toHaveLength(1)
        expect(res.body.products[0].name).toBe('Wireless Mouse')
    })

    it('hides archived products', async () => {
        prismaMock.product.findMany.mockResolvedValue([])

        await request(app).get('/api/products')

        expect(prismaMock.product.findMany.mock.calls[0][0].where).toEqual({ archivedAt: null })
    })
})

describe('archived products', () => {
    const archived = { ...sampleProduct, archivedAt: '2026-10-25T00:00:00.000Z' }

    it('return 404 when looked up by id', async () => {
        prismaMock.product.findUnique.mockResolvedValue(archived)

        const res = await request(app).get('/api/products/prod-1')

        expect(res.status).toBe(404)
    })

    it('cannot be updated', async () => {
        prismaMock.product.findUnique.mockResolvedValue(archived)

        const res = await request(app).put('/api/products/prod-1').set(auth).send({ stock: 5 })

        expect(res.status).toBe(404)
        expect(prismaMock.product.update).not.toHaveBeenCalled()
    })
})

describe('GET /api/products/:id', () => {
    it('returns the product when it exists', async () => {
        prismaMock.product.findUnique.mockResolvedValue(sampleProduct)

        const res = await request(app).get('/api/products/prod-1')

        expect(res.status).toBe(200)
        expect(res.body.product.id).toBe('prod-1')
    })

    it('returns 404 when the product does not exist', async () => {
        prismaMock.product.findUnique.mockResolvedValue(null)

        const res = await request(app).get('/api/products/missing')

        expect(res.status).toBe(404)
        expect(res.body.error.message).toBe('product not found')
    })
})

describe('POST /api/products', () => {
    it('creates a product when logged in', async () => {
        prismaMock.product.create.mockImplementation(async ({ data }) => ({ id: 'prod-2', ...data }))

        const res = await request(app)
            .post('/api/products')
            .set(auth)
            .send({ name: '  Keyboard  ', price: 49.5, stock: 10 })

        expect(res.status).toBe(201)
        expect(res.body.product.name).toBe('Keyboard')
        expect(prismaMock.product.create.mock.calls[0][0].data).toEqual({
            name: 'Keyboard', price: 49.5, stock: 10, sellerId: 'user-ADMIN'
        })
    })

    it('makes the logged-in user the owner, ignoring any sellerId in the body', async () => {
        prismaMock.product.create.mockImplementation(async ({ data }) => ({ id: 'prod-2', ...data }))

        await request(app)
            .post('/api/products')
            .set(sellerAuth)
            .send({ name: 'Keyboard', price: 49.5, sellerId: 'someone-else' })

        expect(prismaMock.product.create.mock.calls[0][0].data.sellerId).toBe('user-SELLER')
    })

    it('ignores fields that are not allowed', async () => {
        prismaMock.product.create.mockImplementation(async ({ data }) => ({ id: 'prod-2', ...data }))

        await request(app)
            .post('/api/products')
            .set(auth)
            .send({ name: 'Keyboard', price: 49.5, id: 'hacked-id' })

        const saved = prismaMock.product.create.mock.calls[0][0].data
        expect(saved).not.toHaveProperty('id')
    })

    it('returns 401 without a token', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: 'Keyboard', price: 49.5 })

        expect(res.status).toBe(401)
        expect(prismaMock.product.create).not.toHaveBeenCalled()
    })

    it('returns 401 with a fake token', async () => {
        const res = await request(app)
            .post('/api/products')
            .set({ Authorization: 'Bearer not-a-real-token' })
            .send({ name: 'Keyboard', price: 49.5 })

        expect(res.status).toBe(401)
        expect(res.body.error.message).toBe('Invalid Token or Expired Token')
    })

    it('lets a SELLER create a product', async () => {
        prismaMock.product.create.mockImplementation(async ({ data }) => ({ id: 'prod-3', ...data }))

        const res = await request(app)
            .post('/api/products')
            .set(sellerAuth)
            .send({ name: 'Headset', price: 30 })

        expect(res.status).toBe(201)
    })

    it('returns 403 for a CUSTOMER', async () => {
        const res = await request(app)
            .post('/api/products')
            .set(customerAuth)
            .send({ name: 'Keyboard', price: 49.5 })

        expect(res.status).toBe(403)
        expect(res.body.error.message).toBe('You do not have permission to do this')
        expect(prismaMock.product.create).not.toHaveBeenCalled()
    })

    it('returns 403 for an old token that has no role', async () => {
        const oldToken = jwt.sign({ id: 'user-1' }, process.env.JWT_PASS)

        const res = await request(app)
            .post('/api/products')
            .set({ Authorization: `Bearer ${oldToken}` })
            .send({ name: 'Keyboard', price: 49.5 })

        expect(res.status).toBe(403)
    })

    it('returns 400 when name is missing', async () => {
        const res = await request(app)
            .post('/api/products')
            .set(auth)
            .send({ price: 49.5 })

        expect(res.status).toBe(400)
        expect(prismaMock.product.create).not.toHaveBeenCalled()
    })

    it('returns 400 when price is negative', async () => {
        const res = await request(app)
            .post('/api/products')
            .set(auth)
            .send({ name: 'Keyboard', price: -5 })

        expect(res.status).toBe(400)
    })

    it('returns 400 when stock is not a whole number', async () => {
        const res = await request(app)
            .post('/api/products')
            .set(auth)
            .send({ name: 'Keyboard', price: 10, stock: 2.5 })

        expect(res.status).toBe(400)
    })
})

describe('PUT /api/products/:id', () => {
    beforeEach(() => {
        prismaMock.product.findUnique.mockResolvedValue(sampleProduct)
    })

    it('updates only the fields that were sent', async () => {
        prismaMock.product.update.mockImplementation(async ({ data }) => ({ ...sampleProduct, ...data }))

        const res = await request(app)
            .put('/api/products/prod-1')
            .set(auth)
            .send({ stock: 5 })

        expect(res.status).toBe(200)
        expect(res.body.product.stock).toBe(5)
        const update = prismaMock.product.update.mock.calls[0][0]
        expect(update.where).toEqual({ id: 'prod-1' })
        expect(update.data).toEqual({ stock: 5 })
    })

    it('returns 403 for a CUSTOMER', async () => {
        const res = await request(app)
            .put('/api/products/prod-1')
            .set(customerAuth)
            .send({ stock: 5 })

        expect(res.status).toBe(403)
        expect(prismaMock.product.update).not.toHaveBeenCalled()
    })

    it('returns 400 when the body is empty', async () => {
        const res = await request(app)
            .put('/api/products/prod-1')
            .set(auth)
            .send({})

        expect(res.status).toBe(400)
    })

    it('returns 404 when the product does not exist', async () => {
        prismaMock.product.findUnique.mockResolvedValue(null)

        const res = await request(app)
            .put('/api/products/missing')
            .set(auth)
            .send({ stock: 5 })

        expect(res.status).toBe(404)
        expect(prismaMock.product.update).not.toHaveBeenCalled()
    })
})

describe('DELETE /api/products/:id', () => {
    it('deletes a product that was never ordered', async () => {
        prismaMock.product.findUnique.mockResolvedValue(sampleProduct)
        prismaMock.cart.count.mockResolvedValue(0)
        prismaMock.product.delete.mockResolvedValue(sampleProduct)

        const res = await request(app)
            .delete('/api/products/prod-1')
            .set(auth)

        expect(res.status).toBe(200)
        expect(res.body).toEqual({ message: 'product deleted', archived: false })
        expect(prismaMock.product.delete).toHaveBeenCalledWith({ where: { id: 'prod-1' } })
    })

    it('archives a product that appears in orders, keeping order history', async () => {
        prismaMock.product.findUnique.mockResolvedValue(sampleProduct)
        prismaMock.cart.count.mockResolvedValue(3)
        prismaMock.product.update.mockResolvedValue({})
        prismaMock.cartItem.deleteMany.mockResolvedValue({ count: 1 })

        const res = await request(app)
            .delete('/api/products/prod-1')
            .set(auth)

        expect(res.status).toBe(200)
        expect(res.body.archived).toBe(true)
        expect(prismaMock.product.delete).not.toHaveBeenCalled()

        const update = prismaMock.product.update.mock.calls[0][0]
        expect(update.where).toEqual({ id: 'prod-1' })
        expect(update.data.archivedAt).toBeInstanceOf(Date)
        expect(update.data.stock).toBe(0)
    })

    it('removes an archived product from everyone\'s carts', async () => {
        prismaMock.product.findUnique.mockResolvedValue(sampleProduct)
        prismaMock.cart.count.mockResolvedValue(1)
        prismaMock.product.update.mockResolvedValue({})
        prismaMock.cartItem.deleteMany.mockResolvedValue({ count: 4 })

        await request(app).delete('/api/products/prod-1').set(auth)

        expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({ where: { productId: 'prod-1' } })
    })

    it('returns 403 for a CUSTOMER', async () => {
        const res = await request(app)
            .delete('/api/products/prod-1')
            .set(customerAuth)

        expect(res.status).toBe(403)
        expect(prismaMock.product.delete).not.toHaveBeenCalled()
    })

    it('returns 401 without a token', async () => {
        const res = await request(app).delete('/api/products/prod-1')

        expect(res.status).toBe(401)
        expect(prismaMock.product.delete).not.toHaveBeenCalled()
    })

    it('returns 404 when the product does not exist', async () => {
        prismaMock.product.findUnique.mockResolvedValue(null)

        const res = await request(app)
            .delete('/api/products/missing')
            .set(auth)

        expect(res.status).toBe(404)
    })
})

describe('product ownership', () => {
    // sellerAuth belongs to user-SELLER
    const mine = { ...sampleProduct, id: 'prod-mine', sellerId: 'user-SELLER' }
    const theirs = { ...sampleProduct, id: 'prod-theirs', sellerId: 'other-seller' }
    const noOwner = { ...sampleProduct, id: 'prod-old', sellerId: null }

    beforeEach(() => {
        prismaMock.product.update.mockImplementation(async ({ data }) => ({ ...mine, ...data }))
        prismaMock.cart.count.mockResolvedValue(0)
        prismaMock.product.delete.mockResolvedValue({})
    })

    it('lets a seller update their own product', async () => {
        prismaMock.product.findUnique.mockResolvedValue(mine)

        const res = await request(app).put('/api/products/prod-mine').set(sellerAuth).send({ stock: 3 })

        expect(res.status).toBe(200)
        expect(prismaMock.product.update).toHaveBeenCalled()
    })

    it('blocks a seller from updating another seller\'s product', async () => {
        prismaMock.product.findUnique.mockResolvedValue(theirs)

        const res = await request(app).put('/api/products/prod-theirs').set(sellerAuth).send({ stock: 0 })

        expect(res.status).toBe(403)
        expect(res.body.error.message).toBe('you can only change your own products')
        expect(prismaMock.product.update).not.toHaveBeenCalled()
    })

    it('lets a seller delete their own product', async () => {
        prismaMock.product.findUnique.mockResolvedValue(mine)

        const res = await request(app).delete('/api/products/prod-mine').set(sellerAuth)

        expect(res.status).toBe(200)
        expect(prismaMock.product.delete).toHaveBeenCalled()
    })

    it('blocks a seller from deleting another seller\'s product', async () => {
        prismaMock.product.findUnique.mockResolvedValue(theirs)

        const res = await request(app).delete('/api/products/prod-theirs').set(sellerAuth)

        expect(res.status).toBe(403)
        expect(prismaMock.product.delete).not.toHaveBeenCalled()
        expect(prismaMock.product.update).not.toHaveBeenCalled()
    })

    it('lets an admin update any seller\'s product', async () => {
        prismaMock.product.findUnique.mockResolvedValue(theirs)

        const res = await request(app).put('/api/products/prod-theirs').set(auth).send({ stock: 1 })

        expect(res.status).toBe(200)
    })

    it('keeps old products with no owner admin only', async () => {
        prismaMock.product.findUnique.mockResolvedValue(noOwner)

        const asSeller = await request(app).put('/api/products/prod-old').set(sellerAuth).send({ stock: 1 })
        const asAdmin = await request(app).put('/api/products/prod-old').set(auth).send({ stock: 1 })

        expect(asSeller.status).toBe(403)
        expect(asAdmin.status).toBe(200)
    })

    it('filters the list by seller', async () => {
        prismaMock.product.findMany.mockResolvedValue([mine])

        await request(app).get('/api/products?sellerId=user-SELLER')

        expect(prismaMock.product.findMany.mock.calls[0][0].where).toEqual({ archivedAt: null, sellerId: 'user-SELLER' })
    })

    it('shows the seller\'s name but never their email', async () => {
        prismaMock.product.findUnique.mockResolvedValue(mine)

        await request(app).get('/api/products/prod-mine')

        expect(prismaMock.product.findUnique.mock.calls[0][0].include).toEqual({
            seller: { select: { id: true, userName: true } }
        })
    })
})
