export interface ParsedRecipients {
  emails: string[];
  duplicatesRemoved: number;
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * Extracts addresses from any CSV or plain text. Pattern matching, rather than
 * column parsing, means it works whether the file has a header row, several
 * columns, quotes, or one address per line.
 */
export function extractEmails(text: string): ParsedRecipients {
  const found = (text.match(EMAIL_PATTERN) ?? []).map((e) => e.toLowerCase());
  const unique = [...new Set(found)];
  return { emails: unique, duplicatesRemoved: found.length - unique.length };
}
