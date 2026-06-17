const styles: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 ring-amber-200',
  verifying: 'bg-blue-100 text-blue-800 ring-blue-200',
  active: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  failed: 'bg-red-100 text-red-800 ring-red-200',
  suspended: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = styles[status] || styles.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {status}
    </span>
  );
}
