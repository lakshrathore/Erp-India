import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppLayout from './components/layout/AppLayout'
import { Spinner } from './components/ui'

// Public
const LoginPage          = lazy(() => import('./modules/auth/LoginPage'))
const SelectCompany      = lazy(() => import('./modules/company/SelectCompanyPage'))
const CompanyCreate      = lazy(() => import('./modules/company/CompanyCreatePage'))
const UserProfile        = lazy(() => import('./modules/auth/UserProfilePage'))
const Dashboard          = lazy(() => import('./modules/dashboard/DashboardPage'))

// Masters
const PartiesPage        = lazy(() => import('./modules/masters/PartiesPage'))
const PartyFormPage      = lazy(() => import('./modules/masters/PartyFormPage'))
const ItemsPage          = lazy(() => import('./modules/masters/ItemsPage'))
const ItemFormPage       = lazy(() => import('./modules/masters/ItemFormPage'))
const ItemCatPage        = lazy(() => import('./modules/masters/ItemCategoriesPage'))
const LedgersPage        = lazy(() => import('./modules/masters/LedgersPage'))
const GodownsPage        = lazy(() => import('./modules/masters/GodownsPage'))

// GST
const GSTR1Page          = lazy(() => import('./modules/gst/GSTR1Page'))
const GSTR3BPage         = lazy(() => import('./modules/gst/GSTR3BPage'))
const GSTR2BPage         = lazy(() => import('./modules/gst/GSTR2BReconPage'))
const TDSTCSPage         = lazy(() => import('./modules/gst/TDSTCSPage'))

// Accounting
const BankReconPage      = lazy(() => import('./modules/accounting/BankReconPage'))
const SettlementPage     = lazy(() => import('./modules/accounting/VoucherSettlementPage'))

// Payroll
const ProcessPayroll     = lazy(() => import('./modules/payroll/ProcessPayrollPage'))
const PayslipsPage       = lazy(() => import('./modules/payroll/PayslipPage'))
const CompliancePage     = lazy(() => import('./modules/payroll/CompliancePage'))
const AttendancePage     = lazy(() => import('./modules/payroll/AttendancePage'))
const LeavePage          = lazy(() => import('./modules/payroll/LeavePage'))
const Form16Page         = lazy(() => import('./modules/payroll/Form16Page'))
const SalaryStructure    = lazy(() => import('./modules/payroll/SalaryStructurePage'))

// Inventory
const StockPage          = lazy(() => import('./modules/inventory/StockReportPage'))
const ItemLedgerPage     = lazy(() => import('./modules/inventory/ItemLedgerPage'))
const ProfitPage         = lazy(() => import('./modules/inventory/ProfitReportPage'))

// Billing
const VoucherPrint       = lazy(() => import('./modules/billing/VoucherPrintPage'))
const VoucherDetail      = lazy(() => import('./modules/billing/VoucherDetailPage'))

// Reports
const OverduePage        = lazy(() => import('./modules/reports/OverduePage'))
const SaleReport         = lazy(() => import('./modules/reports/SalePurchaseReport').then(m => ({ default: m.SaleReportPage })))
const PurchaseReport     = lazy(() => import('./modules/reports/SalePurchaseReport').then(m => ({ default: m.PurchaseReportPage })))

// Settings
const TallyPage          = lazy(() => import('./modules/settings/TallyPage'))
const CompanySettingsPage = lazy(() => import('./modules/settings/CompanySettingsPage').then(m => ({ default: m.CompanySettingsPage })))
const NumberSeriesPage    = lazy(() => import('./modules/settings/NumberSeriesPage'))
const POSPage             = lazy(() => import('./modules/billing/POSPage'))
const FixedAssetListPage  = lazy(() => import('./modules/assets/FixedAssetsPage').then(m => ({ default: m.FixedAssetListPage })))
const FixedAssetFormPage  = lazy(() => import('./modules/assets/FixedAssetsPage').then(m => ({ default: m.FixedAssetFormPage })))
const DepreciationPage    = lazy(() => import('./modules/assets/FixedAssetsPage').then(m => ({ default: m.DepreciationPage })))
const TransactionSettingsPage = lazy(() => import('./modules/settings/TransactionSettingsPage'))
const LedgerMappingPage   = lazy(() => import('./modules/settings/LedgerMappingPage'))
const PrintSetupPage      = lazy(() => import('./modules/settings/PrintSetupPage'))
const DataManagementPage  = lazy(() => import('./modules/settings/DataManagementPage'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
})

function PL() {
  return <div className="flex items-center justify-center min-h-[400px]"><Spinner className="h-8 w-8" /></div>
}

const LB  = ({ n }: { n: string }) => { const M = lazy(() => import('./modules/billing/BillingPages').then(m => ({ default: (m as any)[n] }))); return <Suspense fallback={<PL />}><M /></Suspense> }
const LA  = ({ n }: { n: string }) => { const M = lazy(() => import('./modules/accounting/AccountingPages').then(m => ({ default: (m as any)[n] }))); return <Suspense fallback={<PL />}><M /></Suspense> }
const LS  = ({ n }: { n: string }) => { const M = lazy(() => import('./modules/accounting/StatementPages').then(m => ({ default: (m as any)[n] }))); return <Suspense fallback={<PL />}><M /></Suspense> }
const LF  = ({ n }: { n: string }) => { const M = lazy(() => import('./modules/reports/FinancialReports').then(m => ({ default: (m as any)[n] }))); return <Suspense fallback={<PL />}><M /></Suspense> }
const LR  = ({ n }: { n: string }) => { const M = lazy(() => import('./modules/reports/RegisterPages').then(m => ({ default: (m as any)[n] }))); return <Suspense fallback={<PL />}><M /></Suspense> }
const LE  = ({ n }: { n: string }) => { const M = lazy(() => import('./modules/payroll/EmployeePages').then(m => ({ default: (m as any)[n] }))); return <Suspense fallback={<PL />}><M /></Suspense> }
const LST = ({ n }: { n: string }) => { const M = lazy(() => import('./modules/settings/SettingsPages').then(m => ({ default: (m as any)[n] }))); return <Suspense fallback={<PL />}><M /></Suspense> }

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PL />}>
          <Routes>
            {/* Public */}
            <Route path="/login"             element={<LoginPage />} />
            <Route path="/select-company"    element={<SelectCompany />} />
            <Route path="/companies/create"  element={<CompanyCreate />} />
            <Route path="/print/:type/:id"   element={<VoucherPrint />} />

            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pos"       element={<POSPage />} />
              <Route path="assets"              element={<FixedAssetListPage />} />
              <Route path="assets/new"          element={<FixedAssetFormPage />} />
              <Route path="assets/depreciation" element={<DepreciationPage />} />
              <Route path="assets/:id"          element={<FixedAssetFormPage />} />
              <Route path="profile"   element={<UserProfile />} />

              {/* Masters */}
              <Route path="masters">
                <Route index element={<Navigate to="parties" replace />} />
                <Route path="parties"           element={<PartiesPage />} />
                <Route path="parties/new"       element={<PartyFormPage />} />
                <Route path="parties/:id"       element={<PartyFormPage />} />
                <Route path="parties/:id/edit"  element={<PartyFormPage />} />
                <Route path="items"             element={<ItemsPage />} />
                <Route path="items/new"         element={<ItemFormPage />} />
                <Route path="items/:id"         element={<ItemFormPage />} />
                <Route path="items/:id/edit"    element={<ItemFormPage />} />
                <Route path="item-categories"   element={<ItemCatPage />} />
                <Route path="ledgers"           element={<LedgersPage />} />
                <Route path="godowns"           element={<GodownsPage />} />
              </Route>

              {/* Billing */}
              <Route path="billing/sale"                  element={<LB n="SaleListPage" />} />
              <Route path="billing/sale/new"              element={<LB n="SaleFormPage" />} />
              <Route path="billing/sale/:id"              element={<VoucherDetail />} />
              <Route path="billing/purchase"              element={<LB n="PurchaseListPage" />} />
              <Route path="billing/purchase/new"          element={<LB n="PurchaseFormPage" />} />
              <Route path="billing/purchase/:id"          element={<VoucherDetail />} />
              <Route path="billing/credit-note"           element={<LB n="CreditNoteListPage" />} />
              <Route path="billing/credit-note/new"       element={<LB n="CreditNoteFormPage" />} />
              <Route path="billing/credit-note/:id"       element={<VoucherDetail />} />
              <Route path="billing/debit-note"            element={<LB n="DebitNoteListPage" />} />
              <Route path="billing/debit-note/new"        element={<LB n="DebitNoteFormPage" />} />
              <Route path="billing/debit-note/:id"        element={<VoucherDetail />} />
              <Route path="billing/sale-challan"          element={<LB n="SaleChallanListPage" />} />
              <Route path="billing/sale-challan/new"      element={<LB n="SaleChallanFormPage" />} />
              <Route path="billing/sale-challan/:id"      element={<VoucherDetail />} />
              <Route path="billing/purchase-order"        element={<LB n="PurchaseOrderListPage" />} />
              <Route path="billing/purchase-order/new"    element={<LB n="PurchaseOrderFormPage" />} />
              <Route path="billing/purchase-order/:id"    element={<VoucherDetail />} />
              <Route path="billing/purchase-challan"      element={<LB n="PurchaseChallanListPage" />} />
              <Route path="billing/purchase-challan/new"  element={<LB n="PurchaseChallanFormPage" />} />
              <Route path="billing/purchase-challan/:id"  element={<VoucherDetail />} />
              <Route path="billing/production"            element={<LB n="ProductionListPage" />} />
              <Route path="billing/production/new"        element={<LB n="ProductionFormPage" />} />
              <Route path="billing/production/:id"        element={<VoucherDetail />} />

              {/* Inventory */}
              <Route path="inventory/stock"       element={<StockPage />} />
              <Route path="inventory/item-ledger" element={<ItemLedgerPage />} />
              <Route path="inventory/profit"      element={<ProfitPage />} />

              {/* Accounting */}
              <Route path="accounting/receipt"          element={<LA n="ReceiptListPage" />} />
              <Route path="accounting/receipt/new"      element={<LA n="ReceiptFormPage" />} />
              <Route path="accounting/receipt/:id"      element={<VoucherDetail />} />
              <Route path="accounting/payment"          element={<LA n="PaymentListPage" />} />
              <Route path="accounting/payment/new"      element={<LA n="PaymentFormPage" />} />
              <Route path="accounting/payment/:id"      element={<VoucherDetail />} />
              <Route path="accounting/contra"           element={<LA n="ContraListPage" />} />
              <Route path="accounting/contra/new"       element={<LA n="ContraFormPage" />} />
              <Route path="accounting/contra/:id"       element={<VoucherDetail />} />
              <Route path="accounting/journal"          element={<LA n="JournalListPage" />} />
              <Route path="accounting/journal/new"      element={<LA n="JournalFormPage" />} />
              <Route path="accounting/journal/:id"      element={<VoucherDetail />} />
              <Route path="accounting/party-statement"  element={<LS n="PartyStatementPage" />} />
              <Route path="accounting/ledger-statement" element={<LS n="LedgerStatementPage" />} />
              <Route path="accounting/bank-recon"       element={<BankReconPage />} />
              <Route path="accounting/settlements"      element={<SettlementPage />} />

              {/* GST */}
              <Route path="gst/gstr1"  element={<GSTR1Page />} />
              <Route path="gst/gstr3b" element={<GSTR3BPage />} />
              <Route path="gst/gstr2b"  element={<GSTR2BPage />} />
              <Route path="gst/tds-tcs"    element={<TDSTCSPage />} />

              {/* Reports */}
              <Route path="reports/balance-sheet"      element={<LF n="BalanceSheetPage" />} />
              <Route path="reports/profit-loss"        element={<LF n="ProfitLossPage" />} />
              <Route path="reports/trial-balance"      element={<LF n="TrialBalancePage" />} />
              <Route path="reports/outstanding"        element={<LS n="OutstandingPage" />} />
              <Route path="reports/overdue"            element={<OverduePage />} />
              <Route path="reports/sale-purchase"        element={<SaleReport />} />
              <Route path="reports/sale"               element={<SaleReport />} />
              <Route path="reports/purchase"           element={<PurchaseReport />} />
              <Route path="reports/register"           element={<LR n="SaleRegisterPage" />} />
              <Route path="reports/sale-register"      element={<LR n="SaleRegisterPage" />} />
              <Route path="reports/purchase-register"  element={<LR n="PurchaseRegisterPage" />} />
              <Route path="reports/journal-register"   element={<LR n="JournalRegisterPage" />} />
              <Route path="reports/cash-book"          element={<LR n="CashBookPage" />} />
              <Route path="reports/bank-book"          element={<LR n="BankBookPage" />} />
              <Route path="reports/day-book"           element={<LR n="DayBookPage" />} />

              {/* Payroll */}
              <Route path="payroll/employees"           element={<LE n="EmployeeListPage" />} />
              <Route path="payroll/employees/new"       element={<LE n="EmployeeFormPage" />} />
              <Route path="payroll/employees/:id"       element={<LE n="EmployeeFormPage" />} />
              <Route path="payroll/employees/:id/edit"  element={<LE n="EmployeeFormPage" />} />
              <Route path="payroll/salary-structures"   element={<SalaryStructure />} />
              <Route path="payroll/attendance"          element={<AttendancePage />} />
              <Route path="payroll/leave"               element={<LeavePage />} />
              <Route path="payroll/process"             element={<ProcessPayroll />} />
              <Route path="payroll/payslip"            element={<PayslipsPage />} />
              <Route path="payroll/compliance"          element={<CompliancePage />} />
              <Route path="payroll/form16"              element={<Form16Page />} />

              {/* Settings */}
              <Route path="settings/company"           element={<CompanySettingsPage />} />
              <Route path="settings/branches"          element={<LST n="BranchesPage" />} />
              <Route path="settings/users"             element={<LST n="CompanyUsersPage" />} />
              <Route path="settings/financial-years"   element={<LST n="FinancialYearsPage" />} />
              <Route path="settings/number-series"     element={<NumberSeriesPage />} />
              <Route path="settings/print-setup"      element={<PrintSetupPage />} />
              <Route path="settings/data-management"  element={<DataManagementPage />} />
              <Route path="settings/transaction"       element={<TransactionSettingsPage />} />
              <Route path="settings/ledger-mapping"     element={<LedgerMappingPage />} />
              <Route path="settings/tally"             element={<TallyPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
