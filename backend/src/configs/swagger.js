import swaggerJsdoc from 'swagger-jsdoc'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'E-Shop API',
            version: '1.0.0',
            description: 'API documentation for the E-Shop backend'
        },
        servers: [
            {
                url: `http://localhost:${process.env.PORT || 3000}/api`,
                description: 'Local development server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            },
            schemas: {
                RegisterRequest: {
                    type: 'object',
                    required: ['userName', 'email', 'password'],
                    properties: {
                        userName: { type: 'string', example: 'johndoe' },
                        email: { type: 'string', format: 'email', example: 'john@example.com' },
                        password: { type: 'string', format: 'password', minLength: 6, example: 'secret123' }
                    }
                },
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'john@example.com' },
                        password: { type: 'string', format: 'password', example: 'secret123' }
                    }
                },
                AuthResponse: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', example: 'login success' },
                        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
                    }
                },
                Product: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid', example: '3f1c2a9e-8b7d-4c1e-9a2b-1d2e3f4a5b6c' },
                        name: { type: 'string', example: 'Wireless Mouse' },
                        description: { type: 'string', nullable: true, example: 'Ergonomic 2.4GHz mouse' },
                        price: { type: 'string', description: 'Decimal with 2 places, returned as a string', example: '19.99' },
                        stock: { type: 'integer', example: 50 },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' }
                    }
                },
                ProductInput: {
                    type: 'object',
                    required: ['name', 'price'],
                    properties: {
                        name: { type: 'string', example: 'Wireless Mouse' },
                        description: { type: 'string', example: 'Ergonomic 2.4GHz mouse' },
                        price: { type: 'number', minimum: 0, example: 19.99 },
                        stock: { type: 'integer', minimum: 0, default: 0, example: 50 }
                    }
                },
                ProductUpdate: {
                    type: 'object',
                    minProperties: 1,
                    properties: {
                        name: { type: 'string', example: 'Wireless Mouse Pro' },
                        description: { type: 'string', example: 'Updated description' },
                        price: { type: 'number', minimum: 0, example: 24.99 },
                        stock: { type: 'integer', minimum: 0, example: 30 }
                    }
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: {
                            type: 'object',
                            properties: {
                                message: { type: 'string', example: 'Must input the required field' },
                                status: { type: 'integer', example: 400 }
                            }
                        }
                    }
                }
            }
        }
    },
    // Scan route files for @openapi JSDoc comments
    apis: [path.join(__dirname, '../routes/*.js').split(path.sep).join('/')]
}

const swaggerSpec = swaggerJsdoc(options)

export default swaggerSpec
