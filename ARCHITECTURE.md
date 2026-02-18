# MVP Architecture

## Project structure

```
stat_funnel/
  backend/
    prisma/
      schema.prisma
      seed.ts
    src/
      app.ts
      server.ts
      lib/
      middleware/
      routes/
      utils/
  frontend/
    app/
      layout.tsx
      page.tsx
      login/page.tsx
    components/
      dashboard-client.tsx
      report-form-modal.tsx
    lib/
      api.ts
      auth.ts
      types.ts
      format.ts
  docker-compose.yml
  .env.example
```

## Cumulative -> daily delta example

- Yesterday: `subscription_started_total = 20`
- Today: `subscription_started_total = 21`
- Daily delta: `subscription_started_day = 21 - 20 = 1`

If the delta is negative, API returns `NEGATIVE_DELTAS` and requires explicit confirmation.

## Funnel example

Totals on selected day:

- installs: `1000`
- paywall shown: `700`
- trial started: `210`
- subscription started: `84`
- active subscriptions: `60`

Conversions:

- `CR1 = 700 / 1000 = 70%`
- `CR2 = 210 / 700 = 30%`
- `CR3 = 84 / 210 = 40%`

## Main API endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/apps`
- `POST /api/apps`
- `GET /api/reports?appId&from&to`
- `POST /api/reports`
- `GET /api/reports/export?appId&from&to`
- `GET /api/dashboard?appId&from&to`
- `GET /api/dashboard/examples`
