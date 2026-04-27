const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const { V54_SEED_DATA } = require('./lib/v54-seed');
const { validateParsedEntryV54 } = require('./lib/v54-parsed-entry-contract');
const { mapParsedEntryToLancamentoV54 } = require('./lib/v54-lancamentos-mapper');
const { mapSingleCardPurchaseContract } = require('./lib/v54-card-purchase-contract');
const { mapInstallmentScheduleContract } = require('./lib/v54-installment-schedule-contract');

const actionsV54Path = path.join(__dirname, '..', 'src', 'ActionsV54.js');
const actionsV54Source = fs.readFileSync(actionsV54Path, 'utf8');
const cardPurchaseContractPath = path.join(__dirname, 'lib', 'v54-card-purchase-contract.js');
const cardPurchaseContractSource = fs.readFileSync(cardPurchaseContractPath, 'utf8');
const protectedProductionFiles = [
    'src/Main.js',
    'src/Actions.js',
    'src/Parser.js',
    'src/Commands.js',
    'src/Views.js',
];

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

function loadActionsV54(globals) {
    const sandbox = Object.assign({
        console,
        Date,
        Math,
        JSON,
        Number,
        String,
        Boolean,
        Object,
        Array,
        RegExp,
    }, globals || {});
    vm.createContext(sandbox);
    vm.runInContext(
        `${actionsV54Source}\nresult = { recordEntryV54, V54_LANCAMENTOS_HEADERS, V54_ACTIONS_MVP_SUPPORTED_EVENTS, V54_ACTIONS_UNSUPPORTED_EVENTS };`,
        sandbox,
    );
    return sandbox.result;
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

function baseCardPurchaseEntry(overrides) {
    return Object.assign({
        tipo_evento: 'compra_cartao',
        data: '2026-04-29',
        competencia: '2099-12',
        valor: 90,
        descricao: 'Compra no cartao',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        id_categoria: 'OPEX_RESTAURANTE_CASAL',
        id_cartao: 'CARD_NUBANK_GU',
        id_fonte: undefined,
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
    }, overrides || {});
}

function baseInstallmentEntry(overrides) {
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

function makeFakeSheet(name, headers, rows, writes, writesBySheet) {
    return {
        getLastRow() {
            return 1 + rows.length;
        },
        getRange(row, column, numRows, numColumns) {
            return {
                getValues() {
                    if (row === 1 && column === 1 && numRows === 1) {
                        return [Array.from({ length: numColumns }, (_, index) => headers[index] || '')];
                    }
                    throw new Error(`Unexpected getValues range ${name}:${row}:${column}:${numRows}:${numColumns}`);
                },
                setValues(values) {
                    const write = { sheet: name, row, column, numRows, numColumns, values };
                    writes.push(write);
                    if (!writesBySheet[name]) writesBySheet[name] = [];
                    writesBySheet[name].push(write);
                    values.forEach((valueRow) => {
                        rows.push([...valueRow]);
                    });
                },
            };
        },
    };
}

function makeFakeSpreadsheet(options) {
    const source = options || {};
    const lancamentosHeaders = source.headers === undefined
        ? [...V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54]]
        : source.headers;
    const lancamentosRows = source.rows ? source.rows.map((row) => [...row]) : [];
    const requestedSheets = [];
    const writes = [];
    const writesBySheet = {};
    const rowsBySheet = {};
    const sheetByName = {};

    function registerSheet(sheetName, headers, rows) {
        const targetRows = rows || [];
        rowsBySheet[sheetName] = targetRows;
        sheetByName[sheetName] = makeFakeSheet(sheetName, headers, targetRows, writes, writesBySheet);
    }

    registerSheet(V54_SHEETS.LANCAMENTOS_V54, lancamentosHeaders, lancamentosRows);

    if (source.installmentSheets) {
        const compraRows = source.installmentSheets.comprasRows
            ? source.installmentSheets.comprasRows.map((row) => [...row])
            : [];
        const parcelaRows = source.installmentSheets.parcelasRows
            ? source.installmentSheets.parcelasRows.map((row) => [...row])
            : [];
        const compraHeaders = source.installmentSheets.comprasHeaders || [...V54_HEADERS[V54_SHEETS.COMPRAS_PARCELADAS]];
        const parcelaHeaders = source.installmentSheets.parcelasHeaders || [...V54_HEADERS[V54_SHEETS.PARCELAS_AGENDA]];
        registerSheet(V54_SHEETS.COMPRAS_PARCELADAS, compraHeaders, compraRows);
        registerSheet(V54_SHEETS.PARCELAS_AGENDA, parcelaHeaders, parcelaRows);
    }

    (source.extraSheets || []).forEach((sheetName) => {
        if (sheetByName[sheetName]) return;
        registerSheet(sheetName, ['id'], []);
    });

    return {
        rows: lancamentosRows,
        requestedSheets,
        writes,
        writesBySheet,
        rowsBySheet,
        getSheetByName(name) {
            requestedSheets.push(name);
            if (source.missingSheet && name === V54_SHEETS.LANCAMENTOS_V54) return null;
            if (source.missingSheet === V54_SHEETS.COMPRAS_PARCELADAS && name === V54_SHEETS.COMPRAS_PARCELADAS) return null;
            if (source.missingSheet === V54_SHEETS.PARCELAS_AGENDA && name === V54_SHEETS.PARCELAS_AGENDA) return null;
            if (sheetByName[name]) return sheetByName[name];
            if (source.throwOnUnknownSheet === false) return null;
            throw new Error(`Unexpected sheet requested: ${name}`);
        },
    };
}

function deterministicDeps(fakeSpreadsheet, lockCalls, overrides) {
    const source = overrides || {};
    return {
        getSpreadsheet: () => fakeSpreadsheet,
        withLock(label, fn) {
            lockCalls.push(label);
            return fn();
        },
        now: source.now || (() => '2026-04-26T22:00:00.000Z'),
        makeId: source.makeId || (() => 'LAN_V54_TEST_ACTION_0001'),
        makeCompraId: source.makeCompraId || null,
        mapSingleCardPurchaseContract: source.mapSingleCardPurchaseContract || null,
        mapInstallmentScheduleContract: source.mapInstallmentScheduleContract || null,
        cards: source.cards ? source.cards.map((card) => ({ ...card })) : undefined,
    };
}

function deterministicMapperDeps() {
    return {
        now: () => '2026-04-26T22:00:00.000Z',
        makeId: () => 'LAN_V54_TEST_ACTION_0001',
    };
}

function record(entry, fakeSpreadsheet, lockCalls, overrides) {
    const { recordEntryV54 } = loadActionsV54();
    return recordEntryV54(entry, deterministicDeps(fakeSpreadsheet, lockCalls || [], overrides));
}

function assertOk(result) {
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.errors.length, 0);
    return result;
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

function assertNoAppend(fakeSpreadsheet) {
    assert.strictEqual(fakeSpreadsheet.writes.length, 0);
    assert.strictEqual(fakeSpreadsheet.rows.length, 0);
}

function assertMatchingErrors(actualErrors, expectedErrors) {
    const actualPairs = JSON.parse(JSON.stringify(actualErrors)).map((error) => `${error.code}:${error.field}`).sort();
    const expectedPairs = expectedErrors.map((error) => `${error.code}:${error.field}`).sort();
    assert.deepStrictEqual(actualPairs, expectedPairs);
}

function assertCanonicalValidationParity(entry) {
    const canonical = validateParsedEntryV54(entry);
    const actions = record(entry, makeFakeSpreadsheet(), []);

    assert.strictEqual(actions.ok, canonical.ok, JSON.stringify({ canonical: canonical.errors, actions: actions.errors }));
    if (!canonical.ok) {
        assertMatchingErrors(actions.errors, canonical.errors);
        return { canonical, actions };
    }

    assert.strictEqual(actions.errors.length, 0);
    return { canonical, actions };
}

function assertCanonicalMapperParity(entry, keyFields) {
    const canonical = mapParsedEntryToLancamentoV54(entry, deterministicMapperDeps());
    const actions = assertOk(record(entry, makeFakeSpreadsheet(), []));

    assert.strictEqual(canonical.ok, true, JSON.stringify(canonical.errors));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(actions.rowValues)), canonical.rowValues);
    keyFields.forEach((field) => {
        assert.deepStrictEqual(actions.rowObject[field], canonical.rowObject[field], field);
    });
    return { canonical, actions };
}

function validSimpleEntriesByMvpType() {
    return {
        despesa: baseEntry({
            tipo_evento: 'despesa',
            valor: '105.25',
            descricao: '  Restaurante casal  ',
            id_categoria: 'OPEX_RESTAURANTE_CASAL',
            id_fonte: 'FONTE_CONTA_GU',
            afeta_dre: true,
            afeta_acerto: true,
            afeta_patrimonio: false,
        }),
        receita: baseEntry({
            tipo_evento: 'receita',
            valor: '3400.00',
            descricao: 'Salario Gustavo',
            id_categoria: 'REC_SALARIO',
            id_fonte: 'FONTE_CONTA_GU',
            visibilidade: 'resumo',
            afeta_dre: true,
            afeta_acerto: true,
            afeta_patrimonio: true,
        }),
        transferencia: baseEntry({
            tipo_evento: 'transferencia',
            valor: 1400,
            descricao: 'transferencia reserva',
            id_categoria: undefined,
            id_fonte: 'FONTE_CONTA_GU',
            visibilidade: 'resumo',
            afeta_dre: false,
            afeta_acerto: false,
            afeta_patrimonio: true,
        }),
        aporte: baseEntry({
            tipo_evento: 'aporte',
            valor: 900,
            descricao: 'aporte reserva',
            id_categoria: undefined,
            id_fonte: 'FONTE_CONTA_GU',
            visibilidade: 'resumo',
            afeta_dre: false,
            afeta_acerto: true,
            afeta_patrimonio: true,
        }),
    };
}

function unsupportedCanonicalAcceptedEntries() {
    return {
        pagamento_fatura: baseEntry({
            tipo_evento: 'pagamento_fatura',
            valor: 1200,
            descricao: 'Pagamento fatura',
            id_categoria: undefined,
            id_fonte: 'FONTE_CONTA_GU',
            id_fatura: 'FAT_NUBANK_2026_04',
            afeta_dre: false,
            afeta_acerto: true,
            afeta_patrimonio: true,
        }),
        divida_pagamento: baseEntry({
            tipo_evento: 'divida_pagamento',
            valor: 500,
            descricao: 'Pagamento divida',
            id_categoria: 'DIV_AMORTIZACAO',
            id_fonte: 'FONTE_CONTA_GU',
            afeta_dre: true,
            afeta_acerto: true,
            afeta_patrimonio: true,
        }),
        ajuste: baseEntry({
            tipo_evento: 'ajuste',
            valor: 25,
            descricao: 'Ajuste manual',
            id_categoria: undefined,
            id_fonte: undefined,
            afeta_dre: false,
            afeta_acerto: false,
            afeta_patrimonio: true,
        }),
    };
}

function cardsById() {
    return V54_SEED_DATA[V54_SHEETS.CARTOES].reduce((acc, card) => {
        acc[card.id_cartao] = { ...card };
        return acc;
    }, {});
}

let failed = 0;

failed += test('actions_v54_headers_and_supported_events_match_phase_4b_contract', () => {
    const loaded = loadActionsV54();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(loaded.V54_LANCAMENTOS_HEADERS)), V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54]);
    assert.strictEqual(loaded.V54_LANCAMENTOS_HEADERS.length, 19);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(loaded.V54_ACTIONS_MVP_SUPPORTED_EVENTS)), ['despesa', 'receita', 'transferencia', 'aporte', 'compra_cartao', 'compra_parcelada']);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(loaded.V54_ACTIONS_UNSUPPORTED_EVENTS)), ['pagamento_fatura', 'divida_pagamento', 'ajuste']);
});

failed += test('valid_simple_events_still_match_canonical_mapper_key_fields', () => {
    const keyFields = [
        'id_lancamento',
        'data',
        'competencia',
        'tipo_evento',
        'id_categoria',
        'valor',
        'id_fonte',
        'pessoa',
        'escopo',
        'afeta_dre',
        'afeta_acerto',
        'afeta_patrimonio',
        'visibilidade',
        'descricao',
        'created_at',
    ];

    Object.values(validSimpleEntriesByMvpType()).forEach((entry) => {
        assertCanonicalMapperParity(entry, keyFields);
    });
});

failed += test('valid_despesa_appends_one_row', () => {
    const fake = makeFakeSpreadsheet();
    const locks = [];
    const result = assertOk(record(baseEntry(), fake, locks));
    assert.strictEqual(result.sheet, V54_SHEETS.LANCAMENTOS_V54);
    assert.strictEqual(result.rowNumber, 2);
    assert.strictEqual(result.id_lancamento, 'LAN_V54_TEST_ACTION_0001');
    assert.strictEqual(fake.writes.length, 1);
    assert.strictEqual(fake.rows.length, 1);
    assert.strictEqual(fake.rows[0].length, 19);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(locks)), ['recordEntryV54']);
});

failed += test('missing_lancamentos_sheet_returns_structured_error_and_appends_nothing', () => {
    const fake = makeFakeSpreadsheet({ missingSheet: true });
    const result = record(baseEntry(), fake, []);

    assertError(result, 'MISSING_SHEET', V54_SHEETS.LANCAMENTOS_V54);
    assertNoAppend(fake);
});

failed += test('header_mismatch_returns_structured_error_and_appends_nothing', () => {
    const headers = [...V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54]];
    headers[3] = 'tipo_incorreto';
    const fake = makeFakeSpreadsheet({ headers });
    const result = record(baseEntry(), fake, []);

    assertError(result, 'HEADER_MISMATCH', V54_SHEETS.LANCAMENTOS_V54);
    assertNoAppend(fake);
});

failed += test('generic_simple_event_row_width_matches_lancamentos_v54_schema', () => {
    Object.values(validSimpleEntriesByMvpType()).forEach((entry) => {
        const result = assertOk(record(entry, makeFakeSpreadsheet(), []));

        assert.strictEqual(result.rowValues.length, V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54].length);
        assert.strictEqual(result.rowValues.length, 19);
    });
});

failed += test('generic_simple_event_optional_link_fields_become_empty_strings', () => {
    const result = assertOk(record(validSimpleEntriesByMvpType().transferencia, makeFakeSpreadsheet(), []));

    ['id_categoria', 'id_cartao', 'id_fatura', 'id_compra', 'id_parcela'].forEach((field) => {
        assert.strictEqual(result.rowObject[field], '', field);
        assert.strictEqual(result.rowValues[V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54].indexOf(field)], '', field);
    });
    assert.strictEqual(result.rowValues.includes(undefined), false);
});

failed += test('missing_required_simple_event_fields_match_canonical_validation_errors', () => {
    const entry = baseEntry({
        data: undefined,
        valor: undefined,
        descricao: undefined,
        id_categoria: undefined,
        id_fonte: undefined,
    });
    const { canonical, actions } = assertCanonicalValidationParity(entry);

    ['data', 'valor', 'descricao', 'id_categoria', 'id_fonte'].forEach((field) => {
        assertError(canonical, field === 'id_categoria' || field === 'id_fonte' ? 'REQUIRED_FOR_EVENT' : 'REQUIRED_FIELD', field);
        assertError(actions, field === 'id_categoria' || field === 'id_fonte' ? 'REQUIRED_FOR_EVENT' : 'REQUIRED_FIELD', field);
    });
});

failed += test('boolean_string_flag_rejection_matches_canonical_contract', () => {
    ['afeta_dre', 'afeta_acerto', 'afeta_patrimonio'].forEach((field) => {
        const { canonical, actions } = assertCanonicalValidationParity(baseEntry({ [field]: 'true' }));

        assertError(actions, 'INVALID_BOOLEAN', field);
        assertError(canonical, 'INVALID_BOOLEAN', field);
    });
});

failed += test('compra_cartao_before_closing_appends_one_lancamento_with_current_cycle_id_fatura', () => {
    const fake = makeFakeSpreadsheet();
    const locks = [];
    const result = assertOk(record(
        baseCardPurchaseEntry({
            data: '2026-04-29',
            competencia: '2099-12',
            id_cartao: 'CARD_NUBANK_GU',
        }),
        fake,
        locks,
        { mapSingleCardPurchaseContract },
    ));

    assert.strictEqual(fake.writes.length, 1);
    assert.strictEqual(fake.rows.length, 1);
    assert.strictEqual(result.rowObject.tipo_evento, 'compra_cartao');
    assert.strictEqual(result.rowObject.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(result.rowObject.competencia, '2026-04');
    assert.strictEqual(result.rowObject.data, '2026-04-29');
    assert.strictEqual(result.rowObject.id_fonte, 'FONTE_NUBANK_GU');
    assert.strictEqual(result.rowObject.id_compra, '');
    assert.strictEqual(result.rowObject.id_parcela, '');
    assert.strictEqual(result.rowValues.length, V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54].length);
    assert.strictEqual(result.rowValues.includes(undefined), false);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(locks)), ['recordEntryV54']);
});

failed += test('compra_cartao_preserves_dre_and_patrimonio_true_flags', () => {
    const result = assertOk(record(
        baseCardPurchaseEntry({
            afeta_dre: true,
            afeta_patrimonio: true,
        }),
        makeFakeSpreadsheet(),
        [],
        { mapSingleCardPurchaseContract },
    ));

    assert.strictEqual(result.rowObject.afeta_dre, true);
    assert.strictEqual(result.rowObject.afeta_patrimonio, true);
});

failed += test('compra_cartao_preserves_acerto_true_when_input_says_true', () => {
    const result = assertOk(record(
        baseCardPurchaseEntry({ afeta_acerto: true }),
        makeFakeSpreadsheet(),
        [],
        { mapSingleCardPurchaseContract },
    ));

    assert.strictEqual(result.rowObject.afeta_acerto, true);
});

failed += test('compra_cartao_preserves_acerto_false_when_input_says_false', () => {
    const result = assertOk(record(
        baseCardPurchaseEntry({ afeta_acerto: false }),
        makeFakeSpreadsheet(),
        [],
        { mapSingleCardPurchaseContract },
    ));

    assert.strictEqual(result.rowObject.afeta_acerto, false);
});

failed += test('compra_cartao_on_closing_day_uses_same_cycle_id_fatura', () => {
    const result = assertOk(record(
        baseCardPurchaseEntry({
            data: '2026-04-30',
            id_cartao: 'CARD_NUBANK_GU',
        }),
        makeFakeSpreadsheet(),
        [],
        { mapSingleCardPurchaseContract },
    ));

    assert.strictEqual(result.rowObject.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(result.rowObject.competencia, '2026-04');
});

failed += test('compra_cartao_after_closing_uses_next_cycle_id_fatura', () => {
    const result = assertOk(record(
        baseCardPurchaseEntry({
            data: '2026-04-06',
            id_cartao: 'CARD_MP_GU',
            competencia: '2026-04',
        }),
        makeFakeSpreadsheet(),
        [],
        { mapSingleCardPurchaseContract },
    ));

    assert.strictEqual(result.rowObject.id_fatura, 'FAT_CARD_MP_GU_2026_05');
    assert.strictEqual(result.rowObject.competencia, '2026-05');
    assert.strictEqual(result.rowObject.id_fonte, 'FONTE_MP_GU');
});

failed += test('compra_cartao_december_boundary_writes_january_competencia_and_preserves_purchase_date', () => {
    const result = assertOk(record(
        baseCardPurchaseEntry({
            data: '2026-12-31',
            competencia: '2026-12',
            id_cartao: 'CARD_NUBANK_GU',
        }),
        makeFakeSpreadsheet(),
        [],
        { mapSingleCardPurchaseContract },
    ));

    assert.strictEqual(result.rowObject.data, '2026-12-31');
    assert.strictEqual(result.rowObject.competencia, '2027-01');
    assert.strictEqual(result.rowObject.id_fatura, 'FAT_CARD_NUBANK_GU_2027_01');
});

failed += test('compra_cartao_conflicting_id_fonte_fails_and_appends_nothing', () => {
    const fake = makeFakeSpreadsheet();
    const result = record(
        baseCardPurchaseEntry({
            id_cartao: 'CARD_NUBANK_GU',
            id_fonte: 'FONTE_CONTA_GU',
        }),
        fake,
        [],
        { mapSingleCardPurchaseContract },
    );
    assertError(result, 'CARD_SOURCE_CONFLICT', 'id_fonte');
    assertNoAppend(fake);
});

failed += test('compra_cartao_unknown_card_fails_and_appends_nothing', () => {
    const fake = makeFakeSpreadsheet();
    const result = record(
        baseCardPurchaseEntry({
            id_cartao: 'CARD_UNKNOWN',
        }),
        fake,
        [],
        { mapSingleCardPurchaseContract },
    );
    assertError(result, 'UNKNOWN_CARD', 'id_cartao');
    assertNoAppend(fake);
});

failed += test('compra_cartao_inactive_card_fails_and_appends_nothing', () => {
    const fake = makeFakeSpreadsheet();
    const cards = V54_SEED_DATA[V54_SHEETS.CARTOES].map((card) => (
        card.id_cartao === 'CARD_NUBANK_GU' ? { ...card, ativo: false } : { ...card }
    ));
    const result = record(
        baseCardPurchaseEntry({
            id_cartao: 'CARD_NUBANK_GU',
        }),
        fake,
        [],
        {
            mapSingleCardPurchaseContract,
            cards,
        },
    );
    assertError(result, 'INACTIVE_CARD', 'id_cartao');
    assertNoAppend(fake);
});

failed += test('valid_compra_parcelada_appends_one_compra_and_n_parcelas_without_lancamentos', () => {
    const fake = makeFakeSpreadsheet({
        installmentSheets: {},
        extraSheets: [V54_SHEETS.FATURAS, V54_SHEETS.PAGAMENTOS_FATURA],
    });
    const locks = [];
    const result = assertOk(record(
        baseInstallmentEntry({ parcelamento: { parcelas_total: 3 } }),
        fake,
        locks,
        {
            mapInstallmentScheduleContract,
            makeCompraId: () => 'CP_ACTION_0001',
        },
    ));

    assert.strictEqual(result.sheet, V54_SHEETS.COMPRAS_PARCELADAS);
    assert.strictEqual(result.compra.rowObject.id_compra, 'CP_ACTION_0001');
    assert.strictEqual(result.parcelas.rowCount, 3);
    assert.deepStrictEqual(result.parcelas.rowObjects.map((row) => row.id_compra), ['CP_ACTION_0001', 'CP_ACTION_0001', 'CP_ACTION_0001']);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.COMPRAS_PARCELADAS] || []).length, 1);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.PARCELAS_AGENDA] || []).length, 1);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.FATURAS] || []).length, 0);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.PAGAMENTOS_FATURA] || []).length, 0);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(locks)), ['recordEntryV54']);
});

failed += test('duplicate_same_day_card_description_installments_get_distinct_injected_id_compra', () => {
    let seq = 0;
    const makeCompraId = (entry) => {
        seq += 1;
        return `CP_UNIQUE_${entry.id_cartao}_${entry.data}_${String(seq).padStart(2, '0')}`;
    };

    const firstFake = makeFakeSpreadsheet({ installmentSheets: {} });
    const secondFake = makeFakeSpreadsheet({ installmentSheets: {} });
    const first = assertOk(record(baseInstallmentEntry({
        data: '2026-04-29',
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'Mercado Assai',
    }), firstFake, [], { mapInstallmentScheduleContract, makeCompraId }));
    const second = assertOk(record(baseInstallmentEntry({
        data: '2026-04-29',
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'Mercado Assai',
    }), secondFake, [], { mapInstallmentScheduleContract, makeCompraId }));

    assert.notStrictEqual(first.compra.rowObject.id_compra, second.compra.rowObject.id_compra);
});

failed += test('compra_parcelada_inconsistent_valor_parcela_fails_and_appends_nothing', () => {
    const fake = makeFakeSpreadsheet({ installmentSheets: {} });
    const result = record(baseInstallmentEntry({
        valor: 1200,
        parcelamento: { parcelas_total: 3, valor_parcela: 399.99 },
    }), fake, [], { mapInstallmentScheduleContract, makeCompraId: () => 'CP_ACTION_MISMATCH' });

    assertError(result, 'PARCEL_VALUE_MISMATCH', 'parcelamento.valor_parcela');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.COMPRAS_PARCELADAS] || []).length, 0);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.PARCELAS_AGENDA] || []).length, 0);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
});

failed += test('compra_parcelada_unknown_inactive_and_conflicting_card_fail_and_append_nothing', () => {
    const cards = V54_SEED_DATA[V54_SHEETS.CARTOES].map((card) => (
        card.id_cartao === 'CARD_NUBANK_GU' ? { ...card, ativo: false } : { ...card }
    ));

    [
        { entry: baseInstallmentEntry({ id_cartao: 'CARD_UNKNOWN' }), code: 'UNKNOWN_CARD', field: 'id_cartao', options: {} },
        { entry: baseInstallmentEntry({ id_cartao: 'CARD_NUBANK_GU' }), code: 'INACTIVE_CARD', field: 'id_cartao', options: { cards } },
        {
            entry: baseInstallmentEntry({ id_cartao: 'CARD_NUBANK_GU', id_fonte: 'FONTE_CONTA_GU' }),
            code: 'CARD_SOURCE_CONFLICT',
            field: 'id_fonte',
            options: {},
        },
    ].forEach(({ entry, code, field, options }) => {
        const fake = makeFakeSpreadsheet({ installmentSheets: {} });
        const result = record(entry, fake, [], Object.assign({
            mapInstallmentScheduleContract,
            makeCompraId: () => 'CP_ACTION_FAIL',
        }, options));
        assertError(result, code, field);
        assert.strictEqual((fake.writesBySheet[V54_SHEETS.COMPRAS_PARCELADAS] || []).length, 0);
        assert.strictEqual((fake.writesBySheet[V54_SHEETS.PARCELAS_AGENDA] || []).length, 0);
        assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
    });
});

failed += test('pagamento_fatura_remains_unsupported', () => {
    const fake = makeFakeSpreadsheet({ installmentSheets: {} });
    const result = record(baseEntry({
        tipo_evento: 'pagamento_fatura',
        id_fatura: 'FAT_TEST',
        afeta_dre: false,
    }), fake, [], {
        mapSingleCardPurchaseContract,
        mapInstallmentScheduleContract,
    });

    assertError(result, 'UNSUPPORTED_EVENT', 'tipo_evento');
    assert.strictEqual(fake.writes.length, 0);
});

failed += test('no_fake_rows_appended_to_faturas_pagamentos_or_installments', () => {
    const fake = makeFakeSpreadsheet({
        extraSheets: [
            V54_SHEETS.FATURAS,
            V54_SHEETS.PAGAMENTOS_FATURA,
            V54_SHEETS.COMPRAS_PARCELADAS,
            V54_SHEETS.PARCELAS_AGENDA,
        ],
    });
    assertOk(record(baseCardPurchaseEntry(), fake, [], { mapSingleCardPurchaseContract }));

    [
        V54_SHEETS.FATURAS,
        V54_SHEETS.PAGAMENTOS_FATURA,
        V54_SHEETS.COMPRAS_PARCELADAS,
        V54_SHEETS.PARCELAS_AGENDA,
    ].forEach((sheetName) => {
        const writes = fake.writesBySheet[sheetName] || [];
        assert.strictEqual(writes.length, 0, `${sheetName} should not receive writes`);
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(fake.requestedSheets)), [V54_SHEETS.LANCAMENTOS_V54]);
});

failed += test('card_purchase_lock_wrapper_is_used_around_append', () => {
    const fake = makeFakeSpreadsheet();
    const locks = [];
    assertOk(record(baseCardPurchaseEntry(), fake, locks, { mapSingleCardPurchaseContract }));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(locks)), ['recordEntryV54']);
    assert.strictEqual(fake.writes.length, 1);
});

failed += test('card_purchase_uses_injected_id_and_timestamp_deterministically', () => {
    const fake = makeFakeSpreadsheet();
    const result = assertOk(record(
        baseCardPurchaseEntry({ data: '2026-04-29' }),
        fake,
        [],
        {
            mapSingleCardPurchaseContract,
            now: () => '2030-01-02T03:04:05.000Z',
            makeId: () => 'LAN_V54_CARD_ACTION_FIXED',
        },
    ));
    assert.strictEqual(result.rowObject.id_lancamento, 'LAN_V54_CARD_ACTION_FIXED');
    assert.strictEqual(result.rowObject.created_at, '2030-01-02T03:04:05.000Z');
});

failed += test('invalid_parsed_entry_rejects_before_append', () => {
    const fake = makeFakeSpreadsheet();
    const result = record(baseEntry({ valor: '12,34' }), fake, []);
    assertError(result, 'AMBIGUOUS_MONEY_STRING', 'valor');
    assert.strictEqual(fake.writes.length, 0);
});

failed += test('comma_money_string_rejection_matches_canonical_contract', () => {
    const { canonical, actions } = assertCanonicalValidationParity(baseEntry({ valor: '12,34' }));
    assertError(actions, 'AMBIGUOUS_MONEY_STRING', 'valor');
    assertError(canonical, 'AMBIGUOUS_MONEY_STRING', 'valor');
});

failed += test('unknown_field_rejection_matches_canonical_contract', () => {
    const { canonical, actions } = assertCanonicalValidationParity(baseEntry({ unexpected_field: 'nope' }));
    assertError(actions, 'UNKNOWN_FIELD', 'unexpected_field');
    assertError(canonical, 'UNKNOWN_FIELD', 'unexpected_field');
});

failed += test('unsupported_non_card_events_are_rejected_even_when_canonical_accepts', () => {
    Object.entries(unsupportedCanonicalAcceptedEntries()).forEach(([tipo_evento, entry]) => {
        const canonical = validateParsedEntryV54(entry);
        const mapped = mapParsedEntryToLancamentoV54(entry, deterministicMapperDeps());
        const fake = makeFakeSpreadsheet();
        const actions = record(entry, fake, [], { mapSingleCardPurchaseContract });

        assert.strictEqual(canonical.ok, true, `${tipo_evento} canonical validation errors: ${JSON.stringify(canonical.errors)}`);
        assert.strictEqual(mapped.ok, true, `${tipo_evento} canonical mapper errors: ${JSON.stringify(mapped.errors)}`);
        assertError(actions, 'UNSUPPORTED_EVENT', 'tipo_evento');
        assert.strictEqual(fake.writes.length, 0);
    });
});

failed += test('input_is_not_mutated_for_simple_or_card_entries', () => {
    const simpleInput = baseEntry({ valor: '12.34', descricao: '  Restaurante casal  ' });
    const cardInput = baseCardPurchaseEntry({ competencia: '2099-12', id_fonte: undefined });
    const simpleBefore = JSON.stringify(simpleInput);
    const cardBefore = JSON.stringify(cardInput);

    assertOk(record(simpleInput, makeFakeSpreadsheet(), []));
    assertOk(record(cardInput, makeFakeSpreadsheet(), [], { mapSingleCardPurchaseContract }));

    assert.strictEqual(JSON.stringify(simpleInput), simpleBefore);
    assert.strictEqual(JSON.stringify(cardInput), cardBefore);
});

failed += test('v53_sheet_names_are_never_requested', () => {
    const fake = makeFakeSpreadsheet();
    assertOk(record(baseCardPurchaseEntry(), fake, [], { mapSingleCardPurchaseContract }));
    ['Config', 'Lancamentos', 'Lançamentos', 'Dashboard', 'Investimentos', 'Parcelas'].forEach((name) => {
        assert.strictEqual(fake.requestedSheets.includes(name), false, `Unexpected V53 sheet requested: ${name}`);
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(fake.requestedSheets)), [V54_SHEETS.LANCAMENTOS_V54]);
});

failed += test('protected_production_files_are_not_loaded_or_referenced_by_actions_v54', () => {
    protectedProductionFiles.forEach((filePath) => {
        const basename = path.basename(filePath);
        assert.strictEqual(actionsV54Source.includes(basename), false, `${basename} should not be referenced by ActionsV54`);
    });
});

failed += test('actions_v54_does_not_use_require_or_node_modules', () => {
    assert.strictEqual(/\brequire\s*\(/.test(actionsV54Source), false);
    assert.strictEqual(/module\.exports/.test(actionsV54Source), false);
});

failed += test('card_purchase_contract_has_no_apps_script_globals', () => {
    ['SpreadsheetApp', 'LockService', 'PropertiesService', 'UrlFetchApp'].forEach((globalName) => {
        assert.strictEqual(cardPurchaseContractSource.includes(globalName), false, `${globalName} should not appear`);
    });
});

failed += test('no_openai_or_vendor_calls_in_actions_or_card_purchase_contract', () => {
    ['openai', 'chat.completions', 'responses.create', 'UrlFetchApp.fetch'].forEach((needle) => {
        assert.strictEqual(actionsV54Source.toLowerCase().includes(needle.toLowerCase()), false, `${needle} should not appear in ActionsV54`);
        assert.strictEqual(cardPurchaseContractSource.toLowerCase().includes(needle.toLowerCase()), false, `${needle} should not appear in card purchase contract`);
    });
});

failed += test('card_purchase_missing_contract_dependency_returns_structured_error', () => {
    const result = record(baseCardPurchaseEntry(), makeFakeSpreadsheet(), []);
    assertError(result, 'CARD_CONTRACT_UNAVAILABLE', 'tipo_evento');
});

failed += test('card_purchase_cycle_and_card_source_resolution_match_seed_cards', () => {
    const cards = cardsById();
    const resultNubank = assertOk(record(baseCardPurchaseEntry({
        data: '2026-04-29',
        id_cartao: 'CARD_NUBANK_GU',
    }), makeFakeSpreadsheet(), [], { mapSingleCardPurchaseContract }));
    const resultMp = assertOk(record(baseCardPurchaseEntry({
        data: '2026-04-06',
        id_cartao: 'CARD_MP_GU',
    }), makeFakeSpreadsheet(), [], { mapSingleCardPurchaseContract }));

    assert.strictEqual(resultNubank.rowObject.id_fonte, cards.CARD_NUBANK_GU.id_fonte);
    assert.strictEqual(resultMp.rowObject.id_fonte, cards.CARD_MP_GU.id_fonte);
});

if (failed > 0) {
    console.error(`\n${failed} ActionsV54 MVP check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll ActionsV54 MVP checks passed.');
}
