// ============================================================
// Footer Pages — Type Definitions
// ============================================================
 
// ---- Legal Documents ----------------------------------------
 
export interface LegalSection {
  heading: string
  body: string
  subsections?: Array<{ heading: string; body: string }>
}
 
export interface LegalDocument {
  id: number
  code: 'terms_of_service' | 'privacy_policy'
  title: string
  version: string
  effective_date: string   // ISO date string
  content: LegalSection[]
  updated_at: string
}
 
// ---- Page Content Blocks ------------------------------------
 
export type SectionType =
  | 'hero'
  | 'stats'
  | 'cards'
  | 'faq_group'
  | 'text_block'
  | 'team_grid'
  | 'generic'
 
// Hero section body
export interface HeroBody {
  badge?: string
  cta_text?: string
  cta_href?: string
  founded_year?: string
  tagline?: string
  search_placeholder?: string
}
 
// Stat item
export interface StatItem {
  label: string
  value: string
  icon: string
}
 
// Card item
export interface CardItem {
  icon: string
  title: string
  body: string
  action_label?: string
  action_href?: string
}
 
// FAQ item
export interface FaqItem {
  q: string
  a: string
}
 
// FAQ group body
export interface FaqGroupBody {
  category: string
  icon: string
  items: FaqItem[]
}
 
// Text block body
export interface TextBlockBody {
  body: string
  highlight?: string
  contacts?: Array<{ label: string; value: string; type: 'phone' | 'email' }>
}
 
export interface PageContentBlock {
  id: number
  page_slug: string
  section_key: string
  section_type: SectionType
  title: string | null
  subtitle: string | null
  body: HeroBody | StatItem[] | CardItem[] | FaqGroupBody | TextBlockBody | any
  sort_order: number
}
 
// ---- Career Jobs --------------------------------------------
 
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship'
 
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  contract: 'Contract',
  internship: 'Internship',
}
 
export interface CareerJob {
  id: string
  title: string
  department: string
  location: string
  employment_type: EmploymentType
  experience_range: string | null
  about_role: string | null
  responsibilities: string[]
  requirements: string[]
  nice_to_have: string[]
  benefits: string[]
  jd_s3_key: string | null
  hr_name: string
  hr_email: string
  email_subject_format: string
  email_body_format: string
  is_featured: boolean
  posted_at: string
  expires_at: string | null
}
 
// ---- API Response shapes ------------------------------------
 
export interface ApiPageResponse {
  success: boolean
  data: PageContentBlock[]
}
 
export interface ApiLegalResponse {
  success: boolean
  data: LegalDocument
}
 
export interface ApiCareersResponse {
  success: boolean
  data: CareerJob[]
}
 
export interface ApiJobResponse {
  success: boolean
  data: CareerJob
}
 
export interface ApiJdUrlResponse {
  success: boolean
  data: { url: string; expires_in: number }
}