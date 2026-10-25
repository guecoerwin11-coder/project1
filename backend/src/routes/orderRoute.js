import express from 'express'
import validation from '../middleware/validation.js'
import isAuthorize from '../middleware/isAuthorize.js'
import {
    getOrders, getOrderById, createOrder, getOrderJobStatus, updateOrderStatus, cancelOrder
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
 *     summary: Place an order (queued)
 *     description: >
 *       Checks the items right away, then puts the order in the queue and answers 202.
 *       A worker places orders one by one in arrival order. Poll statusUrl to see
 *       the result. Stock problems show up there as a failed job.
 *       Duplicate products are combined into one line.
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
 *       202:
 *         description: Order accepted and waiting in the queue
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QueuedOrderResponse'
 *       400:
 *         description: Invalid items
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         $ref: '#/components/responses/QueueUnavailable'
 */
orderRouter.get('/orders', getOrders)
orderRouter.post('/orders', createOrder)

/**
 * @openapi
 * /orders/jobs/{jobId}:
 *   get:
 *     summary: Check a queued order
 *     description: >
 *       Use the jobId from POST /orders or POST /cart/checkout. Poll every few
 *       seconds until status is completed or failed. Only the user who queued it,
 *       or an admin, can see it.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The job's current status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderJobStatus'
 *             examples:
 *               waiting:
 *                 summary: Still in line
 *                 value: { jobId: '42', status: waiting, position: 3 }
 *               completed:
 *                 summary: Order placed
 *                 value: { jobId: '42', status: completed, orderId: '3f1c2a9e-8b7d-4c1e-9a2b-1d2e3f4a5b6c', order: { id: '3f1c2a9e-8b7d-4c1e-9a2b-1d2e3f4a5b6c', status: PENDING, total: '39.98', carts: [] } }
 *               failed:
 *                 summary: Out of stock
 *                 value: { jobId: '42', status: failed, error: 'not enough stock for Wireless Mouse, only 1 left' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Job does not exist, expired, or belongs to someone else
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         $ref: '#/components/responses/QueueUnavailable'
 */
orderRouter.get('/orders/jobs/:jobId', getOrderJobStatus)

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
