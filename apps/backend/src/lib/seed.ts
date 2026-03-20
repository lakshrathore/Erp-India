import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding ERP India database...')

  // ── Super Admin ────────────────────────────────────────────────────────────
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@erpindia.com'
  const adminPass  = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123'
  const adminName  = process.env.SUPER_ADMIN_NAME || 'Super Admin'

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } })

  let adminUser
  if (!existing) {
    adminUser = await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPass, 12),
        isSuperAdmin: true,
        isActive: true,
      },
    })
    console.log(`✅ Super admin created: ${adminEmail}`)
  } else {
    adminUser = existing
    console.log(`ℹ️  Super admin already exists: ${adminEmail}`)
  }

  // ── Demo Company ───────────────────────────────────────────────────────────
  const demoCompanyExists = await prisma.company.findFirst({
    where: { name: 'Rajasthan Traders Pvt Ltd' },
  })

  if (!demoCompanyExists) {
    const company = await prisma.company.create({
      data: {
        name: 'Rajasthan Traders Pvt Ltd',
        legalName: 'Rajasthan Traders Private Limited',
        gstin: '08AABCR1234A1Z5',
        pan: 'AABCR1234A',
        addressLine1: '42, MI Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        stateCode: '08',
        pincode: '302001',
        phone: '9876543210',
        email: 'accounts@rajtraders.com',
        financialYearStart: 4,
      },
    })

    // Add super admin as company admin
    await prisma.companyUser.create({
      data: {
        companyId: company.id,
        userId: adminUser.id,
        role: UserRole.COMPANY_ADMIN,
      },
    })

    // Create Head Office branch
    const branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Head Office - Jaipur',
        gstin: '08AABCR1234A1Z5',
        addressLine1: '42, MI Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        stateCode: '08',
        pincode: '302001',
        isHO: true,
      },
    })

    // Create FY 2024-25 (closed) and 2025-26 (active)
    await prisma.financialYear.create({
      data: {
        companyId: company.id,
        name: '24-25',
        startDate: new Date('2024-04-01'),
        endDate: new Date('2025-03-31'),
        isActive: false,
        isClosed: true,
        closedAt: new Date('2025-04-01'),
      },
    })

    const activeFY = await prisma.financialYear.create({
      data: {
        companyId: company.id,
        name: '25-26',
        startDate: new Date('2025-04-01'),
        endDate: new Date('2026-03-31'),
        isActive: true,
      },
    })

    // Seed ledger groups
    const groups = await seedLedgerGroups(company.id)

    // Seed tax masters
    await seedTaxMasters(company.id)

    // Seed godowns
    await prisma.godown.createMany({
      data: [
        { companyId: company.id, name: 'Main Godown - Jaipur' },
        { companyId: company.id, name: 'Branch Godown - Jodhpur' },
      ],
    })

    // Seed sample item category (Textile with color/size)
    const texCat = await prisma.itemCategory.create({
      data: {
        companyId: company.id,
        name: 'Textiles',
        trackBatch: false,
        attributes: [
          { name: 'color', label: 'Color', type: 'text', required: false, showInReport: true },
          { name: 'size', label: 'Size', type: 'select', options: ['XS','S','M','L','XL','XXL'], required: false, showInReport: true },
        ],
      },
    })

    const pharmaCat = await prisma.itemCategory.create({
      data: {
        companyId: company.id,
        name: 'Pharmaceuticals',
        trackBatch: true,
        trackExpiry: true,
        attributes: [
          { name: 'batch_no', label: 'Batch No', type: 'text', required: true, showInReport: true },
          { name: 'mfg_date', label: 'Mfg Date', type: 'date', required: true, showInReport: true },
          { name: 'exp_date', label: 'Exp Date', type: 'date', required: true, showInReport: true },
        ],
      },
    })

    // Seed sample items
    const saleGroup = await prisma.ledgerGroup.findFirst({ where: { companyId: company.id, name: 'Sales Accounts' } })

    await prisma.item.createMany({
      data: [
        {
          companyId: company.id,
          categoryId: texCat.id,
          name: 'Cotton Shirt',
          code: 'ITM001',
          unit: 'PCS',
          hsnCode: '6205',
          gstRate: 12,
          purchaseRate: 350,
          saleRate: 599,
          mrp: 699,
        },
        {
          companyId: company.id,
          categoryId: texCat.id,
          name: 'Denim Jeans',
          code: 'ITM002',
          unit: 'PCS',
          hsnCode: '6203',
          gstRate: 12,
          purchaseRate: 800,
          saleRate: 1499,
          mrp: 1799,
        },
        {
          companyId: company.id,
          name: 'Packaging Material',
          code: 'ITM003',
          unit: 'KG',
          hsnCode: '4819',
          gstRate: 18,
          purchaseRate: 45,
          saleRate: 60,
          maintainStock: true,
        },
      ],
    })

    // Seed sample parties
    const debtorGroup = await prisma.ledgerGroup.findFirst({ where: { companyId: company.id, name: 'Sundry Debtors' } })
    const creditorGroup = await prisma.ledgerGroup.findFirst({ where: { companyId: company.id, name: 'Sundry Creditors' } })

    const sampleParties = [
      { name: 'Delhi Fashion House', type: 'CUSTOMER', gstin: '07AABCD1234A1Z5', city: 'Delhi', stateCode: '07', state: 'Delhi', creditDays: 30 },
      { name: 'Mumbai Wholesale Mart', type: 'VENDOR', gstin: '27AABCE5678B1Z3', city: 'Mumbai', stateCode: '27', state: 'Maharashtra', creditDays: 45 },
      { name: 'Jaipur Retail Point', type: 'CUSTOMER', gstin: '08AABCF9012C1Z1', city: 'Jaipur', stateCode: '08', state: 'Rajasthan', creditDays: 15 },
      { name: 'Gujarat Textiles Co', type: 'VENDOR', gstin: '24AABCG3456D1Z9', city: 'Ahmedabad', stateCode: '24', state: 'Gujarat', creditDays: 30 },
    ]

    for (const p of sampleParties) {
      const groupId = p.type === 'CUSTOMER' ? debtorGroup!.id : creditorGroup!.id
      const ledger = await prisma.ledger.create({
        data: {
          companyId: company.id,
          name: p.name,
          groupId,
          gstin: p.gstin,
        },
      })
      await prisma.party.create({
        data: {
          companyId: company.id,
          ledgerId: ledger.id,
          name: p.name,
          type: p.type as any,
          gstin: p.gstin,
          gstType: 'REGULAR',
          city: p.city,
          state: p.state,
          stateCode: p.stateCode,
          creditDays: p.creditDays,
        },
      })
    }

    // Seed number series for all voucher types
    const voucherTypes = [
      { type: 'SALE', prefix: 'INV' },
      { type: 'PURCHASE', prefix: 'PUR' },
      { type: 'CREDIT_NOTE', prefix: 'CRN' },
      { type: 'DEBIT_NOTE', prefix: 'DBN' },
      { type: 'SALE_CHALLAN', prefix: 'SCH' },
      { type: 'PURCHASE_ORDER', prefix: 'PO' },
      { type: 'PURCHASE_CHALLAN', prefix: 'PCH' },
      { type: 'PRODUCTION', prefix: 'PRD' },
      { type: 'RECEIPT', prefix: 'RCT' },
      { type: 'PAYMENT', prefix: 'PMT' },
      { type: 'CONTRA', prefix: 'CTR' },
      { type: 'JOURNAL', prefix: 'JV' },
    ]

    for (const vt of voucherTypes) {
      await prisma.numberSeries.create({
        data: {
          companyId: company.id,
          voucherType: vt.type as any,
          prefix: vt.prefix,
          separator: '-',
          startNumber: 1,
          currentNumber: 0,
          padLength: 4,
          fyDependent: true,
          financialYear: '25-26',
        },
      })
    }

    // Seed sample departments and designations
    const departments = ['Administration', 'Sales', 'Accounts', 'Warehouse', 'IT']
    for (const name of departments) {
      await prisma.department.create({ data: { companyId: company.id, name } })
    }

    const designations = ['Manager', 'Executive', 'Senior Executive', 'Assistant', 'Intern']
    for (const name of designations) {
      await prisma.designation.create({ data: { companyId: company.id, name } })
    }

    // Seed default salary structure
    await prisma.salaryStructure.create({
      data: {
        companyId: company.id,
        name: 'Standard Staff',
        components: [
          { name: 'Basic', label: 'Basic Salary', type: 'EARNING', calcType: 'PERCENTAGE', value: 40, taxExempt: false, statutory: false },
          { name: 'HRA', label: 'House Rent Allowance', type: 'EARNING', calcType: 'PERCENTAGE', value: 50, onComponent: 'Basic', taxExempt: true, statutory: false },
          { name: 'Special Allowance', label: 'Special Allowance', type: 'EARNING', calcType: 'PERCENTAGE', value: 10, taxExempt: false, statutory: false },
          { name: 'LTA', label: 'Leave Travel Allowance', type: 'EARNING', calcType: 'FIXED', value: 1000, taxExempt: true, statutory: false },
        ],
      },
    })

    console.log(`✅ Demo company created: Rajasthan Traders Pvt Ltd`)
    console.log(`   - FY 2025-26 active`)
    console.log(`   - 4 sample parties`)
    console.log(`   - 3 sample items`)
    console.log(`   - 2 item categories (Textiles, Pharma)`)
    console.log(`   - Number series for all voucher types`)
    console.log(`   - 5 departments, 5 designations`)
    console.log(`   - 1 salary structure`)
  } else {
    console.log('ℹ️  Demo company already exists, skipping...')
  }

  console.log('\n🎉 Seed complete!')
  console.log(`\n📋 Login credentials:`)
  console.log(`   Email:    ${adminEmail}`)
  console.log(`   Password: ${adminPass}`)
  console.log(`   URL:      http://localhost:5173`)
}

async function seedLedgerGroups(companyId: string) {
  const groups = [
    { name: 'Capital Account', nature: 'EQUITY', parent: null },
    { name: 'Reserves & Surplus', nature: 'EQUITY', parent: 'Capital Account' },
    { name: 'Current Liabilities', nature: 'LIABILITY', parent: null },
    { name: 'Duties & Taxes', nature: 'LIABILITY', parent: 'Current Liabilities' },
    { name: 'Sundry Creditors', nature: 'LIABILITY', parent: 'Current Liabilities' },
    { name: 'Loans (Liability)', nature: 'LIABILITY', parent: null },
    { name: 'Fixed Assets', nature: 'ASSET', parent: null },
    { name: 'Current Assets', nature: 'ASSET', parent: null },
    { name: 'Cash-in-Hand', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Bank Accounts', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Sundry Debtors', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Stock-in-Hand', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Loans & Advances (Asset)', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Income', nature: 'INCOME', parent: null },
    { name: 'Sales Accounts', nature: 'INCOME', parent: 'Income' },
    { name: 'Other Income', nature: 'INCOME', parent: 'Income' },
    { name: 'Expenses', nature: 'EXPENSE', parent: null },
    { name: 'Purchase Accounts', nature: 'EXPENSE', parent: 'Expenses' },
    { name: 'Direct Expenses', nature: 'EXPENSE', parent: 'Expenses' },
    { name: 'Indirect Expenses', nature: 'EXPENSE', parent: 'Expenses' },
  ]

  const groupMap: Record<string, string> = {}
  for (const g of groups) {
    const parentId = g.parent ? groupMap[g.parent] : null
    const group = await prisma.ledgerGroup.create({
      data: { companyId, name: g.name, nature: g.nature as any, parentId, isSystem: true },
    })
    groupMap[g.name] = group.id
  }

  // Default ledgers
  const defaultLedgers = [
    { name: 'Cash', group: 'Cash-in-Hand' },
    { name: 'Capital', group: 'Capital Account' },
    { name: 'HDFC Bank', group: 'Bank Accounts' },
    { name: 'Sales', group: 'Sales Accounts' },
    { name: 'Purchase', group: 'Purchase Accounts' },
    { name: 'CGST Payable', group: 'Duties & Taxes' },
    { name: 'SGST Payable', group: 'Duties & Taxes' },
    { name: 'IGST Payable', group: 'Duties & Taxes' },
    { name: 'CGST Input', group: 'Loans & Advances (Asset)' },
    { name: 'SGST Input', group: 'Loans & Advances (Asset)' },
    { name: 'IGST Input', group: 'Loans & Advances (Asset)' },
    { name: 'TDS Payable', group: 'Duties & Taxes' },
    { name: 'TCS Payable', group: 'Duties & Taxes' },
    { name: 'Salary & Wages', group: 'Direct Expenses' },
    { name: 'PF Employer', group: 'Indirect Expenses' },
    { name: 'ESIC Employer', group: 'Indirect Expenses' },
    { name: 'Freight Charges', group: 'Direct Expenses' },
    { name: 'Discount Allowed', group: 'Indirect Expenses' },
    { name: 'Discount Received', group: 'Other Income' },
    { name: 'Round Off', group: 'Indirect Expenses' },
    { name: 'Office Expenses', group: 'Indirect Expenses' },
  ]

  for (const l of defaultLedgers) {
    await prisma.ledger.create({
      data: { companyId, name: l.name, groupId: groupMap[l.group], isSystem: true },
    })
  }

  return groupMap
}

async function seedTaxMasters(companyId: string) {
  const taxes = [
    { name: 'GST 0%', gstRate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0, cessRate: 0 },
    { name: 'GST 5%', gstRate: 5, cgstRate: 2.5, sgstRate: 2.5, igstRate: 5, cessRate: 0 },
    { name: 'GST 12%', gstRate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12, cessRate: 0 },
    { name: 'GST 18%', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, cessRate: 0 },
    { name: 'GST 28%', gstRate: 28, cgstRate: 14, sgstRate: 14, igstRate: 28, cessRate: 0 },
    { name: 'GST 28% + Cess 12%', gstRate: 28, cgstRate: 14, sgstRate: 14, igstRate: 28, cessRate: 12 },
    { name: 'GST 3% (Precious Metals)', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3, cessRate: 0 },
  ]
  for (const t of taxes) {
    await prisma.taxMaster.create({ data: { companyId, ...t } })
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
