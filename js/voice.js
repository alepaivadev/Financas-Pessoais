// Cadastro por voz: transforma a frase falada em valor, categoria e detalhes.
// Roda só no aparelho, sem IA e sem internet. Exemplos que precisam funcionar:
//   "Uber 25"  ·  "R$100, rifa faculdade"  ·  "30 vestuário, calção, moletom"  ·  "recebi 1.500 de salário"

// Remove acentos letra por letra, para que as posições do texto original e do normalizado coincidam.
const norm = (text) => [...text].map((ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || ch).join('');

// Outras formas de falar cada categoria padrão. O nome da categoria sempre vale.
const ALIASES = {
  uber: ['uber', '99', 'corrida', 'taxi', 'transporte', 'carro de aplicativo'],
  vestuario: ['vestuario', 'roupa', 'roupas'],
  academia: ['academia', 'gym', 'personal'],
  internet: ['internet', 'wifi', 'wi-fi', 'wi fi', 'fibra'],
  faculdade: ['faculdade', 'facul', 'universidade', 'mensalidade da faculdade'],
  'rifa-faculdade': ['rifa faculdade', 'rifa da faculdade', 'rifa'],
  cabelo: ['cabelo', 'cabeleireiro', 'cabeleireira', 'barbeiro', 'barbearia', 'corte de cabelo'],
  'papel-de-agua': ['papel de agua', 'conta de agua', 'agua'],
  emergencia: ['emergencia', 'reserva', 'imprevisto'],
};

// Apelidos pelo nome, para categorias criadas no app (que não têm id fixo).
const NAME_ALIASES = {
  comida: ['lanche', 'lanches'],
};

// Palavras que indicam um item comprado: escolhem a categoria, mas continuam nos detalhes.
const HINTS = {
  vestuario: ['calcao', 'calca', 'camisa', 'camiseta', 'blusa', 'moletom', 'bermuda', 'short', 'tenis', 'sapato',
    'chinelo', 'jaqueta', 'casaco', 'meia', 'meias', 'cueca', 'vestido', 'saia', 'bone'],
};

// O reconhecedor confunde "Pix" com palavras parecidas ("picos", "pica", "pics", "pique"...): todas viram "Pix".
// Vale só para a palavra inteira ("picolé", "picanha" e "pista" ficam como estão).
const PIX_WORDS = ['pix', 'pixe', 'pixi', 'pixs', 'piks', 'pics', 'picx', 'pick', 'picks', 'pik', 'pike', 'pikes', 'piki',
  'pique', 'piques', 'piqui', 'piquis', 'pico', 'picos', 'pica', 'picas', 'peak', 'peaks',
  'pixel', 'pixels', 'pixe', 'pixes', 'pixie', 'pixy', 'pixx', 'pex', 'pexe', 'piks', 'piquês'];
const PIX = new RegExp(`(?<![\\p{L}\\d])(?:${[...new Set(PIX_WORDS)].map((w) => w.replace(/i/g, '[ií]').replace(/o/g, '[oó]').replace(/a/g, '[aá]')).join('|')})(?![\\p{L}\\d])`, 'giu');
// Soletrado: "p i x", "p.i.x", "p-i-x", "pê i xis", "p i xis".
const PIX_SPELLED = /(?<![\p{L}\d])p[eê]?[\s.\-]+[ií][\s.\-]+(?:x|xis)(?![\p{L}\d])\.?/giu;
export const fixPix = (text) => text.replace(PIX_SPELLED, 'Pix').replace(PIX, 'Pix');

const INCOME = /(?<![a-z])(recebi|ganhei|receita|entrada|salario|recebimento|pix recebido)(?![a-z])/;
const FILLER = new Set(['gastei', 'paguei', 'pagar', 'comprei', 'valor', 'no valor', 'lancar', 'lanca', 'lance', 'registrar', 'registra', 'anotar', 'anota', 'categoria', 'dei', 'mandei', 'enviei', 'transferi', 'fiz', 'despesa', 'gasto', 'pagamento', 'recebi', 'ganhei', 'receita', 'entrada',
  'de', 'do', 'da', 'no', 'na', 'em', 'com', 'o', 'a', 'os', 'as', 'pra', 'para', 'um', 'uma', 'reais', 'real', 'r$', 'centavos', 'e']);

const UNITS = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
  setecentos: 700, oitocentos: 800, novecentos: 900 };

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Palavra inteira. Também não pode estar colada a um valor: o "99" de "84,99" não é a categoria 99.
const wordRe = (phrase) => new RegExp(`(?<![a-z0-9]${/^\d/.test(phrase) ? '|\\d[.,:]\\s?' : ''})${escape(phrase)}(?![a-z0-9]${/\d$/.test(phrase) ? '|\\s?[.,:]\\d' : ''})`, 'g');
// Apelidos só com algarismos ("99") podem ser o próprio valor: valem por último e só se sobrar outro valor na frase.
const isNumeric = (phrase) => /^\d+$/.test(phrase);

function blank(text, start, end) {
  return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

// A primeira categoria citada vale ("uber 25, corrida até a faculdade" é Uber).
// Se duas expressões começam no mesmo ponto, vale a mais longa ("rifa faculdade" antes de "rifa").
// Singular palavra por palavra: "gastos pessoais" → "gasto pessoal", "cartões" → "cartao".
const singular = (phrase) => phrase.split(' ').map((w) => (w.length <= 3 ? w
  : w.endsWith('ais') ? `${w.slice(0, -3)}al` : w.endsWith('eis') ? `${w.slice(0, -3)}el`
    : /[ao]es$/.test(w) ? `${w.slice(0, -3)}ao` : w.endsWith('s') ? w.slice(0, -1) : w)).join(' ');

// Nome completo, no singular ou no plural ("lanche" acha "Lanches"), mais os apelidos e dicas.
function fullPhrases(cat) {
  const own = norm(cat.name).trim().replace(/\s+/g, ' ');
  const number = own.length > 3 ? (own.endsWith('s') ? own.slice(0, -1) : `${own}s`) : own;
  return [...new Set([own, number, singular(own), ...(ALIASES[cat.id] ?? []), ...(NAME_ALIASES[own] ?? [])])].map((p) => ({ p, keep: false }))
    .concat((HINTS[cat.id] ?? []).map((p) => ({ p, keep: true })));
}

// Uma palavra marcante de um nome composto ("spotify" acha "Assinatura Spotify"), se só ela tiver essa palavra.
function partialPhraser(cats) {
  const count = new Map();
  const wordsOf = (cat) => [...new Set(norm(cat.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !FILLER.has(w)))];
  for (const cat of cats) for (const w of wordsOf(cat)) count.set(w, (count.get(w) ?? 0) + 1);
  return (cat) => (wordsOf(cat).length > 1 ? wordsOf(cat).filter((w) => count.get(w) === 1).map((p) => ({ p, keep: false })) : []);
}

function findCategory(n, cats, phrasesOf = fullPhrases, numeric = false) {
  let best = null;
  for (const cat of cats) {
    const phrases = phrasesOf(cat).filter(({ p }) => isNumeric(p) === numeric);
    for (const { p, keep } of phrases) {
      for (const m of n.matchAll(wordRe(p))) {
        const better = !best || m.index < best.start || (m.index === best.start && p.length > best.len);
        if (better) best = { cat, start: m.index, end: m.index + p.length, len: p.length, keep };
      }
    }
  }
  return best;
}

// Valor em algarismos. O reconhecedor do Google escreve o mesmo valor de vários jeitos:
// "17,95", "17.95", "R$ 17,95", "17 e 95", "17 reais e 95 centavos", "17 95" e até "1795".
const DIGITS = /(?<![\d.,:])(r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,:](\d{1,2}))?(?!\d)/;

function findDigits(n) {
  const m = DIGITS.exec(n);
  if (!m) return null;
  let whole = Number(m[2].replace(/\./g, ''));
  let cents = m[3] ? Number(m[3].padEnd(2, '0')) : null;
  let end = m.index + m[0].length;
  const hasCurrency = !!m[1] || /r\$\s*$/.test(n.slice(0, m.index));

  const reais = /^\s*(?:reais|real)(?![a-z])/.exec(n.slice(end));
  if (reais) end += reais[0].length;
  if (cents === null) {
    // Centavos ditos depois: "17 e 95", "17 reais e 95 centavos", "17 95".
    const tail = /^\s+(?:e\s+(\d{1,2})|(\d{2}))(?![\d.,])(?:\s*centavos?(?![a-z]))?/.exec(n.slice(end));
    if (tail) {
      cents = Number(tail[1] ?? tail[2]);
      end += tail[0].length;
    }
  }

  // "1795" sem vírgula: quase sempre é "dezessete e noventa e cinco" que o reconhecedor juntou.
  // Vira R$ 17,95, e o formulário avisa para a pessoa conferir.
  let ambiguous = null;
  if (cents === null && !reais && !hasCurrency && /^\d{4}$/.test(m[2]) && !m[2].endsWith('00')) {
    ambiguous = whole * 100;
    cents = whole % 100;
    whole = Math.floor(whole / 100);
  }
  return { cents: whole * 100 + (cents ?? 0), start: m.index, end, ambiguous };
}

// Valores por extenso, para quando o reconhecedor não converte em algarismos.
// "cento e vinte" = 120; "dezessete e noventa e cinco" = 17,95 (o segundo número não "cabe" no primeiro, então são centavos).
const magnitude = (v) => (v >= 100 ? 3 : v >= 20 ? 2 : 1);

function readGroup(tokens, i) {
  let total = 0; let current = 0; let last = 5; let j = i; let end = null;
  while (j < tokens.length) {
    const t = tokens[j][0];
    if (t === 'e' && j > i && j + 1 < tokens.length && tokens[j + 1][0] in UNITS && magnitude(UNITS[tokens[j + 1][0]]) < last) { j++; continue; }
    if (t in UNITS && magnitude(UNITS[t]) < last) { current += UNITS[t]; last = magnitude(UNITS[t]); }
    else if (t === 'mil' && last === 4) break;
    else if (t === 'mil') { total += (current || 1) * 1000; current = 0; last = 4; }
    else break;
    end = tokens[j].index + t.length;
    j++;
  }
  return end === null ? null : { value: total + current, j, end };
}

function findWords(n) {
  const tokens = [...n.matchAll(/[a-z$]+/g)];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i][0];
    if (!(w in UNITS) && w !== 'mil') continue;
    const first = readGroup(tokens, i);
    if (!first || first.value <= 0) continue;
    let { j, end } = first;
    let cents = 0;
    if (j < tokens.length && /^(reais|real)$/.test(tokens[j][0])) { end = tokens[j].index + tokens[j][0].length; j++; }
    let k = j;
    if (k < tokens.length && tokens[k][0] === 'e') k++;
    const second = k < tokens.length && tokens[k][0] in UNITS ? readGroup(tokens, k) : null;
    if (second && second.value < 100) {
      cents = second.value;
      end = second.end; j = second.j;
      if (j < tokens.length && /^centavos?$/.test(tokens[j][0])) { end = tokens[j].index + tokens[j][0].length; }
    }
    return { cents: first.value * 100 + cents, start: tokens[i].index, end, ambiguous: null };
  }
  return null;
}

// Limpa o que sobrou: tira palavras de ligação nas pontas e pontuação solta, mantém o resto como foi falado.
function cleanDescription(original, n) {
  const words = [];
  for (const m of n.matchAll(/\S+/g)) words.push({ n: m[0], o: original.slice(m.index, m.index + m[0].length), start: m.index });
  const bare = (w) => w.n.replace(/^[,.;:!?-]+|[,.;:!?-]+$/g, '');
  while (words.length && (FILLER.has(bare(words[0])) || !bare(words[0]))) words.shift();
  while (words.length && (FILLER.has(bare(words[words.length - 1])) || !bare(words[words.length - 1]))) words.pop();
  if (!words.length) return '';
  // Junta só as palavras que sobraram: valor e categoria saem mesmo quando estão no meio da frase.
  const text = words.map((w) => w.o).join(' ')
    .replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:])(?=\S)/g, '$1 ').replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:!?-]+|[\s,;:-]+$/g, '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

// "Pagar despesa futura": abre a lista das despesas futuras para escolher qual está sendo paga.
const PAY_PLANNED = /(?<![a-z])(pagar|paguei|pago|pagando|quitar|quitei|dar baixa n?a?|baixar)( a| uma| na| numa)? (despesas? futuras?|contas? futuras?|despesas? prevista?s?|contas? a pagar)(?![a-z])/;

// Despesa futura pela voz: "despesa futura de 57,60 por mês até fevereiro em gastos pessoais".
const PLANNED = /(?<![a-z])(despesas? futuras?|gastos? futuros?|contas? futuras?|futuras?|futuros?|a pagar|vou pagar|agendad[ao]s?|previst[ao]s?)(?![a-z])/g;
const MONTHLY = /(?<![a-z])(por mes|todo mes|todos os meses|ao mes|mensal|mensalmente|cada mes)(?![a-z])/g;
const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const UNTIL = new RegExp(`(?<![a-z])ate (?:o mes de |o fim de |o final de |)(${MONTHS.join('|')})(?: de (\\d{4}))?(?![a-z])`);
const COUNT_WORDS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };
const FOR_MONTHS = new RegExp(`(?<![a-z])(?:por|durante|nos proximos|pelos proximos|pelos|nos) (\\d{1,2}|${Object.keys(COUNT_WORDS).join('|')}) meses(?![a-z])`);
const MAX_MONTHS = 24;
// Datas avulsas: "24 de novembro, 8 e 22 de dezembro", "dia 24/11". Dias soltos antes de um mês herdam esse mês.
const DAY_LIST = `\\d{1,2}(?:\\s*(?:,|e)\\s*(?:dia\\s+)?\\d{1,2})*`;
const DATE_WORDS = new RegExp(`(?<![\\d.,])(${DAY_LIST})\\s+de\\s+(${MONTHS.join('|')})(?:\\s+de\\s+(\\d{4}))?(?![a-z])`, 'g');
const DATE_NUM = /(?<![\d.,])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d])/g;
const DATE_FILLER = /(?<![a-z])(nas datas|na data|nos dias|no dia|datas|data|dias|dia|cada uma|cada um|cada)(?![a-z])/g;
const pad2 = (x) => String(x).padStart(2, '0');

// Ano da data: o mesmo do mês atual, ou o seguinte se a data já passou ("8 de fevereiro" dito em novembro).
function fullDate(day, month, year, today) {
  const y0 = year ? (year < 100 ? 2000 + year : year) : Number(today.slice(0, 4));
  let date = `${y0}-${pad2(month)}-${pad2(day)}`;
  if (!year && date < today) date = `${y0 + 1}-${pad2(month)}-${pad2(day)}`;
  const [y, m, d] = date.split('-').map(Number);
  const check = new Date(y, m - 1, d);
  return check.getMonth() === m - 1 && check.getDate() === d ? date : null;
}

function readDates(n, today) {
  const dates = [];
  n = n.replace(DATE_WORDS, (whole, days, monthName, year) => {
    const month = MONTHS.indexOf(monthName) + 1;
    for (const d of days.match(/\d{1,2}/g)) {
      const date = fullDate(Number(d), month, year && Number(year), today);
      if (date) dates.push(date);
    }
    return ' '.repeat(whole.length);
  });
  n = n.replace(DATE_NUM, (whole, d, m, y) => {
    const date = Number(m) >= 1 && Number(m) <= 12 ? fullDate(Number(d), Number(m), y && Number(y), today) : null;
    if (!date) return whole;
    dates.push(date);
    return ' '.repeat(whole.length);
  });
  if (dates.length) n = n.replace(DATE_FILLER, (m) => ' '.repeat(m.length));
  return { n, dates: [...new Set(dates)].sort() };
}

const monthAdd = (month, k) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const dateNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

// Tira da frase as palavras de despesa futura e de repetição. Devolve a frase limpa e até que mês repetir.
function readPlanned(n, month, today) {
  let planned = false;
  n = n.replace(PLANNED, (m) => { planned = true; return ' '.repeat(m.length); });
  // Datas avulsas: viram despesas futuras em cada data (opção "Personalizada").
  const found = readDates(n, today);
  if (found.dates.length) return { n: found.n.replace(MONTHLY, (m) => ' '.repeat(m.length)), planned: true, untilMonth: null, dates: found.dates };
  let untilMonth = null;
  const until = UNTIL.exec(n);
  if (until) {
    const target = MONTHS.indexOf(until[1]) + 1;
    const [y, m] = month.split('-').map(Number);
    let year = until[2] ? Number(until[2]) : y;
    if (!until[2] && target < m) year += 1; // "até fevereiro" dito em novembro é o do ano que vem
    untilMonth = `${year}-${String(target).padStart(2, '0')}`;
    n = blank(n, until.index, until.index + until[0].length);
  } else {
    const count = FOR_MONTHS.exec(n);
    if (count) {
      const k = /\d/.test(count[1]) ? Number(count[1]) : COUNT_WORDS[count[1]];
      if (k >= 1) untilMonth = monthAdd(month, k - 1);
      n = blank(n, count.index, count.index + count[0].length);
    }
  }
  n = n.replace(MONTHLY, (m) => ' '.repeat(m.length));
  if (untilMonth && (untilMonth < month || untilMonth > monthAdd(month, MAX_MONTHS - 1))) untilMonth = null;
  // Repetição só faz sentido em despesa futura: "por mês até fevereiro" já indica uma.
  if (untilMonth) planned = true;
  return { n, planned, untilMonth: untilMonth && untilMonth > month ? untilMonth : null, dates: [] };
}

// cats: categorias em que uma despesa pode entrar (subcategorias e independentes, sem arquivadas).
// mains: categorias principais, cada uma com suas subcategorias em .subs (para "... em despesas fixas internet").
// month: mês atual ('2026-11'), usado para "até fevereiro" e "por 3 meses".
export function parseVoice(spoken, cats, mains = [], { month = monthNow(), today = dateNow() } = {}) {
  const original = fixPix(String(spoken ?? '').replace(/\s+/g, ' ').trim());
  let n = norm(original);
  if (PAY_PLANNED.test(n)) {
    // Categoria citada ("pagar despesa futura de gastos pessoais") só filtra a lista.
    const found = findCategory(n, cats) ?? findCategory(n, cats, partialPhraser(cats));
    return { type: 'payPlanned', categoryId: found?.cat.id ?? null, heard: original };
  }
  const isIncome = INCOME.test(n);
  let plan = { planned: false, untilMonth: null, dates: [] };
  if (!isIncome) ({ n, ...plan } = readPlanned(n, month, today));
  const type = isIncome ? 'income' : 'expense';

  let categoryId = null;
  if (type === 'expense') {
    let found = findCategory(n, cats) ?? findCategory(n, cats, partialPhraser(cats));
    if (!found) {
      // Citou só a categoria principal: tira o nome dela da frase e procura a subcategoria no que sobrou.
      const main = findCategory(n, mains);
      if (main) {
        n = blank(n, main.start, main.end);
        const subs = main.cat.subs ?? [];
        found = findCategory(n, subs) ?? findCategory(n, subs, partialPhraser(subs));
        if (!found && subs.length === 1) categoryId = subs[0].id;
      }
    }
    if (!found && !categoryId) {
      const weak = findCategory(n, cats, fullPhrases, true);
      const rest = weak && blank(n, weak.start, weak.end);
      if (weak && (findDigits(rest) ?? findWords(rest))) found = weak;
    }
    if (found) {
      categoryId = found.cat.id;
      if (!found.keep) n = blank(n, found.start, found.end);
      // "corrida no 99 de 15,90": o apelido numérico da mesma categoria sai, se ainda houver outro valor.
      const alias = findCategory(n, [found.cat], fullPhrases, true);
      const rest = alias && blank(n, alias.start, alias.end);
      if (alias && (findDigits(rest) ?? findWords(rest))) n = rest;
      // "gastos pessoais spotify": o nome da principal também sai dos detalhes.
      const parent = mains.find((m) => (m.subs ?? []).some((c) => c.id === categoryId));
      const said = parent && findCategory(n, [parent]);
      if (said) n = blank(n, said.start, said.end);
    }
  }

  const amount = findDigits(n) ?? findWords(n);
  if (amount) n = blank(n, amount.start, amount.end);

  // Na receita, "salário" e afins são o próprio assunto: ficam nos detalhes.
  const description = cleanDescription(original, type === 'income' ? n.replace(/(?<![a-z])(recebi|ganhei|receita|entrada|recebimento)(?![a-z])/g, (m) => ' '.repeat(m.length)) : n);
  return {
    type: plan.planned ? 'planned' : type, untilMonth: plan.untilMonth, dates: plan.dates,
    amountCents: amount?.cents ?? null, ambiguousCents: amount?.ambiguous ?? null, categoryId, description, heard: original,
  };
}
