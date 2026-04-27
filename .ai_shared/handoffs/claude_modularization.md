> ARCHIVED: historical context only. Do not use as current implementation authority.

# MISSÃO PARA CLAUDE 4.7 OPUS: Modularização Segura do Code.js

**Status Atual:** O `Code.js` foi auditado e está funcional. As fórmulas agora seguem um padrão estrito (Inglês + ; separator).

**Objetivo:** Fatiar o monolito `Code.js` (1.300+ linhas) em módulos menores e gerenciáveis para facilitar o trabalho com IAs de contexto limitado, sem quebrar NENHUMA funcionalidade existente.

**Estrutura Alvo (na pasta src/):**
1. `Main.js`: Configurações globais (`CONFIG`), `_loadSecrets`, `doPost`, e funções utilitárias (`sendTelegram`, `formatBRL`).
2. `Parser.js`: Toda a lógica relacionada à OpenAI (`parseWithOpenAI`, `buildSystemPrompt`, `validateParse`).
3. `Commands.js`: O switch principal `handleCommand` e as funções de texto (`helpText`).
4. `Views.js`: Funções de visualização/leitura (`getResumoMes`, `getSaldoCategoria`, `getSaldoTop5`, `getLancamentosHoje`, `getAcertoMes`, `getInvestSaldo`, `getParcelasAtivas`, `getFatura`).
5. `Actions.js`: Funções que escrevem na planilha (`handleEntry`, `formatEntryResponse`, `desfazerUltimo`, `handleManter`, `handleParcela`).
6. `Setup.js`: As funções de configuração e manutenção (`setupV52`, `setWebhook`, `forceFixAllFormulas`).

**Restrições (MANDATÓRIO):**
- NÃO mude a lógica interna de nenhuma função.
- O Google Apps Script trata todos os arquivos .js como um único escopo global. Não use `export`/`require`. Apenas fatie o arquivo fisicamente.
- Mantenha a ordem de carregamento implícita (constantes no topo).

**Passo a passo:**
1. Crie o diretório `src/`.
2. Mova o conteúdo de `Code.js` para os novos arquivos dentro de `src/`.
3. Apague o arquivo `Code.js` original.
4. Atualize o `.clasp.json` (se necessário) para fazer push da pasta `src/`.
5. Modifique o `package.json` para adicionar um script de lint/teste, se quiser.
6. Execute `npm run push` e valide.