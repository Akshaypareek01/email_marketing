'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getToken, getStoredUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/types';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  const isLogin = pathname === '/admin/login';

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    const token = getToken();
    const user = getStoredUser<SessionUser>();
    if (!token) {
      router.replace('/admin/login');
      return;
    }
    if (user?.role !== 'super_admin') {
      // Authenticated but not an operator — bounce to the tenant app.
      router.replace('/dashboard');
      return;
    }
    setReady(true);
  }, [isLogin, router]);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return <>{children}</>;
}
