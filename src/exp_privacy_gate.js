(() => {
  const STORE_KEY = 'exp_privacy_gate_ran'
  const SYNC_KEY = 'exp_privacy_gate_consent_sync'
  const ATTR = 'data-exp-privacy'
  const ATTR_SRC = 'data-exp-src'
  const ATTR_KIND = 'data-exp-kind'
  const ATTR_ONCE = 'data-exp-once'
  const ATTR_FALLBACK = 'data-exp-fallback'
  const DEFAULT_ONCE = '1'

  const ALLOWED_PURPOSES = new Set(['necessary', 'preferences', 'analytics', 'marketing', 'sale_of_data', 'saleofdata'])

  const state = {
    ran: new Set(),
    inFlight: new Set(),
    booted: false
  }

  const readRan = () => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY)
      if (!raw) return
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) arr.forEach((k) => state.ran.add(String(k)))
    } catch (_) {}
  }

  const writeRan = () => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(Array.from(state.ran)))
    } catch (_) {}
  }

  const publish = (name, payload) => {
    try {
      if (window.Shopify && window.Shopify.analytics && typeof window.Shopify.analytics.publish === 'function') {
        window.Shopify.analytics.publish(name, payload)
        return
      }
    } catch (_) {}
    try {
      fetch('/apps/exp/log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, payload })
      }).catch(() => {})
    } catch (_) {}
  }

  const norm = (v) => String(v || '').trim().toLowerCase()

  const parsePurposes = (raw) => {
    const s = norm(raw)
    if (!s) return []
    return s
      .replace(/,/g, ' ')
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean)
  }

  const validatePurposes = (purposes) => {
    const unknown = []
    for (let i = 0; i < purposes.length; i += 1) {
      const p = norm(purposes[i])
      if (!ALLOWED_PURPOSES.has(p)) unknown.push(purposes[i])
    }
    if (unknown.length) {
      publish('exp_privacy_gate_invalid_purpose', { unknown })
      return false
    }
    return true
  }

  const apiState = { p: null, ready: null }

  const ensureCustomerPrivacy = () => {
    if (window.Shopify && window.Shopify.customerPrivacy) return Promise.resolve(window.Shopify.customerPrivacy)
    if (!window.Shopify || typeof window.Shopify.loadFeatures !== 'function') return Promise.resolve(null)
    return new Promise((resolve) => {
      window.Shopify.loadFeatures(
        [{ name: 'consent-tracking-api', version: '0.1' }],
        (error) => resolve(error ? null : (window.Shopify.customerPrivacy || null))
      )
    })
  }

  apiState.ready = ensureCustomerPrivacy().then((p) => (apiState.p = p))

  window.expPrivacyGate = {
    ready: () => apiState.ready,
    customerPrivacy: () => apiState.p || (window.Shopify && window.Shopify.customerPrivacy) || null,
    region: () => (apiState.p?.getRegion?.() || ''),
    consentId: () => apiState.p?.consentId?.(),
    currentVisitorConsent: () => apiState.p?.currentVisitorConsent?.() || null,
    shouldShowBanner: () => !!apiState.p?.shouldShowBanner?.(),
    setTrackingConsent: (payload, cb) => apiState.p?.setTrackingConsent?.(payload, cb || (() => {})),
    scan: () => scan(),
    reset: () => {
      state.ran.clear()
      try { sessionStorage.removeItem(STORE_KEY) } catch (_) {}
    }
  }

  const getPrivacyApi = () => apiState.p || (window.Shopify && window.Shopify.customerPrivacy) || null

  const purposeAllowed = (purpose) => {
    const p0 = norm(purpose)
    const p = (p0 === 'saleofdata') ? 'sale_of_data' : p0

    if (p === 'necessary') return true

    const api = getPrivacyApi()
    if (!api) return false

    try {
      if (p === 'preferences') return !!api.preferencesProcessingAllowed?.()
      if (p === 'analytics') return !!api.analyticsProcessingAllowed?.()
      if (p === 'marketing') return !!api.marketingAllowed?.()
      if (p === 'sale_of_data') return !!api.saleOfDataAllowed?.()
    } catch (_) {
      return false
    }

    return false
  }

  const allPurposesAllowed = (purposes) => {
    if (!purposes.length) return false
    for (let i = 0; i < purposes.length; i += 1) {
      if (!purposeAllowed(purposes[i])) return false
    }
    return true
  }

  // djb2-style string hash → short, stable, deterministic token
  const hashString = (str) => {
    let h = 5381
    for (let i = 0; i < str.length; i += 1) {
      h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0
    }
    return h.toString(36)
  }

  // Deduplication key. A manual `data-exp-key` always wins; otherwise the key
  // is derived deterministically from the node's identifying attributes so it
  // stays stable across page loads. This makes the once-per-session dedup work
  // across navigations and prevents sessionStorage from growing unbounded with
  // throwaway random keys.
  const nodeKey = (el) => {
    const explicit = el.getAttribute('data-exp-key')
    if (explicit) return explicit
    if (!el.__exp_privacy_gate_id) {
      const src = el.getAttribute(ATTR_SRC) || ''
      const kind = el.getAttribute(ATTR_KIND) || ''
      const purposes = el.getAttribute(ATTR) || ''
      const inline = src ? '' : (el.textContent || '')
      el.__exp_privacy_gate_id = 'k_' + hashString(`${src}|${kind}|${purposes}|${inline}`)
    }
    return el.__exp_privacy_gate_id
  }

  const shouldOnce = (el) => {
    const v = el.getAttribute(ATTR_ONCE)
    if (v === null) return DEFAULT_ONCE === '1'
    return String(v) !== '0'
  }

  const markRan = (k) => {
    state.ran.add(k)
    writeRan()
  }

  const alreadyRan = (k) => state.ran.has(k)

  const runInline = (el) => {
    const code = el.textContent || ''
    if (!code.trim()) return
    const s = document.createElement('script')
    s.type = 'text/javascript'
    s.text = code
    document.head.appendChild(s)
    s.remove()
  }

  const runExternal = async (el, src) => {
    const kind = norm(el.getAttribute(ATTR_KIND))
    if (kind === 'module') {
      await import(src)
      return
    }
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })
  }

  const setFallback = (el, visible) => {
    const selector = el.getAttribute(ATTR_FALLBACK)
    if (!selector) return
    try {
      const fallbackEl = document.querySelector(selector)
      if (!fallbackEl) return
      if (visible) {
        fallbackEl.hidden = false
        // Defensively undo an inline display:none, otherwise it would win over
        // removing the hidden attribute and the fallback would never appear.
        if (fallbackEl.style && fallbackEl.style.display === 'none') {
          fallbackEl.style.display = ''
        }
      } else {
        fallbackEl.hidden = true
      }
    } catch (_) {}
  }

  const executeNode = async (el) => {
    const purposes = parsePurposes(el.getAttribute(ATTR))
    if (!purposes.length) return

    if (!validatePurposes(purposes)) return

    if (!allPurposesAllowed(purposes)) {
      setFallback(el, true)
      return
    }

    // Consent granted — hide fallback
    setFallback(el, false)

    const k = nodeKey(el)
    if (shouldOnce(el) && alreadyRan(k)) return

    // Guard against double execution: loading an external script yields at the
    // first `await`, so without a synchronous in-flight marker two concurrent
    // scans (boot, the customerPrivacy ready promise, visitorConsentCollected,
    // the storage event, the MutationObserver and the public scan()) could each
    // pass the alreadyRan() check before either reaches markRan() and inject the
    // same script twice.
    if (state.inFlight.has(k)) return
    state.inFlight.add(k)

    try {
      const src = el.getAttribute(ATTR_SRC)
      if (src) {
        await runExternal(el, src)
      } else {
        runInline(el)
      }
      if (shouldOnce(el)) markRan(k)
      publish('exp_privacy_gate_run', { p: purposes })
    } catch (_) {
      publish('exp_privacy_gate_error', { p: purposes })
    } finally {
      state.inFlight.delete(k)
    }
  }

  const scan = async (root = document) => {
    const nodes = root.querySelectorAll(`[${ATTR}]`)
    for (let i = 0; i < nodes.length; i += 1) {
      await executeNode(nodes[i])
    }
  }

  const observeDom = () => {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((n) => {
            if (n && n.nodeType === 1) scan(n)
          })
        } else if (m.type === 'attributes') {
          const el = m.target
          if (el && el.nodeType === 1 && el.hasAttribute(ATTR)) executeNode(el)
        }
      }
    })
    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [ATTR, ATTR_SRC, ATTR_KIND, ATTR_ONCE, ATTR_FALLBACK]
    })
  }

  const hookPrivacyChanges = () => {
    // Re-scan when consent is collected/updated in the same tab, and broadcast
    // the change to other tabs. Shopify stores consent in a cookie (not in Web
    // Storage), and the `storage` event never fires for cookie changes, so we
    // need to write our own key to localStorage to propagate across tabs.
    document.addEventListener('visitorConsentCollected', () => {
      try { localStorage.setItem(SYNC_KEY, String(Date.now())) } catch (_) {}
      scan()
    })

    // Re-scan when another tab broadcasts a consent change via the key above.
    window.addEventListener('storage', (e) => {
      if (e.key === SYNC_KEY) scan()
    })
  }

  const boot = () => {
    if (state.booted) return
    state.booted = true
    readRan()
    scan()
    observeDom()
    hookPrivacyChanges()
    apiState.ready.then(() => scan())
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
})()
