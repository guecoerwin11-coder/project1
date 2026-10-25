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
                        sellerId: { type: 'string', format: 'uuid', nullable: true, description: 'Owner. Empty for old products, which only admins can change.' },
                        seller: {
                            type: 'object',
                            nullable: true,
                            properties: {
                                id: { type: 'string', format: 'uuid' },
                                userName: { type: 'string', example: 'mouse_shop' }
                            }
                        },
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
                        price: { type: 'string', description: 'Price per unit at the moment of purchase', example: '19.99' },
                        productId: { type: 'string', format: 'uuid' },
                        orderId: { type: 'string', format: 'uuid' },
                        createdAt: { type: 'string', format: 'date-time' },
                        products: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string', example: 'Wireless Mouse' }
                            }
                        }
                    }
                },
                Order: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        userId: { type: 'string', format: 'uuid' },
                        status: { type: 'string', enum: ['PENDING', 'SHIPPED', 'RECEIVE', 'CANCEL'], example: 'PENDING' },
                        createdAt: { type: 'string', format: 'date-time' },
                        carts: {
                            type: 'array',
                            description: 'The items in the order',
                            items: { $ref: '#/components/schemas/OrderItem' }
                        },
                        total: { type: 'string', description: 'Sum of price times quantity, using the prices saved at purchase', example: '39.98' }
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
                QueuedOrderResponse: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', example: 'order queued' },
                        jobId: { type: 'string', example: '42' },
                        status: { type: 'string', enum: ['waiting', 'processing', 'retrying', 'completed', 'failed'], example: 'waiting' },
                        position: { type: 'integer', description: 'Place in line while waiting. 1 means next.', example: 3 },
                        statusUrl: { type: 'string', example: '/api/orders/jobs/42' }
                    }
                },
                OrderJobStatus: {
                    type: 'object',
                    properties: {
                        jobId: { type: 'string', example: '42' },
                        status: {
                            type: 'string',
                            enum: ['waiting', 'processing', 'retrying', 'completed', 'failed'],
                            description: 'waiting = in line, processing = being placed now, retrying = unexpected error and trying again, completed = order placed, failed = could not be placed'
                        },
                        position: { type: 'integer', description: 'Only when waiting. 1 means next.' },
                        orderId: { type: 'string', format: 'uuid', description: 'Only when completed' },
                        order: { $ref: '#/components/schemas/Order' },
                        error: { type: 'string', description: 'Only when failed', example: 'not enough stock for Wireless Mouse, only 1 left' }
                    }
                },
                CartLine: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        productId: { type: 'string', format: 'uuid' },
                        quantity: { type: 'integer', example: 2 },
                        product: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string', example: 'Wireless Mouse' },
                                price: { type: 'string', example: '19.99' },
                                stock: { type: 'integer', example: 50 }
                            }
                        },
                        subtotal: { type: 'string', description: 'price times quantity', example: '39.98' },
                        inStock: { type: 'boolean', description: 'false if stock dropped below the quantity after it was added', example: true }
                    }
                },
                Cart: {
                    type: 'object',
                    properties: {
                        items: { type: 'array', items: { $ref: '#/components/schemas/CartLine' } },
                        itemCount: { type: 'integer', description: 'Sum of all quantities', example: 3 },
                        total: { type: 'string', example: '45.48' }
                    }
                },
                CartResponse: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', example: 'added to cart' },
                        cart: { $ref: '#/components/schemas/Cart' }
                    }
                },
                AddToCartRequest: {
                    type: 'object',
                    required: ['productId'],
                    properties: {
                        productId: { type: 'string', format: 'uuid' },
                        quantity: { type: 'integer', minimum: 1, maximum: 100, default: 1, example: 2 }
                    }
                },
                UpdateCartItemRequest: {
                    type: 'object',
                    required: ['quantity'],
                    properties: {
                        quantity: { type: 'integer', minimum: 1, maximum: 100, example: 3 }
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
                },
                QueueUnavailable: {
                    description: 'The order queue (Redis) is down. Try again later.',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                CartItemNotFound: {
                    description: 'That product is not in your cart',
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
                },
                CartProductId: {
                    in: 'path',
                    name: 'productId',
                    required: true,
                    description: 'The id of the product, not the cart line',
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
