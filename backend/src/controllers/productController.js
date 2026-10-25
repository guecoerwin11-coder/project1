import prisma from '../configs/postgres.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errorClass.js'
import logger from '../logger/logger.js'

// Every product response shows who sells it (never their email or password)
const productInclude = {
    seller: { select: { id: true, userName: true } }
}

// Admins can change any product. Sellers can only change products they own.
// Products with no owner (created before ownership existed) are admin only.
const assertCanManage = (user, product) => {
    if(user.roles === 'ADMIN'){
        return
    }
    if(!product.sellerId || product.sellerId !== user.id){
        throw new Forbidden("you can only change your own products")
    }
}

// Checks the body and returns only the allowed fields.
// When partial is true (updates), missing fields are allowed.
const validateProduct = (body, partial = false) => {
    const { name, description, price, stock } = body;
    const data = {};

    if(name !== undefined || !partial){
        if(typeof name !== 'string' || name.trim() === ''){
            throw new BadRequest("name is required and must be a non-empty string")
        }
        data.name = name.trim()
    }

    if(description !== undefined){
        if(description !== null && typeof description !== 'string'){
            throw new BadRequest("description must be a string")
        }
        data.description = description
    }

    if(price !== undefined || !partial){
        const num = Number(price)
        if(price === null || price === '' || !Number.isFinite(num) || num < 0){
            throw new BadRequest("price is required and must be a number 0 or higher")
        }
        data.price = num
    }

    if(stock !== undefined){
        if(!Number.isInteger(stock) || stock < 0){
            throw new BadRequest("stock must be a whole number 0 or higher")
        }
        data.stock = stock
    }

    if(partial && Object.keys(data).length === 0){
        throw new BadRequest("provide at least one field to update")
    }

    return data
}

const findProductOrFail = async (id) => {
    const product = await prisma.product.findUnique({ where: { id }, include: productInclude })
    // Archived products are kept for order history, but act as deleted everywhere else
    if(!product || product.archivedAt){
        throw new NotFound("product not found")
    }
    return product
}

// GET /products
// Optional: ?sellerId=<id> shows only that seller's products, like a shop page
const getProducts = async (req, res, next) => {
    try{
        const where = { archivedAt: null }
        if(typeof req.query.sellerId === 'string' && req.query.sellerId !== ''){
            where.sellerId = req.query.sellerId
        }

        const products = await prisma.product.findMany({
            where,
            include: productInclude,
            orderBy: { createdAt: 'desc' }
        })
        res.status(200).json({ products })
    }catch(err){
        next(err)
    }
}

const getProductById = async (req, res, next) => {
    try{
        const product = await findProductOrFail(req.params.id)
        res.status(200).json({ product })
    }catch(err){
        next(err)
    }
}

const createProduct = async (req, res, next) => {
    try{
        const data = validateProduct(req.body)
        // The owner always comes from the token, never from the request body
        const product = await prisma.product.create({
            data: { ...data, sellerId: req.user.id },
            include: productInclude
        })

        logger.info({
            message: "Product created",
            productId: product.id,
            userId: req.user.id
        })

        res.status(201).json({ message: "product created", product })
    }catch(err){
        next(err)
    }
}

const updateProduct = async (req, res, next) => {
    try{
        const data = validateProduct(req.body, true)
        const existing = await findProductOrFail(req.params.id)
        assertCanManage(req.user, existing)

        const product = await prisma.product.update({
            where: { id: req.params.id },
            data,
            include: productInclude
        })

        logger.info({
            message: "Product updated",
            productId: product.id,
            userId: req.user.id
        })

        res.status(200).json({ message: "product updated", product })
    }catch(err){
        next(err)
    }
}

// A product that was never ordered is deleted for real.
// A product that appears in orders is archived instead, so order history keeps
// working: it disappears from the shop, from carts, and cannot be bought again.
const deleteProduct = async (req, res, next) => {
    try{
        const id = req.params.id
        const existing = await findProductOrFail(id)
        assertCanManage(req.user, existing)

        const timesOrdered = await prisma.cart.count({ where: { productId: id } })

        if(timesOrdered === 0){
            await prisma.product.delete({ where: { id } })
            logger.info({ message: "Product deleted", productId: id, userId: req.user.id })
            return res.status(200).json({ message: "product deleted", archived: false })
        }

        await prisma.$transaction([
            prisma.product.update({
                where: { id },
                data: { archivedAt: new Date(), stock: 0 }
            }),
            prisma.cartItem.deleteMany({ where: { productId: id } })
        ])

        logger.info({ message: "Product archived", productId: id, userId: req.user.id, timesOrdered })
        res.status(200).json({ message: "product archived, it is kept for order history", archived: true })
    }catch(err){
        next(err)
    }
}

export {
    getProducts, getProductById, createProduct, updateProduct, deleteProduct
}
