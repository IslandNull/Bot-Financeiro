const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const { V54_SEED_DATA } = require('./lib/v54-seed');
const { mapSingleCardPurchaseContract } = require('./lib/v54-card-purchase-contract');

const sourcePath = path.join(__dirname, 'lib', 'v54-card-purchase-contract.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const deterministicMapperOptions = {
    now: () => '2026-04-27T12:00:00.000Z',
    makeId: () => 'LAN_V54_CARD_TEST_0001',
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
        tipo_evento: 'compra_cartao',
        data: '2026-04-29',
        competencia: '2099-12',
        valor: 105,
        descricao: 'Restaurante casal',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        id_categoria: 'OPEX_RESTAURANTE_CASAL',
        id_cartao: 'CARD_NUBANK_GU',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
    }, overrides || {});
}

function map(entry, options) {
    const sourceOptions = options || {};
    const mapperOptions = sourceOptions.mapperOptions || deterministicMapperOptions;
    const finalOptions = { ...sourceOptions, mapperOptions };
    return mapSingleCardPurchaseContract(entry, finalOptions);
}

function assertOk(result) {
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(result.errors, []);
    assert.ok(result.cycle);
    assert.ok(result.mapped);
    assert.strictEqual(result.mapped.ok, true, JSON.stringify(result.mapped.errors));
    return result;
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

function cardsFromSeed() {
    return V54_SEED_DATA[V54_SHEETS.CARTOES].map((card) => ({ ...card }));
}

let failed = 0;

failed += test('nubank_gustavo_before_closing_maps_to_current_cycle_and_id_fatura', () => {
    const result = assertOk(map(baseEntry({ data: '2026-04-29', id_cartao: 'CARD_NUBANK_GU' })));
    assert.strictEqual(result.cycle.competencia, '2026-04');
    assert.strictEqual(result.cycle.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(result.mapped.rowObject.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
});

failed += test('nubank_gustavo_on_closing_day_maps_to_same_cycle', () => {
    const result = assertOk(map(baseEntry({ data: '2026-04-30', id_cartao: 'CARD_NUBANK_GU' })));
    assert.strictEqual(result.cycle.competencia, '2026-04');
    assert.strictEqual(result.cycle.data_fechamento, '2026-04-30');
    assert.strictEqual(result.mapped.rowObject.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
});

failed += test('mercado_pago_gustavo_after_closing_maps_to_next_cycle', () => {
    const result = assertOk(map(baseEntry({ data: '2026-04-06', id_cartao: 'CARD_MP_GU' })));
    assert.strictEqual(result.cycle.competencia, '2026-05');
    assert.strictEqual(result.cycle.id_fatura, 'FAT_CARD_MP_GU_2026_05');
});

failed += test('nubank_luana_close_day_1_edge_case_maps_correctly', () => {
    const result = assertOk(map(baseEntry({
        data: '2026-04-01',
        id_cartao: 'CARD_NUBANK_LU',
        pessoa: 'Luana',
    })));
    assert.strictEqual(result.cycle.competencia, '2026-04');
    assert.strictEqual(result.cycle.data_fechamento, '2026-04-01');
    assert.strictEqual(result.cycle.data_vencimento, '2026-05-08');
});

failed += test('february_closing_clamp_is_inherited_from_card_cycle_helper', () => {
    const result = assertOk(map(baseEntry({
        data: '2026-02-28',
        id_cartao: 'CARD_NUBANK_GU',
    })));
    assert.strictEqual(result.cycle.data_fechamento, '2026-02-28');
    assert.strictEqual(result.cycle.competencia, '2026-02');
});

failed += test('december_to_january_boundary_maps_correctly', () => {
    const result = assertOk(map(baseEntry({
        data: '2026-12-31',
        id_cartao: 'CARD_NUBANK_GU',
    })));
    assert.strictEqual(result.cycle.competencia, '2027-01');
    assert.strictEqual(result.cycle.id_fatura, 'FAT_CARD_NUBANK_GU_2027_01');
});

failed += test('lancamentos_competencia_equals_invoice_cycle_competencia', () => {
    const result = assertOk(map(baseEntry({
        data: '2026-04-29',
        competencia: '2099-12',
    })));
    assert.strictEqual(result.mapped.rowObject.competencia, result.cycle.competencia);
    assert.strictEqual(result.mapped.rowObject.competencia, '2026-04');
});

failed += test('lancamentos_data_preserves_purchase_date', () => {
    const result = assertOk(map(baseEntry({ data: '2026-04-29' })));
    assert.strictEqual(result.mapped.rowObject.data, '2026-04-29');
});

failed += test('id_fonte_is_filled_from_card_when_omitted', () => {
    const result = assertOk(map(baseEntry({ id_fonte: undefined, id_cartao: 'CARD_NUBANK_GU' })));
    assert.strictEqual(result.mapped.rowObject.id_fonte, 'FONTE_NUBANK_GU');
});

failed += test('conflicting_input_id_fonte_returns_structured_error', () => {
    const result = map(baseEntry({
        id_cartao: 'CARD_NUBANK_GU',
        id_fonte: 'FONTE_CONTA_GU',
    }));
    assertError(result, 'CARD_SOURCE_CONFLICT', 'id_fonte');
});

failed += test('unknown_id_cartao_returns_structured_error', () => {
    const result = map(baseEntry({ id_cartao: 'CARD_UNKNOWN' }));
    assertError(result, 'UNKNOWN_CARD', 'id_cartao');
});

failed += test('inactive_card_returns_structured_error', () => {
    const cards = cardsFromSeed();
    const inactive = cards.map((card) => (card.id_cartao === 'CARD_NUBANK_GU' ? { ...card, ativo: false } : card));
    const result = map(baseEntry({ id_cartao: 'CARD_NUBANK_GU' }), { cards: inactive });
    assertError(result, 'INACTIVE_CARD', 'id_cartao');
});

failed += test('missing_required_purchase_fields_return_structured_errors', () => {
    const result = map(baseEntry({
        data: undefined,
        valor: undefined,
        descricao: undefined,
        pessoa: undefined,
        escopo: undefined,
        visibilidade: undefined,
        id_categoria: undefined,
        id_cartao: undefined,
        afeta_dre: undefined,
        afeta_acerto: undefined,
        afeta_patrimonio: undefined,
    }));

    [
        'data',
        'valor',
        'descricao',
        'pessoa',
        'escopo',
        'visibilidade',
        'afeta_dre',
        'afeta_acerto',
        'afeta_patrimonio',
    ].forEach((field) => assertError(result, 'REQUIRED_FIELD', field));
    assertError(result, 'REQUIRED_FOR_EVENT', 'id_cartao');
});

failed += test('id_compra_and_id_parcela_are_empty_for_avista', () => {
    const result = assertOk(map(baseEntry()));
    const headers = V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54];
    const idCompraIndex = headers.indexOf('id_compra');
    const idParcelaIndex = headers.indexOf('id_parcela');

    assert.strictEqual(result.mapped.rowObject.id_compra, '');
    assert.strictEqual(result.mapped.rowObject.id_parcela, '');
    assert.strictEqual(result.mapped.rowValues[idCompraIndex], '');
    assert.strictEqual(result.mapped.rowValues[idParcelaIndex], '');
    assert.strictEqual(result.mapped.rowValues.includes(undefined), false);
});

failed += test('no_faturas_row_is_generated', () => {
    const result = assertOk(map(baseEntry()));
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'faturasRow'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'faturasRows'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.mapped, 'faturasRow'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.mapped, 'faturasRows'), false);
});

failed += test('payment_fatura_settlement_is_not_implemented_in_this_phase', () => {
    const result = map(baseEntry({
        tipo_evento: 'pagamento_fatura',
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: undefined,
        id_fonte: 'FONTE_CONTA_GU',
        afeta_dre: false,
    }));
    assertError(result, 'UNSUPPORTED_EVENT', 'tipo_evento');
});

failed += test('row_width_equals_lancamentos_schema_width', () => {
    const result = assertOk(map(baseEntry()));
    assert.strictEqual(result.mapped.rowValues.length, V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54].length);
    assert.deepStrictEqual(result.mapped.headers, V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54]);
});

failed += test('inputs_are_not_mutated', () => {
    const input = baseEntry({
        data: '2026-04-29',
        competencia: '2099-12',
        id_fonte: undefined,
    });
    const cards = cardsFromSeed();
    const beforeInput = JSON.stringify(input);
    const beforeCards = JSON.stringify(cards);

    assertOk(map(input, { cards }));

    assert.strictEqual(JSON.stringify(input), beforeInput);
    assert.strictEqual(JSON.stringify(cards), beforeCards);
});

failed += test('contract_has_no_apps_script_globals', () => {
    ['SpreadsheetApp', 'LockService', 'PropertiesService', 'UrlFetchApp'].forEach((globalName) => {
        assert.strictEqual(source.includes(globalName), false, `${globalName} should not appear`);
    });
});

failed += test('contract_has_no_openai_or_vendor_calls', () => {
    ['openai', 'chat.completions', 'responses.create', 'UrlFetchApp.fetch'].forEach((needle) => {
        assert.strictEqual(source.toLowerCase().includes(needle.toLowerCase()), false, `${needle} should not appear`);
    });
});

if (failed > 0) {
    console.error(`\n${failed} V54 card purchase contract check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 card purchase contract checks passed.');
}
