import { childrenOf, rootsOf } from './categories.js';
import { monthOf } from './format.js';

// month null = usa as movimentações como vieram (já filtradas por período).
const inMonth = (txs, month) => (month === null ? txs : txs.filter((t) => monthOf(t.date) === month));

export function monthTotals(txs, month) {
  const totals = { income: 0, expense: 0 };
  for (const t of inMonth(txs, month)) totals[t.type] += t.amountCents;
  return { ...totals, balance: totals.income - totals.expense };
}

function spentByCategory(txs, month) {
  const spent = new Map();
  for (const t of inMonth(txs, month)) {
    if (t.type === 'expense') spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + t.amountCents);
  }
  return spent;
}

// Categorias excluídas mas com histórico só aparecem nos meses em que tiveram gastos.
const visible = (item) => !item.cat.archived || item.total > 0;

export function categoryTotals(txs, month, cats) {
  const spent = spentByCategory(txs, month);
  const totalOf = (id) => spent.get(id) ?? 0;
  return rootsOf(cats)
    .map((cat, slot) => {
      const children = childrenOf(cats, cat.id).map((c) => ({ cat: c, total: totalOf(c.id) }));
      const total = cat.kind === 'main' ? children.reduce((sum, c) => sum + c.total, 0) : totalOf(cat.id);
      return { cat, slot, total, children: children.filter(visible) };
    })
    .filter(visible);
}

// Cada categoria mantém a cor da sua posição fixa. Com mais de 8, as últimas viram "Outras".
export function donutSegments(groups, rootCount) {
  const limit = rootCount > 8 ? 7 : 8;
  const spending = groups.filter((g) => g.total > 0);
  const sum = spending.reduce((total, g) => total + g.total, 0);
  const own = spending.filter((g) => g.slot < limit).map((g) => ({
    id: g.cat.id, name: g.cat.name, total: g.total, share: g.total / sum, color: `var(--series-${g.slot + 1})`,
  }));
  const rest = spending.filter((g) => g.slot >= limit).reduce((total, g) => total + g.total, 0);
  return rest ? [...own, { id: 'outras', name: 'Outras', total: rest, share: rest / sum, color: 'var(--muted)' }] : own;
}

export const budgetId = (month, categoryId) => `${month}:${categoryId}`;

export function budgetRows(txs, month, cats, budgets) {
  const limits = new Map(budgets.map((b) => [b.id, b.cents]));
  const row = ({ cat, total }, level) => {
    const budget = limits.get(budgetId(month, cat.id)) ?? null;
    return { cat, level, spent: total, budget, remaining: budget === null ? null : budget - total };
  };
  return categoryTotals(txs, month, cats).flatMap((g) => [row(g, 0), ...g.children.map((c) => row(c, 1))]);
}

export const sortTxs = (txs) =>
  [...txs].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0));

export const monthTxs = (txs, month) => sortTxs(inMonth(txs, month));
