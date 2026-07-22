// app/customer/careers/[id]/layout.tsx
// page.tsx in this segment is 'use client' (interactive apply form), so it
// can't export metadata itself — this sibling server layout carries dynamic
// per-job metadata instead, querying the DB directly rather than the API
// route (avoids a self-fetch round trip during metadata generation).

import type { Metadata } from 'next'
import { queryOne } from '@/lib/db'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params

  const job = await queryOne<{ title: string; department: string; location: string; about_role: string }>(`
    SELECT title, department, location, about_role
    FROM career_jobs
    WHERE public_id = $1 AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
  `, [id]).catch(() => null)

  if (!job) {
    return {
      title: 'Careers | Laundrease',
      description: 'Join the Laundrease team. We are building the future of on-demand laundry in India.',
    }
  }

  const title = `${job.title} — ${job.department} | Laundrease Careers`
  const description = job.about_role?.slice(0, 155) || `${job.title} (${job.department}) at Laundrease, ${job.location}. Apply now.`

  return {
    title,
    description,
    alternates: { canonical: `/customer/careers/${id}` },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default function CareerJobLayout({ children }: { children: React.ReactNode }) {
  return children
}
