# IRSW — Intelligent Restaurant Workflow SaaS Platform

IRSW (Intelligent Restaurant Workflow) is a modern, enterprise-grade, multi-tenant Restaurant and Hospitality SaaS Platform. Built using React, Tailwind CSS v4, Vite, and cloud-native databases, IRSW organizes floor workflows, digital QR menu cataloging, automated stock deduction, kitchen order management, real-time sync, and intelligent guest & staff tracking on a unified high-performance platform.

---

## 1. Project Overview

At its core, IRSW bridges the gap between customer self-service (QR-based table ordering, digital menus) and physical back-of-house operations (kitchen workflow display, inventory depletion alerts, administrative optimization).

By leveraging a serverless architecture powered by Firestore, IRSW supports real-time synchronization between the guest's mobile phone at the table, the waiter's operational device, the back-of-house kitchen displays, and the owner's management suite.

---

## 2. Technology Stack

IRSW is crafted using carefully selected, modern technologies to optimize rendering speed, type safety, layout precision, and multi-tenant isolation:

* **Frontend Framework**: [React 18+](https://react.dev/) using functional components & hooks
* **Build System**: [Vite 6+](https://vite.dev/) for high-speed module compilation
* **Styling & Presentation**: [Tailwind CSS v4](https://tailwindcss.com/) for lightweight utility-first sizing and responsive fluidity
* **Animations**: [Motion](https://motion.dev/) (`motion/react`) for smooth, high-frame-rate UI micro-interactions
* **Databases & Dynamic Backend Sync**: [Firebase Firestore](https://firebase.google.com/docs/firestore) + client-side snapshot listening
* **Security & Authentication**: [Firebase Auth](https://firebase.google.com/docs/auth) for multi-tenant staff & customer credentialing
* **Analytics & Visualization**: [D3.js](https://d3js.org/) and [Recharts](https://recharts.org/) for highly customizable analytical tables and real-time dashboard visualization charts
* **QR Codes & Imaging**: `jsQR` and `qrcode.react` for processing table-based QR layouts and scanning workflows
* **Type System**: [TypeScript](https://www.typescriptlang.org/) for compile-time safety across multi-tenancy models

---

## 3. Architecture Summary

```
                      +-------------------+
                      |   Vite + React    |
                      |   Client Application|
                      +---------+---------+
                                |
                   (Dynamic Auth & DB Subscriptions)
                                |
        +-----------------------v-----------------------+
        |                 Google Firebase               |
        +-----------+-----------------------+-----------+
                    |                       |
            [Firebase Auth]        [Cloud Firestore]
                    |                       |
            - Multi-Tenant Auth     - Multi-Tenant Isolation
            - Waiter/Staff Auth     - Collection-Level Paths
            - Guest Sessioning      - Real-Time Live Sync
```

IRSW uses a decoupled architecture where the client maintains continuous, low-latency listeners connected to Google Cloud Firestore collections. State management is organized around a Repository pattern (`BaseRepository`), isolating tenant queries by appending `/organizations/{organizationId}` dynamically to collection selectors.

This ensures:
1. **Unilateral Data Integrity**: Waiter screens, kitchen tablets, and guest phones never double-fetch; they react dynamically to mutations.
2. **Zero-Latency Interactions**: Local structural modifications render instantly in the React state tree, while Firestore pushes and registers updates atomically in the background.

---

## 4. Authentication Overview

IRSW establishes a flexible Auth model serving multiple user groups:
* **Staff Authentication**: Credentialed login for Waiters, Chefs, managers, and system administrators. Staff belong strictly to a single Organization and are given distinct privilege classes (`Admin`, `POS`, `Kitchen`, `Backup`).
* **Guest Authentication (QR-Based)**: Guests scanning a table's QR-code establish transient, local, or session-authenticated guest flows. This enables they order directly to their physical table without full registration, linking their session to the organization and table number automatically.
* **Role-Based Access Control (RBAC)**: All routes, POS interactions, and Admin configurations are guarded behind role check validations.

---

## 5. Multi-Tenant Design

IRSW is a true Software-as-a-Service system using **logical organization clustering** on Firestore:

* **Dynamic Isolation**: The data collections (menu items, orders, tables, categories, etc.) are separated hierarchically. Each document references a specific `organizationId` or is nested inside sub-collections segregated by tenant space.
* **Metadata Alignment**: The global `AuthContext` determines the tenant context. When a user authenticates, their profile resolves to their corresponding `organizationId`. Subscriptions attach only to collections containing documents belonging to that identifier.
* **Global Seeding**: New organizations trigger a clean bootstrap routine that seeds base categories and system default files atomically utilizing server-side/client-side custom `writeBatch()` logic to guarantee zero partial-state failures.

---

## 6. Development Setup

Follow these steps to configure your local development environment:

### Prerequisites
* **Node.js**: v18 or newer
* **npm**: v9 or newer

### Installation
1. Clone the repository into your local directory.
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Configure your local environment variables. Create a `.env` or check `.env.example`:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

### Running Development Server
To boot the developer server with hot module replacement:
```bash
npm run dev
```
The server binds to port `3000` (or local standard port) and serves the index page in your browser.

---

## 7. Build Instructions

To compile the React and TypeScript source files into optimized, static production-ready bundles:

```bash
npm run build
```

This pipeline:
1. Checks TypeScript files utilizing `tsc --noEmit`.
2. Bundles React assets with Vite.
3. Places static outputs directly into the `/dist` directory.

---

## 8. Deployment Overview

IRSW is optimized for modern containerized cloud services such as **Google Cloud Run**, or static hosting backends like **Vite SPA static hosts** or the **Firebase Hosting** framework.

*All visual and layout assets, combined with built assets under `/dist`, are self-contained. Firestore security configurations enforce isolation rules protecting collections at runtime, and no database or backend servers are exposed directly.*

---

## 9. Current Development Status

* [x] **Phase 1: Foundation (Completed)** — Core database schemas, base repositories, React providers, and initial CSS transitions.
* [x] **Phase 2.1: Integrity Hardening (Completed)** — Removal of local design logic fallovers, migration to atomic write batches, full real-time snapshot bindings.
* [ ] **Phase 2.2: Menu Cataloging (In Discovery)** — Migration of local menu databases to full backend multi-tenant databases.
* [ ] **Phase 3: SaaS Commercialization (Planned)** — Multi-merchant payment checkouts, dynamic licensing.

---

## 10. Roadmap Summary

Our active development priorities are grouped across sequential optimization horizons:

```
  +------------------+     +------------------+     +------------------+
  | Phase 2 (Active) | --> | Phase 3 (Soon)   | --> | Phase 4 (Future) |
  | Firestore Data   |     | Commercialization|     | Analytics & AI   |
  +------------------+     +------------------+     +------------------+
```

* **Q2 - Q3**: Complete Cataloging Migrations, add table state synchronization, and extend operational notifications between the floor and the kitchen.
* **Q3 - Q4**: Integrate SaaS invoicing, dynamic subscription plans, Stripe onboarding, and Multi-location portal dashboards.
* **Next Year**: Deep learning analytics, visual layout planners, and Gemini-based smart forecasting engines.
