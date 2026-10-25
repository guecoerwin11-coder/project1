import prisma from "../configs/postgres.js";
import { BadRequest, NotFound } from "../utils/errorClass.js";
import logger from "../logger/logger.js";
import { MAX_ITEMS, MAX_QUANTITY, orderInclude, withTotal } from "../services/orderService.js";
import { enqueueOrder, getOrderJob, describeOrderJob } from "../queues/orderQueue.js";

// Which status an order may move to from its current status
const ALLOWED_TRANSITIONS = {
    PENDING: ['SHIPPED', 'CANCEL'],
    SHIPPED: ['RECEIVE'],
    RECEIVE: [],
    CANCEL: []
}

const isAdmin = (user) => user.roles === 'ADMIN'

// Checks the items array and combines duplicate products into one line
const validateItems = (items) => {
    if(!Array.isArray(items) || items.length === 0){
        throw new BadRequest("items must be a non-empty array")
    }
    if(items.length > MAX_ITEMS){
        throw new BadRequest(`an order can have at most ${MAX_ITEMS} items`)
    }

    const merged = new Map()
    for(const item of items){
        if(!item || typeof item.productId !== 'string' || item.productId.trim() === ''){
            throw new BadRequest("each item needs a productId")
        }
        if(!Number.isInteger(item.quantity) || item.quantity < 1){
            throw new BadRequest("each item needs a quantity that is a whole number of 1 or more")
        }
        merged.set(item.productId, (merged.get(item.productId) || 0) + item.quantity)
    }

    for(const quantity of merged.values()){
        if(quantity > MAX_QUANTITY){
            throw new BadRequest(`quantity per product can be at most ${MAX_QUANTITY}`)
        }
    }

    return [...merged].map(([productId, quantity]) => ({ productId, quantity }))
}

// Puts the stock of every item in an order back
const restock = async (tx, carts) => {
    for(const item of carts){
        await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } }
        })
    }
}

// Changes the status only if nobody else changed it first.
// Stops two requests from cancelling the same order twice and restocking twice.
const changeStatus = async (tx, order, newStatus) => {
    const result = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: newStatus }
    })
    if(result.count === 0){
        throw new BadRequest("order was changed by another request, try again")
    }
    if(newStatus === 'CANCEL'){
        await restock(tx, order.carts)
    }
    return tx.order.findUnique({ where: { id: order.id }, include: orderInclude })
}

// GET /orders
// Admins see every order. Everyone else sees only their own.
const getOrders = async (req, res, next) => {
    try{
        const where = isAdmin(req.user) ? {} : { userId: req.user.id }

        const orders = await prisma.order.findMany({
            where,
            include: orderInclude,
            orderBy: { createdAt: 'desc' }
        })

        res.status(200).json({ orders: orders.map(withTotal) })
    }catch(err){
        next(err)
    }
}

// GET /orders/:id
// Returns 404 instead of 403 for other people's orders,
// so nobody can find out which order ids exist.
const getOrderById = async (req, res, next) => {
    try{
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: orderInclude
        })

        if(!order || (!isAdmin(req.user) && order.userId !== req.user.id)){
            throw new NotFound("order not found")
        }

        res.status(200).json({ order: withTotal(order) })
    }catch(err){
        next(err)
    }
}

// POST /orders
// Body: { items: [{ productId, quantity }] }
// Checks the input right away, then puts the order in the queue and answers 202.
// A worker places the order later. Poll GET /orders/jobs/:jobId for the result.
const createOrder = async (req, res, next) => {
    try{
        const items = validateItems(req.body.items)

        const { job } = await enqueueOrder({ userId: req.user.id, items, source: 'direct' })

        logger.info({
            message: "Order queued",
            jobId: job.id,
            userId: req.user.id,
            items: items.length
        })

        res.status(202).json({
            message: "order queued",
            ...(await describeOrderJob(job)),
            statusUrl: `/api/orders/jobs/${job.id}`
        })
    }catch(err){
        next(err)
    }
}

// GET /orders/jobs/:jobId
// Shows where a queued order is: waiting (with place in line), processing,
// completed (with the order), or failed (with the reason).
// Other users' jobs return 404, like other users' orders.
const getOrderJobStatus = async (req, res, next) => {
    try{
        const job = await getOrderJob(req.params.jobId)

        if(!job || (!isAdmin(req.user) && job.data.userId !== req.user.id)){
            throw new NotFound("order job not found")
        }

        const summary = await describeOrderJob(job)

        if(summary.status === 'completed' && summary.orderId){
            const order = await prisma.order.findUnique({
                where: { id: summary.orderId },
                include: orderInclude
            })
            if(order){
                summary.order = withTotal(order)
            }
        }

        res.status(200).json(summary)
    }catch(err){
        next(err)
    }
}

// PATCH /orders/:id/status
// Body: { status }
// For staff. Follows ALLOWED_TRANSITIONS. Cancelling puts the stock back.
const updateOrderStatus = async (req, res, next) => {
    try{
        const { status } = req.body

        if(!Object.keys(ALLOWED_TRANSITIONS).includes(status)){
            throw new BadRequest(`status must be one of: ${Object.keys(ALLOWED_TRANSITIONS).join(', ')}`)
        }

        const order = await prisma.$transaction(async (tx) => {
            const current = await tx.order.findUnique({
                where: { id: req.params.id },
                include: { carts: true }
            })
            if(!current){
                throw new NotFound("order not found")
            }
            if(!ALLOWED_TRANSITIONS[current.status].includes(status)){
                throw new BadRequest(`cannot change order from ${current.status} to ${status}`)
            }
            return changeStatus(tx, current, status)
        })

        logger.info({
            message: "Order status updated",
            orderId: order.id,
            status,
            userId: req.user.id
        })

        res.status(200).json({ message: "order status updated", order: withTotal(order) })
    }catch(err){
        next(err)
    }
}

// PATCH /orders/:id/cancel
// The customer who placed the order, or an admin, can cancel it while it is still PENDING.
const cancelOrder = async (req, res, next) => {
    try{
        const order = await prisma.$transaction(async (tx) => {
            const current = await tx.order.findUnique({
                where: { id: req.params.id },
                include: { carts: true }
            })
            if(!current || (!isAdmin(req.user) && current.userId !== req.user.id)){
                throw new NotFound("order not found")
            }
            if(current.status !== 'PENDING'){
                throw new BadRequest(`only PENDING orders can be cancelled, this one is ${current.status}`)
            }
            return changeStatus(tx, current, 'CANCEL')
        })

        logger.info({
            message: "Order cancelled",
            orderId: order.id,
            userId: req.user.id
        })

        res.status(200).json({ message: "order cancelled", order: withTotal(order) })
    }catch(err){
        next(err)
    }
}

export {
    getOrders, getOrderById, createOrder, getOrderJobStatus, updateOrderStatus, cancelOrder
}
