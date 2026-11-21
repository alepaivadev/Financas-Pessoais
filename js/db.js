import { migrateV1 } from './categories.js';

const DB_NAME = 'financas-pessoais';
const DB_VERSION = 3;
const FRESH_INSTALL = 'fresh-install';

const promisify = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

function fillStore(store, items) {
  store.clear();
  items.forEach((item) => store.put(item));
}

function upgrade(db, tx, oldVersion) {
  if (oldVersion < 1) {
    db.createObjectStore('transactions', { keyPath: 'id' });
    db.createObjectStore('categories', { keyPath: 'id' });
    db.createObjectStore('meta');
  }
  if (oldVersion < 2) db.createObjectStore('budgets', { keyPath: 'id' });
  // Versão 3: despesas futuras (previstas para o mês, ainda não pagas).
  if (oldVersion < 3) db.createObjectStore('planned', { keyPath: 'id' });
  if (oldVersion >= 2) return;

  const transactions = tx.objectStore('transactions');
  const categories = tx.objectStore('categories');
  if (oldVersion < 1) {
    // Instalação nova começa sem categorias: a pessoa cria as dela.
    // A marca evita que tarefas feitas só para o aparelho do dono (dados de outubro, renomeações) rodem aqui.
    tx.objectStore('meta').put(true, FRESH_INSTALL);
    return;
  }
  transactions.getAll().onsuccess = (txEvent) => {
    categories.getAll().onsuccess = (catEvent) => {
      const migrated = migrateV1(txEvent.target.result, catEvent.target.result);
      fillStore(transactions, migrated.transactions);
      fillStore(categories, migrated.categories);
    };
  };
}

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => upgrade(request.result, request.transaction, event.oldVersion);
    request.onblocked = () => reject(new Error('Outra aba do app está aberta.'));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function write(stores, fn) {
  const tx = (await open()).transaction(stores, 'readwrite');
  fn(tx);
  await done(tx);
}

export async function loadAll() {
  const tx = (await open()).transaction(['transactions', 'categories', 'budgets', 'planned']);
  const [transactions, categories, budgets, planned] = await Promise.all([
    promisify(tx.objectStore('transactions').getAll()),
    promisify(tx.objectStore('categories').getAll()),
    promisify(tx.objectStore('budgets').getAll()),
    promisify(tx.objectStore('planned').getAll()),
  ]);
  return { transactions, categories, budgets, planned };
}

export const putTx = (t) => write('transactions', (tx) => tx.objectStore('transactions').put(t));
export const deleteTx = (id) => write('transactions', (tx) => tx.objectStore('transactions').delete(id));
export const putCategory = (c) => write('categories', (tx) => tx.objectStore('categories').put(c));
export const deleteBudget = (id) => write('budgets', (tx) => tx.objectStore('budgets').delete(id));

export const putPlanned = (p) => write('planned', (tx) => tx.objectStore('planned').put(p));
export const putPlannedMany = (items) => write('planned', (tx) => items.forEach((p) => tx.objectStore('planned').put(p)));
export const deletePlanned = (id) => write('planned', (tx) => tx.objectStore('planned').delete(id));
// "Paguei": a despesa futura vira movimentação de verdade, na mesma transação.
export const payPlanned = (plannedId, t) => write(['planned', 'transactions'], (tx) => {
  tx.objectStore('planned').delete(plannedId);
  tx.objectStore('transactions').put(t);
});
// Desfaz o "Paguei".
export const unpayPlanned = (p, txId) => write(['planned', 'transactions'], (tx) => {
  tx.objectStore('transactions').delete(txId);
  tx.objectStore('planned').put(p);
});

export const putBudgets = (budgets) =>
  write('budgets', (tx) => budgets.forEach((b) => tx.objectStore('budgets').put(b)));

// Categorias com movimentações são só arquivadas, para o histórico continuar íntegro.
export const removeCategories = ({ archived, removedIds, budgetIds, plannedIds = [] }) =>
  write(['categories', 'budgets', 'planned'], (tx) => {
    archived.forEach((c) => tx.objectStore('categories').put(c));
    removedIds.forEach((id) => tx.objectStore('categories').delete(id));
    budgetIds.forEach((id) => tx.objectStore('budgets').delete(id));
    plannedIds.forEach((id) => tx.objectStore('planned').delete(id));
  });

// Grava os registros só se a chave ainda não estiver marcada, tudo na mesma transação.
export const seedOnce = (key, transactions, budgets) =>
  write(['transactions', 'budgets', 'meta'], (tx) => {
    const meta = tx.objectStore('meta');
    meta.get(key).onsuccess = (event) => {
      if (event.target.result) return;
      transactions.forEach((t) => tx.objectStore('transactions').put(t));
      budgets.forEach((b) => tx.objectStore('budgets').put(b));
      meta.put(true, key);
    };
  });

// Marca uma tarefa única (como uma renomeação feita por atualização). Devolve true só na primeira vez.
export async function markOnce(key) {
  let first = false;
  await write(['meta'], (tx) => {
    const meta = tx.objectStore('meta');
    meta.get(key).onsuccess = (event) => {
      if (event.target.result) return;
      first = true;
      meta.put(true, key);
    };
  });
  return first;
}

// true se o banco foi criado do zero por esta versão do app (instalação nova).
export async function isFreshInstall() {
  const tx = (await open()).transaction('meta');
  return !!(await promisify(tx.objectStore('meta').get(FRESH_INSTALL)));
}

export const deleteRecords = (txIds, budgetIds, plannedIds = []) =>
  write(['transactions', 'budgets', 'planned'], (tx) => {
    txIds.forEach((id) => tx.objectStore('transactions').delete(id));
    budgetIds.forEach((id) => tx.objectStore('budgets').delete(id));
    plannedIds.forEach((id) => tx.objectStore('planned').delete(id));
  });

export const replaceAll = ({ transactions, categories, budgets, planned = [] }) =>
  write(['transactions', 'categories', 'budgets', 'planned'], (tx) => {
    fillStore(tx.objectStore('transactions'), transactions);
    fillStore(tx.objectStore('categories'), categories);
    fillStore(tx.objectStore('budgets'), budgets);
    fillStore(tx.objectStore('planned'), planned);
  });
