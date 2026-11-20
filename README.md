# Finanças Pessoais

App de controle financeiro pessoal para Android (APK) e navegador (PWA): receitas, despesas, categorias com ícones, orçamento mensal e lançamento por voz. Funciona 100% offline: não tem servidor, conta nem login, e os dados ficam só no aparelho.

**Versão atual: 2.0** (versionCode 11)

## Funcionalidades

- **Balanço do mês:** saldo, receitas e despesas, com período escolhível (hoje, esta semana, mês ou um dia específico) e histórico de movimentações com edição e exclusão.
- **Comparar meses:** gráfico de linha do valor acumulado por dia e as categorias que mais gastaram em cada mês.
- **Categorias em dois níveis:** categoria principal com subcategorias, ou categoria independente. Uma instalação nova começa **sem nenhuma categoria**: cada pessoa cria as suas.
- **Ícones e cores:** 52 ícones e 13 cores para escolher ao criar uma categoria. **Subcategorias herdam a cor da categoria principal automaticamente**; mudar a cor da principal muda todas as filhas.
- **Orçamento mensal por categoria:** barras verde (até 70%), laranja (70% a 100%) e vermelha (acima de 100%), e "Copiar do mês anterior".
- **Gráfico de rosca** por categoria ou subcategoria, com as cores escolhidas.
- **Lançamento por voz** (sem IA e sem internet): entende frases como "gastei 17,95 no mercado", "recebi 1.500 de salário" ou "Pix de 84,99 internet", com valores em número ou por extenso. O formulário abre preenchido para confirmar.
- **Widget "Lançar por voz"** na tela inicial do Android: um toque e já pode falar.
- **Backup** em arquivo JSON (menu de três pontinhos › Fazer backup).

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

Ou dê dois cliques em `gerar-apk.bat` (só gera) ou `instalar-no-celular.bat` (gera e instala por USB com `adb`). O arquivo sai em `Financas.apk`.

### Chave de assinatura

**A chave não está no repositório** (`android/signing/` fica no `.gitignore`). Na primeira vez que você gerar o APK, o `build.ps1` cria uma chave nova em `android/signing/`.

Guarde essa pasta em lugar seguro. Uma atualização só instala por cima se for assinada com a mesma chave; sem ela, é preciso desinstalar o app, o que **apaga os dados**.

### Antes de cada versão

- Aumente `versionCode` e `versionName` em `android/AndroidManifest.xml`.
- Se mudou algum arquivo carregado pelo app, aumente `CACHE` em `sw.js`; se criou um arquivo novo, inclua-o na lista `FILES`.

## Regras de negócio

- Saldo = receitas − despesas. Valores gravados em centavos inteiros.
- O controle começa em outubro de 2026 (`FIRST_MONTH` em `js/format.js`). Não dá para lançar em meses futuros.
- Despesas apontam para uma subcategoria ou categoria independente; o total de uma principal é a soma das subcategorias.
- Excluir uma categoria com movimentações só a arquiva: ela some dos cadastros, mas continua no histórico e nos totais.
- Orçamentos são por mês e por categoria.
- Cada aparelho tem seus próprios dados; não há sincronização.

## Testes

Com o servidor ligado, abra no navegador:

- `http://localhost:8420/tests/tests.html`: cálculos, valores, datas, migração e 32 frases de voz.
- `http://localhost:8420/tests/smoke.html`: percorre o app inteiro.
- `http://localhost:8420/tests/month.html`: virada de mês e de ano com relógio simulado.

`smoke.html` e `month.html` **apagam os dados** do endereço em que rodam: use uma janela anônima ou um perfil vazio do navegador e feche as outras abas do app.
