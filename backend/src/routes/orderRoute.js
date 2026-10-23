import express from 'express'
import validation from '../middleware/validation.js'
import isAuthorize from '../middleware/isAuthorize.js'
import {
    getOrders, getOrderById, createOrder, updateOrderStatus, cancelOrder
} from '../controllers/orderController.js'

const orderRouter = express.Router()

// Every order route needs a logged-in user
orderRouter.use('/orders', validation)

// Only staff can move orders through shipping
const canManageOrders = isAuthorize('ADMIN', 'SELLER')

/**
 * @openapi
 * tags:
 *   - name: Orders
 *     description: Place and track orders
 */

/**
 * @openapi
 * /orders:
 *   get:
 *     summary: List orders
 *     description: Admins see every order. Everyone else sees only their own orders.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of orders, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *   post:
 *     summary: Place an order
 *     description: >
 *       Reduces stock and creates the order together. If any product is missing
 *       or out of stock, nothing is saved. Duplicate products are combined into one line.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderRequest'
 *     responses:
 *       201:
 *         description: Order created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: order created
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Invalid items or not enough stock
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error:
 *                 message: not enough stock for Wireless Mouse, only 2 left
 *                 status: 400
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: A product in the order does not exist
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
orderRouter.get('/orders', getOrders)
orderRouter.post('/orders', createOrder)

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     summary: Get one order
 *     description: Only the customer who placed it or an admin can see it. Anyone else gets 404.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrderId'
 *     responses:
 *       200:
 *         description: The order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/OrderNotFound'
 */
orderRouter.get('/orders/:id', getOrderById)

/**
 * @openapi
 * /orders/{id}/status:
 *   patch:
 *     summary: Update an order's status
 *     description: >
 *       Requires the ADMIN or SELLER role. Allowed changes are PENDING to SHIPPED,
 *       PENDING to CANCEL, and SHIPPED to RECEIVE. Cancelling puts the stock back.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrderId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateOrderStatusRequest'
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: order status updated
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Unknown status or change not allowed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error:
 *                 message: cannot change order from PENDING to RECEIVE
 *                 status: 400
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Logged in, but role is not ADMIN or SELLER
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         $ref: '#/components/responses/OrderNotFound'
 */
orderRouter.patch('/orders/:id/status', canManageOrders, updateOrderStatus)

/**
 * @openapi
 * /orders/{id}/cancel:
 *   patch:
 *     summary: Cancel an order
 *     description: >
 *       The customer who placed the order, or an admin, can cancel it while it is
 *       still PENDING. The stock is put back.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrderId'
 *     responses:
 *       200:
 *         description: Order cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: order cancelled
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Order is not PENDING anymore
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/OrderNotFound'
 */
orderRouter.patch('/orders/:id/cancel', cancelOrder)

export default orderRouter
