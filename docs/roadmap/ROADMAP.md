# IRSW — Product Roadmap

This roadmap outlines the past, current, and future milestones of the Intelligent Restaurant Workflow (IRSW) SaaS Platform. Moving from a single-app prototype into a full-scale commercial hospitality engine, our goals are divided into four clear horizons.

---

## Technical Progress Summary

```
 Phase 1: Foundation      Phase 2: Data Migration    Phase 3: Sales & Scale    Phase 4: AI & BigQuery
    [ COMPLETED ] ------------> [ ACTIVE ] --------------> [ UPCOMING ] --------------> [ PLANNED ]
 - Multi-tenant Repos      - Category Migration      - Stripe Billings          - BigQuery Mirrors
 - React UI Shell          - Menu Cataloging Sync    - Custom Invoicing         - Gemini Prediction
 - Basic QR Flow           - Order Queue Redesigns   - Multi-Site Admin Portal  - Inventory Forecast
```

---

## Phase 1 – Foundation (Completed)

Our initial objective was establishing core structural integrity, user role capabilities, and real-time connectivity bindings.

### Core Achievements
* **Decoupled Architecture**: Prepared Firestore service layers and atomic `BaseRepository` routines.
* **Responsive Multi-Panel Interface**: Built visual interfaces representing administrative dashboards, waitstaff points, guest interfaces, and kitchen displays.
* **Basic Guest QR Flow**: Enabled scanning simulators that auto-initialize Guest Sessions bound to localized tables.
* **Flexible Staff Rules & Guard**: Provisioned system rules preventing unauthorized navigation or POS interactions based on staff credentials.

---

## Phase 2 – Firestore Data Migration (Active)

We are currently transitioning the platform from a mix of static/local mockup payloads to consistent cloud databases and multi-tenant live sync pipelines.

### Current Progress
* [x] **Category Bootstrap Refactoring** – Scrapped local design fallbacks for authenticated users. Implemented atomic, transactional `writeBatch()` seeding that ensures correct multi-tenant tenant-space isolation.
* [ ] **Menu Catalog Migration** – Shift `INITIAL_MENU` assets into Firestore. Ensure the admin catalog manager supports real-time CRUD operations.
* [ ] **Active Order State Engine** – Bridge live table orders directly into Firestore real-time snapshots, enabling immediate handshakes between dining tables and back-of-house kitchen displays.
* [ ] **Inventory & Stock Depletion** – Establish Firestore listeners mapping recipe ingredients, auto-deducting stock volumes as meals are prioritized on kitchen monitors.

---

## Phase 3 – SaaS Commercialization (Upcoming)

Expanding the workflow from a single-location tool into a robust, high-license Commercial SaaS offering.

### Planned Milestones
* **Stripe Connect Multi-Tenant Checkout** – Implement direct digital checkouts at the dining table. Let organizations connect their merchant Stripe IDs to receive split payouts directly.
* **Subscription Management Portal** – Provide dynamic subscription tiers (Standard, Pro, Enterprise) managed via administrative client controls.
* **Multi-Location Multi-Site Administration** – Allow multi-site restaurant chains to centralize inventory catalogs across multiple geographical physical locations on a single account.
* **Advanced Staff Labor Logs** – Enhance staff profile interfaces with detailed timestamps, shift transitions, and table service speed auditing metrics.

---

## Phase 4 – Analytics & AI (Planned)

Injecting heavy analytics tools and Gemini interfaces to deliver predictive intelligence, staff optimization metrics, and visual floorplan builders.

### Planned Milestones
* **Auto-Mirror to BigQuery** – Employ the real-time Firestore BigQuery Extension, mirroring transactional history lists to analytical warehouses instantly.
* **Gemini-Powered Demand Predictor** – Analyze historical purchase logs against local seasonal vectors, delivering inventory forecasts to restaurant owners.
* **Automated Vendor Purchasing** – Let the ML system automatically construct weekly restock receipts based on depletion curves, limiting raw material waste.
* **Interactive Floorplan Canvas Designer** – Introduce a fully drag-and-drop interactive canvas letting administrators map, link, and resize dining tables directly.
