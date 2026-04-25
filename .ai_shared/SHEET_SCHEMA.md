# SHEET_SCHEMA — Bot Financeiro V53 (Relacional)

Este documento é a "fonte da verdade" para a estrutura do Google Sheets. Todas as IAs devem consultar este arquivo antes de sugerir ou aplicar qualquer código de manipulação de células.

## 1. Aba: Config (Dicionário de Dados)
Atua como o Schema do sistema. O Apps Script lê esta aba em cache para validar categorias e ativos.

| Coluna | Header | Tipo | Descrição/Exemplo |
| :--- | :--- | :--- | :--- |
| **A** | `ID_CATEGORIA` | String (PK) | Chave Primária (ex: `OPEX-01`, `INV-MP-01`) |
| **B** | `NOME_CATEGORIA`| String | Nome legível (ex: `Mercado`, `CDB Mercado Pago`) |
| **C** | `TIPO_MOVIMENTO`| Enum | `Receita`, `Despesa`, `Transferência Interna` |
| **D** | `CLASSE_DRE` | Enum | `Operacional`, `Patrimonial_Casa`, `Investimento`, `Distribuicao_Lucros` |
| **E** | `TIPO_ATIVO` | Enum | `Dinheiro`, `CDB`, `Fundo` (Vazio para OPEX/CAPEX) |
| **F** | `REGRA_RENDIMENTO`| JSON | Regras de tiering para projeções futuras (veja seção 4) |

## 2. Aba: Lançamentos (Registro de Transações)
Registra o histórico de todas as movimentações financeiras.

| Coluna | Header | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| **A** | `Data` | Date | Data do lançamento (dd/mm/yyyy) |
| **B** | `TIPO` | String | `Despesa`, `Receita` (ou `Partida Dobrada`) |
| **C** | `ID` | String (FK) | Chave estrangeira ligada ao `ID_CATEGORIA` da Config |
| **D** | `VALOR` | Number | Valor absoluto da transação |
| **E** | `FONTE` | String | Origem/Destino do dinheiro (Conta Gustavo, Nubank Lu, etc) |
| **F** | `DESCRIÇÃO` | String | Detalhes opcionais |
| **G** | `PAGADOR` | String | Gustavo ou Luana |
| **H** | `COMPETÊNCIA` | Date | Mês de referência (crucial para faturas de cartão) |

## 3. Lógica de Partidas Dobradas (Módulo 2)
Para qualquer lançamento do tipo **Aporte**, o script deve gerar **duas linhas** na aba Lançamentos:
- **Linha 1 (Débito):** TIPO: `Despesa` | ID: `INV-APORTE` | FONTE: [Conta Origem]
- **Linha 2 (Crédito):** TIPO: `Receita` | ID: [ID_DO_ATIVO_ESPECIFICO] | FONTE: [Corretora/Banco]

## 4. Exemplos de REGRA_RENDIMENTO (Coluna F - Config)
Usado para projeções no Dashboard (não afeta o saldo histórico).

```json
// CDB Mercado Pago
{
  "tier1": {"limite": 10000, "taxa": "120_CDI"},
  "tier2": {"limite": "MAX", "taxa": "100_CDI"}
}

// Caixinha Nubank
{
  "tier1": {"limite": 5000, "taxa": "115_CDI"}
}
```

## 5. Abas Auxiliares
- **Dashboard:** Motor de renderização quebrado em DRE 1 (Operacional) e DRE 2 (Patrimonial).
- **Investimentos:** Saldo consolidado por ativo.
- **Parcelas:** Controle de compras parceladas.

---
**Nota para as IAs:** Todas as fórmulas injetadas via `.setFormula()` devem usar sintaxe em Inglês (vírgula como separador) e datas formatadas via `Utilities.formatDate`.
