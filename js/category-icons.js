import { drawIcon } from './icon-library.js';

// Ícones das categorias. Quem escolheu um ícone no app (cat.icon) usa a biblioteca de js/icon-library.js,
// com a cor da categoria (subcategorias herdam a cor da principal).
// As categorias antigas, sem ícone escolhido, continuam com os arquivos em icons/, pelo id.
const FILES = {
  'despesas-fixas': 'despesas-fixas.svg',
  'rifa-faculdade': 'rifa-faculdade.svg',
  academia: 'academia.svg',
  internet: 'internet.svg',
  faculdade: 'faculdade.svg',
  cabelo: 'cabelo.svg',
  'papel-de-agua': 'papel-de-agua.svg',
  'despesas-variaveis': 'despesas-variaveis.svg',
  uber: 'ic_uber.jpg',
  vestuario: 'vestuario.svg',
  emergencia: 'emergencia.svg',
  // Receitas não têm categoria: todas usam a moeda verde.
  receita: 'receita.svg',
};

// Categorias criadas no app ganham id aleatório: estas são reconhecidas pelo nome.
const BY_NAME = {
  outros: 'outros.svg',
  lanches: 'outros.svg',
  comida: 'outros.svg',
  lanche: 'outros.svg',
};
const norm = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const nameFiles = new Map();
const catsById = new Map();

// Cor dos arquivos antigos, para as subcategorias novas de uma principal antiga herdarem a mesma cor.
const FILE_COLORS = {
  'despesas-fixas.svg': '#2563EB',
  'despesas-variaveis.svg': '#F97316',
  'emergencia.svg': '#DC2626',
  'outros.svg': '#F97316',
  'rifa-faculdade.svg': '#2563EB',
  'academia.svg': '#2563EB',
  'internet.svg': '#2563EB',
  'faculdade.svg': '#2563EB',
  'cabelo.svg': '#2563EB',
  'papel-de-agua.svg': '#2563EB',
  'vestuario.svg': '#F97316',
  'ic_uber.jpg': '#F97316',
};

// Desenho equivalente na biblioteca: se a principal mudar de cor, a subcategoria antiga troca o arquivo
// por este desenho na cor nova, para continuar com a mesma cor da principal.
const FILE_GLYPHS = {
  'rifa-faculdade.svg': 'presente',
  'academia.svg': 'academia',
  'internet.svg': 'internet',
  'faculdade.svg': 'educacao',
  'cabelo.svg': 'cabelo',
  'papel-de-agua.svg': 'agua',
  'vestuario.svg': 'roupa',
  'ic_uber.jpg': 'carro',
  'outros.svg': 'lanche',
  'emergencia.svg': 'emergencia',
  'despesas-fixas.svg': 'casa',
  'despesas-variaveis.svg': 'compras',
};

// Desenho da biblioteca equivalente ao arquivo de ícone de uma categoria antiga (ou null).
export const fileGlyph = (id) => FILE_GLYPHS[FILES[id]] ?? null;

// Chamado sempre que as categorias são carregadas.
export function registerCategories(cats) {
  nameFiles.clear();
  catsById.clear();
  for (const cat of cats) {
    catsById.set(cat.id, cat);
    const file = BY_NAME[norm(cat.name ?? '')];
    if (file) nameFiles.set(cat.id, file);
  }
}

// Cores fixas no gráfico, combinando com o ícone. As demais seguem a paleta do gráfico.
export const CATEGORY_COLORS = { emergencia: '#DC2626' };

// Cor da categoria: a escolhida no app ou a do ícone antigo. Subcategoria sempre usa a da principal.
export function categoryColor(id) {
  const cat = catsById.get(id);
  if (cat?.kind === 'sub' && cat.parentId) return categoryColor(cat.parentId);
  return cat?.color ?? FILE_COLORS[FILES[id] ?? nameFiles.get(id)] ?? null;
}

// Devolve o ícone redondo (<svg> da biblioteca ou <img> antigo), ou null se a categoria não tiver ícone.
export function categoryIcon(id, className = 'cat-icon') {
  const cat = catsById.get(id);
  if (cat?.icon) return drawIcon(cat.icon, categoryColor(id) ?? '#475569', className);
  const file = FILES[id] ?? nameFiles.get(id);
  if (file && cat?.kind === 'sub' && FILE_GLYPHS[file]) {
    const color = categoryColor(id);
    if (color && color !== FILE_COLORS[file]) return drawIcon(FILE_GLYPHS[file], color, className);
  }
  if (!file) return null;
  const img = document.createElement('img');
  img.src = `icons/${file}`;
  img.alt = '';
  img.className = className;
  img.decoding = 'async';
  return img;
}
