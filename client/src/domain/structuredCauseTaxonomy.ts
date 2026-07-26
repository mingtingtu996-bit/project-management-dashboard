export type StructuredCauseTaxonomyEntry = {
  code: string
  label: string
  category: string
  linkedDeviationReasonTypes: string[]
  priority: number
}

export type StructuredCauseTaxonomyResponse = {
  version: string
  entries: StructuredCauseTaxonomyEntry[]
}

export type CauseAttributionRecord = {
  id: string
  subject_id: string
  cause_code: string
  cause_role?: string | null
  event_type?: string | null
  raw_text?: string | null
  status: string
}
