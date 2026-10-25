/*
  Warnings:

  - You are about to drop the column `product_id` on the `Order` table. All the data in the column will be lost.
  - Added the required column `price` to the `Cart` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_productId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_product_id_fkey";

-- AlterTable
-- Edited by hand: add the column as optional, fill old order items with their
-- product's current price (the best value we have), then make it required.
ALTER TABLE "Cart" ADD COLUMN     "price" DECIMAL(10,2);
UPDATE "Cart" SET "price" = "Product"."price" FROM "Product" WHERE "Cart"."productId" = "Product"."id";
ALTER TABLE "Cart" ALTER COLUMN "price" SET NOT NULL;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "product_id";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_user_id_idx" ON "Order"("user_id");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
