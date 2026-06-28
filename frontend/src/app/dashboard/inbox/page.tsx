import { redirect } from 'next/navigation';

/**
 * The inbox has been retired — this is an outbound-only sending platform.
 * Any old links to /dashboard/inbox now land on the Send email page.
 */
export default function InboxRedirectPage() {
  redirect('/dashboard/compose');
}
