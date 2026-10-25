import prisma from "../configs/postgres.js";
import { BadRequest, NotFound } from "../utils/errorClass.js";
import logger  from "../logger/logger.js"
import { MAX_ITEMS, MAX_QUANTITY, withTotal, placeOrder } from "../services/orderService.js";

// Every cart line includes the product info the frontend needs to show it
const cartInclude = {
    product: { select: { id: true, name: true, price: true, stock: true } }
}

// Turns cart rows into the response shape: lines with subtotals, plus totals.
// inStock warns the frontend when stock dropped after the item was added.
const formatCart = (items) => {
    const lines = items.map(item => {
        const subtotal = Number(item.product.price) * item.quantity
        return {
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            product: item.product,
            subtotal: subtotal.toFixed(2),
            inStock: item.quantity <= item.product.stock
        }
    })

    const total = lines.reduce((sum, line) => sum + Number(line.subtotal), 0)
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

    return { items: lines, itemCount, total: total.toFixed(2) }
}

// Loads the user's whole cart, oldest line first
const loadCart = async (userId) => {
    const items = await prisma.cartItem.findMany({
        where: { userId },
        include: cartInclude,
        orderBy: { createdAt: 'asc' }
    })
    return formatCart(items)
}

const validateQuantity = (quantity) => {
    if(!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY){
        throw new BadRequest(`quantity must be a whole number from 1 to ${MAX_QUANTITY}`)
    }
}

const findProductOrFail = async (productId) => {
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if(!product){
        throw new NotFound("product not found")
    }
    return product
}

const checkStock = (product, quantity) => {
    if(quantity > product.stock){
        throw new BadRequest(`not enough stock for ${product.name}, only ${product.stock} left`)
    }
}

// GET /cart
const getCart = async (req, res, next) => {
    try{
        const cart = await loadCart(req.user.id)
        res.status(200).json({ cart })
    }catch(err){
        next(err)
    }
}

// POST /cart/items
// Body: { productId, quantity }  quantity is optional and defaults to 1.
// Adding a product that is already in the cart raises its quantity.
const addToCart = async (req, res, next) => {
    try{
        const { productId, quantity = 1 } = req.body
        const userId = req.user.id

        if(typeof productId !== 'string' || productId.trim() === ''){
            throw new BadRequest("productId is required")
        }
        validateQuantity(quantity)

        const product = await findProductOrFail(productId)

        const existing = await prisma.cartItem.findUnique({
            where: { userId_productId: { userId, productId } }
        })

        if(!existing){
            const lines = await prisma.cartItem.count({ where: { userId } })
            if(lines >= MAX_ITEMS){
                throw new BadRequest(`a cart can have at most ${MAX_ITEMS} different products`)
            }
        }

        const newQuantity = (existing?.quantity || 0) + quantity
        if(newQuantity > MAX_QUANTITY){
            throw new BadRequest(`quantity per product can be at most ${MAX_QUANTITY}`)
        }
        checkStock(product, newQuantity)

        await prisma.cartItem.upsert({
            where: { userId_productId: { userId, productId } },
            create: { userId, productId, quantity: newQuantity },
            update: { quantity: newQuantity }
        })

        const cart = await loadCart(userId)
        res.status(existing ? 200 : 201).json({ message: "added to cart", cart })
    }catch(err){
        next(err)
    }
}

// PATCH /cart/items/:productId
// Body: { quantity }  sets the quantity to exactly this number.
const updateCartItem = async (req, res, next) => {
    try{
        const { quantity } = req.body
        const { productId } = req.params
        const userId = req.user.id

        validateQuantity(quantity)

        const existing = await prisma.cartItem.findUnique({
            where: { userId_productId: { userId, productId } },
            include: cartInclude
        })
        if(!existing){
            throw new NotFound("item not in cart")
        }
        checkStock(existing.product, quantity)

        await prisma.cartItem.update({
            where: { id: existing.id },
            data: { quantity }
        })

        const cart = await loadCart(userId)
        res.status(200).json({ message: "cart updated", cart })
    }catch(err){
        next(err)
    }
}

// DELETE /cart/items/:productId
const removeCartItem = async (req, res, next) => {
    try{
        const userId = req.user.id

        const result = await prisma.cartItem.deleteMany({
            where: { userId, productId: req.params.productId }
        })
        if(result.count === 0){
            throw new NotFound("item not in cart")
        }

        const cart = await loadCart(userId)
        res.status(200).json({ message: "item removed", cart })
    }catch(err){
        next(err)
    }
}

// DELETE /cart
const clearCart = async (req, res, next) => {
    try{
        await prisma.cartItem.deleteMany({ where: { userId: req.user.id } })
        res.status(200).json({ message: "cart cleared", cart: formatCart([]) })
    }catch(err){
        next(err)
    }
}

// POST /cart/checkout
// Turns the cart into an order. Stock is reduced, the order is created, and the
// cart is emptied together. If any product is out of stock, nothing changes.
const checkout = async (req, res, next) => {
    try{
        const userId = req.user.id

        const order = await prisma.$transaction(async (tx) => {
            const items = await tx.cartItem.findMany({
                where: { userId },
                orderBy: { createdAt: 'asc' }
            })
            if(items.length === 0){
                throw new BadRequest("cart is empty")
            }

            const created = await placeOrder(
                tx,
                userId,
                items.map(item => ({ productId: item.productId, quantity: item.quantity }))
            )

            await tx.cartItem.deleteMany({ where: { userId } })
            return created
        })

        logger.info({
            message: "Checkout complete",
            orderId: order.id,
            userId,
            items: order.carts.length
        })

        res.status(201).json({ message: "order placed", order: withTotal(order) })
    }catch(err){
        next(err)
    }
}

export {
    getCart, addToCart, updateCartItem, removeCartItem, clearCart, checkout
}
