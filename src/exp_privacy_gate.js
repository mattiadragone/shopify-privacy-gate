(() => {
  const STORE_KEY = 'exp_privacy_gate_ran'
  const ATTR = 'data-exp-privacy'
  const ATTR_SRC = 'data-exp-src'
  const ATTR_KIND = 'data-exp-kind'
  const ATTR_ONCE = 'data-exp-once'
  const DEFAULT_ONCE = '1'

  const ALLOWED_PURPOSES = new Set(['necessary', 'preferences', 'analytics', 'marketing', 'sale_of_data', 'saleofdata'])

  const state = {
    ran: new Set(),
    booted: false,
    lastEval: 0
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
    setTrackingConsent: (payload, cb) => apiState.p?.setTrackingConsent?.(payload, cb || (() => {}))
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

  const nodeKey = (el) => {
    const explicit = el.getAttribute('data-exp-key')
    if (explicit) return explicit
    if (!el.__exp_privacy_gate_id) {
      el.__exp_privacy_gate_id = 'n_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
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

  const executeNode = async (el) => {
    const purposes = parsePurposes(el.getAttribute(ATTR))
    if (!purposes.length) return

    if (!validatePurposes(purposes)) return
    if (!allPurposesAllowed(purposes)) return

    const k = nodeKey(el)
    if (shouldOnce(el) && alreadyRan(k)) return

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
      attributeFilter: [ATTR, ATTR_SRC, ATTR_KIND, ATTR_ONCE]
    })
  }

  const hookPrivacyChanges = () => {
    document.addEventListener('visitorConsentCollected', () => scan())
    let t = null
    const tick = () => {
      const now = Date.now()
      if (now - state.lastEval > 1200) {
        state.lastEval = now
        scan()
      }
      t = window.setTimeout(tick, 1800)
    }
    tick()
    window.addEventListener('beforeunload', () => {
      if (t) window.clearTimeout(t)
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
