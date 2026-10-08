# Phoenix Studio — Booking app

A self-hosted booking system with a Picktime-style interface: weekly / daily / monthly calendar, appointments and time blockers, customers, team members and booking types, with logins.

## Run it (no install needed)

Requirements: **Node.js 22.13 or newer** (https://nodejs.org). The server has zero npm dependencies and uses Node's built-in SQLite, and the interface is already built (`client/dist`).

```bash
cd phoenix-booking
npm start
```

Open http://localhost:3000. The first time, you create the owner login. Your data is saved in `data/phoenix.db`, so back up that file.

The first launch adds a few fictional "Demo – …" customers and bookings so the calendar isn't empty. You can delete them, or start with none by using `SEED_DEMO=false npm start` on a fresh database.

## What's included

- **Calendar**: Weekly, Daily and Monthly views, with filters by location and team member.
  - Click an empty slot to book at that time. Drag a booking to move it (in Daily view with all team members, dragging to another column reassigns it).
  - Booking details show status (Confirmed / Pending / Completed / No-show / Cancelled), print, edit, cancel, reschedule and delete.
  - You can add appointments or time blockers, set recurring bookings (daily / weekly / every 2 weeks / monthly) and add a customer on the fly.
  - You can add photos to a booking (pick files, drag them in, or paste into the notes). Large photos are scaled down, and they're stored in the database file.
  - You get a warning when a booking overlaps another one for the same team member.
  - You can search by booking ID, customer name or phone.
  - **Import bookings** (upload icon in the calendar toolbar, admins): accepts the Picktime bookings export as `.xlsx` or `.csv`, previews it, creates missing artists/booking types/customers, turns non-client entries (conventions, guests, appointments…) into time blockers, and skips bookings already imported.
- **Customers**: a searchable list with selection, CSV export and bulk delete. Each customer has a details page with Details / Address / Notes / Booking history tabs.
- **Logins and roles** (Setup → Logins): each login is an **Admin**, a **Tattoo artist** (linked to their calendar column), or both.
  - Admins manage everything: all clients, every artist's calendar, settings and logins.
  - Artists see the whole calendar but can only create, edit or move their own appointments (they can't delete). Client names are masked ("Damien ***"), and phone, email and socials are never sent to them. Notes and photos stay visible. The Clients, Team Members, Booking Types and Setup pages are hidden from them; they get a "My account" page to change their password.
- **Customers**: Instagram and Facebook fields on the client profile (admins only).
- **Team Members**: add, edit or remove artists, each with their own calendar colour. Every appointment is assigned to a team member.
- **Booking Types**: services with default duration and price.
- **Setup**: business name, opening hours, open days, currency, extra logins and password change.
- **Overview**: today's appointments and a few counters.
- Reports, Reviews, Payments, Promotions and Online Booking appear in the menu as placeholders.

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `data/phoenix.db` | SQLite file location |
| `SEED_DEMO` | `true` | Add demo customers/bookings on first launch |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |

## Editing the interface

The React source is in `client/src`. To work on it with live reload:

```bash
cd client && npm install      # one time
npm run dev                   # http://localhost:5173 (talks to the API on :3000)
```

Run `npm start` in the root folder at the same time for the API. When you're done, run `npm run build` in `client/` to refresh `client/dist`.

## Project layout

```
server/index.js      HTTP server, auth, REST API (/api/...)
server/db.js         SQLite schema, settings, first-run seed
client/src/          React app (calendar/, pages/, components/)
client/dist/         Built interface served by the server
```

## Putting it online

It runs on any host that supports Node 22+, such as a small VPS, Render, Railway or Fly.io. Put it behind HTTPS, set `COOKIE_SECURE=true`, and make sure the `data/` folder sits on persistent storage.
