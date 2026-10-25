import { BadRequest, NotFound } from "../utils/errorClass.js";

// Shared order logic, used by the order controller and by cart checkout.
// Controllers handle the request and response. Services hold logic that more
// than one controller needs.

export const MAX_ITEMS = 50
export const MAX_QUANTITY = 100

// Every order response includes its items and the product info for each item
export const orderInclude = {
    carts: {
        include: {
            products: { select: { id: true, name: true } }
        }
    }
}

// Adds a total, calculated from the price saved on each item at purchase time.
// Later price changes on the product do not change old orders.
export const withTotal = (order) => {
    const total = order.carts.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0
    )
    return { ...order, total: total.toFixed(2) }
}

// Reduces stock for every item, then creates the order with each item's price.
// Must run inside prisma.$transaction, so a failure saves nothing.
// items: [{ productId, quantity }] with no duplicate products
export const placeOrder = async (tx, userId, items) => {
    const products = await tx.product.findMany({
        where: { id: { in: items.map(item => item.productId) } },
        select: { id: true, name: true, price: true, archivedAt: true }
    })
    const byId = new Map(products.map(product => [product.id, product]))

    for(const item of items){
        const product = byId.get(item.productId)
        if(!product || product.archivedAt){
            throw new NotFound(`product ${item.productId} is no longer available`)
        }

        // Only reduce stock if there is enough. Doing the check and the
        // update in one query stops two buyers from taking the last item.
        const result = await tx.product.updateMany({
            where: { id: item.productId, archivedAt: null, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } }
        })

        if(result.count === 0){
            const latest = await tx.product.findUnique({
                where: { id: item.productId },
                select: { stock: true }
            })
            throw new BadRequest(`not enough stock for ${product.name}, only ${latest?.stock ?? 0} left`)
        }
    }

    return tx.order.create({
        data: {
            userId,
            carts: {
                create: items.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    price: byId.get(item.productId).price
                }))
            }
        },
        include: orderInclude
    })
}
