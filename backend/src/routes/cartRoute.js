import express from 'express'
import validation from '../middleware/validation.js'
import {
    getCart, addToCart, updateCartItem, removeCartItem, clearCart, checkout
} from '../controllers/cartController.js'

const cartRouter = express.Router()

// Every cart route needs a logged-in user. Each user only ever sees their own cart.
cartRouter.use('/cart', validation)

/**
 * @openapi
 * tags:
 *   - name: Cart
 *     description: The logged-in user's shopping cart
 */

/**
 * @openapi
 * /cart:
 *   get:
 *     summary: Get my cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The cart. An empty cart has no items and a total of 0.00.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cart:
 *                   $ref: '#/components/schemas/Cart'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *   delete:
 *     summary: Empty my cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
cartRouter.get('/cart', getCart)
cartRouter.delete('/cart', clearCart)

/**
 * @openapi
 * /cart/items:
 *   post:
 *     summary: Add a product to my cart
 *     description: >
 *       If the product is already in the cart, its quantity goes up instead of
 *       adding a second line. Returns 201 for a new line and 200 for a raised quantity.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddToCartRequest'
 *     responses:
 *       200:
 *         description: Quantity raised for a product already in the cart
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *       201:
 *         description: Product added as a new line
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *       400:
 *         description: Invalid quantity, not enough stock, or cart is full
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Product does not exist
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
cartRouter.post('/cart/items', addToCart)

/**
 * @openapi
 * /cart/items/{productId}:
 *   parameters:
 *     - $ref: '#/components/parameters/CartProductId'
 *   patch:
 *     summary: Set the quantity of a product in my cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCartItemRequest'
 *     responses:
 *       200:
 *         description: Quantity updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *       400:
 *         description: Invalid quantity or not enough stock
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/CartItemNotFound'
 *   delete:
 *     summary: Remove a product from my cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Item removed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/CartItemNotFound'
 */
cartRouter.patch('/cart/items/:productId', updateCartItem)
cartRouter.delete('/cart/items/:productId', removeCartItem)

/**
 * @openapi
 * /cart/checkout:
 *   post:
 *     summary: Turn my cart into an order (queued)
 *     description: >
 *       Puts the cart's current contents in the order queue and answers 202.
 *       A worker then reduces stock, creates the order, and removes those products
 *       from the cart together. If stock ran out, the job fails and the cart is kept.
 *       Poll statusUrl for the result. Clicking checkout again while a checkout is
 *       still waiting returns the same job instead of making a second order.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Checkout accepted and waiting in the queue
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QueuedOrderResponse'
 *       400:
 *         description: Cart is empty
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         $ref: '#/components/responses/QueueUnavailable'
 */
cartRouter.post('/cart/checkout', checkout)

export default cartRouter
