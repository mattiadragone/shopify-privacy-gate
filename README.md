# exp_privacy_gate (open source)

Privacy gate for Shopify: **prevents download and execution** of scripts until the requested “processing purposes” are **Allowed** by the Customer Privacy API (which takes into account region, merchant settings, and user consent).

## Import via CDN (GitHub + jsDelivr)

```html
<script src="https://cdn.jsdelivr.net/gh/ORG/exp-privacy-gate@v1.0.0/dist/exp_privacy_gate.min.js"></script>
```

In a Shopify theme, place it in the `<head>` **before** `{{ content_for_header }}` and **without** `defer/async`:

```liquid
<head>
  <script src="https://cdn.jsdelivr.net/gh/ORG/exp-privacy-gate@v1.0.0/dist/exp_privacy_gate.min.js"></script>
  {{ content_for_header }}
</head>
```

## Supported purposes

- `necessary` (always allowed)
- `preferences`
- `analytics`
- `marketing`
- `sale_of_data` (alias: `saleofdata`)

Comma or space separated list: `marketing,sale_of_data`

### Unsupported purposes
Rejected: no download/execution + `exp_privacy_gate_invalid_purpose` event.

## Usage

### External script (no direct src)

```html
<script type="application/json"
  data-exp-privacy="analytics"
  data-exp-src="https://cdn.jsdelivr.net/npm/gsap@3.14.1/dist/gsap.min.js"></script>
```

### ESM import

```html
<script type="application/json"
  data-exp-privacy="marketing"
  data-exp-kind="module"
  data-exp-src="https://example.com/bundle.esm.js"></script>
```

### Inline bootstrap

```html
<script type="application/json" data-exp-privacy="preferences">
window.__expPrefsReady = true
</script>
```

## Events

- `exp_privacy_gate_run`
- `exp_privacy_gate_error`
- `exp_privacy_gate_invalid_purpose`

Published via `Shopify.analytics.publish` if available, otherwise POSTed to `/apps/exp/log`.

## Public API

The library exposes `window.expPrivacyGate`:

- `await expPrivacyGate.ready()`
- `expPrivacyGate.region()`
- `expPrivacyGate.shouldShowBanner()`
- `expPrivacyGate.currentVisitorConsent()`
- `expPrivacyGate.consentId()`
- `expPrivacyGate.setTrackingConsent(payload, cb)`

## Dev / Build

Requires Node >= 18.

```bash
npm i
npm run build
```

Output:
- `dist/exp_privacy_gate.js` (unminified)
- `dist/exp_privacy_gate.min.js` (minified)
