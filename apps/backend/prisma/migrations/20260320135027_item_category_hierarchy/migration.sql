-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'ACCOUNTANT', 'BILLING_OPERATOR', 'INVENTORY_OPERATOR', 'PAYROLL_OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SALE_CHALLAN', 'PURCHASE_ORDER', 'PURCHASE_CHALLAN', 'PRODUCTION', 'RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('CUSTOMER', 'VENDOR', 'BOTH', 'EMPLOYEE', 'BANK', 'OTHER');

-- CreateEnum
CREATE TYPE "LedgerGroupNature" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "GSTType" AS ENUM ('REGULAR', 'COMPOSITION', 'UNREGISTERED', 'SEZ', 'DEEMED_EXPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('CGST_SGST', 'IGST', 'EXEMPT', 'NIL_RATED', 'NON_GST');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'CHEQUE', 'NEFT', 'RTGS', 'UPI', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('EARNED', 'CASUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'COMPENSATORY', 'OPTIONAL', 'LOSS_OF_PAY');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEKLY_OFF');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('OLD', 'NEW');

-- CreateEnum
CREATE TYPE "GSTReturnStatus" AS ENUM ('PENDING', 'FILED', 'REVISED');

-- CreateEnum
CREATE TYPE "ReconcileStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'PARTIAL', 'IGNORED');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('SLM', 'WDV', 'UNITS');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'DISPOSED', 'FULLY_DEPRECIATED', 'UNDER_REPAIR', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "tan" TEXT,
    "cin" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logo" TEXT,
    "signature" TEXT,
    "gstRegType" "GSTType" NOT NULL DEFAULT 'REGULAR',
    "compositionRate" DOUBLE PRECISION,
    "bookBeginningDate" TIMESTAMP(3),
    "financialYearStart" INTEGER NOT NULL DEFAULT 4,
    "currencySymbol" TEXT NOT NULL DEFAULT '₹',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD-MM-YYYY',
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "roundOffSales" BOOLEAN NOT NULL DEFAULT true,
    "printLogoOnInvoice" BOOLEAN NOT NULL DEFAULT true,
    "printSignatureOnInvoice" BOOLEAN NOT NULL DEFAULT true,
    "printConfig" TEXT,
    "txnSettings" TEXT,
    "ledgerMappings" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_users" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "branchIds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "phone" TEXT,
    "isHO" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_addresses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_years" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_locks" (
    "id" TEXT NOT NULL,
    "financialYearId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,

    CONSTRAINT "period_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_series" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "voucherType" "VoucherType" NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "startNumber" INTEGER NOT NULL DEFAULT 1,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "padLength" INTEGER NOT NULL DEFAULT 4,
    "separator" TEXT NOT NULL DEFAULT '-',
    "fyDependent" BOOLEAN NOT NULL DEFAULT true,
    "financialYear" TEXT,

    CONSTRAINT "number_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_groups" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "nature" "LedgerGroupNature" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledgers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "openingBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "openingType" TEXT NOT NULL DEFAULT 'Dr',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "gstin" TEXT,
    "panNumber" TEXT,
    "tdsApplicable" BOOLEAN NOT NULL DEFAULT false,
    "tdsSection" TEXT,
    "tdsRate" DECIMAL(5,2),
    "tdsThreshold" DECIMAL(15,2),
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifscCode" TEXT,
    "bankBranch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ledgerId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" "PartyType" NOT NULL DEFAULT 'CUSTOMER',
    "gstin" TEXT,
    "gstType" "GSTType" NOT NULL DEFAULT 'REGULAR',
    "pan" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "shipAddressLine1" TEXT,
    "shipAddressLine2" TEXT,
    "shipCity" TEXT,
    "shipState" TEXT,
    "shipStateCode" TEXT,
    "shipPincode" TEXT,
    "creditLimit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "openingType" TEXT NOT NULL DEFAULT 'Dr',
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifscCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_addresses" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "party_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "icon" TEXT,
    "description" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '[]',
    "trackBatch" BOOLEAN NOT NULL DEFAULT false,
    "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "alternateUnit" TEXT,
    "conversionFactor" DECIMAL(10,4),
    "hsnCode" TEXT,
    "sacCode" TEXT,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cessRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxType" "TaxType" NOT NULL DEFAULT 'CGST_SGST',
    "purchaseRate" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "saleRate" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "mrp" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ptr" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "pts" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "wholesaleRate" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "tradeDiscount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cashDiscount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "schemeDiscount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "maintainStock" BOOLEAN NOT NULL DEFAULT true,
    "reorderLevel" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "reorderQty" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "minSaleQty" DECIMAL(15,3) NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_variants" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "code" TEXT,
    "barcode" TEXT,
    "attributeValues" JSONB NOT NULL DEFAULT '{}',
    "purchaseRate" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "saleRate" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_masters" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cgstRate" DECIMAL(5,2) NOT NULL,
    "sgstRate" DECIMAL(5,2) NOT NULL,
    "igstRate" DECIMAL(5,2) NOT NULL,
    "cessRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tax_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "godowns" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "godowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "financialYear" TEXT NOT NULL,
    "voucherType" "VoucherType" NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "partyId" TEXT,
    "narration" TEXT,
    "status" "VoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentMode" "PaymentMode",
    "chequeNumber" TEXT,
    "chequeDate" DATE,
    "bankLedgerId" TEXT,
    "placeOfSupply" TEXT,
    "isReverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "isExport" BOOLEAN NOT NULL DEFAULT false,
    "isInclusive" BOOLEAN NOT NULL DEFAULT false,
    "exportType" TEXT,
    "saleType" TEXT,
    "lut" TEXT,
    "lutDate" DATE,
    "eInvoiceIRN" TEXT,
    "eInvoiceAckNo" TEXT,
    "eWayBillNo" TEXT,
    "refVoucherType" "VoucherType",
    "refVoucherNumber" TEXT,
    "refVoucherDate" DATE,
    "totalQty" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_items" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "variantId" TEXT,
    "batchId" TEXT,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "qty" DECIMAL(15,3) NOT NULL,
    "freeQty" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "rate" DECIMAL(15,4) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountAmt" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount2Pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount2Amt" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount3Pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount3Amt" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(15,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "taxType" "TaxType" NOT NULL DEFAULT 'CGST_SGST',
    "cgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "igstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cessRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(15,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "mfgDate" DATE,
    "expDate" DATE,
    "batchNo" TEXT,

    CONSTRAINT "voucher_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_ledgers" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "voucher_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_links" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "linkedQty" DECIMAL(15,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_settlements" (
    "id" TEXT NOT NULL,
    "fromVoucherId" TEXT NOT NULL,
    "againstVoucherId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "date" DATE NOT NULL,
    "narration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "financialYear" TEXT NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_batches" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "variantId" TEXT,
    "godownId" TEXT,
    "batchNo" TEXT,
    "mfgDate" DATE,
    "expDate" DATE,
    "purchaseDate" DATE NOT NULL,
    "purchaseRate" DECIMAL(15,4) NOT NULL,
    "qtyIn" DECIMAL(15,3) NOT NULL,
    "qtyOut" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "qtyBalance" DECIMAL(15,3) NOT NULL,
    "sourceVoucherId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "voucherId" TEXT,
    "itemId" TEXT NOT NULL,
    "variantId" TEXT,
    "batchId" TEXT,
    "godownId" TEXT,
    "date" DATE NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "qty" DECIMAL(15,3) NOT NULL,
    "rate" DECIMAL(15,4) NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "narration" TEXT,
    "financialYear" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gst_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "partyGstin" TEXT,
    "partyName" TEXT,
    "placeOfSupply" TEXT NOT NULL,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "taxableValue" DECIMAL(15,2) NOT NULL,
    "igstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "hsnSummary" JSONB,
    "gstr1Filed" BOOLEAN NOT NULL DEFAULT false,
    "gstr1Period" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gst_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gstr2b_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "supplierGstin" TEXT NOT NULL,
    "supplierName" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "invoiceType" TEXT NOT NULL,
    "placeOfSupply" TEXT,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "taxableValue" DECIMAL(15,2) NOT NULL,
    "igstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "itcAvailable" BOOLEAN NOT NULL DEFAULT true,
    "reconStatus" "ReconcileStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedVoucherId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gstr2b_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tds_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "partyId" TEXT,
    "partyPan" TEXT,
    "section" TEXT NOT NULL,
    "baseAmount" DECIMAL(15,2) NOT NULL,
    "tdsRate" DECIMAL(5,2) NOT NULL,
    "tdsAmount" DECIMAL(15,2) NOT NULL,
    "isDeducted" BOOLEAN NOT NULL DEFAULT true,
    "deductionDate" DATE NOT NULL,
    "challanNo" TEXT,
    "challanDate" DATE,
    "quarterPeriod" TEXT,
    "isForm26As" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tds_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "txnDate" DATE NOT NULL,
    "valueDate" DATE,
    "description" TEXT NOT NULL,
    "refNo" TEXT,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(15,2),
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" TIMESTAMP(3),
    "matchedVoucherId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costCenter" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "components" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "empCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fatherName" TEXT,
    "dob" DATE,
    "gender" TEXT,
    "maritalStatus" TEXT,
    "nationality" TEXT NOT NULL DEFAULT 'Indian',
    "doj" DATE NOT NULL,
    "dol" DATE,
    "departmentId" TEXT,
    "designationId" TEXT,
    "salaryStructureId" TEXT,
    "reportingTo" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "taxRegime" "TaxRegime" NOT NULL DEFAULT 'NEW',
    "phone" TEXT,
    "email" TEXT,
    "personalEmail" TEXT,
    "emergencyContact" TEXT,
    "presentAddress" TEXT,
    "permanentAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "pan" TEXT,
    "aadhaar" TEXT,
    "uan" TEXT,
    "esicNo" TEXT,
    "ptState" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifscCode" TEXT,
    "bankBranch" TEXT,
    "ctc" DECIMAL(15,2),
    "basicSalary" DECIMAL(15,2),
    "investmentDecl" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "inTime" TEXT,
    "outTime" TEXT,
    "overtime" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "year" INTEGER NOT NULL,
    "allocated" DECIMAL(5,1) NOT NULL,
    "used" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "balance" DECIMAL(5,1) NOT NULL,
    "carryForward" DECIMAL(5,1) NOT NULL DEFAULT 0,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_applications" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_processed" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "presentDays" DECIMAL(5,1) NOT NULL,
    "lopDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "earnings" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "basic" DECIMAL(15,2) NOT NULL,
    "hra" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(15,2) NOT NULL,
    "pfEmployee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "pfEmployer" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "esicEmployee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "esicEmployer" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "professionalTax" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lwf" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(15,2) NOT NULL,
    "netPay" DECIMAL(15,2) NOT NULL,
    "totalCtc" DECIMAL(15,2) NOT NULL,
    "paymentDate" DATE,
    "paymentMode" TEXT,
    "paymentRef" TEXT,
    "isPosted" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedBy" TEXT,

    CONSTRAINT "salary_processed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_loans" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "loanType" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "outstanding" DECIMAL(15,2) NOT NULL,
    "monthlyEmi" DECIMAL(15,2) NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "sanctionDate" DATE NOT NULL,
    "narration" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "location" TEXT,
    "purchaseDate" DATE NOT NULL,
    "purchaseValue" DECIMAL(15,2) NOT NULL,
    "salvageValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "usefulLifeYears" INTEGER NOT NULL DEFAULT 5,
    "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'WDV',
    "depreciationRate" DECIMAL(5,2) NOT NULL,
    "currentValue" DECIMAL(15,2) NOT NULL,
    "totalDepreciation" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vendorName" TEXT,
    "vendorInvoiceNo" TEXT,
    "warrantyExpiry" DATE,
    "hsnCode" TEXT,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "assetLedgerId" TEXT,
    "depExpLedgerId" TEXT,
    "accDepLedgerId" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposalDate" DATE,
    "disposalValue" DECIMAL(15,2),
    "disposalReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_depreciations" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "openingValue" DECIMAL(15,2) NOT NULL,
    "depreciationAmt" DECIMAL(15,2) NOT NULL,
    "closingValue" DECIMAL(15,2) NOT NULL,
    "voucherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_depreciations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_companyId_userId_key" ON "company_users"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_years_companyId_name_key" ON "financial_years"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "period_locks_financialYearId_month_year_key" ON "period_locks"("financialYearId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_companyId_key_key" ON "company_settings"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "number_series_companyId_branchId_voucherType_financialYear_key" ON "number_series"("companyId", "branchId", "voucherType", "financialYear");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_groups_companyId_name_key" ON "ledger_groups"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ledgers_companyId_name_key" ON "ledgers"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "parties_ledgerId_key" ON "parties"("ledgerId");

-- CreateIndex
CREATE UNIQUE INDEX "parties_companyId_name_key" ON "parties"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "item_categories_companyId_name_key" ON "item_categories"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "items_companyId_name_key" ON "items"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tax_masters_companyId_name_key" ON "tax_masters"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "godowns_companyId_name_key" ON "godowns"("companyId", "name");

-- CreateIndex
CREATE INDEX "vouchers_companyId_voucherType_date_idx" ON "vouchers"("companyId", "voucherType", "date");

-- CreateIndex
CREATE INDEX "vouchers_companyId_partyId_date_idx" ON "vouchers"("companyId", "partyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_companyId_voucherType_voucherNumber_financialYear_key" ON "vouchers"("companyId", "voucherType", "voucherNumber", "financialYear");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_ledgerId_date_idx" ON "journal_entries"("companyId", "ledgerId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_date_idx" ON "journal_entries"("companyId", "date");

-- CreateIndex
CREATE INDEX "inventory_batches_itemId_variantId_purchaseDate_idx" ON "inventory_batches"("itemId", "variantId", "purchaseDate");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_variantId_date_idx" ON "stock_movements"("itemId", "variantId", "date");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_date_idx" ON "stock_movements"("companyId", "date");

-- CreateIndex
CREATE INDEX "gst_entries_companyId_period_idx" ON "gst_entries"("companyId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "gstr2b_entries_companyId_period_supplierGstin_invoiceNumber_key" ON "gstr2b_entries"("companyId", "period", "supplierGstin", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "departments_companyId_name_key" ON "departments"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "designations_companyId_name_key" ON "designations"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_companyId_name_key" ON "salary_structures"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_empCode_key" ON "employees"("companyId", "empCode");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_employeeId_date_key" ON "attendance"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employeeId_leaveType_year_key" ON "leave_balances"("employeeId", "leaveType", "year");

-- CreateIndex
CREATE UNIQUE INDEX "salary_processed_employeeId_month_year_key" ON "salary_processed"("employeeId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "asset_depreciations_assetId_financialYear_month_key" ON "asset_depreciations"("assetId", "financialYear", "month");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_years" ADD CONSTRAINT "financial_years_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "financial_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_series" ADD CONSTRAINT "number_series_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_groups" ADD CONSTRAINT "ledger_groups_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_groups" ADD CONSTRAINT "ledger_groups_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ledger_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ledger_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_addresses" ADD CONSTRAINT "party_addresses_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_masters" ADD CONSTRAINT "tax_masters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "godowns" ADD CONSTRAINT "godowns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_items" ADD CONSTRAINT "voucher_items_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_items" ADD CONSTRAINT "voucher_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_items" ADD CONSTRAINT "voucher_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_ledgers" ADD CONSTRAINT "voucher_ledgers_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_ledgers" ADD CONSTRAINT "voucher_ledgers_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_links" ADD CONSTRAINT "voucher_links_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_links" ADD CONSTRAINT "voucher_links_childId_fkey" FOREIGN KEY ("childId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_settlements" ADD CONSTRAINT "voucher_settlements_fromVoucherId_fkey" FOREIGN KEY ("fromVoucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_settlements" ADD CONSTRAINT "voucher_settlements_againstVoucherId_fkey" FOREIGN KEY ("againstVoucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "godowns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_entries" ADD CONSTRAINT "gst_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_entries" ADD CONSTRAINT "gst_entries_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gstr2b_entries" ADD CONSTRAINT "gstr2b_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tds_entries" ADD CONSTRAINT "tds_entries_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_salaryStructureId_fkey" FOREIGN KEY ("salaryStructureId") REFERENCES "salary_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_processed" ADD CONSTRAINT "salary_processed_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciations" ADD CONSTRAINT "asset_depreciations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
