-- AlterTable
ALTER TABLE "items" ADD COLUMN     "isService" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxMasterId" TEXT;

-- CreateTable
CREATE TABLE "item_tax_history" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "taxMasterId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cessRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notificationNo" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "item_tax_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsn_sac_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "codeType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hsn_sac_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_tax_history_itemId_effectiveFrom_idx" ON "item_tax_history"("itemId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "hsn_sac_codes_code_key" ON "hsn_sac_codes"("code");

-- CreateIndex
CREATE INDEX "hsn_sac_codes_codeType_code_idx" ON "hsn_sac_codes"("codeType", "code");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_taxMasterId_fkey" FOREIGN KEY ("taxMasterId") REFERENCES "tax_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_tax_history" ADD CONSTRAINT "item_tax_history_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_tax_history" ADD CONSTRAINT "item_tax_history_taxMasterId_fkey" FOREIGN KEY ("taxMasterId") REFERENCES "tax_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
