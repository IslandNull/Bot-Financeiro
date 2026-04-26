const assert = require('assert');

const {
    V54_HEADERS,
    V54_SHEETS,
    getV54Headers,
    getV54SheetNames,
    validateV54Schema,
} = require('./lib/v54-schema');

function test(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
        return 0;
    } catch (error) {
        console.error(`FAIL ${name} - ${error.message}`);
        return 1;
    }
}

let failed = 0;

failed += test('all_required_v54_sheets_are_declared', () => {
    assert.deepStrictEqual(getV54SheetNames(), [
        'Config_Categorias',
        'Config_Fontes',
        'Rendas',
        'Cartoes',
        'Faturas',
        'Pagamentos_Fatura',
        'Compras_Parceladas',
        'Parcelas_Agenda',
        'Orcamento_Futuro_Casa',
        'Lancamentos_V54',
        'Patrimonio_Ativos',
        'Dividas',
        'Acertos_Casal',
        'Fechamentos_Mensais',
    ]);
});

failed += test('config_fontes_does_not_duplicate_card_authority', () => {
    const headers = getV54Headers(V54_SHEETS.CONFIG_FONTES);
    assert.deepStrictEqual(headers, ['id_fonte', 'nome', 'tipo', 'titular', 'ativo']);
    assert.strictEqual(headers.includes('fechamento_dia'), false);
    assert.strictEqual(headers.includes('vencimento_dia'), false);
    assert.strictEqual(headers.includes('limite'), false);
});

failed += test('cartoes_owns_card_specific_fields_and_references_fonte', () => {
    assert.deepStrictEqual(getV54Headers(V54_SHEETS.CARTOES), [
        'id_cartao',
        'id_fonte',
        'nome',
        'titular',
        'fechamento_dia',
        'vencimento_dia',
        'limite',
        'ativo',
    ]);
});

failed += test('parcelas_agenda_has_stable_key_referenced_by_lancamentos', () => {
    assert.strictEqual(V54_HEADERS[V54_SHEETS.PARCELAS_AGENDA].includes('id_parcela'), true);
    assert.strictEqual(V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54].includes('id_parcela'), true);
});

failed += test('analysis_consolidation_schema_decisions_are_present', () => {
    assert.ok(getV54Headers(V54_SHEETS.PAGAMENTOS_FATURA).includes('id_pagamento'));
    assert.ok(getV54Headers(V54_SHEETS.PAGAMENTOS_FATURA).includes('afeta_patrimonio'));
    assert.ok(getV54Headers(V54_SHEETS.DIVIDAS).includes('saldo_devedor'));
    assert.ok(getV54Headers(V54_SHEETS.DIVIDAS).includes('estrategia'));
    assert.ok(getV54Headers(V54_SHEETS.FECHAMENTOS_MENSAIS).includes('taxa_poupanca'));
    assert.ok(getV54Headers(V54_SHEETS.FECHAMENTOS_MENSAIS).includes('patrimonio_liquido'));
    assert.ok(getV54Headers(V54_SHEETS.CONFIG_CATEGORIAS).includes('visibilidade_padrao'));
    assert.ok(getV54Headers(V54_SHEETS.COMPRAS_PARCELADAS).includes('visibilidade'));
    assert.ok(getV54Headers(V54_SHEETS.LANCAMENTOS_V54).includes('afeta_patrimonio'));
    assert.ok(getV54Headers(V54_SHEETS.LANCAMENTOS_V54).includes('visibilidade'));
});

failed += test('schema_has_no_duplicate_headers_or_known_conflicts', () => {
    const validation = validateV54Schema();
    assert.deepStrictEqual(validation, { ok: true, errors: [] });
});

if (failed > 0) {
    console.error(`\n${failed} V54 schema check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 schema checks passed.');
}
