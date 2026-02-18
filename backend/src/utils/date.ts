export function toDateOnlyUtc(input: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  const normalized = formatDateOnlyUtc(date);
  if (normalized !== input) {
    throw new Error("Invalid date value. Use real calendar date in YYYY-MM-DD.");
  }
  return date;
}

export function formatDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}
