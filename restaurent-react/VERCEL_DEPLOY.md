# Vercel Deploy

This project is prepared to run on Vercel as a demo.

## What to set in Vercel

- Root directory: `restaurent-react`
- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

## Environment variables

- `VITE_ENABLE_DEMO_PAYMENT=true`
- `SESSION_SECRET=any-random-long-string`

Optional for full backend persistence:

- `MONGO_URI=...`
- `RAZORPAY_KEY_ID=...`
- `RAZORPAY_KEY_SECRET=...`

## Notes

- If `MONGO_URI` is not set, the app runs in demo mode with in-memory order data.
- In demo mode on Vercel, data is not guaranteed to persist between serverless cold starts.
- Frontend and API are configured to run on the same Vercel domain.
