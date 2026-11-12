/** CSV cell encoding for user supplied Project, Work Item and Staff text.
 * Spreadsheet applications can execute a cell beginning with =, +, - or @.
 * Prefix risky values with an apostrophe before RFC 4180 quoting.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = String(value ?? '');
  const unsafe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(raw);
  const sanitized = unsafe ? `'${raw}` : raw;
  return `"${sanitized.replaceAll('"', '""')}"`;
}

export function encodeCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}
