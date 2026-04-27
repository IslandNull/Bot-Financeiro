const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const { V54_SEED_DATA } = require('./lib/v54-seed');
const {
    mapInstallmentScheduleContract,
    splitCentsDeterministically,
} = require('./lib/v54-installment-schedule-contract');

const sourcePath = path.join(__dirname, 'lib', 'v54-installment-schedule-contract.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const deterministicOptions = {
    makeCompraId: () => 'CP_TEST_0001',
    makeParcelaId: (_entry, numeroParcela, idCompra) => `${idCompra}_PARC_${String(numeroParcela).padStart(2, '0')}`,
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
        tipo_evento: 'compra_parcelada',
        data: '2026-04-29',
        competencia: '2099-12',
        valor: 1200,
        descricao: 'Geladeira',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        id_categoria: 'OPEX_CASA_ITENS',
        id_cartao: 'CARD_NUBANK_GU',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
        parcelamento: {
            parcelas_total: 3,
        },
    }, overrides || {});
}

function map(entry, options) {
    return mapInstallmentScheduleContract(entry, Object.assign({}, deterministicOptions, options || {}));
}

function assertOk(result) {
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.compras.rowObjects.length, 1);
    assert.ok(result.parcelas.rowObjects.length > 0);
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

function sum(values) {
    return Number(values.reduce((acc, value) => acc + value, 0).toFixed(2));
}

let failed = 0;

failed += test('valid_n_installments_maps_one_purchase_and_n_schedule_rows', () => {
    const result = assertOk(map(baseEntry({ valor: 1200, parcelamento: { parcelas_total: 3 } })));

    assert.strictEqual(result.compras.rowObjects.length, 1);
    assert.strictEqual(result.parcelas.rowObjects.length, 3);
    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.numero_parcela), [1, 2, 3]);
    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.valor_parcela), [400, 400, 400]);
    assert.strictEqual(sum(result.parcelas.rowObjects.map((row) => row.valor_parcela)), 1200);
});

failed += test('row_headers_align_with_schema', () => {
    const result = assertOk(map(baseEntry()));

    assert.deepStrictEqual(result.compras.headers, V54_HEADERS[V54_SHEETS.COMPRAS_PARCELADAS]);
    assert.deepStrictEqual(result.parcelas.headers, V54_HEADERS[V54_SHEETS.PARCELAS_AGENDA]);
    assert.strictEqual(result.compras.rowValues[0].length, V54_HEADERS[V54_SHEETS.COMPRAS_PARCELADAS].length);
    assert.strictEqual(result.parcelas.rowValues[0].length, V54_HEADERS[V54_SHEETS.PARCELAS_AGENDA].length);
    assert.strictEqual(result.compras.rowValues[0].includes(undefined), false);
    assert.strictEqual(result.parcelas.rowValues[0].includes(undefined), false);
});

failed += test('purchase_row_uses_expected_status_and_fields', () => {
    const result = assertOk(map(baseEntry()));
    assert.deepStrictEqual(result.compras.rowObject, undefined);

    assert.deepStrictEqual(result.compras.rowObjects[0], {
        id_compra: 'CP_TEST_0001',
        data_compra: '2026-04-29',
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'Geladeira',
        id_categoria: 'OPEX_CASA_ITENS',
        valor_total: 1200,
        parcelas_total: 3,
        responsavel: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        status: 'ativa',
    });
});

failed += test('schedule_rows_use_pending_status_and_empty_id_lancamento', () => {
    const result = assertOk(map(baseEntry()));

    result.parcelas.rowObjects.forEach((row) => {
        assert.strictEqual(row.status, 'pendente');
        assert.strictEqual(row.id_lancamento, '');
        assert.strictEqual(row.id_compra, 'CP_TEST_0001');
    });
});

failed += test('first_parcel_uses_purchase_date_invoice_cycle', () => {
    const result = assertOk(map(baseEntry({ data: '2026-04-29', id_cartao: 'CARD_NUBANK_GU' })));

    assert.strictEqual(result.parcelas.rowObjects[0].competencia, '2026-04');
    assert.strictEqual(result.parcelas.rowObjects[0].id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
});

failed += test('later_parcels_advance_one_invoice_cycle_each', () => {
    const result = assertOk(map(baseEntry({
        data: '2026-04-29',
        id_cartao: 'CARD_NUBANK_GU',
        parcelamento: { parcelas_total: 4 },
    })));

    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.competencia), [
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
    ]);
    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.id_fatura), [
        'FAT_CARD_NUBANK_GU_2026_04',
        'FAT_CARD_NUBANK_GU_2026_05',
        'FAT_CARD_NUBANK_GU_2026_06',
        'FAT_CARD_NUBANK_GU_2026_07',
    ]);
});

failed += test('purchase_on_closing_day_uses_that_cycle', () => {
    const result = assertOk(map(baseEntry({ data: '2026-04-30', id_cartao: 'CARD_NUBANK_GU' })));

    assert.strictEqual(result.parcelas.rowObjects[0].competencia, '2026-04');
    assert.strictEqual(result.parcelas.rowObjects[0].id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
});

failed += test('purchase_after_closing_uses_next_cycle', () => {
    const result = assertOk(map(baseEntry({ data: '2026-04-06', id_cartao: 'CARD_MP_GU' })));

    assert.strictEqual(result.parcelas.rowObjects[0].competencia, '2026-05');
    assert.strictEqual(result.parcelas.rowObjects[0].id_fatura, 'FAT_CARD_MP_GU_2026_05');
});

failed += test('december_to_january_boundary_advances_correctly', () => {
    const result = assertOk(map(baseEntry({
        data: '2026-12-31',
        id_cartao: 'CARD_NUBANK_GU',
        parcelamento: { parcelas_total: 2 },
    })));

    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.competencia), ['2027-01', '2027-02']);
    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.id_fatura), [
        'FAT_CARD_NUBANK_GU_2027_01',
        'FAT_CARD_NUBANK_GU_2027_02',
    ]);
});

failed += test('february_closing_clamp_advances_to_march_for_second_parcel', () => {
    const result = assertOk(map(baseEntry({
        data: '2026-02-28',
        id_cartao: 'CARD_NUBANK_GU',
        parcelamento: { parcelas_total: 2 },
    })));

    assert.deepStrictEqual(result.cycles.map((cycle) => cycle.data_fechamento), ['2026-02-28', '2026-03-30']);
    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.competencia), ['2026-02', '2026-03']);
});

failed += test('uneven_split_100_over_3_is_deterministic_and_sums', () => {
    const result = assertOk(map(baseEntry({ valor: 100, parcelamento: { parcelas_total: 3 } })));

    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.valor_parcela), [33.34, 33.33, 33.33]);
    assert.strictEqual(sum(result.parcelas.rowObjects.map((row) => row.valor_parcela)), 100);
    assert.deepStrictEqual(splitCentsDeterministically(100, 3).cents, [3334, 3333, 3333]);
});

failed += test('valor_parcela_absent_uses_current_deterministic_split', () => {
    const result = assertOk(map(baseEntry({
        valor: 100,
        parcelamento: { parcelas_total: 3 },
    })));

    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.valor_parcela), [33.34, 33.33, 33.33]);
});

failed += test('valor_parcela_matching_split_is_accepted', () => {
    const result = assertOk(map(baseEntry({
        valor: 1200,
        parcelamento: { parcelas_total: 3, valor_parcela: 400 },
    })));

    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.valor_parcela), [400, 400, 400]);
});

failed += test('valor_parcela_inconsistent_returns_structured_error_and_no_rows', () => {
    const result = map(baseEntry({
        valor: 1200,
        parcelamento: { parcelas_total: 3, valor_parcela: 399.99 },
    }));

    assertError(result, 'PARCEL_VALUE_MISMATCH', 'parcelamento.valor_parcela');
    assert.strictEqual(result.compras.rowObjects.length, 0);
    assert.strictEqual(result.parcelas.rowObjects.length, 0);
});

failed += test('deterministic_ids_can_be_dependency_injected', () => {
    const result = assertOk(map(baseEntry(), {
        makeCompraId: () => 'CP_CUSTOM',
        makeParcelaId: (_entry, numeroParcela, idCompra) => `${idCompra}_${numeroParcela}`,
    }));

    assert.strictEqual(result.compras.rowObjects[0].id_compra, 'CP_CUSTOM');
    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.id_parcela), [
        'CP_CUSTOM_1',
        'CP_CUSTOM_2',
        'CP_CUSTOM_3',
    ]);
});

failed += test('default_id_compra_is_deterministic_for_identical_input', () => {
    const first = mapInstallmentScheduleContract(baseEntry());
    const second = mapInstallmentScheduleContract(baseEntry());

    assertOk(first);
    assertOk(second);
    assert.strictEqual(first.compras.rowObjects[0].id_compra, second.compras.rowObjects[0].id_compra);
    assert.deepStrictEqual(
        first.parcelas.rowObjects.map((row) => row.id_parcela),
        second.parcelas.rowObjects.map((row) => row.id_parcela),
    );
});

failed += test('duplicate_default_id_compra_behavior_is_explicit_for_same_day_card_description', () => {
    const first = assertOk(mapInstallmentScheduleContract(baseEntry({
        data: '2026-04-29',
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'Mercado Assai',
    })));
    const second = assertOk(mapInstallmentScheduleContract(baseEntry({
        data: '2026-04-29',
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'Mercado Assai',
    })));

    assert.strictEqual(first.compras.rowObjects[0].id_compra, second.compras.rowObjects[0].id_compra);
});

failed += test('injected_makeCompraId_can_disambiguate_duplicate_purchases_for_future_fake_write_path', () => {
    let sequence = 0;
    const makeCompraId = (entry) => {
        sequence += 1;
        return `CP_UNIQUE_${entry.id_cartao}_${entry.data}_${String(sequence).padStart(2, '0')}`;
    };
    const first = assertOk(map(baseEntry({
        data: '2026-04-29',
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'Mercado Assai',
    }), { makeCompraId }));
    const second = assertOk(map(baseEntry({
        data: '2026-04-29',
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'Mercado Assai',
    }), { makeCompraId }));

    assert.notStrictEqual(first.compras.rowObjects[0].id_compra, second.compras.rowObjects[0].id_compra);
});

failed += test('unknown_card_returns_structured_error', () => {
    assertError(map(baseEntry({ id_cartao: 'CARD_UNKNOWN' })), 'UNKNOWN_CARD', 'id_cartao');
});

failed += test('inactive_card_returns_structured_error', () => {
    const cards = cardsFromSeed().map((card) => (card.id_cartao === 'CARD_NUBANK_GU' ? { ...card, ativo: false } : card));

    assertError(map(baseEntry({ id_cartao: 'CARD_NUBANK_GU' }), { cards }), 'INACTIVE_CARD', 'id_cartao');
});

failed += test('conflicting_card_source_returns_structured_error', () => {
    assertError(map(baseEntry({
        id_cartao: 'CARD_NUBANK_GU',
        id_fonte: 'FONTE_CONTA_GU',
    })), 'CARD_SOURCE_CONFLICT', 'id_fonte');
});

failed += test('missing_or_invalid_parcelamento_returns_structured_errors', () => {
    assertError(map(baseEntry({ parcelamento: undefined })), 'REQUIRED_FOR_EVENT', 'parcelamento');
    assertError(map(baseEntry({ parcelamento: { parcelas_total: 1 } })), 'INVALID_MINIMUM', 'parcelamento.parcelas_total');
    assertError(map(baseEntry({ parcelamento: { parcelas_total: 3, numero_parcela: 4 } })), 'INVALID_INSTALLMENT_NUMBER', 'parcelamento.numero_parcela');
});

failed += test('invalid_purchase_date_returns_structured_error', () => {
    assertError(map(baseEntry({ data: '2026-02-31' })), 'INVALID_DATE', 'purchaseDate');
});

failed += test('input_and_cards_are_not_mutated', () => {
    const input = baseEntry({
        data: '2026-04-29',
        competencia: '2099-12',
        parcelamento: { parcelas_total: 3 },
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

failed += test('does_not_generate_lancamentos_faturas_or_pagamentos_rows', () => {
    const result = assertOk(map(baseEntry()));

    [
        'lancamento',
        'lancamentos',
        'lancamentosRow',
        'lancamentosRows',
        'fatura',
        'faturas',
        'faturasRow',
        'faturasRows',
        'pagamento',
        'pagamentos',
        'pagamentosRow',
        'pagamentosRows',
    ].forEach((field) => {
        assert.strictEqual(Object.prototype.hasOwnProperty.call(result, field), false, `${field} should not exist`);
    });
});

if (failed > 0) {
    console.error(`\n${failed} V54 installment schedule contract check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 installment schedule contract checks passed.');
}
