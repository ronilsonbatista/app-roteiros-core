# Carrinho / Checkout Payment API

Mobile Carrinho consumes these Core endpoints. **Price is always server-side** (`Product.price`); never trust client amounts.

## Endpoints

| Method | Path | Auth | Role |
|--------|------|------|------|
| `GET` | `/trips/:tripId/checkout-summary` | JWT | Price + product + method matrix |
| `POST` | `/trips/:tripId/checkout-quote` | JWT | Quote with optional coupon (throws if invalid) |
| `POST` | `/trips/:tripId/coupons/validate` | JWT | Soft validate (`valid: false` + reason, no 400) |
| `POST` | `/purchases/checkout` | JWT | Create charge — `PIX` \| `CARD` (+ wallets when enabled) |
| `POST` | `/purchases/card-intent` | JWT | Card intent **stub** (no charge) |
| `POST` | `/purchases/:id/expire` | JWT | Expire PENDING (Pix abandon / TTL) |
| `GET` | `/purchases/:id/status` | JWT | Poll status (+ reconcile PAID) |
| `POST` | `/webhooks/mercadopago` | public + HMAC | Provider notifications |

Optional header on checkout: `idempotency-key`.

## Payment methods

`paymentMethodAvailability` on summary/quote:

| Method | Default |
|--------|---------|
| `PIX` | available |
| `CARD` | available |
| `APPLE_PAY` | `COMING_SOON` until `WALLET_PAYMENTS_ENABLED=true` |
| `GOOGLE_PAY` | `COMING_SOON` until `WALLET_PAYMENTS_ENABLED=true` |

`supportedPaymentMethods` = chargeable methods only (checkout accepts these).

## Suggested Carrinho flow

1. `GET .../checkout-summary` → show trip + **Valor** from `pricing.finalAmount`
2. User enters cupom → `POST .../coupons/validate` → update Valor / toast if `valid: false`
3. Method:
   - **Pix** → `POST /purchases/checkout` `{ paymentMethod: "PIX" }` → show `pixDetails` QR; poll status; on abandon `POST /purchases/:id/expire`
   - **Card** → `POST /purchases/card-intent` → Brick/form with `publicKey` (or stub) → `POST /purchases/checkout` `{ paymentMethod: "CARD", cardToken }`
   - **Apple/Google Pay** → show disabled / coming soon until wallets enabled + Ronilson config

## Secret-free local

```bash
# Option A — Mercado Pago test-token stub (omit ACCESS_TOKEN)
PAYMENT_PROVIDER=mercadopago
# Option B — Mock provider with PIX QR in-memory
PAYMENT_PROVIDER=mock
BILLING_MOCK_PAYMENTS_ENABLED=true
```

Production/staging require real `MERCADO_PAGO_ACCESS_TOKEN` + `MERCADO_PAGO_WEBHOOK_SECRET`.

## Env (see `.env.example`)

| Var | Purpose |
|-----|---------|
| `PAYMENT_PROVIDER` | `mercadopago` \| `mock` |
| `BILLING_MOCK_PAYMENTS_ENABLED` | Opt-in mock (never in production) |
| `WALLET_PAYMENTS_ENABLED` | Unlock Apple/Google Pay in availability |
| `MERCADO_PAGO_ACCESS_TOKEN` | Charge API |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Webhook HMAC |
| `MERCADO_PAGO_PUBLIC_KEY` | Card Brick / form (client) |
| `SEED_PRODUCT_PRICE` | Seed product price |
