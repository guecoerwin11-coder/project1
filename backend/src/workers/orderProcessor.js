import { UnrecoverableError } from 'bullmq'
import prisma from '../configs/postgres.js'
import { placeOrder } from '../services/orderService.js'
import { BadRequest, NotFound } from '../utils/errorClass.js'

// Processes one order job from the queue. The worker calls this for each job, in order.
// job.data: { userId, items: [{ productId, quantity }], source: 'cart' | 'direct' }
// Returns { orderId }, which BullMQ stores as the job's result.
export const processOrderJob = async (job) => {
    const { userId, items, source } = job.data

    try{
        const order = await prisma.$transaction(async (tx) => {
            const created = await placeOrder(tx, userId, items)

            // Checkout removes the ordered products from the cart.
            // Products the user added after clicking checkout stay in the cart.
            if(source === 'cart'){
                await tx.cartItem.deleteMany({
                    where: { userId, productId: { in: items.map(item => item.productId) } }
                })
            }
            return created
        })

        return { orderId: order.id }
    }catch(err){
        // Out of stock or a missing product will fail the same way every time,
        // so tell BullMQ not to retry. The message is shown to the user.
        if(err instanceof BadRequest || err instanceof NotFound){
            throw new UnrecoverableError(err.message)
        }
        // Anything else, like a lost database connection, is retried
        throw err
    }
}
