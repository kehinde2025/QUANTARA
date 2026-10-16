# Quantara

Deriv-connected automated trading platform. **Early development. Demo accounts only.**
No guaranteed profits, no guaranteed win rates.

## Status

| Area | State |
| --- | --- |
| Frontend (Next.js 16, Tailwind v3) | Placeholder page only |
| Backend (Express, TypeScript) | `/health` endpoint only |
| Database, auth, Deriv integration, bots | Not started |

## Layout

- `frontend/` Next.js app (App Router, no `src/` folder)
- `backend/` Express API (`backend/src/`)
- `spike/` Stage 0 throwaway scripts used to test the Deriv API. Not production code.

## Run locally

Backend (port 4000):

```bash
cd backend
npm run dev
```

Check http://localhost:4000/health

Frontend (port 3000):

```bash
cd frontend
npm run dev
```

## Checks

```bash
cd backend
npm test
npm run typecheck
```

## Environment variables

Copy `.env.example` to `.env`. Never commit `.env` or any token.

## What the Stage 0 spike verified (demo account only)

- Public market feed works without login.
- Contract types ACCU, CALL/PUT and the DIGIT types exist on R_100.
- A Personal Access Token connection can list accounts and stay connected
  for over an hour. Drops happened and the script reconnected on its own.
- One 1 USD, 5-tick CALL was quoted, bought and settled; balance matched.
- A finished contract shows `is_expired` before `is_sold`. A result is only
  final when `is_sold` is 1.

## Known unknowns

- OAuth refresh tokens: unconfirmed. The OAuth page shows a 1-hour access token and no refresh token.
- Markup per market (e.g. forex vs synthetics): unconfirmed.
- Accumulator and Digit trade flows: not yet tested.
- Real-account trading: never tested. Not enabled.