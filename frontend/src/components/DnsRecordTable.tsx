import type { DnsRecord } from '@/lib/types';

export function DnsRecordTable({ records }: { records: DnsRecord[] }) {
  if (!records.length) {
    return <p className="text-sm text-zinc-500">No DNS records generated yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">
        <thead className="bg-zinc-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-zinc-600">Type</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600">Host</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600">Value</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600">Purpose</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {records.map((r, i) => (
            <tr key={r._id || i} className="hover:bg-zinc-50/80">
              <td className="px-4 py-3 font-mono text-xs">{r.type}</td>
              <td className="px-4 py-3 font-mono text-xs break-all">{r.host}</td>
              <td className="px-4 py-3 font-mono text-xs break-all max-w-md">{r.value}</td>
              <td className="px-4 py-3 capitalize text-zinc-600">{r.purpose.replace('_', ' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

