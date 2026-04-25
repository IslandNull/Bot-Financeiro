# Formula Standard

Este documento oficializa o padrão para manipulação de fórmulas no projeto Bot Financeiro, garantindo que IAs e desenvolvedores mantenham a consistência arquitetural.

Use:
- **Apps Script API:** Sempre use `range.setFormula()` (nunca use `setValue()` para tentar injetar funções).
- **Function names:** English names ONLY (ex: `SUMIFS`, `XLOOKUP`, `DATEDIF`, `IF`, `TODAY`).
- **Argument separator:** Utilize ponto e vírgula `;` como separador de argumentos (comum no Google Sheets com locale pt-BR mas exigido na API quando se usa funções em inglês sem comma-separation nativa global).
- **Do not use localized function names** like `SOMASES`, `HOJE`, `DATADIF` (isso quebra quando injetado via script).
