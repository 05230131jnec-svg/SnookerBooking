# Snooker Pool Management System (SQL Edition)

A mobile-friendly snooker booking and club-management web app. The frontend is plain HTML, CSS, and JavaScript; Express serves the UI and JSON API; a relational SQL database (SQLite by default via Sequelize, with optional PostgreSQL or MySQL support) stores accounts, bookings, tables, equipment, tournaments, match results, notifications, and feedback.

## Features

- Player registration, sign-in, profile editing, and role-protected admin access.
- Live table status, date-based availability, and booking requests with 1–4 hour durations.
- Unique `(table_id, slot_key)` constraints and database transactions prevent overlapping requests, including when two players submit at once. Pending requests hold their time until they are rejected, cancelled, or approved and later cancelled.
- Players can edit pending requests, cancel future bookings, request equipment, and view booking history.
- Admin approval/rejection, table maintenance status, equipment inventory, and payment-at-the-desk tracking.
- In-app booking/payment notifications and optional email one-time-code password reset.
- Tournament registration, round-robin fixture generation, match scheduling, and verified results.
- Player ratings/feedback and admin usage reports.
- Installable app shell and a local offline booking queue that syncs after the user signs back in and the connection returns.

## Requirements

- Node.js 20 or newer and npm.
- No external database installation is required by default (uses SQLite at `backend/data/snooker_booking.sqlite`). PostgreSQL and MySQL are also supported via `DATABASE_URL`.

## Setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Generate a long random `JWT_SECRET` (at least 32 characters) and set it in `backend/.env`.
3. From the project root, install the backend dependencies:

   ```bash
   npm install --prefix backend
   ```

4. Add an administrator to `backend/.env` using a strong password of at least 12 characters:

   ```dotenv
   ADMIN_NAME=Club Administrator
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=use-a-long-unique-password
   ```

   Then run `npm run seed:admin` from the project root (or `npm --prefix backend run seed:admin`). Public registration always creates a player account; it cannot grant administrator access.

5. Start the server from the project root:

   ```bash
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000). The first run creates the SQLite database (`backend/data/snooker_booking.sqlite`), synchronizes all relational tables (DDL also provided in `backend/sql/schema.sql`), and seeds four sample tables and initial equipment.

To create separate demo player and administrator accounts with randomly generated passwords, run `npm run seed:demo` from the project root.

## Switching to PostgreSQL or MySQL

1. Install the corresponding driver inside `backend/`:
   - PostgreSQL: `npm install --prefix backend pg pg-hstore`
   - MySQL: `npm install --prefix backend mysql2`
2. Update `backend/.env`:
   ```dotenv
   DB_DIALECT=postgres
   DATABASE_URL=postgres://user:password@localhost:5432/snooker_booking
   ```

## Project structure

```text
SnookerBooking/
├── backend/
│   ├── server.js                 # application entry point
│   ├── sql/schema.sql            # relational SQL DDL schema
│   ├── scripts/seedAdmin.js      # create or promote the administrator account
│   ├── scripts/seedDemoAccounts.js
│   ├── src/
│   │   ├── app.js                # Express application and SQL-backed API endpoints
│   │   ├── config/database.js    # Sequelize SQL connection
│   │   ├── controllers/          # request controllers
│   │   ├── middleware/           # authentication, async routes, error handling
│   │   ├── models/               # Sequelize models and relational associations
│   │   ├── routes/               # Express routers
│   │   ├── services/             # shared business services
│   │   └── utils/                # booking validation helpers
│   └── test/
├── frontend/                     # HTML, CSS, and client-side JS
└── README.md
```
