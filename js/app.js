import * as db from './db.js';
import { CATEGORY_COLORS, categoryColor, categoryIcon, fileGlyph, registerCategories } from './category-icons.js';
import { COLOR_PALETTE, DEFAULT_ICON, drawIcon, ICON_LIBRARY, PICKER_ICONS } from './icon-library.js';
import { parseVoice } from './voice.js';
import { PAIS } from './edition.js';
import { childrenOf, makeCategory, nextOrder, rootsOf } from './categories.js';
import { donutChart, hideTooltip, lineChart } from './charts.js';
import {
  addMonths, FIRST_MONTH, fmtDate, fmtMoney, fmtPlain, isTracked, monthLabel, monthOf, parseMoney, today,
} from './format.js';
import { budgetId, budgetRows, categoryTotals, donutSegments, monthTotals, monthTxs, sortTxs } from './stats.js';

const $ = (id) => document.getElementById(id);

const state = {
  txs: [],
  cats: [],
  budgets: [],
  planned: [], // despesas futuras: { id, month, categoryId, amountCents, description, createdAt }
  budgetView: 'orcamento', // caixinha escolhida na aba Orçamento: 'orcamento' ou 'futuras'
  tab: 'balanco',
  currentMonth: monthOf(today()),
  month: monthOf(today()),
  expanded: new Set(),
  // Gráfico de rosca: nível (mães ou subcategorias) e período (hoje, semana ou mês).
  chart: { level: 'sub', period: 'month', day: null }, // a rosca abre em Subcategorias (desde 21/11)
  bal: { period: 'month', day: null }, // período do card Saldo
  pop: null, // id do menu de lápis aberto (sobrevive ao render)
  monthPop: false, // All Features: faixa de meses aberta ao tocar no nome do mês
  budgetPick: null, // lista do + aberta na aba Orçamento ('main:<id>' ou 'outras')
  budgetPending: { month: null, ids: new Set() }, // escolhidas pelo +, ainda sem valor
};

const TITLES = { balanco: 'Balanço', categorias: 'Categorias', orcamento: 'Orçamento' };
const KIND_LABELS = { main: 'Principal', sub: 'Subcategoria', independent: 'Independente' };

const ICONS = {
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  chevron: 'M6 9l6 6 6-6',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  dots: 'M12 5.5v.01M12 12v.01M12 18.5v.01',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-10',
  calendar: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10.5h16M8.5 3.5v5M15.5 3.5v5',
};

function icon(name, className = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  if (className) el.setAttribute('class', className);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  el.append(path);
  return el;
}

// Elementos vêm sempre daqui: texto do usuário entra como nó de texto, nunca como HTML.
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden']);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  el.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v);
  }
  return el;
}

const findCat = (id) => state.cats.find((c) => c.id === id);
const activeRoots = () => rootsOf(state.cats).filter((c) => !c.archived);
const activeChildren = (id) => childrenOf(state.cats, id).filter((c) => !c.archived);

// Avisos

let toastTimer;

function toast(message, action) {
  const el = $('toast');
  clearTimeout(toastTimer);
  const button = action && h('button', {
    type: 'button',
    onClick: () => { el.hidden = true; action.run(); },
  }, action.label);
  el.replaceChildren(h('span', {}, message), button || '');
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 7000 : 3500);
}

function confirmDialog(title, body, okLabel) {
  const dialog = $('confirmDialog');
  $('confirmTitle').textContent = title;
  $('confirmBody').textContent = body;
  $('confirmOk').textContent = okLabel;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}

async function reload() {
  const { transactions, categories, budgets, planned } = await db.loadAll();
  const oldTxs = transactions.filter((t) => !isTracked(t.date));
  const oldBudgets = budgets.filter((b) => b.month < FIRST_MONTH);
  const oldPlanned = planned.filter((p) => p.month < FIRST_MONTH);
  if (oldTxs.length || oldBudgets.length || oldPlanned.length) {
    await db.deleteRecords(oldTxs.map((t) => t.id), oldBudgets.map((b) => b.id), oldPlanned.map((p) => p.id));
  }
  state.planned = planned.filter((p) => p.month >= FIRST_MONTH);
  state.txs = transactions.filter((t) => isTracked(t.date));
  state.cats = categories;
  registerCategories(categories);
  state.budgets = budgets.filter((b) => b.month >= FIRST_MONTH);
}

// Toda escrita passa por aqui: o que aparece na tela é sempre o que está gravado.
async function commit(action, message, undo) {
  try {
    await action();
    await reload();
    render();
    if (message) toast(message, undo);
    return true;
  } catch (error) {
    console.error(error);
    toast('Não foi possível salvar. Tente novamente.');
    return false;
  }
}

// Formulário de movimentação

let txContext = null;

function fillExpenseCategories(selected) {
  const options = activeRoots().map((root) => {
    if (root.kind === 'independent') return h('option', { value: root.id }, root.name);
    const subs = activeChildren(root.id);
    return subs.length
      ? h('optgroup', { label: root.name }, subs.map((c) => h('option', { value: c.id }, c.name)))
      : null;
  });
  const archived = findCat(selected);
  $('txCat').replaceChildren(
    h('option', { value: '' }, 'Selecione'),
    ...options.filter(Boolean),
    ...(archived?.archived ? [h('option', { value: archived.id }, archived.name)] : []),
  );
  $('txCat').value = selected ?? '';
  closeCatPicker();
  syncCatButton();
}

// Seletor de categoria com ícones. O <select> escondido continua guardando o valor.
const CHECK = 'M5 12l5 5 9-10';

function catChoice(cat, child) {
  const selected = $('txCat').value === cat.id;
  return h('button', {
    type: 'button', role: 'option', class: `cat-option ${child ? 'child' : ''} ${selected ? 'selected' : ''}`,
    'aria-selected': String(selected), 'data-value': cat.id,
    onClick: () => chooseCat(cat.id),
  },
  categoryIcon(cat.id, 'cat-icon small') ?? h('span', { class: 'cat-icon small placeholder', 'aria-hidden': 'true' }),
  h('span', { class: 'cat-option-name' }, cat.name),
  selected ? checkIcon() : null);
}

function checkIcon() {
  const el = icon('edit', 'cat-check');
  el.querySelector('path').setAttribute('d', CHECK);
  return el;
}

function renderCatPicker() {
  const groups = activeRoots().map((root) => {
    if (root.kind === 'independent') return h('div', { class: 'cat-group' }, catChoice(root, false));
    const subs = activeChildren(root.id);
    if (!subs.length) return null;
    return h('div', { class: 'cat-group' },
      h('div', { class: 'cat-group-title' },
        categoryIcon(root.id, 'cat-icon tiny'),
        h('span', {}, root.name)),
      subs.map((c) => catChoice(c, true)));
  });
  const archived = findCat($('txCat').value);
  if (!groups.some(Boolean) && !archived?.archived) {
    $('txCatList').replaceChildren(h('p', { class: 'note cat-empty' },
      'Nenhuma categoria para lançar ainda. Crie na aba Categorias uma categoria principal e as subcategorias dela.'));
    return;
  }
  $('txCatList').replaceChildren(...groups.filter(Boolean),
    ...(archived?.archived ? [h('div', { class: 'cat-group' }, catChoice(archived, false))] : []));
}

function syncCatButton() {
  const cat = findCat($('txCat').value);
  $('txCatBtn').replaceChildren(...[
    cat ? (categoryIcon(cat.id, 'cat-icon small') ?? h('span', { class: 'cat-icon small placeholder', 'aria-hidden': 'true' })) : null,
    h('span', { class: `cat-select-text ${cat ? '' : 'is-placeholder'}` }, cat ? cat.name : 'Selecione a categoria'),
    icon('chevron', 'cat-select-arrow'),
  ].filter(Boolean));
}

function openCatPicker() {
  renderCatPicker();
  $('txCatList').hidden = false;
  $('txCatBtn').setAttribute('aria-expanded', 'true');
  $('txCatBtn').classList.add('open');
  ($('txCatList').querySelector('.selected') ?? $('txCatList').querySelector('.cat-option'))?.focus();
}

function closeCatPicker() {
  $('txCatList').hidden = true;
  $('txCatBtn').setAttribute('aria-expanded', 'false');
  $('txCatBtn').classList.remove('open');
}

function chooseCat(id) {
  $('txCat').value = id;
  $('txError').textContent = '';
  syncCatButton();
  closeCatPicker();
  $('txCatBtn').focus();
}

function openTxForm(type, tx = null, voice = null) {
  closeFabMenu();
  // Despesa futura nova começa no mês em exibição, se for um mês futuro; senão, no mês atual.
  const base = !voice && state.month > state.currentMonth ? state.month : state.currentMonth;
  txContext = { type, tx, base };
  // 'planned' = despesa futura: mesmo formulário da despesa, sem data.
  const isPlanned = type === 'planned';
  const isExpense = type === 'expense' || isPlanned;
  $('txTitle').textContent = `${tx ? 'Editar' : 'Nova'} ${isPlanned ? 'despesa futura' : isExpense ? 'despesa' : 'receita'}`;
  $('txAmount').value = tx ? fmtPlain(tx.amountCents) : '';
  $('txCatField').hidden = !isExpense;
  if (isExpense) fillExpenseCategories(tx?.categoryId);
  $('txDesc').placeholder = isExpense ? 'Ex.: corrida até a faculdade' : 'Ex.: salário, venda da rifa';
  $('txDesc').value = tx?.description ?? '';
  // A data é automática no cadastro; só aparece para corrigir uma movimentação já registrada.
  $('txDateField').hidden = !tx || isPlanned;
  // Repetir em meses seguintes: só no cadastro de uma despesa futura nova.
  $('txUntilField').hidden = !(isPlanned && !tx);
  if (isPlanned && !tx) fillUntil(voice?.untilMonth, voice?.dates ?? []);
  else $('txUntilNote').hidden = true;
  $('txDate').value = tx?.date ?? '';
  $('txDate').max = today();
  $('txDate').min = `${FIRST_MONTH}-01`;
  // Despesa futura com data (Personalizada): a data aparece na edição e pode ir para o futuro.
  if (isPlanned && tx?.date) {
    $('txDateField').hidden = false;
    $('txDate').min = tx.date < today() ? tx.date : today();
    $('txDate').max = datesMax();
  }
  $('txError').textContent = '';
  $('txDelete').hidden = !tx;
  $('txHeard').hidden = !voice;
  renderTxPayBox(type === 'expense' && !tx && !voice);
  if (voice) fillFromVoice(voice, isExpense);
  syncUntilNote();
  $('txDialog').showModal();
  if (!voice) $('txAmount').focus();
  else if (!voice.amountCents) $('txAmount').focus();
  else if (isExpense && !voice.categoryId) $('txCatBtn').focus();
  else $('txForm').querySelector('button[type="submit"]').focus();
}

// Cadastro por voz: o formulário abre preenchido e a pessoa só confirma.

function fillFromVoice(voice, isExpense) {
  $('txHeard').replaceChildren(`Ouvi: “${voice.heard}”`);
  // "1795" pode ser R$ 17,95 ou R$ 1.795,00: o app escolhe o primeiro e oferece trocar com um toque.
  if (voice.ambiguousCents) {
    const other = voice.ambiguousCents;
    const swap = h('button', {
      type: 'button', class: 'voice-swap', id: 'txAmountSwap',
      onClick: () => {
        const showing = parseMoney($('txAmount').value);
        const next = showing === other ? voice.amountCents : other;
        $('txAmount').value = fmtPlain(next);
        swap.textContent = `Era ${fmtMoney(next === other ? voice.amountCents : other)}?`;
      },
    }, `Era ${fmtMoney(other)}?`);
    $('txHeard').append(h('span', { class: 'voice-check' }, `Entendi ${fmtMoney(voice.amountCents)}. `, swap));
  }
  if (voice.amountCents) $('txAmount').value = fmtPlain(voice.amountCents);
  if (isExpense) fillExpenseCategories(voice.categoryId ?? undefined);
  $('txDesc').value = voice.description;
}

const voiceChoices = () => activeRoots().flatMap((root) => (root.kind === 'independent' ? [root] : activeChildren(root.id)));

// Modo rápido: aberto pelo widget da tela inicial, mostra só o cadastro e fecha ao terminar.
const QUICK = new URLSearchParams(location.search).get('voz') === '1';
let quickMessage = '';

function closeQuick(message = '') {
  if (!QUICK) return;
  if (window.AndroidApp?.close) window.AndroidApp.close(message);
  else if (message) toast(message);
}

function handleVoice(text) {
  if (!text || !text.trim()) {
    if (QUICK) closeQuick('Não entendi. Toque no microfone e tente de novo.');
    else toast('Não entendi. Toque no microfone e tente de novo.');
    return;
  }
  const mains = activeRoots().filter((r) => r.kind === 'main').map((r) => ({ ...r, subs: activeChildren(r.id) }));
  // Versão dos pais: sem despesas futuras, a voz só lança receita ou despesa.
  const result = parseVoice(text, voiceChoices(), mains, { month: state.currentMonth, planned: !PAIS });
  if (result.type === 'payPlanned') { openPayDialog(result); return; }
  openTxForm(result.type, null, result);
}

function startVoice() {
  closeFabMenu();
  if (window.AndroidApp?.startVoice) {
    window.AndroidApp.startVoice();
    return;
  }
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) {
    toast('Reconhecimento de voz não disponível neste aparelho.');
    return;
  }
  const rec = new Recognition();
  rec.lang = 'pt-BR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => handleVoice(e.results[0]?.[0]?.transcript ?? '');
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Permita o uso do microfone para cadastrar por voz.');
    else if (e.error !== 'aborted') toast('Não entendi. Toque no microfone e tente de novo.');
  };
  toast('Pode falar… Ex.: “Uber 25”');
  rec.start();
}

// O app Android chama estas funções quando o reconhecedor de voz do aparelho termina.
window.onVoiceResult = (text) => handleVoice(text);
window.onVoiceError = (message) => (QUICK ? closeQuick(message) : toast(message));
window.onVoiceCancel = () => closeQuick();

// Valor digitado como no caixa eletrônico: os números entram pela direita e a vírgula fica sempre
// antes dos dois últimos ("1" → 0,01, "123" → 1,23, "123456" → 1.234,56). Até R$ 999.999.999,99.
const AMOUNT_DIGITS = 11;
function maskAmount(input) {
  const digits = input.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, AMOUNT_DIGITS);
  input.value = digits ? fmtPlain(Number(digits)) : '';
  // O cursor fica sempre no fim, onde os números entram.
  try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* alguns tipos de campo não aceitam */ }
}

async function submitTx(event) {
  event.preventDefault();
  const { type, tx: original } = txContext;
  if (type === 'planned') return submitPlanned(original);
  const amountCents = parseMoney($('txAmount').value);
  const categoryId = type === 'expense' ? $('txCat').value : null;
  const date = original ? $('txDate').value : today();
  const description = $('txDesc').value.trim();
  const fail = (message) => { $('txError').textContent = message; };

  if (!amountCents) return fail('Digite um valor maior que zero, como 1.234,56.');
  if (type === 'expense' && !categoryId) return fail('Escolha a categoria da despesa.');
  if (!date) return fail('Informe a data.');
  if (date > today()) return fail('A data não pode estar no futuro.');
  if (!isTracked(date)) return fail(`A data não pode ser anterior a ${monthLabel(FIRST_MONTH)}.`);

  const tx = {
    description: '',
    ...original,
    id: original?.id ?? crypto.randomUUID(),
    createdAt: original?.createdAt ?? Date.now(),
    type,
    amountCents,
    date,
    categoryId,
    description,
  };
  const saved = await commit(async () => {
    await db.putTx(tx);
    state.month = monthOf(date);
  }, `Salvo em ${monthLabel(monthOf(date))}.`);
  if (saved) {
    quickMessage = `${type === 'expense' ? 'Despesa' : 'Receita'} salva: ${fmtMoney(amountCents)}`;
    $('txDialog').close();
    navigator.storage?.persist?.();
  }
}

// Repetir da despesa futura nova: "Não repetir", "Mensalmente" (até um mês) ou "Personalizada" (datas avulsas).
const UNTIL_MAX = 24;
const untilBase = () => txContext?.base ?? state.currentMonth;
const repeatMode = () => txContext?.repeat ?? 'once';
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
// Datas da opção Personalizada: de hoje (ou do 1º dia do mês futuro em exibição) até 24 meses à frente.
const datesMin = () => (untilBase() > state.currentMonth ? `${untilBase()}-01` : today());
const datesMax = () => `${addMonths(untilBase(), UNTIL_MAX - 1)}-${String(daysIn(addMonths(untilBase(), UNTIL_MAX - 1))).padStart(2, '0')}`;

function fillUntil(selected, dates = []) {
  const base = untilBase();
  const valid = selected && selected > base && selected <= addMonths(base, UNTIL_MAX - 1);
  $('txUntil').min = addMonths(base, 1);
  $('txUntil').max = addMonths(base, UNTIL_MAX - 1);
  $('txUntil').value = valid ? selected : '';
  $('txDates').replaceChildren();
  dates.forEach((d) => addDateRow(d));
  setRepeat(dates.length ? 'custom' : valid ? 'monthly' : 'once');
}

function setRepeat(mode) {
  txContext.repeat = mode;
  for (const btn of $('txRepeatSeg').querySelectorAll('button')) btn.setAttribute('aria-selected', String(btn.dataset.mode === mode));
  $('txUntilWrap').hidden = mode !== 'monthly';
  $('txDatesWrap').hidden = mode !== 'custom';
  if (mode === 'monthly' && !$('txUntil').value) $('txUntil').value = $('txUntil').min;
  if (mode === 'custom' && !$('txDates').children.length) addDateRow('');
  syncUntilNote();
}

function addDateRow(value) {
  const input = h('input', {
    type: 'date', class: 'tx-date-item', value, min: datesMin(), max: datesMax(), 'aria-label': 'Data da despesa',
    onChange: syncUntilNote, onInput: syncUntilNote,
  });
  const row = h('div', { class: 'date-row' }, input,
    h('button', {
      type: 'button', class: 'icon-btn', 'aria-label': 'Remover data',
      onClick: () => { row.remove(); if (!$('txDates').children.length) addDateRow(''); syncUntilNote(); },
    }, '×'));
  $('txDates').append(row);
  return input;
}

const customDates = () => [...new Set([...$('txDates').querySelectorAll('input')].map((i) => i.value).filter(isDate))].sort();

const untilMonths = () => {
  const base = untilBase();
  const until = repeatMode() === 'monthly' && /^\d{4}-\d{2}$/.test($('txUntil').value) ? $('txUntil').value : base;
  const last = until > addMonths(base, UNTIL_MAX - 1) ? addMonths(base, UNTIL_MAX - 1) : until;
  const months = [];
  for (let m = base; m <= last; m = addMonths(m, 1)) months.push(m);
  return months.length ? months : [base];
};

// Cada lançamento que será criado: { month } ou, na Personalizada, { month, date }.
const plannedSlots = () => (repeatMode() === 'custom'
  ? customDates().map((date) => ({ month: monthOf(date), date }))
  : untilMonths().map((month) => ({ month })));

function syncUntilNote() {
  if ($('txUntilField').hidden) return;
  const slots = plannedSlots();
  const cents = parseMoney($('txAmount').value);
  const total = cents ? `: ${fmtMoney(cents * slots.length)} no total` : '';
  let text = '';
  if (repeatMode() === 'custom' && slots.length) {
    text = `${slots.length} ${slots.length === 1 ? 'lançamento' : 'lançamentos'} (${slots.map((s) => shortDate(s.date)).join(', ')})${total}.`;
  } else if (slots.length > 1) {
    text = `${slots.length} lançamentos, de ${monthLabel(slots[0].month)} a ${monthLabel(slots.at(-1).month)}${total}.`;
  }
  $('txUntilNote').hidden = !text;
  $('txUntilNote').textContent = text;
}

// Despesas futuras: valem para o mês atual (ou se repetem nos próximos) e já descontam do saldo previsto.
async function submitPlanned(original) {
  const amountCents = parseMoney($('txAmount').value);
  const categoryId = $('txCat').value;
  const fail = (message) => { $('txError').textContent = message; };
  if (!amountCents) return fail('Digite um valor maior que zero, como 1.234,56.');
  if (!categoryId) return fail('Escolha a categoria da despesa.');
  const description = $('txDesc').value.trim();
  if (original) {
    const planned = { ...original, categoryId, amountCents, description };
    if (original.date) {
      const date = $('txDate').value;
      if (!isDate(date)) return fail('Informe a data.');
      planned.date = date;
      planned.month = monthOf(date);
    }
    if (await commit(() => db.putPlanned(planned), 'Despesa futura atualizada.')) {
      quickMessage = `Despesa futura salva: ${fmtMoney(amountCents)}`;
      $('txDialog').close();
    }
    return;
  }
  const mode = repeatMode();
  if (mode === 'monthly') {
    const until = $('txUntil').value;
    if (!/^\d{4}-\d{2}$/.test(until) || until <= untilBase()) return fail(`Escolha até que mês repetir (depois de ${monthLabel(untilBase())}).`);
    if (until > addMonths(untilBase(), UNTIL_MAX - 1)) return fail(`Dá para repetir por até ${UNTIL_MAX} meses (até ${monthLabel(addMonths(untilBase(), UNTIL_MAX - 1))}).`);
  }
  if (mode === 'custom') {
    const dates = customDates();
    if (!dates.length) return fail('Escolha pelo menos uma data.');
    if (dates[0] < datesMin()) return fail(`As datas precisam ser a partir de ${fmtDate(datesMin())}.`);
    if (dates.at(-1) > datesMax()) return fail(`As datas podem ir até ${fmtDate(datesMax())}.`);
  }
  const slots = plannedSlots();
  const seriesId = slots.length > 1 ? crypto.randomUUID() : null;
  const now = Date.now();
  const items = slots.map((slot, i) => ({
    id: crypto.randomUUID(), createdAt: now + i, ...slot, categoryId, amountCents, description,
    ...(seriesId ? { seriesId, part: i + 1, parts: slots.length } : {}),
  }));
  const last = slots.at(-1);
  const message = slots.length > 1
    ? (mode === 'custom' ? `${slots.length} despesas futuras salvas.` : `${slots.length} despesas futuras salvas, até ${monthLabel(last.month)}.`)
    : 'Despesa futura salva.';
  if (await commit(() => db.putPlannedMany(items), message)) {
    quickMessage = slots.length > 1
      ? (mode === 'custom'
        ? `Despesa futura salva: ${slots.length}× ${fmtMoney(amountCents)}`
        : `Despesa futura salva: ${fmtMoney(amountCents)} por mês até ${monthLabel(last.month)}`)
      : `Despesa futura salva: ${fmtMoney(amountCents)}`;
    $('txDialog').close();
    navigator.storage?.persist?.();
  }
}

async function removePlanned(p) {
  await commit(() => db.deletePlanned(p.id), 'Despesa futura excluída.', {
    label: 'Desfazer',
    run: () => commit(() => db.putPlanned(p), 'Despesa futura restaurada.'),
  });
}

// "Paguei": vira uma despesa de verdade com a data de hoje e sai da lista de futuras.
async function payPlanned(p) {
  const tx = {
    id: crypto.randomUUID(), createdAt: Date.now(), type: 'expense', amountCents: p.amountCents,
    date: today(), categoryId: p.categoryId, description: p.description ?? '',
  };
  return commit(() => db.payPlanned(p.id, tx), `Despesa lançada: ${fmtMoney(p.amountCents)}`, {
    label: 'Desfazer',
    run: () => commit(() => db.unpayPlanned(p, tx.id), 'Voltou para despesas futuras.'),
  });
}

const plannedOf = (month) => state.planned.filter((p) => p.month === month);

// Pagar uma despesa futura com um toque: pela caixinha no formulário de despesa ou pela voz ("pagar despesa futura").
const plannedSort = (a, b) => (a.date ?? `${a.month}-99`).localeCompare(b.date ?? `${b.month}-99`) || a.createdAt - b.createdAt;
const duePlanned = () => state.planned.filter((p) => p.month <= state.currentMonth).sort(plannedSort);
const laterPlanned = () => state.planned.filter((p) => p.month > state.currentMonth).sort(plannedSort);
let payMessage = '';

function payChoice(p, onPaid) {
  const cat = findCat(p.categoryId);
  const when = p.date ? `Dia ${shortDate(p.date)}` : p.month < state.currentMonth ? monthLabel(p.month) : '';
  const meta = [when, p.description, p.parts ? `${p.part}/${p.parts}` : ''].filter(Boolean).join(' · ');
  return h('button', {
    type: 'button', class: 'pay-choice', 'data-pay': p.id, 'aria-label': `Pagar ${cat?.name ?? 'despesa'} ${fmtMoney(p.amountCents)}`,
    onClick: async (e) => {
      e.currentTarget.disabled = true;
      if (await payPlanned(p)) onPaid(p);
    },
  },
  categoryIcon(p.categoryId, 'cat-icon small') ?? h('span', { class: 'cat-icon small placeholder', 'aria-hidden': 'true' }),
  h('span', { class: 'pay-text' }, h('span', { class: 'pay-name' }, cat?.name ?? 'Sem categoria'), meta ? h('span', { class: 'pay-meta' }, meta) : null),
  h('span', { class: 'pay-value' }, fmtMoney(p.amountCents)));
}

// Caixinha no topo do formulário de despesa nova: despesas futuras deste mês (e as atrasadas).
function renderTxPayBox(show) {
  const due = show ? duePlanned() : [];
  $('txPayBox').hidden = !due.length;
  if (!due.length) { $('txPayBox').replaceChildren(); return; }
  $('txPayBox').replaceChildren(
    h('p', { class: 'pay-box-title' }, 'Pagando uma despesa futura? Toque para lançar'),
    h('div', { class: 'pay-list' }, due.map((p) => payChoice(p, (paid) => {
      quickMessage = `Despesa paga: ${fmtMoney(paid.amountCents)}`;
      $('txDialog').close();
    }))));
}

function renderPayDialog(filterCat) {
  // Categoria dita na voz filtra a lista, se houver alguma despesa futura dela; senão mostra todas.
  const useFilter = filterCat && state.planned.some((p) => p.categoryId === filterCat);
  const pick = (list) => (useFilter ? list.filter((p) => p.categoryId === filterCat) : list);
  const due = pick(duePlanned());
  const later = pick(laterPlanned());
  const onPaid = (paid) => { payMessage = `Despesa paga: ${fmtMoney(paid.amountCents)}`; $('payDialog').close(); };
  $('payBody').replaceChildren(...[
    !due.length && !later.length ? empty('Nenhuma despesa futura cadastrada.') : null,
    due.length ? h('p', { class: 'pay-section' }, 'Deste mês') : null,
    due.length ? h('div', { class: 'pay-list' }, due.map((p) => payChoice(p, onPaid))) : null,
    later.length ? h('p', { class: 'pay-section' }, 'Próximos meses') : null,
    later.length ? h('div', { class: 'pay-list' }, later.map((p) => payChoice(p, onPaid))) : null,
  ].filter(Boolean));
}

function openPayDialog(voice = null) {
  closeFabMenu();
  payMessage = '';
  $('payHeard').hidden = !voice;
  if (voice) $('payHeard').replaceChildren(`Ouvi: “${voice.heard}”`);
  renderPayDialog(voice?.categoryId ?? null);
  $('payDialog').showModal();
}
const plannedTotal = (month) => plannedOf(month).reduce((sum, p) => sum + p.amountCents, 0);

async function removeEditingTx() {
  const { tx, type } = txContext;
  if (type === 'planned') {
    $('txDialog').close();
    await removePlanned(tx);
    return;
  }
  $('txDialog').close();
  await commit(() => db.deleteTx(tx.id), 'Movimentação excluída.', {
    label: 'Desfazer',
    run: () => commit(() => db.putTx(tx), 'Movimentação restaurada.'),
  });
}

function setFabMenu(open) {
  $('fabMenu').hidden = !open;
  $('fab').setAttribute('aria-expanded', String(open));
}

const closeFabMenu = () => setFabMenu(false);

// Peças das telas

// Meses futuros: dá para avançar e ver as despesas futuras já cadastradas (até 10 anos à frente).
const FUTURE_LIMIT = PAIS ? 0 : 120; // versão dos pais: sem meses futuros
const isFuture = () => state.month > state.currentMonth;

// Meses da faixa de escolha: do primeiro mês até 12 meses à frente (ou até a última despesa futura).
function stripMonths() {
  const lastPlanned = state.planned.reduce((max, p) => (p.month > max ? p.month : max), '');
  let last = addMonths(state.currentMonth, PAIS ? 0 : 12);
  if (!PAIS && lastPlanned > last) last = lastPlanned;
  if (state.month > last) last = state.month;
  const months = [];
  for (let m = FIRST_MONTH; m <= last; m = addMonths(m, 1)) months.push(m);
  return months;
}

const pickMonth = (m) => { if (m !== state.month) { state.month = m; render(); } };

// All Features: faixa retangular só com os nomes dos meses; arraste para os lados para trocar (ou toque num mês).
function monthStrip() {
  return h('div', { class: 'month-strip', id: 'monthStrip', role: 'listbox', 'aria-label': 'Escolher o mês' },
    stripMonths().map((m) => {
      const selected = m === state.month;
      const [y, mm] = m.split('-').map(Number);
      const name = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(y, mm - 1, 1));
      return h('button', {
        type: 'button', role: 'option', class: `month-chip ${selected ? 'selected' : ''} ${m === state.currentMonth ? 'is-current' : ''}`,
        'aria-selected': String(selected), 'data-month': m, onClick: () => { if (!stripDragged) pickMonth(m); },
      }, h('span', { class: 'month-chip-name' }, name[0].toUpperCase() + name.slice(1)), h('span', { class: 'month-chip-year' }, String(y)));
    }));
}

// Depois de desenhar: centraliza o mês escolhido e liga o arrastar (dedo rola sozinho; mouse arrasta aqui).
let stripDragged = false;
let stripSettle = null;
function wireMonthStrip() {
  const strip = $('monthStrip');
  if (!strip) return;
  const center = () => strip.scrollLeft + strip.clientWidth / 2;
  const chipAt = () => [...strip.children].reduce((best, c) => {
    const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center());
    return !best || d < best.d ? { c, d } : best;
  }, null)?.c;
  const sel = strip.querySelector('.selected');
  if (sel) strip.scrollLeft = sel.offsetLeft + sel.offsetWidth / 2 - strip.clientWidth / 2;
  let ignore = true; // a rolagem acima não conta como escolha
  requestAnimationFrame(() => { ignore = false; });
  strip.addEventListener('scroll', () => {
    if (ignore) return;
    clearTimeout(stripSettle);
    // Quando o arraste para, o mês no centro vira o mês escolhido.
    stripSettle = setTimeout(() => { const c = chipAt(); if (c) pickMonth(c.dataset.month); }, 180);
  });
  // Mouse (Chrome no PC): arrastar com o botão pressionado. No celular o dedo já rola a faixa.
  let start = null;
  strip.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    start = { x: e.clientX, left: strip.scrollLeft, id: e.pointerId }; stripDragged = false;
  });
  strip.addEventListener('pointermove', (e) => {
    if (!start) return;
    if (!stripDragged && Math.abs(e.clientX - start.x) <= 4) return; // ainda é um clique
    if (!stripDragged) {
      stripDragged = true;
      // Só captura o mouse quando vira arraste: capturar antes mandaria o clique para a faixa, não para o mês.
      try { strip.setPointerCapture(start.id); } catch { /* sem captura, o arraste para ao sair da faixa */ }
    }
    strip.scrollLeft = start.left - (e.clientX - start.x);
  });
  const end = () => { start = null; setTimeout(() => { stripDragged = false; }, 0); };
  strip.addEventListener('pointerup', end);
  strip.addEventListener('pointercancel', end);
}

function monthBar({ compare = true } = {}) {
  const go = (n) => () => { state.month = addMonths(state.month, n); render(); };
  // Sem setinhas à vista (continuam para leitores de tela e teclado); o nome do mês abre a faixa de meses.
  // Nas duas versões; na Low Features a faixa vai só até o mês atual.
  const arrow = 'icon-btn sr-only';
  return h('div', { class: 'month month-swipe' },
    h('button', { class: arrow, type: 'button', id: 'prevMonth', 'aria-label': 'Mês anterior', disabled: state.month <= FIRST_MONTH, onClick: go(-1) }, icon('prev')),
    h('h1', { id: 'monthLabel', 'aria-live': 'polite' }, h('button', {
        type: 'button', class: 'month-label-btn', id: 'monthBtn', 'aria-haspopup': 'listbox', 'aria-expanded': String(state.monthPop),
        'aria-controls': 'monthStrip', title: 'Trocar o mês',
        onClick: () => { state.monthPop = !state.monthPop; render(); },
      }, monthLabel(state.month))),
    h('button', { class: arrow, type: 'button', id: 'nextMonth', 'aria-label': 'Próximo mês', disabled: state.month >= addMonths(state.currentMonth, FUTURE_LIMIT), onClick: go(1) }, icon('next')),
    state.monthPop ? monthStrip() : null,
    isFuture()
      ? h('div', { class: 'month-actions' },
        h('button', { class: 'compare-btn today-btn', type: 'button', id: 'todayBtn', onClick: () => { state.month = state.currentMonth; render(); } }, 'Voltar ao mês atual'))
      : compare
      ? h('div', { class: 'month-actions' },
        h('button', { class: 'compare-btn', type: 'button', id: 'compareBtn', 'aria-haspopup': 'dialog', onClick: () => openCompare() }, 'Comparar'))
      : null);
}

// Comparar meses

// extra: meses a mais só no gráfico (até 3), além do mês em análise e do mês comparado.
const CMP_MAX_EXTRA = 3;
// pickOpen: lista de meses aberta (escolha do mês para comparar).
const compare = { other: null, type: 'expense', extra: [], pickOpen: false };

function trackedMonths() {
  const months = [];
  for (let m = FIRST_MONTH; m <= state.currentMonth; m = addMonths(m, 1)) months.push(m);
  return months;
}

const daysIn = (month) => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };

// Valor acumulado por dia (despesas ou receitas); o mês em andamento para no dia de hoje.
function dailyCumulative(month, type = 'expense') {
  const perDay = new Array(daysIn(month)).fill(0);
  for (const t of state.txs) {
    if (t.type === type && monthOf(t.date) === month) perDay[Number(t.date.slice(8, 10)) - 1] += t.amountCents;
  }
  const last = month === state.currentMonth ? Number(today().slice(8, 10)) : perDay.length;
  let sum = 0;
  return perDay.slice(0, last).map((v) => (sum += v));
}

// As três subcategorias (ou categorias sem filhas) com maior gasto no mês.
function topCategories(month) {
  const spent = new Map();
  for (const t of state.txs) {
    if (t.type === 'expense' && monthOf(t.date) === month) spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + t.amountCents);
  }
  return [...spent].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, total]) => ({ id, total, name: findCat(id)?.name ?? 'Sem categoria' }));
}

// "Outubro"; com o ano só quando é de outro ano que o mês em análise.
const shortMonth = (month) => (month.slice(0, 4) === state.month.slice(0, 4) ? monthLabel(month).replace(/ de \d{4}$/, '') : monthLabel(month));

// Receitas não têm categoria: mostra as três maiores entradas do mês.
function topIncomes(month) {
  return state.txs.filter((t) => t.type === 'income' && monthOf(t.date) === month)
    .sort((a, b) => b.amountCents - a.amountCents).slice(0, 3)
    .map((t) => ({ id: 'receita', total: t.amountCents, name: t.description || 'Receita' }));
}

function compareColumn(month, color) {
  const isIncome = compare.type === 'income';
  const tops = isIncome ? topIncomes(month) : topCategories(month);
  return h('div', { class: 'cmp-col' },
    h('p', { class: 'cmp-col-title' }, h('span', { class: 'cmp-dot', style: `background:${color}` }), shortMonth(month)),
    tops.length
      ? h('ol', { class: 'cmp-top' }, tops.map((c) => h('li', {},
        categoryIcon(c.id, 'cat-icon small') ?? h('span', { class: 'cat-icon small is-placeholder' }),
        h('span', { class: 'cmp-top-text' }, h('span', { class: 'cmp-top-name' }, c.name), h('span', { class: 'cmp-top-value' }, fmtMoney(c.total))))))
      : h('p', { class: 'cmp-none' }, isIncome ? 'Sem receitas' : 'Sem despesas'));
}

// Mais meses no gráfico: chips dos meses que sobram (nem o em análise nem o comparado).
function extraChips(base, other, extra) {
  const rest = trackedMonths().filter((m) => m !== base && m !== other).reverse();
  if (!rest.length) return null;
  const full = extra.length >= CMP_MAX_EXTRA;
  return h('div', { class: 'cmp-extra' },
    h('p', { class: 'cmp-extra-title' }, 'Mais meses no gráfico'),
    h('div', { class: 'cmp-chips', id: 'cmpExtra' }, rest.map((m) => {
      const on = extra.includes(m);
      return h('button', {
        type: 'button', class: `chip ${on ? 'on' : ''}`, 'data-month': m, 'aria-pressed': String(on), disabled: !on && full,
        onClick: () => { compare.extra = on ? extra.filter((x) => x !== m) : [...extra, m]; renderCompare(); },
      }, on ? h('span', { class: 'cmp-dot', style: `background:var(--series-${extra.indexOf(m) + 3})` }) : null, shortMonth(m));
    })));
}

function renderCompare() {
  const base = state.month;
  const other = compare.other;
  const colors = { base: 'var(--series-1)', other: 'var(--series-2)' };
  const type = compare.type;
  const isIncome = type === 'income';
  const baseTotal = monthTotals(state.txs, base)[type];
  const otherTotal = other ? monthTotals(state.txs, other)[type] : 0;
  const options = trackedMonths().filter((m) => m !== base);
  const extra = compare.extra.filter((m) => m !== base && m !== other && options.includes(m));

  // Mês para comparar: texto com setinha (sem caixa) que abre a lista de meses, no estilo do seletor de categoria.
  const picker = h('button', {
    type: 'button', class: `cmp-pick ${compare.pickOpen ? 'open' : ''}`, id: 'cmpMonth', 'data-value': other ?? '',
    'aria-haspopup': 'listbox', 'aria-expanded': String(compare.pickOpen), 'aria-controls': 'cmpMonthList', 'aria-label': `Mês para comparar: ${other ? monthLabel(other) : ''}`,
    onClick: () => { compare.pickOpen = !compare.pickOpen; renderCompare(); },
  },
  h('span', { class: 'cmp-dot', style: `background:${colors.other}` }),
  h('span', { class: 'cmp-pick-text' }, other ? shortMonth(other) : ''),
  icon('chevron', 'cat-select-arrow'));
  const monthList = compare.pickOpen && other
    ? h('div', { class: 'cat-picker cmp-month-list', id: 'cmpMonthList', role: 'listbox', 'aria-label': 'Meses para comparar' },
      [...options].reverse().map((m) => {
        const selected = m === other;
        return h('button', {
          type: 'button', role: 'option', class: `cat-option ${selected ? 'selected' : ''}`, 'aria-selected': String(selected), 'data-value': m,
          onClick: () => { compare.other = m; compare.pickOpen = false; renderCompare(); },
        }, h('span', { class: 'cat-option-name' }, monthLabel(m)), selected ? checkIcon() : null);
      }))
    : null;

  const diff = baseTotal - otherTotal;
  const verdict = !other ? null
    : diff === 0 ? 'Mesmo gasto nos dois meses.'
      : `${isIncome ? 'Recebeu' : 'Gastou'} ${fmtMoney(Math.abs(diff))} ${diff > 0 ? 'a mais' : 'a menos'} que em ${shortMonth(other)}.`;
  // Verde quando é bom: gastar menos ou receber mais.
  const good = isIncome ? diff > 0 : diff < 0;
  const typeBtn = (value, label) => h('button', {
    type: 'button', role: 'tab', id: value === 'expense' ? 'cmpExpense' : 'cmpIncome', 'aria-selected': String(type === value),
    onClick: () => { if (compare.type !== value) { compare.type = value; renderCompare(); } },
  }, label);

  $('cmpBody').replaceChildren(...[
    h('div', { class: 'cmp-months' },
      h('div', { class: 'cmp-total' },
        h('span', { class: 'cmp-total-label' }, h('span', { class: 'cmp-dot', style: `background:${colors.base}` }), shortMonth(base)),
        h('strong', { id: 'cmpBaseTotal' }, fmtMoney(baseTotal))),
      h('div', { class: 'cmp-total' },
        other ? picker : h('span', { class: 'cmp-total-label' }, 'Nenhum outro mês ainda'),
        h('strong', { id: 'cmpOtherTotal' }, other ? fmtMoney(otherTotal) : '—'))),
    monthList,
    verdict ? h('p', { class: `cmp-verdict ${diff === 0 ? '' : good ? 'down' : 'up'}`, id: 'cmpVerdict' }, verdict) : null,
    h('div', { class: 'seg cmp-type', role: 'tablist', 'aria-label': 'O que comparar' }, typeBtn('expense', 'Despesas'), typeBtn('income', 'Receitas')),
    h('p', { class: 'cmp-chart-title' }, isIncome ? 'Receita acumulada no mês' : 'Gasto acumulado no mês'),
    lineChart([
      ...extra.map((m, i) => ({ name: monthLabel(m), color: `var(--series-${i + 3})`, points: dailyCumulative(m, type) })),
      ...(other ? [{ name: monthLabel(other), color: colors.other, points: dailyCumulative(other, type) }] : []),
      { name: monthLabel(base), color: colors.base, points: dailyCumulative(base, type) },
    ], 31),
    h('p', { class: 'cmp-chart-foot' }, 'Dia do mês'),
    extraChips(base, other, extra),
    h('h3', { class: 'sub-list-title' }, isIncome ? 'Maiores receitas' : 'Categorias que mais gastaram'),
    h('div', { class: 'cmp-cols' }, compareColumn(base, colors.base), other ? compareColumn(other, colors.other) : null),
  ].filter(Boolean));
}

function openCompare() {
  const options = trackedMonths().filter((m) => m !== state.month);
  const previous = addMonths(state.month, -1);
  compare.pickOpen = false;
  if (!options.includes(compare.other)) compare.other = options.includes(previous) ? previous : options[options.length - 1] ?? null;
  renderCompare();
  $('cmpDialog').showModal();
  $('cmpClose').focus();
}

const empty = (text) => h('p', { class: 'empty' }, text);

// No card do Balanço a linha só mostra; na janela de editar ela vira botão com lápis.
function historyRow(t, editable = false) {
  const isIncome = t.type === 'income';
  const category = findCat(t.categoryId);
  const parent = findCat(category?.parentId);
  const meta = parent ? `${parent.name} · ${fmtDate(t.date)}` : fmtDate(t.date);
  const name = isIncome ? 'Receita' : category?.name ?? 'Sem categoria';
  const props = editable
    ? { class: 'tx-row', type: 'button', 'aria-label': `Editar ${name}, ${fmtMoney(t.amountCents)}, ${fmtDate(t.date)}`, onClick: () => openTxForm(t.type, t) }
    : { class: 'tx-row static' };
  return h('li', {}, h(editable ? 'button' : 'div', props,
  categoryIcon(isIncome ? 'receita' : t.categoryId) || h('span', { class: `badge-icon ${t.type}` }, icon(isIncome ? 'up' : 'down')),
  h('span', { class: 'tx-main' }, h('span', { class: 'tx-name' }, name),
    t.description ? h('span', { class: 'tx-desc' }, t.description) : null,
    h('span', { class: 'tx-meta' }, meta)),
  h('span', { class: `tx-value ${t.type}` }, `${isIncome ? '+' : '−'} ${fmtMoney(t.amountCents)}`),
  editable ? icon('edit', 'tx-edit') : null));
}

// Janela com só as receitas ou só as despesas do período do Saldo.
let typeOpen = null;

function renderTypeDialog() {
  const type = typeOpen;
  const period = effectivePeriod(state.bal);
  const suffix = { today: 'de hoje', week: 'da semana', month: 'do mês', day: `de ${shortDate(state.bal.day)}` }[period];
  const txs = sortTxs(chartTxs(period, state.bal.day).filter((t) => t.type === type));
  const total = txs.reduce((sum, t) => sum + t.amountCents, 0);
  const name = type === 'income' ? 'Receitas' : 'Despesas';
  $('typeTitle').replaceChildren(h('span', { class: `badge-icon ${type} small` }, icon(type === 'income' ? 'up' : 'down')), h('span', {}, `${name} ${suffix}`));
  $('typeBody').replaceChildren(
    h('div', { class: 'sub-summary' },
      h('p', { class: 'sub-summary-label' }, `${txs.length} ${txs.length === 1 ? 'movimentação' : 'movimentações'}`),
      h('p', { class: `sub-summary-value ${type}`, id: 'typeTotal' }, fmtMoney(total))),
    txs.length
      ? h('ul', { class: 'tx-list type-list' }, txs.map((t) => historyRow(t)))
      : empty(type === 'income' ? 'Nenhuma receita neste período.' : 'Nenhuma despesa neste período.'));
}

function openTypeDialog(type) {
  typeOpen = type;
  renderTypeDialog();
  $('typeDialog').showModal();
  $('typeClose').focus();
}

// Backup: um arquivo .json com tudo o que está gravado no aparelho (movimentações, categorias e orçamentos).
function setAppMenu(open) {
  $('appMenu').hidden = !open;
  $('appMenuBtn').setAttribute('aria-expanded', String(open));
}

async function makeBackup() {
  setAppMenu(false);
  try {
    const { transactions, categories, budgets, planned } = await db.loadAll();
    const data = {
      app: 'financas-pessoais', formato: 1, criadoEm: new Date().toISOString(),
      resumo: { movimentacoes: transactions.length, categorias: categories.length, orcamentos: budgets.length, despesasFuturas: planned.length },
      transactions: sortTxs(transactions), categories, budgets, planned,
    };
    const name = `financas-backup-${today()}.json`;
    const text = JSON.stringify(data, null, 2);
    if (window.AndroidApp?.saveFile) {
      // O Android abre a tela "Salvar como"; o resultado volta em onNativeFileSaved.
      window.AndroidApp.saveFile(name, 'application/json', text);
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = h('a', { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Backup gerado: ${name}`);
  } catch (error) {
    console.error(error);
    toast('Não foi possível gerar o backup.');
  }
}

window.onNativeFileSaved = (saved) => toast(saved ? 'Backup salvo.' : 'Backup cancelado.');

// Menu de três pontinhos do card Histórico e a janela de edição.
function setHistMenu(open) {
  const menu = $('histMenu');
  if (!menu) return;
  menu.hidden = !open;
  $('histMore').setAttribute('aria-expanded', String(open));
}

function renderHistEdit() {
  const history = monthTxs(state.txs, state.month);
  $('histSub').textContent = `${monthLabel(state.month)} · toque em uma movimentação para editar`;
  $('histBody').replaceChildren(history.length
    ? h('ul', { class: 'tx-list' }, history.map((t) => historyRow(t, true)))
    : empty('Nenhuma movimentação neste mês.'));
}

function openHistEdit() {
  setHistMenu(false);
  renderHistEdit();
  $('histDialog').showModal();
  $('histClose').focus();
}

// Telas

function viewBalanco() {
  const history = monthTxs(state.txs, state.month);
  // Tocar em Receitas ou Despesas abre só essas movimentações, no mesmo período do Saldo.
  const tile = (type, label, value) => h('button', {
    type: 'button', class: 'card tile', id: `tile-${type}`, 'aria-haspopup': 'dialog', 'aria-label': `${label}: ${fmtMoney(value)}. Ver movimentações`,
    onClick: () => openTypeDialog(type),
  },
  h('span', { class: `badge-icon ${type}` }, icon(type === 'income' ? 'up' : 'down')),
  h('div', {}, h('p', { class: 'tile-label' }, label), h('p', { class: 'tile-value' }, fmtMoney(value))));

  const balPeriod = effectivePeriod(state.bal);
  const periodTxs = chartTxs(balPeriod, state.bal.day);
  const balance = periodTxs.reduce((sum, t) => sum + (t.type === 'income' ? t.amountCents : -t.amountCents), 0);
  // Saldo, Receitas e Despesas seguem o período escolhido na setinha do Saldo.
  const suffix = { today: 'de hoje', week: 'da semana', month: 'do mês', day: `de ${shortDate(state.bal.day)}` }[balPeriod];
  const heroLabel = `Saldo ${suffix}`;
  const sumOf = (type) => periodTxs.filter((t) => t.type === type).reduce((sum, t) => sum + t.amountCents, 0);

  return [
    monthBar(),
    h('section', { class: 'card hero' },
      editPop('balPop', 'Período do saldo',
        h('p', { class: 'pop-title' }, 'Período'),
        periodPicker(state.bal, 'balDay', 'Período do saldo')),
      h('p', { class: 'hero-label' }, heroLabel),
      h('div', { class: 'hero-row' },
        h('p', { class: `hero-value ${balance < 0 ? 'negative' : ''}`, id: 'balance' }, fmtMoney(balance)),
        // Só no período do mês: o saldo depois de pagar as despesas futuras, transparente, logo abaixo do saldo.
        balPeriod === 'month' && plannedTotal(state.month)
          ? h('p', {
            class: `hero-projected ${balance - plannedTotal(state.month) < 0 ? 'negative' : ''}`, id: 'balanceProjected',
            'aria-label': `Depois das despesas futuras: ${fmtMoney(balance - plannedTotal(state.month))}`,
          }, h('span', { class: 'hero-projected-value' }, fmtMoney(balance - plannedTotal(state.month))),
          h('span', { class: 'hero-projected-label' }, 'previsto'))
          : null)),
    h('div', { class: 'tiles' },
      tile('income', `Receitas ${suffix}`, sumOf('income')),
      tile('expense', `Despesas ${suffix}`, sumOf('expense'))),
    h('section', { class: 'card', id: 'history' },
      h('div', { class: 'hist-head' },
        h('h2', {}, 'Histórico'),
        h('button', {
          class: 'icon-btn hist-more', type: 'button', id: 'histMore', 'aria-label': 'Opções do histórico', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
          onClick: (e) => { e.stopPropagation(); setHistMenu($('histMenu').hidden); },
        }, icon('dots')),
        h('div', { class: 'hist-menu', id: 'histMenu', role: 'menu', hidden: true },
          h('button', { type: 'button', role: 'menuitem', id: 'histEdit', onClick: openHistEdit }, icon('edit'), h('span', {}, 'Editar')))),
      history.length
        ? h('ul', { class: 'tx-list' }, history.map((t) => historyRow(t)))
        : empty('Nenhuma movimentação neste mês.')),
  ];
}

function toggleCard(card, button, cat) {
  const open = card.classList.toggle('open');
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', `${open ? 'Recolher' : 'Expandir'} ${cat.name}`);
  if (open) state.expanded.add(cat.id);
  else state.expanded.delete(cat.id);
}

// Quanto das despesas futuras do mês em exibição cai em cada categoria (a principal soma as filhas).
function committedOf(cat) {
  const ids = cat.kind === 'main' ? new Set(childrenOf(state.cats, cat.id).map((c) => c.id)) : new Set([cat.id]);
  return plannedOf(state.month).filter((p) => ids.has(p.categoryId)).reduce((sum, p) => sum + p.amountCents, 0);
}

function categoryCard(group, color) {
  const { cat, total, children } = group;
  // O comprometido aparece só onde a despesa futura foi cadastrada: na subcategoria (linha dela) ou na
  // categoria independente (este card). O card da categoria principal não mostra.
  const committed = cat.kind === 'main' ? 0 : committedOf(cat);
  const open = state.expanded.has(cat.id);
  const hasChildren = children.length > 0;
  const card = h('section', { class: `card cat-card ${open ? 'open' : ''}`, 'data-category': cat.id });
  const bodyId = `body-${cat.id}`;
  const arrow = hasChildren
    ? h('button', {
      class: 'icon-btn cat-arrow', type: 'button',
      'aria-expanded': String(open), 'aria-controls': bodyId,
      'aria-label': `${open ? 'Recolher' : 'Expandir'} ${cat.name}`,
      onClick: (e) => toggleCard(card, e.currentTarget, cat),
    }, icon('chevron'))
    : h('span', { class: 'cat-spacer' });
  card.append(h('div', { class: 'cat-head' },
    categoryIcon(cat.id) ?? h('i', { class: 'key', style: `background:${color}` }),
    h('h2', { class: 'cat-title' }, cat.name),
    h('span', { class: 'cat-total' }, fmtMoney(total),
      committed ? h('span', { class: 'cat-committed', 'aria-label': `mais ${fmtMoney(committed)} em despesas futuras` }, `+${fmtMoney(committed)} comprometido`) : null),
    arrow));
  if (hasChildren) {
    card.append(h('div', { class: 'cat-body', id: bodyId }, h('div', {}, children.map((c) => subRow(c)))));
  }
  return card;
}

// Barra do orçamento. O comprometido em despesas futuras do mês enche a barra como se já tivesse sido gasto.
// A cor e a porcentagem já contam o comprometido: verde até 70%, laranja de 70% a 100%, vermelho acima.
function budgetBar(spent, budget, committed = 0) {
  if (!budget) {
    return h('span', { class: 'sub-bar none' },
      h('span', { class: 'sub-pct' }, 'Sem orçamento'),
      h('span', { class: 'sub-track' }),
      committed ? h('span', { class: 'sub-committed-note' }, `+${fmtMoney(committed)} comprometido`) : null);
  }
  const spentPct = (spent / budget) * 100;
  const pct = ((spent + committed) / budget) * 100;
  const level = pct > 100 ? 'high' : pct >= 70 ? 'mid' : 'low';
  const spentW = Math.min(spentPct, 100);
  const label = committed
    ? `${Math.round(spentPct)}% gasto e ${Math.round(pct - spentPct)}% comprometido em despesas futuras`
    : `${Math.round(pct)}% do orçamento usado`;
  return h('span', { class: `sub-bar ${level} ${committed ? 'has-committed' : ''}`, role: 'img', 'aria-label': label },
    h('span', { class: 'sub-pct' }, `${Math.round(pct)}%`),
    h('span', { class: 'sub-track' },
      h('span', { class: 'sub-fill', style: `width:${spentW}%` }),
      committed ? h('span', { class: 'sub-fill committed', style: `left:${spentW}%;width:${Math.max(0, Math.min(pct, 100) - spentW)}%` }) : null),
    committed ? h('span', { class: 'sub-committed-note' }, `+${fmtMoney(committed)} comprometido`) : null);
}

// Despesas da subcategoria no mês, com valor e detalhes.
function subHistory(cat) {
  const txs = sortTxs(state.txs.filter((t) => t.type === 'expense' && t.categoryId === cat.id && monthOf(t.date) === state.month));
  if (!txs.length) return h('p', { class: 'sub-empty' }, 'Nenhuma despesa neste mês.');
  return h('ul', { class: 'sub-txs' }, txs.map((t) => h('li', { class: 'sub-tx' },
    h('span', { class: 'sub-tx-main' },
      h('span', { class: `sub-tx-desc ${t.description ? '' : 'none'}` }, t.description || 'Sem detalhes'),
      h('span', { class: 'sub-tx-date' }, fmtDate(t.date))),
    h('span', { class: 'sub-tx-value' }, fmtMoney(t.amountCents)))));
}

const budgetIn = (month, cat) => state.budgets.find((b) => b.id === budgetId(month, cat.id))?.cents ?? null;
// Mês futuro ainda sem orçamento próprio usa o do mês atual como referência, para a barra encher com o comprometido.
const budgetOf = (cat) => budgetIn(state.month, cat) ?? (isFuture() ? budgetIn(state.currentMonth, cat) : null);
const budgetIsReference = (cat) => budgetIn(state.month, cat) === null && budgetOf(cat) !== null;

// Janela da subcategoria: total gasto no mês e cada despesa com valor e detalhes.
function openSubDialog(cat, total) {
  const budget = budgetOf(cat);
  const planned = plannedOf(state.month).filter((p) => p.categoryId === cat.id).sort(plannedSort);
  const committed = planned.reduce((sum, p) => sum + p.amountCents, 0);
  $('subTitle').replaceChildren(categoryIcon(cat.id, 'cat-icon small') ?? '', h('span', {}, cat.name));
  $('subBody').replaceChildren(...[
    h('div', { class: 'sub-summary' },
      h('p', { class: 'sub-summary-label' }, `Total gasto em ${monthLabel(state.month)}`),
      h('p', { class: 'sub-summary-value', id: 'subTotal' }, fmtMoney(total)),
      committed ? h('p', { class: 'sub-summary-committed', id: 'subCommitted' }, `+${fmtMoney(committed)} comprometido em despesas futuras`) : null,
      budget ? h('div', { class: 'sub-summary-budget' }, budgetBar(total, budget, committed),
        h('span', {}, budgetIsReference(cat) ? `Orçamento: ${fmtMoney(budget)} (referência: ${monthLabel(state.currentMonth)})` : `Orçamento: ${fmtMoney(budget)}`),
        h('span', {}, budget - total - committed >= 0 ? `Livre: ${fmtMoney(budget - total - committed)}` : `Passa ${fmtMoney(total + committed - budget)} do orçamento`)) : null),
    planned.length ? h('h3', { class: 'sub-list-title' }, 'Despesas futuras') : null,
    planned.length ? h('ul', { class: 'sub-txs' }, planned.map((p) => h('li', { class: 'sub-tx planned' },
      h('span', { class: 'sub-tx-main' },
        h('span', { class: `sub-tx-desc ${p.description ? '' : 'none'}` }, p.description || 'Sem detalhes'),
        h('span', { class: 'sub-tx-date' }, [p.date ? fmtDate(p.date) : 'Neste mês', p.parts ? `${p.part}/${p.parts}` : ''].filter(Boolean).join(' · '))),
      h('span', { class: 'sub-tx-value' }, fmtMoney(p.amountCents))))) : null,
    h('h3', { class: 'sub-list-title' }, 'Registros'),
    subHistory(cat)].filter(Boolean));
  $('subDialog').showModal();
  $('subClose').focus();
}

function subRow({ cat, total }) {
  return h('div', { class: 'sub-item', 'data-sub': cat.id },
    h('button', {
      type: 'button', class: 'sub-row', 'aria-haspopup': 'dialog', 'aria-label': `${cat.name}: ver despesas do mês`,
      onClick: () => openSubDialog(cat, total),
    },
    h('span', { class: 'sub-name' }, categoryIcon(cat.id, 'cat-icon small'), h('span', { class: 'sub-label' }, cat.name)),
    // Versão dos pais não tem orçamento: no lugar da barra, o valor gasto no mês.
    PAIS ? h('span', { class: 'sub-value' }, fmtMoney(total)) : budgetBar(total, budgetOf(cat), committedOf(cat))));
}

// Semana de segunda a domingo; pode começar no mês anterior.
function weekStart(date) {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return today(day);
}

const PERIODS = { today: 'Hoje', week: 'Esta semana', month: 'Mês' };

const shortDate = (date) => (date ? fmtDate(date).slice(0, 5) : '');

// Hoje e Esta semana só existem no mês em andamento; o dia escolhido precisa ser do mês em exibição.
function effectivePeriod(sel) {
  if (sel.period === 'day') return sel.day && monthOf(sel.day) === state.month ? 'day' : 'month';
  return state.month === state.currentMonth ? sel.period : 'month';
}

// Hoje | Esta semana | Mês | 📅. O calendário abre o seletor de data do celular.
function periodPicker(sel, dateId, label) {
  const isCurrent = state.month === state.currentMonth;
  const period = effectivePeriod(sel);
  const options = isCurrent ? PERIODS : { month: 'Mês' };
  const openPicker = () => { const input = $(dateId); try { input?.showPicker?.(); } catch { input?.focus(); } };
  const seg = h('div', { class: 'seg chart-seg', role: 'tablist', 'aria-label': label },
    Object.entries(options).map(([value, text]) => h('button', {
      type: 'button', role: 'tab', 'data-value': value, 'aria-selected': String(value === period),
      onClick: () => { state.pop = null; sel.period = value; render(); },
    }, text)),
    h('button', {
      type: 'button', role: 'tab', class: 'seg-icon', 'data-value': 'day', 'aria-label': 'Escolher um dia', 'aria-selected': String(period === 'day'),
      onClick: () => {
        sel.period = 'day';
        if (!sel.day || monthOf(sel.day) !== state.month) sel.day = isCurrent ? today() : `${state.month}-01`;
        render();
        openPicker();
      },
    }, icon('calendar')));
  const dateInput = period === 'day'
    ? h('label', { class: 'pop-date' }, h('span', {}, 'Dia'),
      h('input', {
        type: 'date', id: dateId, value: sel.day, min: `${state.month}-01`, max: isCurrent ? today() : `${state.month}-${String(daysIn(state.month)).padStart(2, '0')}`,
        onChange: (e) => { if (e.target.value) { sel.day = e.target.value; state.pop = null; render(); } },
      }))
    : null;
  return [seg, dateInput];
}

// Movimentações do período escolhido (hoje, esta semana, um dia ou o mês em exibição).
function chartTxs(period, day = null) {
  const now = today();
  if (period === 'day') return state.txs.filter((t) => t.date === day);
  if (period === 'today') return state.txs.filter((t) => t.date === now);
  if (period === 'week') { const start = weekStart(now); return state.txs.filter((t) => t.date >= start && t.date <= now); }
  return state.txs.filter((t) => monthOf(t.date) === state.month);
}

// Fatias por subcategoria (e categorias independentes), da maior para a menor.
function subSegments(txs) {
  const spent = new Map();
  for (const t of txs) if (t.type === 'expense') spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + t.amountCents);
  const sum = [...spent.values()].reduce((a, b) => a + b, 0);
  const sorted = [...spent].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const own = sorted.slice(0, sorted.length > 8 ? 7 : 8).map(([id, total], i) => ({
    id, name: findCat(id)?.name ?? 'Sem categoria', total, share: total / sum,
    color: CATEGORY_COLORS[id] ?? `var(--series-${i + 1})`,
  }));
  const rest = sorted.slice(own.length).reduce((a, [, v]) => a + v, 0);
  return rest ? [...own, { id: 'outras', name: 'Outras', total: rest, share: rest / sum, color: 'var(--muted)' }] : own;
}

// Setinha pequena no canto do card que abre um menu com as opções.
function editPop(id, label, ...content) {
  const open = state.pop === id;
  return h('div', { class: 'pop-wrap' },
    h('button', {
      class: 'icon-btn pop-btn', type: 'button', id: `${id}Btn`, 'aria-label': label, 'aria-haspopup': 'true', 'aria-expanded': String(open),
      onClick: () => { state.pop = open ? null : id; render(); },
    }, icon('chevron')),
    open ? h('div', { class: 'pop-menu', id }, ...content) : null);
}

function chartSeg(options, current, onPick, label) {
  return h('div', { class: 'seg chart-seg', role: 'tablist', 'aria-label': label },
    Object.entries(options).map(([value, text]) => h('button', {
      type: 'button', role: 'tab', 'data-value': value, 'aria-selected': String(value === current),
      // Escolher fecha o menu.
      onClick: () => { state.pop = null; if (value !== current) onPick(value); render(); },
    }, text)));
}

// Cor fixa da fatia: a de CATEGORY_COLORS ou a que a pessoa escolheu para a categoria.
const fixedColor = (s) => {
  const color = CATEGORY_COLORS[s.id] ?? findCat(s.id)?.color;
  return color ? { ...s, color } : s;
};

// Aba vazia (instalação nova): explica e já leva para a criação.
function openNewCategory(preset) {
  if (!$('manageDialog').open) { $('manageDialog').showModal(); renderManage(); }
  openCatForm(null, preset);
}

const welcomeCard = () => h('section', { class: 'card welcome-card' },
  h('h2', {}, 'Crie suas categorias'),
  h('p', { class: 'note' }, 'Comece com uma categoria principal (por exemplo, Casa) e depois crie as subcategorias dentro dela (Aluguel, Luz, Internet). As subcategorias usam a mesma cor da principal.'),
  h('button', { class: 'btn primary', type: 'button', id: 'welcomeNew', onClick: () => openNewCategory() }, '+ Nova categoria'));

function viewCategorias() {
  const groups = categoryTotals(state.txs, state.month, state.cats);
  const rootCount = rootsOf(state.cats).length;
  const monthSegments = donutSegments(groups, rootCount).map(fixedColor);
  const colorOf = (g) => monthSegments.find((s) => s.id === g.cat.id)?.color ??
    (g.slot < (rootCount > 8 ? 7 : 8) ? `var(--series-${g.slot + 1})` : 'var(--muted)');

  const period = effectivePeriod(state.chart);
  const txs = chartTxs(period, state.chart.day);
  const segments = state.chart.level === 'sub'
    ? subSegments(txs)
    : donutSegments(categoryTotals(txs, null, state.cats), rootCount).map(fixedColor);
  const total = txs.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amountCents, 0);
  const emptyText = { today: 'Nenhuma despesa hoje.', week: 'Nenhuma despesa nesta semana.', month: 'Nenhuma despesa neste mês.', day: `Nenhuma despesa em ${shortDate(state.chart.day)}.` }[period];

  if (!activeRoots().length && !groups.length) return [monthBar(), welcomeCard()];

  return [
    monthBar(),
    h('section', { class: 'card donut-card' },
      editPop('chartPop', 'Opções do gráfico',
        h('p', { class: 'pop-title' }, 'Mostrar'),
        chartSeg({ main: 'Categorias', sub: 'Subcategorias' }, state.chart.level, (v) => { state.chart.level = v; }, 'Detalhe do gráfico'),
        h('p', { class: 'pop-title' }, 'Período'),
        periodPicker(state.chart, 'chartDay', 'Período do gráfico')),
      donutChart(segments, total, period === 'month' ? 'Despesas' : period === 'day' ? shortDate(state.chart.day) : PERIODS[period]),
      segments.length
        ? h('div', { class: 'legend', id: 'chartLegend' }, segments.map((s) => h('div', { class: 'legend-row' },
          h('i', { class: 'key', style: `background:${s.color}` }),
          h('span', {}, s.name),
        )))
        : h('p', { class: 'note' }, emptyText)),
    groups.map((g) => categoryCard(g, colorOf(g))),
  ];
}

// Painel: categorias

let catContext = null;

function fillParents(selected) {
  $('catParent').replaceChildren(...activeRoots()
    .filter((c) => c.kind === 'main')
    .map((c) => h('option', { value: c.id }, c.name)));
  if (selected) $('catParent').value = selected;
  closeParentPicker();
  syncParentButton();
}

// Mesmo seletor bonito do formulário de despesa, com os ícones das categorias principais.
const parentIcon = (cat) => categoryIcon(cat.id, 'cat-icon small') ?? h('span', { class: 'cat-icon small placeholder', 'aria-hidden': 'true' });

function syncParentButton() {
  const cat = findCat($('catParent').value);
  $('catParentBtn').replaceChildren(...[
    cat ? parentIcon(cat) : null,
    h('span', { class: `cat-select-text ${cat ? '' : 'is-placeholder'}` }, cat ? cat.name : 'Selecione a categoria'),
    icon('chevron', 'cat-select-arrow'),
  ].filter(Boolean));
}

function openParentPicker() {
  const current = $('catParent').value;
  $('catParentList').replaceChildren(h('div', { class: 'cat-group' }, activeRoots().filter((c) => c.kind === 'main').map((cat) => {
    const selected = cat.id === current;
    return h('button', {
      type: 'button', role: 'option', class: `cat-option ${selected ? 'selected' : ''}`, 'aria-selected': String(selected), 'data-value': cat.id,
      onClick: () => { $('catParent').value = cat.id; syncParentButton(); closeParentPicker(); syncCatForm(); $('catParentBtn').focus(); },
    }, parentIcon(cat), h('span', { class: 'cat-option-name' }, cat.name), selected ? checkIcon() : null);
  })));
  $('catParentList').hidden = false;
  $('catParentBtn').setAttribute('aria-expanded', 'true');
  $('catParentBtn').classList.add('open');
  ($('catParentList').querySelector('.selected') ?? $('catParentList').querySelector('.cat-option'))?.focus();
}

function closeParentPicker() {
  $('catParentList').hidden = true;
  $('catParentBtn').setAttribute('aria-expanded', 'false');
  $('catParentBtn').classList.remove('open');
}

const selectedKind = () => $('catForm').elements.catKind.value;
const formKind = () => catContext?.cat?.kind ?? selectedKind();
const FALLBACK_COLOR = '#475569';

// Cor que o ícone vai ter: subcategoria herda a da principal escolhida; as outras usam a cor marcada.
function formColor() {
  if (formKind() === 'sub') return categoryColor($('catParent').value) ?? FALLBACK_COLOR;
  return catContext.color;
}

// Sugere uma cor que nenhuma outra categoria principal ou independente esteja usando.
function suggestColor() {
  const used = new Set(activeRoots().map((c) => categoryColor(c.id)));
  return (COLOR_PALETTE.find(([color]) => !used.has(color)) ?? COLOR_PALETTE[activeRoots().length % COLOR_PALETTE.length])[0];
}

function renderColorGrid() {
  $('catColors').replaceChildren(...COLOR_PALETTE.map(([color, label]) => {
    const selected = color === catContext.color;
    return h('button', {
      type: 'button', role: 'radio', class: `color-choice ${selected ? 'selected' : ''}`, 'aria-checked': String(selected),
      'aria-label': label, style: `--swatch:${color}`,
      onClick: () => { catContext.color = color; renderColorGrid(); renderIconGrid(); },
    });
  }));
}

function renderIconGrid() {
  const color = formColor();
  const scroll = $('catIcons').scrollTop;
  // Versão dos pais: só os 21 ícones da lista reduzida (o ícone atual da categoria entra também). A versão normal mostra os 52.
  const keys = new Set(PAIS ? PICKER_ICONS : ICON_LIBRARY.map(([key]) => key));
  if (catContext.icon) keys.add(catContext.icon);
  $('catIcons').replaceChildren(...ICON_LIBRARY.filter(([key]) => keys.has(key)).map(([key, label]) => {
    const selected = key === catContext.icon;
    return h('button', {
      type: 'button', role: 'radio', class: `icon-choice ${selected ? 'selected' : ''}`, 'aria-checked': String(selected),
      'aria-label': label, title: label, 'data-icon': key,
      onClick: (e) => pickIcon(key, e.currentTarget),
    }, drawIcon(key, color, 'icon-choice-svg'));
  }));
  $('catIcons').scrollTop = scroll;
}

// Marca o ícone sem redesenhar a grade (mantém a rolagem e o toque).
function pickIcon(key, button) {
  catContext.icon = key;
  for (const el of $('catIcons').children) {
    const on = el === button;
    el.classList.toggle('selected', on);
    el.setAttribute('aria-checked', String(on));
  }
}

function syncCatForm() {
  const isSub = formKind() === 'sub';
  $('catParentField').hidden = !isSub;
  $('catColorField').hidden = isSub;
  const parent = findCat($('catParent').value);
  $('catColorNote').hidden = !isSub;
  $('catColorNote').textContent = parent
    ? `A cor é a mesma de "${parent.name}". Para mudar, edite a categoria principal.`
    : 'A subcategoria usa a mesma cor da categoria principal.';
  renderIconGrid();
}

// preset: { kind, parentId } para abrir já como subcategoria de uma principal.
function openCatForm(cat = null, preset = {}) {
  catContext = {
    cat,
    // Categorias antigas sem ícone escolhido continuam com o desenho de antes até a pessoa marcar um.
    icon: cat ? cat.icon ?? null : DEFAULT_ICON,
    color: (cat && cat.kind !== 'sub' ? categoryColor(cat.id) : null) ?? suggestColor(),
  };
  $('catForm').reset();
  if (!cat && preset.kind) $('catForm').elements.catKind.value = preset.kind;
  $('catTitle').textContent = cat ? 'Editar categoria' : preset.kind === 'sub' ? 'Nova subcategoria' : 'Nova categoria';
  $('catKindField').hidden = !!cat;
  $('catName').value = cat?.name ?? '';
  $('catError').textContent = '';
  fillParents(cat?.parentId ?? preset.parentId);
  renderColorGrid();
  syncCatForm();
  $('catDialog').showModal();
  $('catIcons').scrollTop = 0;
  $('catName').focus();
}

async function submitCat(event) {
  event.preventDefault();
  const { cat } = catContext;
  const kind = formKind();
  const name = $('catName').value.trim();
  const parentId = kind === 'sub' ? $('catParent').value : null;
  const fail = (message) => { $('catError').textContent = message; };

  if (!name) return fail('Digite o nome da categoria.');
  if (kind === 'sub' && !parentId) return fail('Crie uma categoria principal primeiro.');
  const duplicate = state.cats.some((c) => !c.archived && c.id !== cat?.id && c.parentId === parentId &&
    c.name.toLowerCase() === name.toLowerCase());
  if (duplicate) return fail('Já existe uma categoria com esse nome aqui.');

  const base = cat ? { ...cat, name, parentId } : makeCategory(crypto.randomUUID(), name, kind, parentId, nextOrder(state.cats));
  if (catContext.icon) base.icon = catContext.icon;
  // Subcategoria não guarda cor: ela sempre segue a principal, mesmo se a principal mudar de cor depois.
  if (kind === 'sub') delete base.color;
  else base.color = catContext.color;
  if (await commit(() => db.putCategory(base), cat ? 'Categoria atualizada.' : 'Categoria criada.')) {
    $('catDialog').close();
  }
}

async function removeCategory(cat) {
  const family = [cat, ...childrenOf(state.cats, cat.id)];
  const familyIds = new Set(family.map((c) => c.id));
  const linked = state.txs.filter((t) => familyIds.has(t.categoryId));
  const subs = family.length - 1;

  if (linked.length || subs) {
    const parts = [];
    if (subs) parts.push(`${subs} ${subs === 1 ? 'subcategoria será excluída' : 'subcategorias serão excluídas'} junto.`);
    if (linked.length) {
      parts.push(`${linked.length} ${linked.length === 1 ? 'movimentação continuará' : 'movimentações continuarão'} no histórico e nos totais dos meses em que ${linked.length === 1 ? 'foi registrada' : 'foram registradas'}.`);
    }
    if (!await confirmDialog(`Excluir "${cat.name}"?`, parts.join(' '), 'Excluir')) return;
  }

  const usedIds = new Set(linked.map((t) => t.categoryId));
  const keep = (c) => usedIds.has(c.id) || family.some((f) => f.parentId === c.id && usedIds.has(f.id));
  const archived = family.filter(keep).map((c) => ({ ...c, archived: true }));
  const removedIds = family.filter((c) => !keep(c)).map((c) => c.id);
  const budgetIds = state.budgets.filter((b) => removedIds.includes(b.categoryId)).map((b) => b.id);
  // Despesas futuras de categorias que saem de vez também saem (não há mais onde lançá-las).
  const plannedIds = state.planned.filter((p) => familyIds.has(p.categoryId)).map((p) => p.id);
  await commit(() => db.removeCategories({ archived, removedIds, budgetIds, plannedIds }), 'Categoria excluída.');
}

function manageRow(cat, child) {
  return h('div', { class: `manage-row ${child ? 'child' : ''}`, 'data-manage': cat.id },
    categoryIcon(cat.id, 'cat-icon small') ?? h('span', { class: 'cat-icon small placeholder', 'aria-hidden': 'true' }),
    h('span', { class: 'manage-text' },
      h('span', { class: 'manage-name' }, cat.name),
      cat.kind === 'main' ? h('span', { class: 'tag' }, KIND_LABELS.main) : null),
    cat.kind === 'main'
      ? h('button', { class: 'icon-btn add-sub', type: 'button', 'aria-label': `Nova subcategoria em ${cat.name}`, title: 'Nova subcategoria', onClick: () => openCatForm(null, { kind: 'sub', parentId: cat.id }) }, icon('plus'))
      : null,
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Editar ${cat.name}`, onClick: () => openCatForm(cat) }, icon('edit')),
    h('button', { class: 'icon-btn delete', type: 'button', 'aria-label': `Excluir ${cat.name}`, onClick: () => removeCategory(cat) }, icon('trash')));
}

const panelCategorias = () => [
  // Sem nenhuma categoria (primeira vez no app): o botão fica centralizado, com um aviso curto embaixo.
  h('div', { class: `panel-actions ${activeRoots().length ? '' : 'is-empty'}` },
    h('button', { class: 'btn primary', type: 'button', id: 'newCategory', onClick: () => openCatForm() }, '+ Nova categoria'),
    activeRoots().some((c) => c.kind === 'main')
      ? h('button', { class: 'btn', type: 'button', id: 'newSubcategory', onClick: () => openCatForm(null, { kind: 'sub' }) }, '+ Nova subcategoria')
      : null),
  activeRoots().length ? null : h('p', { class: 'note manage-empty' }, 'Nenhuma categoria ainda. Cadastre uma categoria para ela aparecer aqui.'),
  activeRoots().flatMap((root) => [
    manageRow(root, false),
    ...activeChildren(root.id).map((c) => manageRow(c, true)),
  ]),
];

// Aba: orçamento

function saveBudget(cat, input) {
  if (state.month !== state.currentMonth) return; // mês encerrado: orçamento só para consulta
  const raw = input.value.trim();
  const id = budgetId(state.month, cat.id);
  const current = state.budgets.find((b) => b.id === id);
  const cents = raw ? parseMoney(raw) : null;
  if (raw && !cents) {
    input.value = current ? fmtPlain(current.cents) : '';
    toast('Orçamento inválido. Use um valor como 500,00.');
    return;
  }
  if (cents === (current?.cents ?? null)) return;
  // Depois de salvar (ou apagar), a linha passa a seguir só o orçamento gravado: apagar o valor tira da lista.
  state.budgetPending.ids.delete(cat.id);
  commit(() => (cents
    ? db.putBudgets([{ id, month: state.month, categoryId: cat.id, cents }])
    : db.deleteBudget(id)));
}

function copyPreviousBudgets(previous) {
  const copies = previous.map((b) => ({ ...b, id: budgetId(state.month, b.categoryId), month: state.month }));
  commit(() => db.putBudgets(copies), 'Orçamentos copiados.');
}

// As duas caixinhas logo abaixo do mês: Orçamento e Despesas futuras.
function budgetSwitch() {
  const pick = (view) => () => { state.budgetView = view; render(); };
  const tab = (view, id, label) => h('button', {
    type: 'button', role: 'tab', id, 'aria-selected': String(state.budgetView === view), onClick: pick(view),
  }, label);
  return h('div', { class: 'seg budget-switch', role: 'tablist', 'aria-label': 'Orçamento ou despesas futuras' },
    tab('orcamento', 'budgetViewLimits', 'Orçamento'),
    tab('futuras', 'budgetViewFuture', 'Despesas futuras'));
}

function plannedRow(p, editable, canPay = editable) {
  const cat = findCat(p.categoryId);
  return h('li', { class: 'planned-row', 'data-planned': p.id },
    categoryIcon(p.categoryId, 'cat-icon small') ?? h('span', { class: 'cat-icon small placeholder', 'aria-hidden': 'true' }),
    h('span', { class: 'planned-text' },
      h('span', { class: 'planned-cat' }, cat?.name ?? 'Sem categoria'),
      p.description || p.parts || p.date ? h('span', { class: 'planned-desc' }, [p.date ? `Dia ${shortDate(p.date)}` : '', p.description, p.parts ? `${p.part}/${p.parts}` : ''].filter(Boolean).join(' · ')) : null),
    h('span', { class: 'planned-value' }, fmtMoney(p.amountCents)),
    editable
      ? h('span', { class: 'planned-actions' },
        canPay ? h('button', { class: 'icon-btn pay', type: 'button', 'aria-label': `Paguei ${cat?.name ?? ''}: lançar como despesa`, title: 'Paguei: lançar como despesa', onClick: () => payPlanned(p) }, icon('check')) : null,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Editar despesa futura de ${cat?.name ?? ''}`, onClick: () => openTxForm('planned', p) }, icon('edit')))
      : null);
}

// editable: mês atual (tudo) ou mês futuro (cadastrar, editar e excluir; "Paguei" só no mês atual).
function viewFuturas(editable) {
  const future = isFuture();
  const isCurrent = state.month === state.currentMonth;
  const items = plannedOf(state.month)
    .slice()
    .sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || (findCat(a.categoryId)?.order ?? 0) - (findCat(b.categoryId)?.order ?? 0) || a.createdAt - b.createdAt);
  const total = items.reduce((sum, p) => sum + p.amountCents, 0);
  return [
    editable
      ? h('div', { class: 'panel-actions planned-new' },
        h('button', { class: 'btn primary', type: 'button', id: 'newPlanned', onClick: () => openTxForm('planned') }, '+ Nova despesa futura'))
      : h('p', { class: 'note budget-note' }, 'Mês encerrado: só para consulta.'),
    h('section', { class: 'card planned-card', id: 'plannedList' },
      items.length
        ? [
          h('div', { class: 'planned-total' }, h('span', {}, 'Total previsto'), h('strong', { id: 'plannedTotal' }, fmtMoney(total))),
          h('ul', { class: 'planned-list' }, items.map((p) => plannedRow(p, editable, isCurrent))),
        ]
        : empty(future ? `Nenhuma despesa futura em ${monthLabel(state.month)}.` : editable ? 'Nenhuma despesa futura. Cadastre o que ainda vai pagar neste mês.' : 'Nenhuma despesa futura neste mês.')),
    isCurrent ? nextMonthsCard() : null,
  ];
}

// Despesas já lançadas para os próximos meses (pela repetição). Entram no saldo previsto quando o mês chegar.
function nextMonthsCard() {
  const later = state.planned.filter((p) => p.month > state.currentMonth).sort((a, b) => a.month.localeCompare(b.month) || a.createdAt - b.createdAt);
  if (!later.length) return null;
  const months = [...new Set(later.map((p) => p.month))];
  return h('section', { class: 'card planned-card', id: 'plannedNext' },
    h('h2', { class: 'planned-next-title' }, 'Próximos meses'),
    months.map((m) => {
      const items = later.filter((p) => p.month === m);
      return h('div', { class: 'planned-month', 'data-month': m },
        h('div', { class: 'planned-total' }, h('span', {}, monthLabel(m)), h('strong', {}, fmtMoney(items.reduce((s, p) => s + p.amountCents, 0)))),
        h('ul', { class: 'planned-list' }, items.map((p) => plannedRow(p, true, false))));
    }));
}

function viewOrcamento() {
  const editable = state.month === state.currentMonth;
  if (state.budgetView === 'futuras') {
    const plannedEditable = state.month >= state.currentMonth;
    if (!activeRoots().length && !plannedOf(state.month).length) {
      return [monthBar({ compare: false }), budgetSwitch(), h('section', { class: 'card' },
        h('p', { class: 'note' }, 'Nenhuma categoria ainda. Crie suas categorias na aba Categorias para cadastrar despesas futuras.'))];
    }
    return [monthBar({ compare: false }), budgetSwitch(), ...viewFuturas(plannedEditable)];
  }
  // Categoria principal não tem orçamento próprio: quem recebe valor são as subcategorias.
  const rows = budgetRows(state.txs, state.month, state.cats, state.budgets);
  const hasBudget = rows.some((r) => r.cat.kind !== 'main' && r.budget !== null);
  // Só o mês atual é editável. Meses passados mostram os limites que tiveram, sem caixa de edição.
  const before = addMonths(state.month, -1);
  const previous = state.budgets.filter((b) => {
    const cat = findCat(b.categoryId);
    return b.month === before && cat && !cat.archived && cat.kind !== 'main';
  });

  if (!rows.length) {
    return [monthBar({ compare: false }), budgetSwitch(), h('section', { class: 'card' },
      h('p', { class: 'note' }, 'Nenhuma categoria ainda. Crie suas categorias na aba Categorias para definir os orçamentos.'))];
  }

  // Só aparecem as categorias com orçamento no mês (e as que a pessoa acabou de escolher pelo +).
  const pending = state.budgetPending.month === state.month ? state.budgetPending.ids : new Set();
  const shown = (r) => r.budget !== null || (editable && pending.has(r.cat.id));
  const groups = [];
  for (const r of rows) {
    if (r.level === 0) groups.push({ root: r, kids: [] });
    else groups.at(-1)?.kids.push(r);
  }
  const free = (r) => r.budget === null && !pending.has(r.cat.id) && !r.cat.archived;
  const budgetRow = ({ cat, level, budget }) => h('div', { class: `budget-row ${level ? 'child' : ''} ${cat.kind === 'main' ? 'is-main' : ''}`, 'data-budget': cat.id },
    h('div', { class: 'budget-top' },
      categoryIcon(cat.id, 'cat-icon small') ?? h('span', { class: 'cat-icon small placeholder', 'aria-hidden': 'true' }),
      cat.kind === 'main' || !editable ? h('span', { class: 'budget-name' }, cat.name) : h('label', { for: `budget-${cat.id}` }, cat.name),
      cat.kind === 'main' ? null : !editable
        ? h('span', { class: `budget-value ${budget ? '' : 'is-empty'}`, 'aria-label': `Orçamento de ${cat.name}` }, budget ? fmtPlain(budget) : 'Sem limite')
        : h('input', {
          id: `budget-${cat.id}`, inputmode: 'decimal', autocomplete: 'off', placeholder: 'Valor',
          value: budget ? fmtPlain(budget) : '',
          'aria-label': `Orçamento de ${cat.name}`,
          onChange: (e) => saveBudget(cat, e.target),
          onKeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
          // Escolhida pelo + e deixada em branco: some de novo.
          onBlur: (e) => {
            if (budget || e.target.value.trim()) return;
            setTimeout(() => { if (pending.delete(cat.id)) render(); }, 0);
          },
        })));
  const sections = [];
  const leftover = []; // categorias sem nenhum orçamento: entram no "+ Orçamento em outra categoria"
  for (const g of groups) {
    if (g.root.cat.kind === 'main') {
      const visible = g.kids.filter(shown);
      const rest = g.kids.filter(free);
      if (!visible.length) { if (!g.root.cat.archived && rest.length) leftover.push({ root: g.root.cat, kids: rest.map((r) => r.cat) }); continue; }
      sections.push(budgetRow(g.root), ...visible.map(budgetRow));
      if (editable && rest.length) sections.push(addBudgetButton(`main:${g.root.cat.id}`, `Orçamento em outra subcategoria de ${g.root.cat.name}`, [{ root: null, kids: rest.map((r) => r.cat) }]));
    } else if (shown(g.root)) {
      sections.push(budgetRow(g.root));
    } else if (free(g.root)) {
      leftover.push({ root: null, kids: [g.root.cat] });
    }
  }

  return [
    monthBar({ compare: false }),
    budgetSwitch(),
    editable ? null : h('p', { class: 'note budget-note' }, isFuture() ? 'Mês futuro: o orçamento é definido quando o mês chegar.' : 'Mês encerrado: só para consulta.'),
    editable && !hasBudget && previous.length
      ? h('div', { class: 'panel-actions' }, h('button', {
        class: 'btn', type: 'button', id: 'copyBudgets', style: 'margin-top:10px', onClick: () => copyPreviousBudgets(previous),
      }, `Copiar de ${monthLabel(before)}`))
      : null,
    h('section', { class: 'card budget-card' },
      sections.length ? sections : h('p', { class: 'note budget-empty' }, editable ? `Nenhum orçamento em ${monthLabel(state.month)}. Toque no + para cadastrar.` : 'Nenhum orçamento neste mês.'),
      editable && leftover.length
        ? addBudgetButton('outras', sections.length ? 'Orçamento em outra categoria' : 'Cadastrar orçamento', leftover, true)
        : null),
  ];
}

// Botão + e a lista das categorias ainda sem orçamento (abre ali mesmo, no estilo do seletor de categoria).
function addBudgetButton(key, label, groups, wide = false) {
  const open = state.budgetPick === key;
  return h('div', { class: `budget-add-wrap ${wide ? 'wide' : ''}`, 'data-add': key },
    h('button', {
      type: 'button', class: `budget-add ${wide ? 'wide' : ''}`, 'aria-expanded': String(open), 'aria-label': label, title: label,
      onClick: () => { state.budgetPick = open ? null : key; render(); },
    }, icon('plus'), wide ? h('span', {}, label) : null),
    open ? h('div', { class: 'cat-picker budget-pick', role: 'listbox', 'aria-label': label },
      groups.map((g) => h('div', { class: 'cat-group' },
        g.root ? h('p', { class: 'cat-group-title' }, g.root.name) : null,
        g.kids.map((c) => h('button', {
          type: 'button', role: 'option', class: `cat-option ${g.root ? 'child' : ''}`, 'data-value': c.id,
          onClick: () => {
            if (state.budgetPending.month !== state.month) state.budgetPending = { month: state.month, ids: new Set() };
            state.budgetPending.ids.add(c.id);
            state.budgetPick = null;
            render();
            $(`budget-${c.id}`)?.focus();
          },
        }, categoryIcon(c.id, 'cat-icon small') ?? h('span', { class: 'cat-icon small placeholder', 'aria-hidden': 'true' }), h('span', { class: 'cat-option-name' }, c.name)))))) : null);
}

function renderManage() {
  if (!$('manageDialog').open) return;
  const focused = document.activeElement?.id;
  $('manageBody').replaceChildren(...panelCategorias().flat().filter(Boolean));
  if (focused) $(focused)?.focus();
}

const VIEWS = { orcamento: viewOrcamento, categorias: viewCategorias, balanco: viewBalanco };

function render() {
  hideTooltip();
  const focused = document.activeElement?.id;
  document.title = `${TITLES[state.tab]} · Finanças Pessoais`;
  const isBalanco = state.tab === 'balanco';
  $('fabWrap').hidden = !isBalanco;
  $('manageBtn').hidden = state.tab !== 'categorias';
  closeFabMenu();
  for (const [id, tab] of [['tabOrcamento', 'orcamento'], ['tabCategorias', 'categorias'], ['tabBalanco', 'balanco']]) {
    if (!$(id)) continue;
    if (tab === state.tab) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
  $('view').replaceChildren(...VIEWS[state.tab]().flat().filter(Boolean));
  wireMonthStrip();
  renderManage();
  if ($('histDialog').open) renderHistEdit();
  if ($('typeDialog').open) renderTypeDialog();
  if (focused) $(focused)?.focus();
}

// Outubro vira mês encerrado sozinho: quem estava no mês atual passa para o novo mês,
// e quem consultava um mês anterior continua onde estava.
function syncCurrentMonth() {
  const now = monthOf(today());
  if (now === state.currentMonth) return;
  if (state.month === state.currentMonth) state.month = now;
  state.currentMonth = now;
  render();
}

function setTab(tab) {
  state.tab = tab;
  render();
  scrollTo(0, 0);
}

function bindEvents() {
  $('tabOrcamento').addEventListener('click', () => setTab('orcamento'));
  $('tabCategorias').addEventListener('click', () => setTab('categorias'));
  $('tabBalanco').addEventListener('click', () => setTab('balanco'));
  $('fab').addEventListener('click', () => setFabMenu($('fabMenu').hidden));
  $('addIncome').addEventListener('click', () => openTxForm('income'));
  $('addExpense').addEventListener('click', () => openTxForm('expense'));
  $('addVoice').addEventListener('click', startVoice);
  document.addEventListener('click', (e) => {
    if (!$('fabWrap').contains(e.target)) closeFabMenu();
    if (!e.target.closest?.('#histMenu')) setHistMenu(false);
    if (!e.target.closest?.('.app-menu-wrap')) setAppMenu(false);
    // Toque fora do menu de lápis fecha. Os botões de dentro re-renderizam, então o alvo pode já ter saído da página.
    if (state.pop && e.target.isConnected && !e.target.closest('.pop-wrap')) { state.pop = null; render(); }
    // Toque fora do nome do mês e da faixa fecha a faixa de meses.
    if (state.monthPop && e.target.isConnected && !e.target.closest('#monthStrip, #monthBtn')) { state.monthPop = false; render(); }
    if (state.budgetPick && e.target.isConnected && !e.target.closest('.budget-add-wrap')) { state.budgetPick = null; render(); }
  });
  $('histClose').addEventListener('click', () => $('histDialog').close());
  $('appMenuBtn').addEventListener('click', () => setAppMenu($('appMenu').hidden));
  $('backupBtn').addEventListener('click', makeBackup);
  $('typeClose').addEventListener('click', () => $('typeDialog').close());
  $('typeDialog').addEventListener('click', (e) => { if (e.target === $('typeDialog')) $('typeDialog').close(); });
  $('histDialog').addEventListener('click', (e) => { if (e.target === $('histDialog')) $('histDialog').close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeFabMenu();
    if (state.monthPop) { state.monthPop = false; render(); }
  });

  $('txForm').addEventListener('submit', submitTx);
  $('txCatBtn').addEventListener('click', () => ($('txCatList').hidden ? openCatPicker() : closeCatPicker()));
  $('txCat').addEventListener('change', syncCatButton);
  $('catParentBtn').addEventListener('click', () => ($('catParentList').hidden ? openParentPicker() : closeParentPicker()));
  $('catDialog').addEventListener('close', closeParentPicker);
  $('txDialog').addEventListener('close', closeCatPicker);
  $('txDialog').addEventListener('close', () => {
    closeQuick(quickMessage);
    quickMessage = '';
  });
  $('txCancel').addEventListener('click', () => $('txDialog').close());
  $('payClose').addEventListener('click', () => $('payDialog').close());
  $('payDialog').addEventListener('click', (e) => { if (e.target === $('payDialog')) $('payDialog').close(); });
  $('payDialog').addEventListener('close', () => { closeQuick(payMessage); payMessage = ''; });
  $('txDelete').addEventListener('click', removeEditingTx);
  for (const btn of $('txRepeatSeg').querySelectorAll('button')) btn.addEventListener('click', () => setRepeat(btn.dataset.mode));
  $('txAddDate').addEventListener('click', () => addDateRow('').focus());
  $('txUntil').addEventListener('change', syncUntilNote);
  $('txUntil').addEventListener('input', syncUntilNote);
  $('txAmount').addEventListener('input', (e) => { maskAmount(e.target); syncUntilNote(); });

  $('subClose').addEventListener('click', () => $('subDialog').close());
  $('cmpClose').addEventListener('click', () => $('cmpDialog').close());
  $('cmpDialog').addEventListener('click', (e) => { if (e.target === $('cmpDialog')) $('cmpDialog').close(); });
  $('cmpDialog').addEventListener('close', hideTooltip);
  $('subDialog').addEventListener('click', (e) => { if (e.target === $('subDialog')) $('subDialog').close(); });
  $('manageBtn').addEventListener('click', () => { $('manageDialog').showModal(); renderManage(); });
  $('manageClose').addEventListener('click', () => $('manageDialog').close());

  $('catForm').addEventListener('submit', submitCat);
  // Só o tipo muda o formulário. Re-renderizar a cada 'change' (como o do Nome, ao perder o foco)
  // trocaria a grade de ícones no meio do toque e o ícone tocado não seria marcado.
  $('catForm').addEventListener('change', (e) => { if (e.target.name === 'catKind') syncCatForm(); });
  $('catCancel').addEventListener('click', () => $('catDialog').close());

  // Outra aba ou o app instalado pode ter gravado dados enquanto esta estava em segundo plano.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    await reload();
    render();
    syncCurrentMonth();
  });
  setInterval(syncCurrentMonth, 60_000);
}

// Desde 22/11 toda categoria é principal ou subcategoria. Uma categoria independente antiga (ex.: Emergência)
// vira uma principal com o mesmo nome, cor e ícone, e ela mesma passa a ser a subcategoria de dentro:
// mantém o id, então lançamentos, orçamentos e despesas futuras continuam apontando para ela sem mudar nada.
async function convertIndependents() {
  const olds = state.cats.filter((c) => c.kind === 'independent');
  if (!olds.length) return false;
  const used = new Set(state.cats.map((c) => c.id));
  const changes = [];
  for (const c of olds) {
    let id = `${c.id}-principal`;
    for (let i = 2; used.has(id); i++) id = `${c.id}-principal-${i}`;
    used.add(id);
    const main = {
      id, name: c.name, kind: 'main', parentId: null, order: c.order, archived: !!c.archived,
      icon: c.icon ?? fileGlyph(c.id) ?? DEFAULT_ICON,
      color: c.color ?? CATEGORY_COLORS[c.id] ?? categoryColor(c.id) ?? COLOR_PALETTE[0][0],
    };
    const { color, ...sub } = c; // a subcategoria herda a cor da principal
    changes.push(main, { ...sub, kind: 'sub', parentId: id });
  }
  await db.putCategories(changes);
  return true;
}

async function start() {
  bindEvents();
  if (!PAIS) {
    // All Features: o botão de editar categorias é uma caneta.
    const svg = $('manageBtn').querySelector('svg');
    svg.replaceChildren(icon('edit').querySelector('path'));
    $('manageBtn').setAttribute('aria-label', 'Editar categorias');
  }
  if (PAIS) {
    // Versão dos pais: só Balanço e Categorias.
    $('tabOrcamento').remove();
    delete VIEWS.orcamento;
    document.documentElement.classList.add('pais');
  }
  try {
    await reload();
    if (await convertIndependents()) await reload();
    render();
    if (QUICK) startVoice();
  } catch (error) {
    console.error(error);
    $('view').replaceChildren(h('section', { class: 'card' }, empty(
      'Não foi possível abrir seus dados. Feche outras abas do app e confira se não está em uma janela anônima.',
    )));
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.AndroidApp) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
}

start();
