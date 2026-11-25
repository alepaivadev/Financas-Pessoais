# Finanças Pessoais

App de controle financeiro pessoal para Android (APK) e navegador (PWA): receitas, despesas, categorias com ícones, orçamento mensal e lançamento por voz. Funciona 100% offline: não tem servidor, conta nem login, e os dados ficam só no aparelho.

**Branch `2.0.1`** (versionName 2.0.1, versionCode 17): a All Features 2.5 **sem subcategorias**. Toda categoria é principal e recebe as despesas direto. A versão com subcategorias continua na `main`, e a simplificada, a **Low Features**, na branch `financas-low-features`.

### O que muda na 2.0.1

- **Só categorias principais:** não existe mais "Nova subcategoria" nem o tipo no formulário de categoria. Cada categoria tem a sua cor e o seu ícone.
- **Conversão automática ao abrir:** cada subcategoria vira uma categoria principal com o mesmo id, nome e ícone. Lançamentos, orçamentos e despesas futuras continuam ligados a ela. A primeira de cada grupo fica com a cor da principal antiga, e as outras ganham cores livres. A principal antiga, que só agrupava, sai.
- **Gráfico de rosca** por categoria, sem a opção "Mostrar".
- **Orçamento, despesas futuras e comprometido** ficam direto em cada categoria.

## Funcionalidades

- **Três abas:** Balanço (esquerda), Categorias (meio) e Orçamento (direita).
- **Balanço do mês:** saldo, receitas e despesas, com período escolhível (hoje, esta semana, mês ou um dia específico) e histórico de movimentações com edição e exclusão. Abaixo do saldo, em transparente, o **saldo previsto** depois das despesas futuras do mês.
- **Troca de mês:** toque no nome do mês para abrir a faixa com os meses (inclusive os próximos, para ver as despesas futuras); toque num mês ou arraste para os lados. Num mês futuro aparece "Voltar ao mês atual".
- **Comparar meses:** escolha o mês a comparar numa lista, gráfico de linha do valor acumulado por dia (com até 3 meses a mais no gráfico) e o top 3 de despesas ou receitas de cada mês.
- **Categorias em um nível só (2.0.1):** toda categoria é principal. Uma instalação nova começa **sem nenhuma categoria**: cada pessoa cria as suas (botão de caneta em Categorias).
- **Ícones e cores:** 52 ícones e 13 cores para escolher ao criar uma categoria.
- **Aba Orçamento:** mostra só as categorias com orçamento no mês; o **+** cadastra nas que faltam. Só o mês atual é editável; meses passados ficam para consulta. "Copiar do mês anterior".
- **Despesas futuras:** na aba Orçamento, cadastre o que ainda vai pagar, sem repetir, **mensalmente** até um mês ou em **datas personalizadas** (ex.: parcelas em 24/11, 08/12 e 22/12). Elas descontam do saldo previsto e aparecem como **comprometido** na categoria em que foram cadastradas. "Paguei" lança a despesa de verdade com um toque.
- **Pagar despesa futura com um toque:** ao lançar uma despesa nova, uma caixinha mostra as despesas futuras do mês; tocar numa delas já lança.
- **Barras de orçamento** na aba Categorias: verde (até 70%), laranja (70% a 100%) e vermelha (acima de 100%), já contando o comprometido.
- **Gráfico de rosca** por categoria, com as cores escolhidas.
- **Valor com vírgula automática:** os números entram pela direita ("123456" vira 1.234,56).
- **Lançamento por voz** (sem IA e sem internet): entende frases como "gastei 17,95 no mercado", "recebi 1.500 de salário" ou "Pix de 84,99 internet", com valores em número ou por extenso. Também entende despesas futuras ("despesa futura de 57,60 por mês até fevereiro em gastos pessoais", "... na data 24 de novembro, 8 de dezembro, no valor de 21,68 cada uma") e "pagar despesa futura", que abre a lista para escolher qual foi paga. O formulário abre preenchido para confirmar.
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
| `js/edition.js` | Liga a versão Low Features (`PAIS`); na main fica `false` |
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
- O controle começa em outubro de 2026 (`FIRST_MONTH` em `js/format.js`). Receitas e despesas não aceitam data futura; o que vai acontecer depois entra como **despesa futura**.
- Despesas apontam para uma subcategoria; o total de uma principal é a soma das subcategorias.
- Excluir uma categoria com movimentações só a arquiva: ela some dos cadastros, mas continua no histórico e nos totais.
- Orçamentos são por mês e por categoria. Um mês futuro sem orçamento próprio usa o do mês atual como referência.
- Despesas futuras ficam no IndexedDB (versão 3 do banco, store `planned`); a atualização da versão 2 só cria esse espaço vazio, sem mexer no resto.
- Cada aparelho tem seus próprios dados; não há sincronização.

## Testes

Com o servidor ligado, abra no navegador:

- `http://localhost:8420/tests/tests.html`: cálculos, valores, datas, migração e as frases de voz.
- `http://localhost:8420/tests/smoke.html`: percorre o app inteiro.
- `http://localhost:8420/tests/month.html`: virada de mês e de ano com relógio simulado.

`smoke.html` e `month.html` **apagam os dados** do endereço em que rodam: use uma janela anônima ou um perfil vazio do navegador e feche as outras abas do app.
