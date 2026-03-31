# 🎸 Fermata Management System

A full-stack web-based management system for **Fermata Musical Instrument Shop**, covering:

- **Inventory Management** — Per-branch + master view, person-in-charge logging, inclusions/bundles, sale items, barcode printing
- **Terminal POS** — Customer info, payment method selector, inclusions per item, discount (% or fixed), full refund processing, receipt printing
- **Luthier Workshop** — Repair booking queue with service types, progress tracking, technician assignment
- **Business Analytics** — Revenue charts, sales velocity, branch split, top products, CSV export, sales/inventory history
- **Fermata DSS** — Real-time business intelligence powered by actual inventory + sales data (no external AI needed)
- **User Management** — Create/edit/disable users, role assignment, granular permission toggles, password reset

## Stack

- React 19 + Vite + Tailwind CSS v4
- Firebase (Auth + Firestore)
- Recharts, Lucide React
- JsBarcode for barcode generation

## Setup

1. Clone the repo
2. Add your Firebase config to `firebase-applet-config.json`
3. Install: `npm install`
4. Run dev server: `npm run dev`
5. Create your first Super Admin user through Firebase Console → Authentication

## Firebase Collections

- `products` — Inventory items
- `transactions` — POS sales
- `refunds` — Refund records
- `bookings` — Workshop repair queue
- `inventoryLogs` — Stock movement history
- `users` — User profiles (linked to Firebase Auth)

## Branches

- **Imus, Cavite** — Branch 1
- **Quezon City** — Branch 2

Super Admin has access to all branches. Branch Staff is scoped to their assigned branch.
