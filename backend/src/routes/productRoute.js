import express from 'express'
import validation from '../middleware/validation.js'
import isAuthorize from '../middleware/isAuthorize.js'
import {
    getProducts, getProductById, createProduct, updateProduct, deleteProduct
} from '../controllers/productController.js'

const productRouter = express.Router()

// Only admins and sellers can create, update or delete products
const canManageProducts = isAuthorize('ADMIN', 'SELLER')

/**
 * @openapi
 * tags:
 *   - name: Products
 *     description: Browse and manage products
 */

/**
 * @openapi
 * /products:
 *   get:
 *     summary: List all products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of products, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *   post:
 *     summary: Create a product
 *     tags: [Products]
 *     description: Requires the ADMIN or SELLER role.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductInput'
 *     responses:
 *       201:
 *         description: Product created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: product created
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         description: Invalid or missing fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Logged in, but role is not ADMIN or SELLER
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
productRouter.get('/products', getProducts)
productRouter.post('/products', validation, canManageProducts, createProduct)

/**
 * @openapi
 * /products/{id}:
 *   parameters:
 *     - in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *         format: uuid
 *   get:
 *     summary: Get one product
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: The product
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   put:
 *     summary: Update a product
 *     description: Requires the ADMIN or SELLER role. Send only the fields you want to change.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductUpdate'
 *     responses:
 *       200:
 *         description: Product updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: product updated
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         description: Invalid fields or empty body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Logged in, but role is not ADMIN or SELLER
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 *     description: >
 *       Requires the ADMIN or SELLER role. A product that was never ordered is
 *       deleted. A product that appears in orders is archived instead: it is hidden
 *       from the shop and removed from carts, but kept so order history still works.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Product deleted or archived
 *         content:
 *           application/json:
 *             examples:
 *               deleted:
 *                 summary: Never ordered, removed for good
 *                 value: { message: product deleted, archived: false }
 *               archived:
 *                 summary: Has orders, kept for history
 *                 value: { message: 'product archived, it is kept for order history', archived: true }
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Logged in, but role is not ADMIN or SELLER
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
productRouter.get('/products/:id', getProductById)
productRouter.put('/products/:id', validation, canManageProducts, updateProduct)
productRouter.delete('/products/:id', validation, canManageProducts, deleteProduct)

export default productRouter
