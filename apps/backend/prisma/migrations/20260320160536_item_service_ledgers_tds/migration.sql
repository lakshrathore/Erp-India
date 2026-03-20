-- AlterTable
ALTER TABLE "items" ADD COLUMN     "expenseLedgerId" TEXT,
ADD COLUMN     "incomeLedgerId" TEXT,
ADD COLUMN     "tdsApplicable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tdsRate" DECIMAL(5,2),
ADD COLUMN     "tdsSection" TEXT;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_incomeLedgerId_fkey" FOREIGN KEY ("incomeLedgerId") REFERENCES "ledgers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_expenseLedgerId_fkey" FOREIGN KEY ("expenseLedgerId") REFERENCES "ledgers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
