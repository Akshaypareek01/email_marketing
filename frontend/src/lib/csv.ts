/**
 * Parse CSV text into row objects using the first line as headers.
 * @param text Raw CSV file content
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx]?.trim() ?? '';
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Split a single CSV line respecting quoted fields.
 * @param line
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Guess column mapping from CSV headers.
 * @param headers
 */
export function guessColumnMapping(headers: string[]): Record<string, string> {
  const lower = headers.map((h) => h.toLowerCase());
  const find = (...candidates: string[]) => {
    const idx = lower.findIndex((h) => candidates.some((c) => h.includes(c)));
    return idx >= 0 ? headers[idx] : '';
  };

  return {
    email: find('email', 'e-mail'),
    firstName: find('first', 'fname', 'given'),
    lastName: find('last', 'lname', 'surname', 'family'),
    company: find('company', 'organization', 'org'),
    tags: find('tag'),
  };
}
