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
| `data-exp-src` | — | — | URL of the external script to load, or the real source to reveal on a gated `<iframe>`/`<img>`/`<link>` |
| `data-exp-kind` | — | `classic` | Set to `module` to load via ESM `import()` (scripts only) |
| `data-exp-once` | — | `1` | Set to `0` to allow re-execution on every scan (see caveat below) |
| `data-exp-key` | — | auto | Manual deduplication key (overrides the auto-generated one) |
| `data-exp-fallback` | — | — | CSS selector of an element to show while consent is not given |
| `data-exp-integrity` | — | — | Subresource Integrity hash for the external script (classic only) |
| `data-exp-crossorigin` | — | auto | CORS mode for the external script; defaults to `anonymous` when an integrity hash is set |
| `data-exp-nonce` | — | — | CSP nonce applied to the injected `<script>` (script nodes only) |
| `data-exp-reload-on-revoke` | — | — | Reload the page if consent is withdrawn after the node has run |
| `data-exp-when` | — | immediate | Defer an allowed node: `idle`, `visible`, or `interaction` (see below) |

> **`data-exp-once="0"` caveat:** re-execution on every scan applies to classic
> scripts and inline bootstraps. ESM modules (`data-exp-kind="module"`) are
> loaded with `import()`, which the browser caches by URL, so a module is only
> evaluated once per URL regardless of this setting.

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

### Gating iframes, images and pixels

The gate isn't limited to `<script>` tags. Put the attributes directly on an
`<iframe>`, `<img>` or `<link>` and **leave its `src` empty** — the real URL goes
in `data-exp-src` and is only applied once consent is granted, so nothing is
requested before then.

```html
<!-- Cookieless until marketing consent: a YouTube embed -->
<iframe
  data-exp-privacy="marketing"
  data-exp-src="https://www.youtube.com/embed/VIDEO_ID"
  data-exp-fallback="#yt-blocked"
  width="560" height="315" loading="lazy"></iframe>

<div id="yt-blocked" hidden>Enable marketing cookies to watch this video.</div>

<!-- Tracking pixel as an image -->
<img data-exp-privacy="marketing,sale_of_data"
  data-exp-src="https://pixel.example.com/p.gif" width="1" height="1" alt="">
```

### Consent revocation

`visitorConsentCollected` also fires when a visitor **withdraws** consent. On the
next scan the gate reacts:

- **`<iframe>`** is reset to `about:blank`, **`<img>`/`<link>`** have their
  `src`/`href` removed — so the embed/pixel stops loading and setting cookies;
- an `exp_privacy_gate_revoked` event is published;
- the node becomes eligible to run again if consent is later re-granted;
- the fallback element (if any) is shown again.

An already-executed `<script>` **cannot be unloaded**. When stopping it really
matters, add `data-exp-reload-on-revoke` so the page reloads on withdrawal:

```html
<script type="application/json"
  data-exp-privacy="analytics"
  data-exp-src="https://cdn.example.com/tracker.js"
  data-exp-reload-on-revoke>
</script>
```

### Deferred loading (`data-exp-when`)

Once consent is granted you can still defer *when* a non-critical node runs, to
keep it off the critical rendering path:

- `idle` — run during browser idle time (`requestIdleCallback`, 3s timeout fallback)
- `visible` — run when the element scrolls into view (`IntersectionObserver`). Only
  meaningful for rendered elements such as `<iframe>`/`<img>`; a `<script>` tag has
  no layout box and would never trigger.
- `interaction` — run on the first user interaction (pointer, key, touch or scroll)

```html
<!-- Load the chat widget only when the visitor scrolls to it -->
<iframe
  data-exp-privacy="marketing"
  data-exp-src="https://widget.example.com/chat"
  data-exp-when="visible"></iframe>
```

If consent is withdrawn before a deferred node fires, it is silently skipped.

### Fallback element

Show a message while analytics consent is not given. The fallback is hidden automatically once consent is granted.

> **Initialize the fallback element with the `hidden` attribute.** The gate
> shows it (removes `hidden`) only when consent is missing and hides it again
> once consent is granted. Starting it hidden avoids a flash of the fallback
> content before the gate has evaluated. Do **not** hide it with
> `style="display:none"`: an inline `display` would win over the `hidden`
> attribute (the gate clears it defensively, but `hidden` is the supported way).

```html
<script type="application/json"
  data-exp-privacy="analytics"
  data-exp-src="https://cdn.example.com/tracker.js"
  data-exp-fallback="#analytics-blocked">
</script>

<div id="analytics-blocked" hidden>
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

<div id="analytics-consent-notice" hidden>
  Analytics are disabled. <a href="/pages/privacy">Update preferences</a>
</div>
```

---

## Events

All events are published via `Shopify.analytics.publish` if available, otherwise POSTed to `/apps/exp/log`. Override the fallback endpoint by setting `window.EXP_PRIVACY_GATE_LOG_URL` before the library boots:

```html
<script>window.EXP_PRIVACY_GATE_LOG_URL = '/apps/my-app/privacy-log'</script>
```

| Event | When |
|---|---|
| `exp_privacy_gate_run` | A gated node was successfully executed |
| `exp_privacy_gate_error` | A gated node threw an error during execution |
| `exp_privacy_gate_invalid_purpose` | An unknown purpose was specified |
| `exp_privacy_gate_revoked` | A previously-run node was torn down because consent was withdrawn |
| `exp_privacy_gate_blocked` | A node is blocked for lack of consent (emitted once per blocked episode) |

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
| `expPrivacyGate.status()` | Return the state of every gated node (`allowed`, `activated`, `blockedBy`) for debugging |

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

## Configuration globals

Set these on `window` before the library boots:

| Global | Effect |
|---|---|
| `EXP_PRIVACY_GATE_LOG_URL` | Override the fallback analytics log endpoint (default `/apps/exp/log`) |
| `EXP_PRIVACY_GATE_DEBUG` | When truthy, log every gate decision (`run`, `blocked`, `revoked`) to the console |
| `EXP_PRIVACY_GATE_FAIL_OPEN` | When truthy, allow non-necessary purposes if the Customer Privacy API is unavailable (default is **fail-closed** — block everything but `necessary`) |

```html
<script>
  window.EXP_PRIVACY_GATE_DEBUG = true
</script>
```

## TypeScript

Type definitions ship with the package (`types/index.d.ts`) and describe the
`window.expPrivacyGate` API and the configuration globals.

## Security notes

### Subresource Integrity (SRI)

For external classic scripts you can pin an integrity hash so a tampered CDN
response is rejected by the browser:

```html
<script type="application/json"
  data-exp-privacy="analytics"
  data-exp-src="https://cdn.example.com/tracker.js"
  data-exp-integrity="sha384-…"
  data-exp-crossorigin="anonymous">
</script>
```

SRI is not applied to ESM imports (`data-exp-kind="module"`), since `import()`
does not support an integrity attribute.

### Content Security Policy (CSP)

The gate executes gated nodes by injecting `<script>` elements (external `src`
for `data-exp-src`, and an inline `<script>` for inline bootstraps). If your
store uses a strict CSP, make sure `script-src` allows the external origins you
gate, and that inline bootstraps are permitted (e.g. via a nonce/hash or
`'unsafe-inline'`) — otherwise the browser will block them.

## Dev / Build

Requires Node >= 18.

```bash
npm i
npm run build
```

Output:
- `dist/exp_privacy_gate.js` — unminified
- `dist/exp_privacy_gate.min.js` — minified (via terser)
