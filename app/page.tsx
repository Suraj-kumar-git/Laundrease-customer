import { redirect } from 'next/navigation';

export default function RootRedirect() {
  // const role = process.env.ROLE || null;
  redirect('/customer');
}