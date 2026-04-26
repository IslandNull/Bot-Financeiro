const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const { validateParsedEntryV54 } = require('./lib/v54-parsed-entry-contract');
const { mapParsedEntryToLancamentoV54 } = require('./lib/v54-lancamentos-mapper');

const actionsV54Path = path.join(__dirname, '..', 'src', 'ActionsV54.js');
const actionsV54Source = fs.readFileSync(actionsV54Path, 'utf8');
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

function loadActionsV54() {
    const sandbox = {
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
    };
    vm.createContext(sandbox);
    vm.runInContext(`${actionsV54Source}\nresult = { recordEntryV54, V54_LANCAMENTOS_HEADERS };`, sandbox);
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

function makeFakeSpreadsheet(options) {
    const source = options || {};
    const headers = source.headers === undefined
        ? [...V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54]]
        : source.headers;
    const rows = source.rows ? source.rows.map((row) => [...row]) : [];
    const requestedSheets = [];
    const writes = [];
    const sheet = {
        getLastRow() {
            return 1 + rows.length;
        },
        getRange(row, column, numRows, numColumns) {
            return {
                getValues() {
                    if (row === 1 && column === 1 && numRows === 1) {
                        return [Array.from({ length: numColumns }, (_, index) => headers[index] || '')];
                    }
                    throw new Error(`Unexpected getValues range ${row}:${column}:${numRows}:${numColumns}`);
                },
                setValues(values) {
                    writes.push({ row, column, numRows, numColumns, values });
                    rows.push([...values[0]]);
                },
            };
        },
    };

    return {
        rows,
        requestedSheets,
        writes,
        getSheetByName(name) {
            requestedSheets.push(name);
            if (source.missingSheet) return null;
            if (name === 'Lancamentos_V54') return sheet;
            throw new Error(`Unexpected sheet requested: ${name}`);
        },
    };
}

function deterministicDeps(fakeSpreadsheet, lockCalls) {
    return {
        getSpreadsheet: () => fakeSpreadsheet,
        withLock(label, fn) {
            lockCalls.push(label);
            return fn();
        },
        now: () => '2026-04-26T22:00:00.000Z',
        makeId: () => 'LAN_V54_TEST_ACTION_0001',
    };
}

function deterministicMapperDeps() {
    return {
        now: () => '2026-04-26T22:00:00.000Z',
        makeId: () => 'LAN_V54_TEST_ACTION_0001',
    };
}

function record(entry, fakeSpreadsheet, lockCalls) {
    const { recordEntryV54 } = loadActionsV54();
    return recordEntryV54(entry, deterministicDeps(fakeSpreadsheet, lockCalls || []));
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

function validEntriesByMvpType() {
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
        compra_cartao: baseEntry({
            tipo_evento: 'compra_cartao',
            valor: 80,
            descricao: 'Compra credito',
            id_categoria: 'OPEX_MERCADO_CASAL',
            id_fonte: undefined,
            id_cartao: 'CARD_NUBANK_GU',
            afeta_dre: true,
            afeta_acerto: true,
            afeta_patrimonio: false,
        }),
        compra_parcelada: baseEntry({
            tipo_evento: 'compra_parcelada',
            valor: 600,
            descricao: 'Compra parcelada',
            id_categoria: 'OPEX_CASA_CASAL',
            id_fonte: undefined,
            id_cartao: 'CARD_NUBANK_GU',
            afeta_dre: true,
            afeta_acerto: true,
            afeta_patrimonio: false,
            parcelamento: {
                parcelas_total: 3,
                numero_parcela: 1,
                valor_parcela: 200,
            },
        }),
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

let failed = 0;

failed += test('actions_v54_headers_match_canonical_schema', () => {
    const { V54_LANCAMENTOS_HEADERS } = loadActionsV54();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(V54_LANCAMENTOS_HEADERS)), V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54]);
    assert.strictEqual(V54_LANCAMENTOS_HEADERS.length, 19);
});

failed += test('valid_mvp_events_match_canonical_mapper_key_fields', () => {
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

    Object.values(validEntriesByMvpType()).forEach((entry) => {
        assertCanonicalMapperParity(entry, keyFields);
    });
});

failed += test('valid_despesa_appends_one_row', () => {
    const fake = makeFakeSpreadsheet();
    const locks = [];
    const result = assertOk(record(baseEntry(), fake, locks));
    assert.strictEqual(result.sheet, 'Lancamentos_V54');
    assert.strictEqual(result.rowNumber, 2);
    assert.strictEqual(result.id_lancamento, 'LAN_V54_TEST_ACTION_0001');
    assert.strictEqual(fake.writes.length, 1);
    assert.strictEqual(fake.rows.length, 1);
    assert.strictEqual(fake.rows[0].length, 19);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(locks)), ['recordEntryV54']);
});

failed += test('valid_receita_appends_one_row', () => {
    const fake = makeFakeSpreadsheet();
    const result = assertOk(record(baseEntry({
        tipo_evento: 'receita',
        valor: '3400.00',
        descricao: 'Salario Gustavo',
        id_categoria: 'REC_SALARIO',
        id_fonte: 'FONTE_CONTA_GU',
        visibilidade: 'resumo',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
    }), fake, []));
    assert.strictEqual(result.rowObject.tipo_evento, 'receita');
    assert.strictEqual(result.rowObject.valor, 3400);
    assert.strictEqual(fake.rows.length, 1);
});

failed += test('valid_transferencia_and_aporte_with_afeta_dre_false_append_one_row', () => {
    ['transferencia', 'aporte'].forEach((tipo_evento) => {
        const fake = makeFakeSpreadsheet();
        const result = assertOk(record(baseEntry({
            tipo_evento,
            valor: 1400,
            descricao: `${tipo_evento} reserva`,
            id_categoria: 'INV_APORTE',
            id_fonte: 'FONTE_CONTA_GU',
            visibilidade: 'resumo',
            afeta_dre: false,
            afeta_acerto: true,
            afeta_patrimonio: true,
        }), fake, []));
        assert.strictEqual(result.rowObject.tipo_evento, tipo_evento);
        assert.strictEqual(result.rowObject.afeta_dre, false);
        assert.strictEqual(fake.rows.length, 1);
    });
});

failed += test('unsupported_card_installment_invoice_debt_adjustment_events_reject', () => {
    ['compra_cartao', 'compra_parcelada', 'pagamento_fatura', 'divida_pagamento', 'ajuste'].forEach((tipo_evento) => {
        const fake = makeFakeSpreadsheet();
        const result = record(baseEntry({
            tipo_evento,
            id_cartao: 'CARD_NUBANK_GU',
            id_fatura: 'FAT_TEST',
            afeta_dre: false,
        }), fake, []);
        assertError(result, 'UNSUPPORTED_EVENT', 'tipo_evento');
        assert.strictEqual(fake.writes.length, 0);
    });
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

failed += test('missing_required_fields_produce_structured_canonical_rejection', () => {
    const entry = baseEntry({
        data: undefined,
        competencia: undefined,
        valor: undefined,
        descricao: undefined,
        pessoa: undefined,
        escopo: undefined,
        visibilidade: undefined,
        id_categoria: undefined,
        id_fonte: undefined,
        afeta_dre: undefined,
        afeta_acerto: undefined,
        afeta_patrimonio: undefined,
    });
    const { canonical, actions } = assertCanonicalValidationParity(entry);

    [
        'data',
        'competencia',
        'valor',
        'descricao',
        'pessoa',
        'escopo',
        'visibilidade',
        'afeta_dre',
        'afeta_acerto',
        'afeta_patrimonio',
    ].forEach((field) => {
        assertError(actions, 'REQUIRED_FIELD', field);
        assertError(canonical, 'REQUIRED_FIELD', field);
    });
    assertError(actions, 'REQUIRED_FOR_EVENT', 'id_categoria');
    assertError(actions, 'REQUIRED_FOR_EVENT', 'id_fonte');
});

failed += test('boolean_string_rejection_matches_canonical_contract', () => {
    const { canonical, actions } = assertCanonicalValidationParity(baseEntry({
        afeta_dre: 'true',
        afeta_acerto: 'false',
        afeta_patrimonio: 'false',
    }));
    ['afeta_dre', 'afeta_acerto', 'afeta_patrimonio'].forEach((field) => {
        assertError(actions, 'INVALID_BOOLEAN', field);
        assertError(canonical, 'INVALID_BOOLEAN', field);
    });
});

failed += test('missing_lancamentos_v54_sheet_rejects', () => {
    const fake = makeFakeSpreadsheet({ missingSheet: true });
    const result = record(baseEntry(), fake, []);
    assertError(result, 'MISSING_SHEET', 'Lancamentos_V54');
    assert.deepStrictEqual(fake.requestedSheets, ['Lancamentos_V54']);
    assert.strictEqual(fake.writes.length, 0);
});

failed += test('header_mismatch_rejects', () => {
    const wrongHeaders = [...V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54]];
    wrongHeaders[0] = 'id_errado';
    const fake = makeFakeSpreadsheet({ headers: wrongHeaders });
    const result = record(baseEntry(), fake, []);
    assertError(result, 'HEADER_MISMATCH', 'Lancamentos_V54');
    assert.strictEqual(fake.writes.length, 0);
});

failed += test('row_width_is_exactly_19', () => {
    const fake = makeFakeSpreadsheet();
    const result = assertOk(record(baseEntry(), fake, []));
    assert.strictEqual(result.rowValues.length, 19);
    assert.strictEqual(fake.writes[0].numColumns, 19);
    assert.strictEqual(fake.writes[0].values[0].length, 19);
});

failed += test('optional_fields_become_empty_strings_not_undefined', () => {
    const fake = makeFakeSpreadsheet();
    const result = assertOk(record(baseEntry({
        id_cartao: undefined,
        id_fatura: undefined,
        id_compra: undefined,
        id_parcela: undefined,
    }), fake, []));
    ['id_cartao', 'id_fatura', 'id_compra', 'id_parcela'].forEach((field) => {
        assert.strictEqual(result.rowObject[field], '');
        assert.strictEqual(result.rowValues[result.rowValues.indexOf(undefined)], undefined);
    });
    assert.strictEqual(result.rowValues.includes(undefined), false);
});

failed += test('optional_link_fields_become_empty_strings_in_row_payload_like_canonical_mapper', () => {
    const entry = baseEntry({
        tipo_evento: 'transferencia',
        id_categoria: undefined,
        id_cartao: undefined,
        id_fatura: undefined,
        id_compra: undefined,
        id_parcela: undefined,
        afeta_dre: false,
    });
    const { canonical, actions } = assertCanonicalMapperParity(entry, [
        'id_categoria',
        'id_cartao',
        'id_fatura',
        'id_compra',
        'id_parcela',
    ]);

    ['id_categoria', 'id_cartao', 'id_fatura', 'id_compra', 'id_parcela'].forEach((field) => {
        const index = V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54].indexOf(field);
        assert.strictEqual(actions.rowObject[field], '');
        assert.strictEqual(canonical.rowObject[field], '');
        assert.strictEqual(actions.rowValues[index], '');
        assert.strictEqual(canonical.rowValues[index], '');
    });
});

failed += test('unsupported_mvp_events_are_rejected_by_actions_even_when_canonical_accepts', () => {
    Object.entries(unsupportedCanonicalAcceptedEntries()).forEach(([tipo_evento, entry]) => {
        const canonical = validateParsedEntryV54(entry);
        const mapped = mapParsedEntryToLancamentoV54(entry, deterministicMapperDeps());
        const fake = makeFakeSpreadsheet();
        const actions = record(entry, fake, []);

        assert.strictEqual(canonical.ok, true, `${tipo_evento} canonical validation errors: ${JSON.stringify(canonical.errors)}`);
        assert.strictEqual(mapped.ok, true, `${tipo_evento} canonical mapper errors: ${JSON.stringify(mapped.errors)}`);
        assertError(actions, 'UNSUPPORTED_EVENT', 'tipo_evento');
        assert.strictEqual(fake.writes.length, 0);
    });
});

failed += test('booleans_and_numbers_are_preserved', () => {
    const fake = makeFakeSpreadsheet();
    const result = assertOk(record(baseEntry({ valor: '12.34', afeta_acerto: false, afeta_patrimonio: true }), fake, []));
    assert.strictEqual(result.rowObject.valor, 12.34);
    assert.strictEqual(typeof result.rowObject.valor, 'number');
    assert.strictEqual(typeof result.rowObject.afeta_dre, 'boolean');
    assert.strictEqual(typeof result.rowObject.afeta_acerto, 'boolean');
    assert.strictEqual(typeof result.rowObject.afeta_patrimonio, 'boolean');
});

failed += test('injected_id_and_timestamp_are_deterministic', () => {
    const fake = makeFakeSpreadsheet();
    const result = assertOk(record(baseEntry(), fake, []));
    assert.strictEqual(result.rowObject.id_lancamento, 'LAN_V54_TEST_ACTION_0001');
    assert.strictEqual(result.rowObject.created_at, '2026-04-26T22:00:00.000Z');
});

failed += test('lock_wrapper_is_used_around_append', () => {
    const fake = makeFakeSpreadsheet();
    const locks = [];
    assertOk(record(baseEntry(), fake, locks));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(locks)), ['recordEntryV54']);
    assert.strictEqual(fake.writes.length, 1);
});

failed += test('input_is_not_mutated', () => {
    const input = baseEntry({ valor: '12.34', descricao: '  Restaurante casal  ' });
    const before = JSON.stringify(input);
    assertOk(record(input, makeFakeSpreadsheet(), []));
    assert.strictEqual(JSON.stringify(input), before);
});

failed += test('v53_sheet_names_are_never_requested', () => {
    const fake = makeFakeSpreadsheet();
    assertOk(record(baseEntry(), fake, []));
    ['Config', 'Lancamentos', 'Lançamentos', 'Dashboard', 'Investimentos', 'Parcelas'].forEach((name) => {
        assert.strictEqual(fake.requestedSheets.includes(name), false, `Unexpected V53 sheet requested: ${name}`);
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(fake.requestedSheets)), ['Lancamentos_V54']);
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

failed += test('default_production_id_generation_is_not_second_precision_only', () => {
    assert.ok(actionsV54Source.includes('randomPart'));
    assert.ok(actionsV54Source.includes('Math.random()'));
    assert.ok(actionsV54Source.includes("slice(0, 17)"));
});

if (failed > 0) {
    console.error(`\n${failed} ActionsV54 MVP check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll ActionsV54 MVP checks passed.');
}
