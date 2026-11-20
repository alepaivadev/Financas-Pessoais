// kind: 'main' agrupa subcategorias; 'sub' pertence a uma 'main'; 'independent' fica sozinha.
// Despesas só apontam para 'sub' ou 'independent'; o total de uma 'main' é a soma das suas subcategorias.
const SEED = [
  ['despesas-fixas', 'Despesas fixas', 'main', [
    ['rifa-faculdade', 'Rifa faculdade'],
    ['academia', 'Academia'],
    ['internet', 'Internet'],
    ['faculdade', 'Faculdade'],
    ['cabelo', 'Cabelo'],
    ['papel-de-agua', 'Papel de água'],
  ]],
  ['despesas-variaveis', 'Despesas variáveis', 'main', [
    ['uber', 'Uber'],
    ['vestuario', 'Vestuário'],
  ]],
  ['emergencia', 'Emergência', 'independent', []],
];

export const makeCategory = (id, name, kind, parentId, order) =>
  ({ id, name, kind, parentId, order, archived: false });

export const DEFAULT_CATEGORIES = (() => {
  let order = 0;
  return SEED.flatMap(([id, name, kind, subs]) => [
    makeCategory(id, name, kind, null, order++),
    ...subs.map(([subId, subName]) => makeCategory(subId, subName, 'sub', id, order++)),
  ]);
})();

const byOrder = (a, b) => a.order - b.order;

export const rootsOf = (cats) => cats.filter((c) => c.kind !== 'sub').sort(byOrder);
export const childrenOf = (cats, id) => cats.filter((c) => c.parentId === id).sort(byOrder);
export const nextOrder = (cats) => Math.max(-1, ...cats.map((c) => c.order)) + 1;

// Converte os dados da primeira versão do app, em que categorias eram uma lista simples
// e receitas tinham categoria. Categorias de despesa já usadas continuam como independentes.
export function migrateV1(transactions, categories) {
  const kept = transactions
    .filter((t) => !t.id.startsWith('demo-'))
    .map((t) => (t.type === 'income' ? { ...t, categoryId: null } : t));
  const used = new Set(kept.map((t) => t.categoryId));
  const old = categories
    .filter((c) => c.kind === 'expense' && used.has(c.id))
    .map((c, i) => makeCategory(c.id, c.name, 'independent', null, DEFAULT_CATEGORIES.length + i));
  return { transactions: kept, categories: [...DEFAULT_CATEGORIES, ...old] };
}
