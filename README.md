# ERP India — Complete Business Management System

Full-stack ERP for Indian businesses. GST-compliant billing, FIFO inventory, double-entry accounting, GST returns, and payroll with PF/ESI/Form 16 support.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 15 |
| ORM | Prisma |
| Cache | Redis |
| Storage | MinIO |
| Auth | JWT + Refresh tokens |

## Quick Start

### Prerequisites
- Node.js 20 LTS
- Docker & Docker Compose

### 1. Clone and install

```bash
git clone <repo>
cd erp-india
npm install
```

### 2. Start infrastructure

```bash
docker-compose up -d
# Starts: PostgreSQL, Redis, MinIO
```

### 3. Configure environment

```bash
cp apps/backend/.env.example apps/backend/.env
# Edit .env with your settings (defaults work for Docker dev)
```

### 4. Set up database

```bash
cd apps/backend
npm run db:generate   # Generate Prisma client
npm run db:push       # Create all tables
npm run db:seed       # Create super admin + sample data
```

### 5. Start development servers

```bash
# Terminal 1: Backend (port 5000)
cd apps/backend && npm run dev

# Terminal 2: Frontend (port 5173)
cd apps/frontend && npm run dev
```

Open http://localhost:5173

**Default login:**
- Email: `admin@erpindia.com`
- Password: `Admin@123`

---

## Module Status

### Phase 1 — Foundation ✅ (Current)
- [x] Multi-company with role-based access
- [x] Auth (JWT + refresh tokens)
- [x] Company + branch management
- [x] Financial year management
- [x] Complete Prisma schema (all modules)
- [x] Party master (customer/vendor/both)
- [x] Item master (dynamic attributes per category)
- [x] Ledger master + auto chart of accounts seeding
- [x] Tax master (GST slabs)
- [x] Godown master
- [x] Number series configuration
- [x] React frontend with full navigation
- [x] Dashboard with KPIs
- [x] Parties list + form with GSTIN/PAN validation

### Phase 2 — Billing (Next)
- [ ] Sale invoice with dynamic item grid + GST
- [ ] Purchase invoice
- [ ] Credit note / Debit note
- [ ] Sale & Purchase challans
- [ ] Purchase orders with challan linking
- [ ] Production voucher
- [ ] Voucher print / PDF export
- [ ] E-invoice IRN generation

### Phase 3 — Inventory & Accounting
- [ ] FIFO inventory engine
- [ ] Stock reports (item-wise, godown-wise)
- [ ] Double-entry journal
- [ ] Ledger statement
- [ ] Party statement
- [ ] Bank reconciliation
- [ ] Voucher settlement (bill-by-bill)
- [ ] Outstanding & overdue reports

### Phase 4 — GST & Financial Reports
- [ ] GSTR-1 with all categories (B2B/B2CS/B2CL/EXP/CDNR)
- [ ] GSTR-3B auto-computation
- [ ] GSTR-2B reconciliation
- [ ] TDS/TCS tracking
- [ ] Balance sheet
- [ ] Profit & Loss
- [ ] Trial balance
- [ ] Day/Cash/Bank books
- [ ] All registers

### Phase 5 — Payroll
- [ ] Employee master
- [ ] Salary structure (CTC components)
- [ ] Attendance & leave management
- [ ] Monthly payroll processing
- [ ] PF / ESI / PT / TDS computation
- [ ] Payslip PDF
- [ ] PF ECR file
- [ ] ESI challan
- [ ] Form 16 (Part A + B)
- [ ] Form 24Q
- [ ] Full & Final settlement

---

## Project Structure

```
erp-india/
├── apps/
│   ├── backend/
│   │   ├── prisma/schema.prisma   # Complete DB schema
│   │   └── src/
│   │       ├── modules/           # Feature modules
│   │       ├── middleware/        # Auth, error handling
│   │       ├── lib/               # Prisma, Redis
│   │       └── utils/             # India-specific utilities
│   └── frontend/
│       └── src/
│           ├── modules/           # Pages by feature
│           ├── components/        # Shared UI
│           ├── hooks/             # React Query hooks
│           ├── stores/            # Zustand state
│           └── lib/               # API client, India utils
└── docker-compose.yml
```

## Indian Market Features

- **GST**: CGST+SGST (intra-state), IGST (inter-state), EXEMPT, NIL
- **Number format**: Indian lakhs/crores (₹1,23,456.00)
- **Financial year**: April–March
- **Date format**: DD-MM-YYYY throughout
- **GSTIN validation**: 15-digit format with state code check
- **PAN validation**: AAAAA0000A format
- **Amount in words**: Indian system (Lakhs, Crores)
- **Professional tax**: State-wise slabs
- **PF**: 12% employee + 12% employer on basic
- **ESIC**: 0.75% employee + 3.25% employer (up to ₹21,000 gross)
- **TDS**: Multiple sections with threshold tracking

## API Documentation

Backend runs Swagger at: http://localhost:5000/api-docs (after Phase 2)

Key endpoints:
- `POST /api/auth/login` — Login
- `GET  /api/companies` — List user companies
- `GET  /api/masters/parties` — Party list
- `POST /api/masters/parties` — Create party
- `GET  /api/masters/items` — Item list
- `POST /api/vouchers` — Create any voucher type

---

Built for Indian SMEs. Handles multi-company, multi-branch operations with full GST compliance.
