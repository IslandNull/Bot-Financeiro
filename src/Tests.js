// ============================================================
// TESTS - endpoints de validacao protegidos por SYNC_SECRET.
// Nao sao chamados pelo Telegram.
// ============================================================

function runV53AporteTest(cleanup) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const { fontes, pagadores, categorias, catMap } = getListsCached();

    const investimento = categorias.find(c => String(catMap[c] || '').startsWith('INV-'));
    if (!investimento) throw new Error('Nenhuma categoria de investimento com ID INV-* encontrada.');

    const idInvestimento = catMap[investimento];
    const fonte = fontes.includes('Conta Gustavo') ? 'Conta Gustavo' : fontes[0];
    const pagador = pagadores.includes('Gustavo') ? 'Gustavo' : pagadores[0];
    const chatId = 'TEST_V53_APORTE';
    const marker = 'TEST_V53_APORTE_' + Utilities.getUuid();
    const beforeLastRow = sheet.getLastRow();

    const parsed = {
        tipo: 'Transferência',
        valor: 12.34,
        categoria: investimento,
        id_categoria: idInvestimento,
        fonte,
        descricao: marker,
        pagador,
        error: null
    };

    const result = recordParsedEntry(parsed, chatId, { pagador });
    const rawRows = sheet.getRange(result.firstRow, 1, result.count, 8).getValues();
    const displayRows = sheet.getRange(result.firstRow, 1, result.count, 8).getDisplayValues();

    const checks = [
        { name: 'count_is_two', ok: result.count === 2 },
        { name: 'first_row_is_despesa', ok: rawRows[0] && rawRows[0][1] === 'Despesa' },
        { name: 'first_row_is_inv_aporte', ok: rawRows[0] && rawRows[0][2] === 'INV-APORTE' },
        { name: 'second_row_is_receita', ok: rawRows[1] && rawRows[1][1] === 'Receita' },
        { name: 'second_row_uses_investment_id', ok: rawRows[1] && rawRows[1][2] === idInvestimento },
        { name: 'both_values_match', ok: rawRows.length === 2 && rawRows.every(r => r[3] === 12.34) },
        { name: 'both_descriptions_have_marker', ok: rawRows.length === 2 && rawRows.every(r => r[5] === marker) },
        { name: 'last_row_advanced_by_two', ok: sheet.getLastRow() === beforeLastRow + 2 }
    ];

    const ok = checks.every(c => c.ok);
    let cleaned = false;
    if (cleanup && ok) {
        sheet.deleteRows(result.firstRow, result.count);
        PropertiesService.getScriptProperties().deleteProperty('last_row_' + chatId);
        cleaned = true;
    }

    return {
        ok,
        cleanup: Boolean(cleanup),
        cleaned,
        beforeLastRow,
        afterLastRow: sheet.getLastRow(),
        firstRow: result.firstRow,
        count: result.count,
        investimento,
        idInvestimento,
        fonte,
        pagador,
        marker,
        checks,
        rows: displayRows
    };
}
