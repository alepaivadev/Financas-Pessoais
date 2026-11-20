// Ações usadas pelos testes de fluxo. Atenção: esses testes apagam os dados do endereço em que rodam.
export const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export function makeReporter() {
  const log = [];
  const failures = [];
  const check = (ok, name) => { log.push(`${ok ? 'ok  ' : 'FALHA'} ${name}`); if (!ok) failures.push(name); };
  const finish = () => {
    document.getElementById('result').textContent =
      `${failures.length ? `FALHOU ${failures.length}` : 'OK'}\n${log.join('\n')}\n${failures.join('\n')}`;
  };
  return { check, finish, failures };
}

export const deleteDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.deleteDatabase('financas-pessoais');
  request.onsuccess = resolve;
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error('Feche as outras abas do app antes de rodar o teste.'));
});

export function appDriver(frame) {
  const doc = () => frame.contentDocument;
  const $ = (id) => doc().getElementById(id);
  const text = (id) => $(id)?.textContent ?? '';
  const until = async (fn) => {
    for (let i = 0; i < 80; i++) { if (fn()) return true; await wait(50); }
    return false;
  };
  const ready = () => until(() => doc()?.getElementById('balance') || doc()?.querySelector('.donut'));
  const fill = (id, value) => {
    $(id).value = value;
    $(id).dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }));
  };
  const addTx = async (type, amount, category) => {
    $('fab').click();
    $(type === 'income' ? 'addIncome' : 'addExpense').click();
    $('txAmount').value = amount;
    if (category) $('txCat').value = category;
    $('txForm').requestSubmit();
    await wait(250);
  };
  return { doc, $, text, until, ready, fill, addTx };
}
