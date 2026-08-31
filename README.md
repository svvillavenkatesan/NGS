# Multi-Tiered Number Game System

A GitHub-ready direct-selling number game system with separate Super Admin and Seller experiences; a Node.js API; durable storage; real-time results; prize, commission, and profit engines; and automated tests.

> **Proprietary software — available for commercial licensing or sale.**
>
> This application and its business workflow are an original, privately owned software design. The source code is provided only for authorised evaluation and development. Copying, modifying, distributing, reselling, sublicensing, or operating this software without the owner's written permission is prohibited. For purchase, licensing, deployment, or customisation, contact the repository owner.

## Architecture

```text
admin-portal/             Super Admin web dashboard
owner-portal/             System Owner controls Super Admins and limits
seller-portal/            Browser-based Seller dashboard
seller-mobile-app/        Flutter Android seller client
backend-api/              Node.js HTTP and real-time API
database/                 PostgreSQL schema
web-shared/               Shared portal styling and API client
```

## Quick start

Requirements: Node.js 20+ and, for persistent operation, Docker Desktop.

```powershell
Copy-Item .env.example .env
npm test
npm start
```

The complete local portal starts at `http://localhost:4000`. Use `/admin` or `/seller`. The local API atomically persists business data in `backend-api/data/application-data.json`, so server restarts do not erase records. `database/schema.sql` remains the future PostgreSQL deployment model.

### Demo accounts

| Portal | Phone | Password |
|---|---:|---|
| System Owner | 9000000000 | Owner@123 |
| Super Admin | 9000000001 | Admin@123 |
| Flutter Seller | 9000000004 | Seller@123 |

The Admin portal creates **Direct Seller** accounts and assigns each Seller's permitted Lot Code, schemes, rates, and 0–50% commission. NGS has no Distributor or Sub-Distributor tier.

Change all demo credentials and `JWT_SECRET` before exposing the service outside a local development machine.

## HTTPS production deployment

1. Buy a lawful domain and point its DNS `A`/`AAAA` record to the production server.
2. Copy `.env.production.example` to `.env` and replace every example secret and domain value.
3. Run `docker compose up -d --build`. Caddy obtains and renews the HTTPS certificate automatically.
4. Keep PostgreSQL private; only ports 80 and 443 are published.
5. Change the seeded Owner and Super Admin passwords immediately, then create encrypted off-server backups.

## Demo API

The API uses signed bearer sessions. Obtain a token from `/api/auth/login` and supply it as `Authorization: Bearer <token>`.

```bash
curl http://localhost:4000/health
curl -X POST http://localhost:4000/api/auth/login -H "content-type: application/json" -d '{"phone":"9000000001","password":"Admin@123"}'
```

## Rules implemented

- Pricing always increases or stays equal down the hierarchy.
- Four-, three-, two-, and one-digit schemes settle against a four-digit winning number.
- Premium two- and one-digit defaults are INR 2,000 and INR 250; standard defaults are INR 1,000 and INR 100.
- Bonuses activate only after a configured sales target and are deducted from the granting tier's profit.
- User listings expose only Direct Sellers belonging to the Super Admin.
- Published results stream immediately and permanently settle matching Lot Code + Show + Date tickets as WIN/LOSE.
- After a result is published, the Admin dashboard calculates a read-only per-Seller profit/loss report from sales margin and result-specific prize exposure. It never mutates ticket settlement state.
- Before publishing, the Admin can enter any four-digit candidate in **Result profit preview** to calculate projected margin, prize exposure, and profit/loss without changing any data.
- The Admin also receives up to ten unique active four-digit numbers taken from actual sold tickets, ranked by projected profit. Selecting an option copies it into the publish form; publishing still requires a separate confirmation click.
- The Seller panel shows a live `unit price x quantity = total` calculation before the sale button, so the seller can confirm the amount before creating the ticket.
- Sellers can build a mixed bill with 4-digit, 3-digit, 2-digit, and single-digit numbers. The bill lists each number, quantity, unit price, line amount, total quantity, and grand total, then creates all tickets together through an atomic-style batch API.
- Admin manages Board/Company names such as Kerala, Dear, and Sikkim, plus custom names. Seller selects Board first, then Scheme, Number, and Quantity; every bill row retains its Board.
- Each Board stores its own subset of the master Scheme List and optional Morning/Afternoon/Evening start-end windows. Selecting KL, Dear, or Sikkim can therefore load only that Board's assigned schemes for the applicable time.
- Super Admin can enforce a minimum result profit as a percentage (for example 20%, 50%, 60%, or 80%) or as a fixed INR amount. Preview cards show target eligibility, and below-target results are blocked from publishing.
- A dedicated Admin **Schemes & Prizes** tab controls every 4D, 3D, 2D, and single-digit payout. Saved amounts feed directly into result preview and profit/loss reports.
- Admin can create named scheme records containing four explicit fields: 4 Digit Prize, 3 Digit Prize, 2 Digit Prize, and Single Digit Prize. The Scheme List displays all amounts in one row per scheme.

## Production checklist

- Rotate the signing secret, replace demo users, and consider managed OIDC for larger deployments.
- Implement the PostgreSQL repository with transactions and row-level policies.
- Add FCM credentials and an outbox worker for durable push notifications within the three-second objective.
- Add a supported Bluetooth ESC/POS package and device permissions to the Flutter client.
- Store money as integer minor units at the API boundary, add idempotency keys, draw locking, ticket void/refund rules, rate limiting, and encrypted backups.
- Obtain jurisdiction-specific legal, tax, KYC/AML, age-gating, and responsible-gaming review before handling real money.

## License

Copyright © 2026. All rights reserved.

This is proprietary commercial software and is **not open source**. No permission is granted to copy, modify, distribute, resell, sublicense, publish, or operate any part of this project without a separate written agreement from the owner. This private repository is maintained for authorised development, demonstration, deployment, and commercial evaluation only.
