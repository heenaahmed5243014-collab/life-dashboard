# Life Dashboard

A phone-first app that shows what's due soon across five areas of life. See the scope doc for the why.

- **Today**: Top 3, the rest of today, the next 3 days, the Inbox and today's routines.
- **Tasks**: every task, project and idea, filterable by domain. Add, edit, complete.
- Data is stored in **Supabase**, so it's the same on your phone and the desk PC. Sign-in uses a 6-digit email code.

Try it without Supabase: add `?demo` to the address. Nothing is saved in demo mode.

## Setup

See [SETUP.md](SETUP.md) for step-by-step instructions.

## For developers

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

- `supabase/schema.sql`: database tables and privacy rules (safe to re-run)
- `src/backend.ts`: Supabase reads and writes, plus the in-memory demo
- `src/store.tsx`: app state, with changes shown instantly and then saved
- `src/screens/`: one file per screen
