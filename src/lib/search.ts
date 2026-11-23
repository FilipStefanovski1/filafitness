/**
 * Script-independent search keys so "подварок", "podvarok" and "Podvarok" match, and
 * common romanizations ("zh"/"ž"/"z", "kj"/"ќ"/"k", "dzh"/"џ") collapse together.
 */
const CYR: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  ѓ: 'gj',
  е: 'e',
  ж: 'zh',
  з: 'z',
  ѕ: 'dz',
  и: 'i',
  ј: 'j',
  к: 'k',
  л: 'l',
  љ: 'lj',
  м: 'm',
  н: 'n',
  њ: 'nj',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  ќ: 'kj',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  џ: 'dzh',
  ш: 'sh',
  // Serbian / Bulgarian / Russian letters that show up in food names
  ђ: 'dj',
  ћ: 'c',
  й: 'j',
  ъ: 'a',
  ь: '',
  ы: 'y',
  э: 'e',
  ю: 'ju',
  я: 'ja',
  щ: 'sht',
  ё: 'e',
  є: 'e',
  і: 'i',
  ї: 'i',
};

export function transliterate(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) out += CYR[ch] ?? ch;
  return out;
}

/** Lowercase, transliterate, strip diacritics, fold romanization variants, keep [a-z0-9 ]. */
export function searchKey(s: string): string {
  return transliterate(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/dzh|dž/g, 'z')
    .replace(/zh|dz/g, 'z')
    .replace(/ch|kj|tj/g, 'c')
    .replace(/sh/g, 's')
    .replace(/gj|dj/g, 'g')
    .replace(/lj/g, 'l')
    .replace(/nj/g, 'n')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildSearchKey(name: string, aliases: string[] = [], extra: Array<string | null | undefined> = []): string {
  const parts = [name, ...aliases, ...extra.filter(Boolean)] as string[];
  return Array.from(new Set(parts.map(searchKey).filter(Boolean))).join(' | ');
}

/** Score how well a query matches a stored key. 0 = no match. */
export function matchScore(query: string, key: string): number {
  const q = searchKey(query);
  if (!q) return 1;
  const tokens = q.split(' ');
  if (!tokens.every((t) => key.includes(t))) return 0;
  const names = key.split(' | ');
  if (names.some((n) => n === q)) return 100;
  if (names.some((n) => n.startsWith(q))) return 80;
  if (names.some((n) => n.split(' ').some((w) => w.startsWith(tokens[0])))) return 60;
  return 40;
}
