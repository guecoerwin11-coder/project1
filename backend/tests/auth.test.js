import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// Mock the database so tests never touch Postgres
const prismaMock = {
    user: {
        findUnique: jest.fn(),
        create: jest.fn()
    }
}
jest.unstable_mockModule('../src/configs/postgres.js', () => ({ default: prismaMock }))

// Silence the logger so tests don't write log files
jest.unstable_mockModule('../src/logger/logger.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))

process.env.JWT_PASS = 'test-access-secret'
process.env.JWT_FRESH = 'test-refresh-secret'

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')

const existingUser = {
    id: 'user-1',
    userName: 'johndoe',
    email: 'john@example.com'
}

describe('POST /api/register', () => {
    it('creates a user and returns an access token', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null)
        prismaMock.user.create.mockImplementation(async ({ data }) => ({ id: 'new-id', ...data }))

        const res = await request(app)
            .post('/api/register')
            .send({ userName: 'johndoe', email: 'john@example.com', password: 'secret123' })

        expect(res.status).toBe(201)
        expect(res.body.message).toBe('register successful')

        const decoded = jwt.verify(res.body.accessToken, process.env.JWT_PASS)
        expect(decoded).toMatchObject({ id: 'new-id', email: 'john@example.com' })
    })

    it('stores a hashed password, not the plain one', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null)
        prismaMock.user.create.mockImplementation(async ({ data }) => ({ id: 'new-id', ...data }))

        await request(app)
            .post('/api/register')
            .send({ userName: 'johndoe', email: 'john@example.com', password: 'secret123' })

        const saved = prismaMock.user.create.mock.calls[0][0].data.password
        expect(saved).not.toBe('secret123')
        expect(await bcrypt.compare('secret123', saved)).toBe(true)
    })

    it('returns 400 when a field is missing', async () => {
        const res = await request(app)
            .post('/api/register')
            .send({ email: 'john@example.com', password: 'secret123' })

        expect(res.status).toBe(400)
        expect(res.body.success).toBe(false)
        expect(prismaMock.user.create).not.toHaveBeenCalled()
    })

    it('returns 400 when the password is shorter than 6 characters', async () => {
        const res = await request(app)
            .post('/api/register')
            .send({ userName: 'johndoe', email: 'john@example.com', password: '123' })

        expect(res.status).toBe(400)
        expect(res.body.success).toBe(false)
    })

    it('returns 401 when the email is already used', async () => {
        prismaMock.user.findUnique.mockResolvedValue(existingUser)

        const res = await request(app)
            .post('/api/register')
            .send({ userName: 'johndoe', email: 'john@example.com', password: 'secret123' })

        expect(res.status).toBe(401)
        expect(res.body.error.message).toBe('email is already used')
        expect(prismaMock.user.create).not.toHaveBeenCalled()
    })
})

describe('POST /api/login', () => {
    let hashedPassword

    beforeAll(async () => {
        hashedPassword = await bcrypt.hash('secret123', 10)
    })

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue({ ...existingUser, password: hashedPassword })
    })

    it('returns an access token for valid credentials', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({ email: 'john@example.com', password: 'secret123' })

        expect(res.status).toBe(200)
        expect(res.body.message).toBe('login success')

        const decoded = jwt.verify(res.body.accessToken, process.env.JWT_PASS)
        expect(decoded).toMatchObject({ id: 'user-1', email: 'john@example.com' })
    })

    it('returns 400 when a field is missing', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({ email: 'john@example.com' })

        expect(res.status).toBe(400)
        expect(res.body.success).toBe(false)
    })

    it('returns 401 when the email is not registered', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null)

        const res = await request(app)
            .post('/api/login')
            .send({ email: 'nobody@example.com', password: 'secret123' })

        expect(res.status).toBe(401)
        expect(res.body.success).toBe(false)
    })

    it('returns 401 when the password is wrong', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({ email: 'john@example.com', password: 'wrongpass' })

        expect(res.status).toBe(401)
        expect(res.body.success).toBe(false)
    })
})

describe('GET /api-docs', () => {
    it('serves the Swagger UI', async () => {
        const res = await request(app).get('/api-docs/')
        expect(res.status).toBe(200)
        expect(res.text).toContain('swagger-ui')
    })
})
