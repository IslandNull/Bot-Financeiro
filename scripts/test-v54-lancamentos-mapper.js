const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const {
    getLancamentosV54Headers,
    mapParsedEntryToLancamentoV54,
} = require('./lib/v54-lancamentos-mapper');

const mapperSource = fs.readFileSync(path.join(__dirname, 'lib', 'v54-lancamentos-mapper.js'), 'utf8');

const deterministicDeps = {
    now: () => '2026-04-26T20:00:00.000Z',
    makeId: () => 'LAN_V54_TEST_0001',
};

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

function baseEntry(overrides) {
    return Object.assign({
        tipo_evento: 'despesa',
        data: '2026-04-26',
        competencia: '2026-04',
        valor: 105,
        descricao: 'Restaurante casal',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        id_categoria: 'OPEX_RESTAURANTE_CASAL',
        id_fonte: 'FONTE_CONTA_GU',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: false,
        confidence: 0.95,
        raw_text: '105 restaurante casal',
        warnings: [],
    }, overrides || {});
}

function map(entry, deps) {
    return mapParsedEntryToLancamentoV54(entry, deps || deterministicDeps);
}

function assertOk(result) {
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(result.errors, []);
    return result;
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

let failed = 0;

failed += test('uses_canonical_lancamentos_v54_headers', () => {
    assert.deepStrictEqual(
        getLancamentosV54Headers(),
        V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54],
    );
    assert.strictEqual(getLancamentosV54Headers().length, 19);
});

failed += test('maps_valid_simple_cash_expense_to_exactly_19_columns', () => {
    const result = assertOk(map(baseEntry()));
    assert.strictEqual(result.rowValues.length, 19);
    assert.deepStrictEqual(result.headers, [
        'id_lancamento',
        'data',
        'competencia',
        'tipo_evento',
        'id_categoria',
        'valor',
        'id_fonte',
        'pessoa',
        'escopo',
        'id_cartao',
        'id_fatura',
        'id_compra',
        'id_parcela',
        'afeta_dre',
        'afeta_acerto',
        'afeta_patrimonio',
        'visibilidade',
        'descricao',
        'created_at',
    ]);
    assert.deepStrictEqual(result.rowValues, [
        'LAN_V54_TEST_0001',
        '2026-04-26',
        '2026-04',
        'despesa',
        'OPEX_RESTAURANTE_CASAL',
        105,
        'FONTE_CONTA_GU',
        'Gustavo',
        'Casal',
        '',
        '',
        '',
        '',
        true,
        true,
        false,
        'detalhada',
        'Restaurante casal',
        '2026-04-26T20:00:00.000Z',
    ]);
});

failed += test('maps_valid_income', () => {
    const result = assertOk(map(baseEntry({
        tipo_evento: 'receita',
        valor: '3400.00',
        descricao: 'Salario Gustavo',
        id_categoria: 'REC_SALARIO',
        id_fonte: 'FONTE_CONTA_GU',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'resumo',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
    })));

    assert.strictEqual(result.rowObject.tipo_evento, 'receita');
    assert.strictEqual(result.rowObject.valor, 3400);
    assert.strictEqual(result.rowObject.id_categoria, 'REC_SALARIO');
});

failed += test('maps_valid_transfer_aporte_with_afeta_dre_false', () => {
    const result = assertOk(map(baseEntry({
        tipo_evento: 'aporte',
        valor: 1400,
        descricao: 'Aporte reserva',
        id_categoria: 'INV_APORTE',
        id_fonte: 'FONTE_CONTA_GU',
        visibilidade: 'resumo',
        afeta_dre: false,
        afeta_acerto: true,
        afeta_patrimonio: true,
    })));

    assert.strictEqual(result.rowObject.tipo_evento, 'aporte');
    assert.strictEqual(result.rowObject.afeta_dre, false);
    assert.strictEqual(result.rowObject.afeta_patrimonio, true);
});

failed += test('maps_valid_card_purchase_with_id_cartao', () => {
    const result = assertOk(map(baseEntry({
        tipo_evento: 'compra_cartao',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        afeta_patrimonio: true,
    })));

    assert.strictEqual(result.rowObject.id_fonte, '');
    assert.strictEqual(result.rowObject.id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(result.rowValues[result.headers.indexOf('id_cartao')], 'CARD_NUBANK_GU');
});

failed += test('rejects_invalid_parsed_entry_with_structured_validation_errors', () => {
    const result = map(baseEntry({ tipo_evento: 'compra_cartao', id_cartao: undefined, id_fonte: undefined }));
    assertError(result, 'REQUIRED_FOR_EVENT', 'id_cartao');
    assert.strictEqual(result.validation.ok, false);
    assert.strictEqual(result.rowObject, null);
});

failed += test('keeps_optional_empty_links_as_empty_strings_not_undefined', () => {
    const result = assertOk(map(baseEntry({
        tipo_evento: 'compra_cartao',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        id_fatura: undefined,
        id_compra: undefined,
        id_parcela: undefined,
    })));

    ['id_fonte', 'id_fatura', 'id_compra', 'id_parcela'].forEach((field) => {
        assert.strictEqual(result.rowObject[field], '');
        assert.strictEqual(result.rowValues[result.headers.indexOf(field)], '');
    });
});

failed += test('preserves_booleans_as_booleans', () => {
    const result = assertOk(map(baseEntry({ afeta_dre: true, afeta_acerto: false, afeta_patrimonio: true })));
    assert.strictEqual(typeof result.rowObject.afeta_dre, 'boolean');
    assert.strictEqual(typeof result.rowObject.afeta_acerto, 'boolean');
    assert.strictEqual(typeof result.rowObject.afeta_patrimonio, 'boolean');
    assert.deepStrictEqual([
        result.rowObject.afeta_dre,
        result.rowObject.afeta_acerto,
        result.rowObject.afeta_patrimonio,
    ], [true, false, true]);
});

failed += test('preserves_numeric_value_as_number', () => {
    const result = assertOk(map(baseEntry({ valor: '12.34' })));
    assert.strictEqual(result.rowObject.valor, 12.34);
    assert.strictEqual(typeof result.rowObject.valor, 'number');
});

failed += test('does_not_accept_unknown_fields_because_contract_rejects_them', () => {
    const result = map(baseEntry({ moeda: 'BRL' }));
    assertError(result, 'UNKNOWN_FIELD', 'moeda');
});

failed += test('does_not_mutate_input_object', () => {
    const input = baseEntry({ valor: '12.34', descricao: '  Restaurante casal  ' });
    const before = JSON.stringify(input);
    assertOk(map(input));
    assert.strictEqual(JSON.stringify(input), before);
});

failed += test('uses_injected_id_and_timestamp_in_tests', () => {
    const result = assertOk(map(baseEntry(), {
        now: () => '2026-04-26T21:00:00.000Z',
        makeId: (entry) => `LAN_V54_${entry.tipo_evento.toUpperCase()}_FIXED`,
    }));

    assert.strictEqual(result.rowObject.id_lancamento, 'LAN_V54_DESPESA_FIXED');
    assert.strictEqual(result.rowObject.created_at, '2026-04-26T21:00:00.000Z');
});

failed += test('does_not_import_apps_script_globals', () => {
    [
        'SpreadsheetApp',
        'PropertiesService',
        'CacheService',
        'LockService',
        'ScriptApp',
        'ContentService',
        'UrlFetchApp',
        'Telegram',
    ].forEach((name) => {
        assert.strictEqual(mapperSource.includes(name), false, `Unexpected Apps Script/global token: ${name}`);
    });
});

failed += test('does_not_call_openai', () => {
    assert.strictEqual(/openai/i.test(mapperSource), false);
    assert.strictEqual(/chat\/completions/i.test(mapperSource), false);
});

if (failed > 0) {
    console.error(`\n${failed} Lancamentos_V54 mapper check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll Lancamentos_V54 mapper checks passed.');
}
