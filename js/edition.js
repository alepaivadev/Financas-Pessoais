// Edição do app. PAIS = true gera a "versão dos pais": sem a aba Orçamento, sem orçamentos e sem despesas futuras
// (nem pela voz), sem navegar para meses futuros. Balanço, Categorias, Comparar, backup e o widget de voz continuam.
// O APK dos pais é outro app (pacote br.financas.pais), com dados próprios.
export const PAIS = true;
// PAIS_OWN_DB = false: a versão dos pais usa o mesmo banco da versão completa. É a "Low Features de atualização",
// que instala por cima de um app completo já em uso (mesmo pacote) e mantém as categorias e movimentações.
export const PAIS_OWN_DB = true;
