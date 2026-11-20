// Biblioteca de ícones para as categorias criadas no app.
// Cada ícone é um desenho branco (traço) em uma grade de 24×24, colocado dentro de um círculo da cor da categoria.
// A categoria guarda só a chave do ícone (cat.icon) e a cor (cat.color); subcategorias herdam a cor da principal.

// Pontinho redondo (usado em olhos, rodas, gotas etc.).
const dot = (x, y, r = 1.3) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

export const ICON_LIBRARY = [
  // Casa e contas
  ['casa', 'Casa', 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6'],
  ['aluguel', 'Aluguel', `M8 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11h9M18 11v3M21 11v2.5`],
  ['luz', 'Luz', 'M13 2L4.5 13.5H11L10 22l8.5-11.5H12z'],
  ['agua', 'Água', 'M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11z'],
  ['gas', 'Gás', 'M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-4-3-6-4.5-10-1.8 2-2.6 4-2.6 6-1.2-.8-2-2-2.2-3.8C7.2 9 5.5 12 5.5 15a6.5 6.5 0 0 0 6.5 6.5z'],
  ['internet', 'Internet', `M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0${dot(12, 19.5, 1.2)}`],
  ['celular', 'Celular', 'M7.5 2h9a1.5 1.5 0 0 1 1.5 1.5v17a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5v-17A1.5 1.5 0 0 1 7.5 2zM10.5 18.5h3'],
  ['tv', 'TV', 'M3.5 7h17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM8 3l4 4 4-4'],
  ['limpeza', 'Limpeza', 'M9.5 3h5v5h-5zM7 8h10l1 13H6zM10 12.5v4.5M14 12.5v4.5'],
  ['ferramenta', 'Manutenção', 'M15 3a5 5 0 0 0-4.6 6.9L3.6 16.7a2.1 2.1 0 0 0 3 3l6.8-6.8A5 5 0 0 0 20.6 8l-3.1 3-3.5-1-1-3.5 3-3.1A5 5 0 0 0 15 3z'],

  // Comida
  ['mercado', 'Mercado', `M2.5 4h2.3l2.3 10.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7.5H5.6${dot(9, 19.5, 1.5)}${dot(17, 19.5, 1.5)}`],
  ['restaurante', 'Restaurante', 'M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 4-3.5 7.5V13H17'],
  ['lanche', 'Lanche', `M4.5 7Q12 2.5 19.5 7L12 21.5zM4.5 7Q12 5 19.5 7${dot(10, 11, 1.2)}${dot(14.2, 11.6, 1.2)}${dot(12, 15.5, 1.1)}`],
  ['hamburguer', 'Hambúrguer', 'M4 11a8 6 0 0 1 16 0zM3 14.5h18M4 17.5h16v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'],
  ['cafe', 'Café', 'M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v3M12 3.5v3'],
  ['bebida', 'Bebidas', 'M5 6.5h10v13.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM15 9.5h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M5 6.5a2.5 2.5 0 0 1 4-2 2.5 2.5 0 0 1 4.5.6A2 2 0 0 1 15 6.5M8.5 11v6.5M11.5 11v6.5'],
  ['doce', 'Doces', 'M7 10a5 5 0 0 1 10 0zM6 10h12l-2.5 11h-7zM12 3v2'],

  // Transporte
  ['carro', 'Carro', `M4 15.5V12l2.2-5h11.6L20 12v3.5zM4 12h16M4 15.5V18h3v-2.5M17 15.5V18h3v-2.5${dot(7.5, 13.8, 1)}${dot(16.5, 13.8, 1)}`],
  ['combustivel', 'Combustível', 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M5 10h10M15 8l3 3v6a1.5 1.5 0 0 0 3 0V9.5l-3-3'],
  ['onibus', 'Ônibus', `M6 3h12a2 2 0 0 1 2 2v12H4V5a2 2 0 0 1 2-2zM4 11h16M7 17v3M17 17v3${dot(8, 14, 1)}${dot(16, 14, 1)}`],
  ['bicicleta', 'Bicicleta', `${dot(5.5, 16.5, 3.3)}${dot(18.5, 16.5, 3.3)}M5.5 16.5L9 9h6l3.5 7.5M12 16.5L9 9M15 9l-1-3.5h2.5`],
  ['aviao', 'Avião', 'M21 15.5l-8-4.5V5a1.5 1.5 0 0 0-3 0v6l-8 4.5V17l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-4.5l8 2.5z'],
  ['viagem', 'Viagem', 'M4 8h16v12H4zM9 8V5h6v3M9 8v12M15 8v12'],

  // Saúde e cuidados
  ['saude', 'Saúde', 'M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20z'],
  ['hospital', 'Hospital', 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'],
  ['remedio', 'Remédio', 'M10.5 20.5l10-10a4.95 4.95 0 0 0-7-7l-10 10a4.95 4.95 0 0 0 7 7zM8.5 8.5l7 7'],
  ['academia', 'Academia', 'M9 12h6M6 8v8M9 6.5v11M15 6.5v11M18 8v8M3.5 10.5v3M20.5 10.5v3'],
  ['cabelo', 'Cabelo', `${dot(6, 6, 3)}${dot(6, 18, 3)}M8.2 7.8L20 19M8.2 16.2L20 5`],
  ['beleza', 'Beleza', 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z'],

  // Pessoas e casa
  ['pessoal', 'Pessoal', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'],
  ['familia', 'Família', 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 13.5a7 7 0 0 1 4 6.5'],
  ['pet', 'Pet', `M12 13c-3 0-5.5 3.5-5.5 5.5 0 1.5 1.2 2.5 2.7 2.5 1.2 0 1.8-.6 2.8-.6s1.6.6 2.8.6c1.5 0 2.7-1 2.7-2.5 0-2-2.5-5.5-5.5-5.5z${dot(5, 10.5, 1.7)}${dot(9, 6.5, 1.7)}${dot(15, 6.5, 1.7)}${dot(19, 10.5, 1.7)}`],
  ['roupa', 'Roupas', 'M8 3L3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z'],
  ['compras', 'Compras', 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2'],
  ['presente', 'Presentes', 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C10 4 7 4 7 6s3 2 5 2c2 0 5 0 5-2s-3-2-5 2'],

  // Educação, trabalho e lazer
  ['educacao', 'Educação', 'M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6'],
  ['livro', 'Livros', 'M4 5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h14v-4'],
  ['trabalho', 'Trabalho', 'M3 8h18v11H3zM9 8V5h6v3M3 13h18'],
  ['jogos', 'Jogos', `M7 8h10a5 5 0 0 1 4.6 7l-.6 1.6a2.5 2.5 0 0 1-4 .9L15 15H9l-2 2.5a2.5 2.5 0 0 1-4-.9L2.4 15A5 5 0 0 1 7 8zM7 10v4M5 12h4${dot(15.5, 11, 1)}${dot(17.5, 13, 1)}`],
  ['musica', 'Música', 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  ['streaming', 'Streaming', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 8.5v7l5.5-3.5z'],
  ['esporte', 'Esporte', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5l4 3-1.5 4.5h-5L8 10.5zM12 3v4.5M16 10.5l4.5-1.5M14.5 15l2.5 4M9.5 15L7 19M8 10.5L3.5 9'],
  ['lazer', 'Lazer', 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  ['assinatura', 'Assinaturas', 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10.5h16M8.5 3.5v5M15.5 3.5v5'],

  // Dinheiro
  ['dinheiro', 'Dinheiro', `M2.5 6h19v12h-19zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z${dot(6, 12, 1)}${dot(18, 12, 1)}`],
  ['cartao', 'Cartão', 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM2 10h20M6 15h4'],
  ['banco', 'Banco', 'M3 10l9-6 9 6zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18'],
  ['investimento', 'Investimentos', 'M3 17l6-6 4 4 8-8M15 7h6v6'],
  ['imposto', 'Impostos', 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6'],
  ['seguro', 'Seguro', 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5'],
  ['emergencia', 'Emergência', `M12 3.5L2.5 20h19zM12 9.5v4${dot(12, 16.8, 1)}`],
  ['outros', 'Outros', `M3 12V4h8l10 10-8 8z${dot(7.5, 8, 1.4)}`],
];

const BY_KEY = new Map(ICON_LIBRARY.map(([key, label, path]) => [key, { key, label, path }]));
export const iconInfo = (key) => BY_KEY.get(key) ?? null;
export const DEFAULT_ICON = 'outros';

// Cores para escolher. A primeira que ainda não estiver em uso é a sugerida.
export const COLOR_PALETTE = [
  ['#2563EB', 'Azul'],
  ['#F97316', 'Laranja'],
  ['#16A34A', 'Verde'],
  ['#7C3AED', 'Roxo'],
  ['#DC2626', 'Vermelho'],
  ['#F59E0B', 'Amarelo'],
  ['#0D9488', 'Verde-água'],
  ['#DB2777', 'Rosa'],
  ['#0EA5E9', 'Azul-claro'],
  ['#65A30D', 'Verde-limão'],
  ['#4F46E5', 'Anil'],
  ['#92400E', 'Marrom'],
  ['#475569', 'Cinza'],
];

const NS = 'http://www.w3.org/2000/svg';

// Desenha o ícone redondo: círculo colorido com o desenho branco no meio.
export function drawIcon(key, color, className = 'cat-icon') {
  const info = iconInfo(key) ?? iconInfo(DEFAULT_ICON);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '12');
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'none'); // o CSS geral dá contorno a todo <svg>
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', 'translate(5.4 5.4) scale(.55)');
  g.setAttribute('fill', 'none');
  g.setAttribute('stroke', '#fff');
  g.setAttribute('stroke-width', '2.1');
  g.setAttribute('stroke-linecap', 'round');
  g.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', info.path);
  g.append(path);
  svg.append(circle, g);
  return svg;
}
