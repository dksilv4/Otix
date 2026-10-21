export interface LegalSection {
  id: string
  label: string
}

export const TERMS_SECTIONS: LegalSection[] = [
  { id: 'acceptance', label: '1. Acceptance & Scope' },
  { id: 'byos-architecture', label: '2. BYOS Zero-Relay Architecture' },
  { id: 'user-responsibility', label: '3. User Responsibility' },
  { id: 'lists-metadata', label: '4. Lists & Metadata' },
  { id: 'integrations', label: '5. Integrations & Trademarks' },
  { id: 'prohibited', label: '6. Prohibited Activities' },
  { id: 'refunds', label: '7. Subscriptions & Refunds' },
  { id: 'licensing', label: '8. Asset & Font Licensing' },
  { id: 'dmca', label: '9. DMCA Safe Harbor' },
  { id: 'liability', label: '10. Limitation of Liability' },
]

export const PRIVACY_SECTIONS: LegalSection[] = [
  { id: 'controller', label: '1. Data Controller' },
  { id: 'data-collected', label: '2. Data Collected' },
  { id: 'byos-streaming', label: '3. BYOS Streaming Privacy' },
  { id: 'third-party-apis', label: '4. External APIs' },
  { id: 'cookies', label: '5. Cookies & Storage' },
  { id: 'children', label: '6. Children’s Privacy' },
  { id: 'data-deletion', label: '7. Data Erasure & Rights' },
  { id: 'communications', label: '8. Communications' },
]

export const scrollToLegalSection = (id: string): void => {
  if (typeof document === 'undefined') return
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
