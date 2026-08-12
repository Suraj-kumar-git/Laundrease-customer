// app/customer/faq/page.tsx
//
// Server component: loads the live FAQ list from the CMS and hands it to the
// interactive client half. This page used to import ./faq-data directly and
// render it unconditionally, so nothing an admin did in the CMS ever reached
// the public page — and hardcoded questions that had since been removed from
// the database kept showing up here.
//
// The static list is now reached only through getFaqs()'s catch, i.e. only
// when the API genuinely fails.

import { getFaqs } from './get-faqs'
import { FaqContent } from './FaqContent'

export const revalidate = 21600 // 6 hours — matches the other CMS-backed pages

export default async function FAQPage() {
  const items = await getFaqs()
  return <FaqContent items={items} />
}
