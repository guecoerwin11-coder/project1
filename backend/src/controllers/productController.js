import prisma from '../configs/postgres.js'
import { BadRequest, NotFound } from '../utils/errorClass.js'
import logger from '../logger/logger.js'

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
    const product = await prisma.product.findUnique({ where: { id } })
    if(!product){
        throw new NotFound("product not found")
    }
    return product
}

const getProducts = async (req, res, next) => {
    try{
        const products = await prisma.product.findMany({
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
        const product = await prisma.product.create({ data })

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
        await findProductOrFail(req.params.id)

        const product = await prisma.product.update({
            where: { id: req.params.id },
            data
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

const deleteProduct = async (req, res, next) => {
    try{
        await findProductOrFail(req.params.id)
        await prisma.product.delete({ where: { id: req.params.id } })

        logger.info({
            message: "Product deleted",
            productId: req.params.id,
            userId: req.user.id
        })

        res.status(200).json({ message: "product deleted" })
    }catch(err){
        next(err)
    }
}

export {
    getProducts, getProductById, createProduct, updateProduct, deleteProduct
}
