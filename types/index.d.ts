// Type definitions for Shopify Privacy Gate
// The library is a side-effecting IIFE that attaches `expPrivacyGate` to `window`.

export type ExpPrivacyPurpose =
  | 'necessary'
  | 'preferences'
  | 'analytics'
  | 'marketing'
  | 'sale_of_data'

export interface ExpTrackingConsent {
  analytics?: boolean
  marketing?: boolean
  preferences?: boolean
  sale_of_data?: boolean
}

export interface ExpNodeStatus {
  /** The gated DOM element. */
  element: Element
  /** Purposes parsed from `data-exp-privacy`. */
  purposes: string[]
  /** Whether every purpose is currently allowed. */
  allowed: boolean
  /** Whether the node has already been run/revealed. */
  activated: boolean
  /** Purposes currently blocking the node (empty when allowed). */
  blockedBy: string[]
}

export interface ExpPrivacyGate {
  /** Resolves once the Customer Privacy API has been initialised. */
  ready(): Promise<unknown>
  /** The underlying `Shopify.customerPrivacy` object, if available. */
  customerPrivacy(): unknown | null
  /** The visitor's region string (may be empty). */
  region(): string
  /** Unique consent id, if available. */
  consentId(): string | undefined
  /** Current visitor consent object, if available. */
  currentVisitorConsent(): unknown | null
  /** Whether the consent banner should be shown. */
  shouldShowBanner(): boolean
  /** Programmatically set tracking consent (passthrough to the Shopify API). */
  setTrackingConsent(payload: ExpTrackingConsent, cb?: (data?: { error?: unknown }) => void): void
  /** Manually trigger a DOM scan (e.g. after injecting gated content). */
  scan(): void
  /** Clear the "already ran" dedup state so nodes can run again. */
  reset(): void
  /** Introspect every gated node and why it is/isn't allowed. */
  status(): ExpNodeStatus[]
}

declare global {
  interface Window {
    expPrivacyGate?: ExpPrivacyGate
    /** Override the fallback analytics log endpoint (default `/apps/exp/log`). */
    EXP_PRIVACY_GATE_LOG_URL?: string
    /** Log gate decisions to the console when truthy. */
    EXP_PRIVACY_GATE_DEBUG?: boolean
    /** Allow non-necessary purposes when the Customer Privacy API is unavailable. */
    EXP_PRIVACY_GATE_FAIL_OPEN?: boolean
  }
}

export {}
