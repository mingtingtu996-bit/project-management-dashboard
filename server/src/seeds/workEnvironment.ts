export type WorkEnvironment = 'outdoor' | 'indoor' | 'mixed'

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export function normalizeWorkEnvironment(value: unknown): WorkEnvironment | null {
  const text = normalizeText(value)
  if (text === 'outdoor' || text === 'site_external' || text === 'external') return 'outdoor'
  if (text === 'indoor' || text === 'interior' || text === 'internal') return 'indoor'
  if (text === 'mixed' || text === 'both' || text === 'indoor_outdoor') return 'mixed'
  return null
}

export function inferWorkEnvironment(
  text: unknown,
  metadata?: Record<string, unknown> | null,
): WorkEnvironment {
  const explicit = normalizeWorkEnvironment(
    metadata?.workEnvironment
      ?? metadata?.work_environment
      ?? metadata?.environment,
  )
  if (explicit) return explicit

  const haystack = [
    text,
    metadata?.applicableScope,
    metadata?.applicable_scope,
    metadata?.phaseWindow,
    metadata?.phase_window,
    metadata?.primaryWorkfaceType,
    metadata?.primary_workface_type,
    ...(Array.isArray(metadata?.methodVariantCodes) ? metadata.methodVariantCodes : []),
    ...(Array.isArray(metadata?.method_variant_codes) ? metadata.method_variant_codes : []),
  ].map(normalizeText).filter(Boolean).join(' ')

  if (/(outdoor|external|exterior|facade|roof|site|road|hardscape|landscape|trench|earthwork|foundation|pit|dewatering|hoisting|scaffold|curtain|municipal)/.test(haystack)) {
    return /(interior|indoor|mep|decoration|finishing)/.test(haystack) ? 'mixed' : 'outdoor'
  }

  if (/(indoor|interior|decoration|finishing|ceiling|putty|cabinet|drywall|room|mep|plumbing|electrical|hvac)/.test(haystack)) {
    return 'indoor'
  }

  return 'mixed'
}

export function workEnvironmentMatches(
  ruleEnvironment: unknown,
  contextEnvironment: unknown,
) {
  const rule = normalizeWorkEnvironment(ruleEnvironment)
  const context = normalizeWorkEnvironment(contextEnvironment)
  if (!rule || !context) return true
  if (rule === 'mixed' || context === 'mixed') return true
  return rule === context
}
