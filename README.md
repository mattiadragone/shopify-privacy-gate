# Shopify Privacy Gate

Privacy gate for Shopify: **prevents download and execution** of scripts until the requested "processing purposes" are **allowed** by the Customer Privacy API (which takes into account region, merchant settings, and user consent).

Optionally shows a **fallback element** while consent is not given, and hides it automatically once consent is granted.

---

## Import via CDN (GitHub + jsDelivr)

```html
<script src="https://cdn.jsdelivr.net/gh/mattiadragone/shopify-privacy-gate@v1.0.0/dist/exp_privacy_gate.min.js"></script>
```

In a Shopify theme, place it in the `<head>` **before** `{{ content_for_header }}` and **without** `defer`/`async`:

```liquid
<head>
  <script src="https://cdn.jsdelivr.net/gh/mattiadragone/shopify-privacy-gate@v1.0.0/dist/exp_privacy_gate.min.js"></script>
  {{ content_for_header }}
</head>
```

---

## Supported purposes

- `necessary` — always allowed, never blocked
- `preferences`
- `analytics`
- `marketing`
- `sale_of_data` (alias: `saleofdata`)

Multiple purposes can be specified as a comma- or space-separated list: `marketing,analytics`

### Unsupported purposes
Unknown purposes are rejected (no download/execution) and trigger an `exp_privacy_gate_invalid_purpose` event.

---

## Attributes reference

| Attribute | Required | Default | Description |
|---|---|---|---|
| `data-exp-privacy` | ✅ | — | One or more purposes required before execution |
| `data-exp-src` | — | — | URL of the external script to load |
| `data-exp-kind` | — | `classic` | Set to `module` to load via ESM `import()` |
| `data-exp-once` | — | `1` | Set to `0` to allow re-execution on every scan |
| `data-exp-key` | — | auto | Manual deduplication key (overrides the auto-generated one) |
| `data-exp-fallback` | — | — | CSS selector of an element to show while consent is not given |

---

## Usage examples

### External script

```html
<script type="application/json"
  data-exp-privacy="analytics"
  data-exp-src="https://cdn.jsdelivr.net/npm/gsap@3.14.1/dist/gsap.min.js">
</script>
```

### ESM module import

```html
<script type="application/json"
  data-exp-privacy="marketing"
  data-exp-kind="module"
  data-exp-src="https://example.com/bundle.esm.js">
</script>
```

### Inline script bootstrap

```html
<script type="application/json" data-exp-privacy="preferences">
window.__expPrefsReady = true
</script>
```

### Fallback element

Show a message while analytics consent is not given. The fallback is hidden automatically once consent is granted.

```html
<script type="application/json"
  data-exp-privacy="analytics"
  data-exp-src="https://cdn.example.com/tracker.js"
  data-exp-fallback="#analytics-blocked">
</script>

<div id="analytics-blocked">
  Analytics disabled.
  <a href="/pages/privacy">Manage your preferences</a>
</div>
```

### Shopify Liquid — end-to-end example

```liquid
{%- comment -%}
  Load the privacy gate before content_for_header so it is
  available when theme scripts start executing.
{%- endcomment -%}
<head>
  <script src="https://cdn.jsdelivr.net/gh/mattiadragone/shopify-privacy-gate@v1.0.0/dist/exp_privacy_gate.min.js"></script>
  {{ content_for_header }}

  {%- comment -%} Analytics — only loads after visitor grants analytics consent {%- endcomment -%}
  <script type="application/json"
    data-exp-privacy="analytics"
    data-exp-src="{{ 'analytics.js' | asset_url }}"
    data-exp-fallback="#analytics-consent-notice">
  </script>

  {%- comment -%} Marketing pixel — marketing + sale_of_data required {%- endcomment -%}
  <script type="application/json"
    data-exp-privacy="marketing,sale_of_data"
    data-exp-src="https://pixel.example.com/pixel.js">
  </script>
</head>

<div id="analytics-consent-notice" style="display:none">
  Analytics are disabled. <a href="/pages/privacy">Update preferences</a>
</div>
```

---

## Events

All events are published via `Shopify.analytics.publish` if available, otherwise POSTed to `/apps/exp/log`.

| Event | When |
|---|---|
| `exp_privacy_gate_run` | A gated node was successfully executed |
| `exp_privacy_gate_error` | A gated node threw an error during execution |
| `exp_privacy_gate_invalid_purpose` | An unknown purpose was specified |

---

## Public API

The library exposes `window.expPrivacyGate`:

| Method | Description |
|---|---|
| `await expPrivacyGate.ready()` | Resolves when the Customer Privacy API is initialised |
| `expPrivacyGate.region()` | Returns the visitor's region string |
| `expPrivacyGate.shouldShowBanner()` | Whether the consent banner should be shown |
| `expPrivacyGate.currentVisitorConsent()` | Current consent object |
| `expPrivacyGate.consentId()` | Unique consent ID |
| `expPrivacyGate.setTrackingConsent(payload, cb)` | Programmatically set consent |
| `expPrivacyGate.scan()` | Manually trigger a DOM scan (useful after dynamic content injection) |
| `expPrivacyGate.reset()` | Clear the "already ran" state so nodes can be re-executed |

### Example: trigger after dynamic content injection

```js
// After inserting new gated elements into the DOM:
await expPrivacyGate.ready()
expPrivacyGate.scan()
```

### Example: reset for SPA navigation

```js
// On route change, allow gated scripts to re-execute
expPrivacyGate.reset()
expPrivacyGate.scan()
```

---

## Dev / Build

Requires Node >= 18.

```bash
npm i
npm run build
```

Output:
- `dist/exp_privacy_gate.js` — unminified
- `dist/exp_privacy_gate.min.js` — minified (via terser)
