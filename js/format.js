const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const MAX_CENTS = 100_000_000_000; // R$ 1 bilhão

export const fmtMoney = (cents) => currency.format(cents / 100);
export const fmtPlain = (cents) => plain.format(cents / 100);

// Aceita "1.234,56", "1234,5", "1.234" (milhar) e "1234.56". Rejeita formatos ambíguos,
// como "1,234", para nunca gravar um valor mil vezes maior ou menor que o digitado.
export function parseMoney(input) {
  const s = String(input).replace(/R\$/gi, '').replace(/\s/g, '');
  const m = s.match(/^(?:(\d{1,3}(?:([.,])\d{3})(?:\2\d{3})*)|(\d+))(?:([.,])(\d{1,2}))?$/);
  if (!m) return null;
  const [, grouped, groupSep, ungrouped, decSep, dec = ''] = m;
  if (grouped && groupSep === ',' && !decSep) return null;
  if (grouped && decSep === groupSep) return null;
  const whole = grouped ? grouped.replaceAll(groupSep, '') : ungrouped;
  const cents = Number(whole) * 100 + Number(dec.padEnd(2, '0') || 0);
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}

const pad = (n) => String(n).padStart(2, '0');

// Usa o horário local: toISOString() cairia no dia seguinte à noite no Brasil.
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthOf = (date) => date.slice(0, 7);

// O controle começa neste mês: nada anterior é exibido nem contabilizado.
export const FIRST_MONTH = '2026-10';
export const isTracked = (date) => monthOf(date) >= FIRST_MONTH;

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  return label[0].toUpperCase() + label.slice(1);
}

export function isValidDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
}

export const fmtDate = (date) => date.split('-').reverse().join('/');
