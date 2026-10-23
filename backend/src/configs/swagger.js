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
                OrderItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        quantity: { type: 'integer', example: 2 },
                        productId: { type: 'string', format: 'uuid' },
                        orderId: { type: 'string', format: 'uuid' },
                        createdAt: { type: 'string', format: 'date-time' },
                        products: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string', example: 'Wireless Mouse' },
                                price: { type: 'string', example: '19.99' }
                            }
                        }
                    }
                },
                Order: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        userId: { type: 'string', format: 'uuid' },
                        productId: { type: 'string', format: 'uuid', description: 'First product in the order. See carts for the full list.' },
                        status: { type: 'string', enum: ['PENDING', 'SHIPPED', 'RECEIVE', 'CANCEL'], example: 'PENDING' },
                        createdAt: { type: 'string', format: 'date-time' },
                        carts: {
                            type: 'array',
                            description: 'The items in the order',
                            items: { $ref: '#/components/schemas/OrderItem' }
                        },
                        total: { type: 'string', description: 'Sum of price times quantity, using current product prices', example: '39.98' }
                    }
                },
                CreateOrderRequest: {
                    type: 'object',
                    required: ['items'],
                    properties: {
                        items: {
                            type: 'array',
                            minItems: 1,
                            maxItems: 50,
                            items: {
                                type: 'object',
                                required: ['productId', 'quantity'],
                                properties: {
                                    productId: { type: 'string', format: 'uuid' },
                                    quantity: { type: 'integer', minimum: 1, maximum: 100, example: 2 }
                                }
                            }
                        }
                    }
                },
                UpdateOrderStatusRequest: {
                    type: 'object',
                    required: ['status'],
                    properties: {
                        status: { type: 'string', enum: ['PENDING', 'SHIPPED', 'RECEIVE', 'CANCEL'], example: 'SHIPPED' }
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
            },
            // Reusable responses, referenced from route docs with $ref
            responses: {
                Unauthorized: {
                    description: 'Missing, invalid or expired token',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                OrderNotFound: {
                    description: 'Order does not exist, or belongs to someone else',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            },
            parameters: {
                OrderId: {
                    in: 'path',
                    name: 'id',
                    required: true,
                    schema: { type: 'string', format: 'uuid' }
                }
            }
        }
    },
    // Scan route files for @openapi JSDoc comments
    apis: [path.join(__dirname, '../routes/*.js').split(path.sep).join('/')]
}

const swaggerSpec = swaggerJsdoc(options)

export default swaggerSpec
