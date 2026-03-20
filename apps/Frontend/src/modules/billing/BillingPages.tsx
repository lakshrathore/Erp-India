// ─── SALE INVOICE ─────────────────────────────────────────────────────────────
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import VoucherForm from '../../components/forms/VoucherForm'
import VoucherListPage from '../../components/forms/VoucherListPage'

export function SaleListPage() {
  return <VoucherListPage voucherType="SALE" title="Sale Invoices" newPath="/billing/sale/new" />
}

export function SaleFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = id && id !== 'new'

  const { data: voucher } = useQuery({
    queryKey: ['voucher', id],
    queryFn: async () => {
      const { data } = await api.get(`/billing/vouchers/${id}`)
      return data.data
    },
    enabled: !!isEdit,
  })

  return (
    <VoucherForm
      voucherType="SALE"
      title="Sale Invoice"
      initial={isEdit && voucher ? {
        id: voucher.id,
        voucherNumber: voucher.voucherNumber,
        status: voucher.status,
        date: voucher.date?.substring(0, 10),
        partyId: voucher.partyId,
        narration: voucher.narration,
        placeOfSupply: voucher.placeOfSupply,
        isReverseCharge: voucher.isReverseCharge,
        isExport: voucher.isExport,
        items: voucher.items?.map((it: any) => ({
          itemId: it.itemId,
          variantId: it.variantId || null,
          _itemName: it.item?.name,
          _variantLabel: it.variant
            ? Object.values(it.variant.attributeValues || {}).filter(Boolean).join(' · ')
            : '',
          unit: it.unit,
          qty: Number(it.qty),
          freeQty: Number(it.freeQty || 0),
          rate: Number(it.rate),
          discountPct: Number(it.discountPct || 0),
          discount2Pct: Number(it.discount2Pct || 0),
          discount3Pct: Number(it.discount3Pct || 0),
          gstRate: Number(it.gstRate),
          taxType: it.taxType || 'CGST_SGST',
        })) || [],
      } : undefined}
      onSuccess={() => navigate('/billing/sale')}
    />
  )
}

// ─── PURCHASE INVOICE ─────────────────────────────────────────────────────────

export function PurchaseListPage() {
  return <VoucherListPage voucherType="PURCHASE" title="Purchase Invoices" newPath="/billing/purchase/new" />
}

export function PurchaseFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = id && id !== 'new'

  const { data: voucher } = useQuery({
    queryKey: ['voucher', id],
    queryFn: async () => {
      const { data } = await api.get(`/billing/vouchers/${id}`)
      return data.data
    },
    enabled: !!isEdit,
  })

  return (
    <VoucherForm
      voucherType="PURCHASE"
      title="Purchase Invoice"
      initial={isEdit && voucher ? {
        id: voucher.id, voucherNumber: voucher.voucherNumber, status: voucher.status,
        date: voucher.date?.substring(0, 10), partyId: voucher.partyId,
        narration: voucher.narration, placeOfSupply: voucher.placeOfSupply,
        items: voucher.items?.map((it: any) => ({
          itemId: it.itemId, _itemName: it.item?.name, unit: it.unit,
          qty: Number(it.qty), freeQty: Number(it.freeQty), rate: Number(it.rate),
          discountPct: Number(it.discountPct), gstRate: Number(it.gstRate), taxType: it.taxType,
        })) || [],
      } : undefined}
      onSuccess={() => navigate('/billing/purchase')}
    />
  )
}

// ─── CREDIT NOTE ──────────────────────────────────────────────────────────────

export function CreditNoteListPage() {
  return <VoucherListPage voucherType="CREDIT_NOTE" title="Credit Notes" newPath="/billing/credit-note/new" />
}

export function CreditNoteFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  return (
    <VoucherForm voucherType="CREDIT_NOTE" title="Credit Note"
      onSuccess={() => navigate('/billing/credit-note')} />
  )
}

// ─── DEBIT NOTE ───────────────────────────────────────────────────────────────

export function DebitNoteListPage() {
  return <VoucherListPage voucherType="DEBIT_NOTE" title="Debit Notes" newPath="/billing/debit-note/new" />
}

export function DebitNoteFormPage() {
  const navigate = useNavigate()
  return (
    <VoucherForm voucherType="DEBIT_NOTE" title="Debit Note"
      onSuccess={() => navigate('/billing/debit-note')} />
  )
}

// ─── SALE CHALLAN ─────────────────────────────────────────────────────────────

export function SaleChallanListPage() {
  return <VoucherListPage voucherType="SALE_CHALLAN" title="Sale Challans" newPath="/billing/sale-challan/new" />
}

export function SaleChallanFormPage() {
  const navigate = useNavigate()
  return (
    <VoucherForm voucherType="SALE_CHALLAN" title="Sale Challan"
      onSuccess={() => navigate('/billing/sale-challan')} />
  )
}

// ─── PURCHASE ORDER ───────────────────────────────────────────────────────────

export function PurchaseOrderListPage() {
  return <VoucherListPage voucherType="PURCHASE_ORDER" title="Purchase Orders" newPath="/billing/purchase-order/new" />
}

export function PurchaseOrderFormPage() {
  const navigate = useNavigate()
  return (
    <VoucherForm voucherType="PURCHASE_ORDER" title="Purchase Order"
      onSuccess={() => navigate('/billing/purchase-order')} />
  )
}

// ─── PURCHASE CHALLAN (GRN) ───────────────────────────────────────────────────

export function PurchaseChallanListPage() {
  return <VoucherListPage voucherType="PURCHASE_CHALLAN" title="Purchase Challans (GRN)" newPath="/billing/purchase-challan/new" />
}

export function PurchaseChallanFormPage() {
  const navigate = useNavigate()
  return (
    <VoucherForm voucherType="PURCHASE_CHALLAN" title="Purchase Challan / GRN"
      onSuccess={() => navigate('/billing/purchase-challan')} />
  )
}

// ─── PRODUCTION ───────────────────────────────────────────────────────────────

export function ProductionListPage() {
  return <VoucherListPage voucherType="PRODUCTION" title="Production" newPath="/billing/production/new" />
}

export function ProductionFormPage() {
  const navigate = useNavigate()
  return (
    <VoucherForm voucherType="PRODUCTION" title="Production Entry"
      onSuccess={() => navigate('/billing/production')} />
  )
}
