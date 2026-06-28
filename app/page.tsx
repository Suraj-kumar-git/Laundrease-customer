// app/page.tsx
import { redirect } from 'next/navigation';

export default function RootRedirect() {
  const role = process.env.ROLE || null;
  redirect(`/${role}`);
}