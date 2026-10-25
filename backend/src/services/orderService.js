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
            products: { select: { id: true, name: true, price: true } }
        }
    }
}

// Adds a total, calculated from each item's product price times quantity
export const withTotal = (order) => {
    const total = order.carts.reduce(
        (sum, item) => sum + Number(item.products.price) * item.quantity,
        0
    )
    return { ...order, total: total.toFixed(2) }
}

// Reduces stock for every item, then creates the order.
// Must run inside prisma.$transaction, so a failure saves nothing.
// items: [{ productId, quantity }] with no duplicate products
export const placeOrder = async (tx, userId, items) => {
    for(const item of items){
        // Only reduce stock if there is enough. Doing the check and the
        // update in one query stops two buyers from taking the last item.
        const result = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } }
        })

        if(result.count === 0){
            const product = await tx.product.findUnique({
                where: { id: item.productId },
                select: { name: true, stock: true }
            })
            if(!product){
                throw new NotFound(`product ${item.productId} not found`)
            }
            throw new BadRequest(`not enough stock for ${product.name}, only ${product.stock} left`)
        }
    }

    return tx.order.create({
        data: {
            userId,
            // The schema requires one productId on the order itself.
            // The full list of products is in carts.
            productId: items[0].productId,
            carts: {
                create: items.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity
                }))
            }
        },
        include: orderInclude
    })
}
