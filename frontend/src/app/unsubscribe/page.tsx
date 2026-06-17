'use client';

import { Suspense } from 'react';
import { UnsubscribeContent } from './UnsubscribeContent';
import { Card, CardBody, Skeleton } from '@/components/ui';

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background p-6">
          <Card className="max-w-md w-full">
            <CardBody>
              <Skeleton className="h-32" />
            </CardBody>
          </Card>
        </main>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}
