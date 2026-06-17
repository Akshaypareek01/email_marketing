'use client';

/**
 * Banner shown when a tenant user lacks admin permissions on a page.
 */
export function ReadOnlyBanner({ message }: { message?: string }) {
  return (
    <div
      className="mb-4 rounded-lg border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground"
      role="status"
    >
      {message || 'View-only mode — contact a tenant admin to make changes.'}
    </div>
  );
}
