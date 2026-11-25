# Finanças Pessoais — Low Features

Versão simplificada do app de controle financeiro pessoal, pensada para quem quer só o essencial: receitas, despesas, categorias e lançamento por voz. Funciona 100% offline: não tem servidor, conta nem login, e os dados ficam só no aparelho.

**Branch:** `financas-low-features` · **Versão: 1.2** (versionCode 3) · A versão completa (All Features) fica na branch `main`.

É **outro app** no Android (pacote `br.financas.pais`) e usa um banco de dados próprio (`financas-pais`): pode ser instalado ao lado da versão completa, sem misturar os dados.

## Funcionalidades

- **Duas abas:** Balanço e Categorias.
- **Balanço do mês:** saldo, receitas e despesas, com período escolhível (hoje, esta semana, mês ou um dia específico) e histórico com edição e exclusão.
- **Troca de mês:** toque no nome do mês para abrir a faixa com os meses (de outubro de 2026 até o mês atual); toque num mês ou arraste para os lados.
- **Comparar meses:** gráfico do valor acumulado por dia e o top 3 de despesas ou receitas de cada mês.
- **Categorias em dois níveis:** só **categoria principal** e **subcategoria**. Uma instalação nova começa sem nenhuma categoria. 21 ícones e 13 cores; subcategorias herdam a cor da principal.
- **Gráfico de rosca** por subcategoria (padrão) ou categoria principal; cada subcategoria mostra o valor gasto no mês.
- **Valor com vírgula automática:** os números entram pela direita ("123456" vira 1.234,56).
- **Lançamento por voz** (sem IA e sem internet) e **widget "Lançar por voz"** na tela inicial do Android.
- **Backup** em arquivo JSON (menu de três pontinhos › Fazer backup).

**Não tem** (em relação à versão completa): aba Orçamento, orçamentos e barras de orçamento, despesas futuras (nem pela voz), saldo previsto e navegação para meses futuros.

O que liga essa versão é `js/edition.js` (`PAIS = true`); o restante do código é o mesmo da versão completa.

## Como é feito

A interface inteira é **HTML, CSS e JavaScript puro** (módulos ES, sem frameworks e sem etapa de build). O APK é só uma casca Java com WebView que carrega esses mesmos arquivos de dentro do pacote. Ele é compilado direto com as ferramentas do Android SDK, **sem Gradle**.

O APK não pede nenhuma permissão, nem de internet, então o Android impede que ele envie dados para fora do aparelho. A voz usa o reconhecedor de fala do Google, chamado pelo sistema.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `index.html`, `css/` | Página e estilos (fonte Fraunces, licença OFL em `css/fonts/`) |
| `js/app.js` | Telas, formulários, navegação e backup |
| `js/voice.js` | Interpretação da frase falada (valor, tipo, categoria e detalhes) |
| `js/categories.js` | Hierarquia de categorias e migração da versão 1 |
| `js/category-icons.js` | Ícone e cor de cada categoria (`categoryIcon`, `categoryColor`) |
| `js/icon-library.js` | Biblioteca de 52 ícones e 13 cores |
| `js/db.js` | Leitura e gravação no IndexedDB |
| `js/stats.js` | Totais, gráfico e orçamento |
| `js/format.js` | Valores em reais, datas e meses |
| `js/charts.js` | Gráfico de rosca, gráfico de linha e tooltips |
| `sw.js` | Cache para uso offline na versão web |
| `android/` | Casca Android: `MainActivity` (WebView + ponte `AndroidApp`), `VoiceActivity`, `VoiceWidget`, recursos e `build.ps1` |
| `tests/` | Testes no navegador |
| `tools/` | Servidor local e geração dos ícones do app |

## Rodar no computador

No Windows, dê dois cliques em `iniciar.bat`. O app abre em <http://localhost:8420>. Em outro sistema, sirva a pasta com qualquer servidor estático (por exemplo `python3 -m http.server 8420`).

Os dados pertencem ao endereço em que o app foi aberto: se o endereço ou a porta mudar, o app abre vazio.

## Gerar o APK

Precisa do Android Studio (usa o JDK dele) e do Android SDK com build-tools e uma plataforma instalados.

```powershell
powershell -ExecutionPolicy Bypass -File android\build.ps1
```

Ou dê dois cliques em `gerar-apk.bat` (só gera) ou `instalar-no-celular.bat` (gera e instala por USB com `adb`). O arquivo sai em `Financas.apk`. Nesta branch o `build.ps1` gera o app com o pacote `br.financas.pais` (opção `--rename-manifest-package` do aapt2).

### Chave de assinatura

**A chave não está no repositório** (`android/signing/` fica no `.gitignore`). Na primeira vez que você gerar o APK, o `build.ps1` cria uma chave nova em `android/signing/`.

Guarde essa pasta em lugar seguro. Uma atualização só instala por cima se for assinada com a mesma chave; sem ela, é preciso desinstalar o app, o que **apaga os dados**.

### Antes de cada versão

- Aumente `versionCode` e `versionName` em `android/AndroidManifest.xml`.
- Se mudou algum arquivo carregado pelo app, aumente `CACHE` em `sw.js`; se criou um arquivo novo, inclua-o na lista `FILES`.

## Regras de negócio

- Saldo = receitas − despesas. Valores gravados em centavos inteiros.
- O controle começa em outubro de 2026 (`FIRST_MONTH` em `js/format.js`). Receitas e despesas não aceitam data futura.
- Despesas apontam para uma subcategoria; o total de uma principal é a soma das subcategorias. Categorias independentes antigas viram uma principal com uma subcategoria de mesmo nome.
- Excluir uma categoria com movimentações só a arquiva: ela some dos cadastros, mas continua no histórico e nos totais.
- Cada aparelho tem seus próprios dados; não há sincronização.

## Testes

Com o servidor ligado, abra no navegador:

- `http://localhost:8420/tests/tests.html`: cálculos, valores, datas, migração e as frases de voz.

Os testes de fluxo (`smoke.html` e `month.html`) cobrem a versão completa e ficam na branch `main`.
