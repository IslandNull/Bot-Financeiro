'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const { V54_SEED_DATA } = require('./lib/v54-seed');
const { IDEMPOTENCY_STATUSES, hashPayload, makeSemanticFingerprint } = require('./lib/v54-idempotency-contract');
const { makeDeterministicIdempotentResultRefs, planV54IdempotentWrite } = require('./lib/v54-idempotent-write-path');
const { planStaleProcessingRecovery } = require('./lib/v54-idempotency-recovery-policy');
const { mapSingleCardPurchaseContract } = require('./lib/v54-card-purchase-contract');
const { mapInstallmentScheduleContract } = require('./lib/v54-installment-schedule-contract');
const { planExpectedFaturasUpsert } = require('./lib/v54-faturas-expected-upsert');

const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'src', '000_V54Schema.js'), 'utf8');
const actionsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ActionsV54.js'), 'utf8');
const actionsHelpersSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ActionsV54Helpers.js'), 'utf8');
const idempotencyAdapterSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ActionsV54Idempotency.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'Main.js'), 'utf8');
const IDEMPOTENCY_KEY = 'telegram:telegram_update_id:91001';
const IDEMPOTENT_REFS = makeDeterministicIdempotentResultRefs(IDEMPOTENCY_KEY);

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
    const sandbox = { console, Date, Math, JSON, Number, String, Boolean, Object, Array, RegExp };
    vm.createContext(sandbox);
    vm.runInContext(`${schemaSource}\n${actionsSource}\n${actionsHelpersSource}\n${idempotencyAdapterSource}\nresult = { recordEntryV54 };`, sandbox);
    return sandbox.result;
}

function rowObjectToValues(headers, rowObject) {
    return headers.map((header) => rowObject[header] === undefined || rowObject[header] === null ? '' : rowObject[header]);
}

function makeFakeSheet(name, headers, rows, writesBySheet) {
    const rowValues = rows || [];
    return {
        getLastRow() {
            return 1 + rowValues.length;
        },
        getRange(row, column, numRows, numColumns) {
            return {
                getValues() {
                    if (row === 1 && column === 1 && numRows === 1) {
                        return [Array.from({ length: numColumns }, (_, index) => headers[index] || '')];
                    }
                    if (row >= 2 && column === 1) {
                        return rowValues
                            .slice(row - 2, row - 2 + numRows)
                            .map((sourceRow) => Array.from({ length: numColumns }, (_, index) => sourceRow[index] === undefined ? '' : sourceRow[index]));
                    }
                    throw new Error(`Unexpected getValues range ${name}:${row}:${column}:${numRows}:${numColumns}`);
                },
                setValues(values) {
                    if (!writesBySheet[name]) writesBySheet[name] = [];
                    writesBySheet[name].push({ sheet: name, row, column, numRows, numColumns, values: values.map((valueRow) => [...valueRow]) });
                    values.forEach((valueRow, index) => {
                        const targetIndex = row - 2 + index;
                        if (targetIndex >= 0 && targetIndex < rowValues.length) {
                            rowValues[targetIndex] = [...valueRow];
                        } else {
                            rowValues.push([...valueRow]);
                        }
                    });
                },
            };
        },
    };
}

function makeFakeSpreadsheet(seed) {
    const source = seed || {};
    const writesBySheet = {};
    const requestedSheets = [];
    const rowsBySheet = {};
    const sheets = {};

    function register(sheetName, rows, headersOverride) {
        const headers = headersOverride || V54_HEADERS[sheetName];
        rowsBySheet[sheetName] = (rows || []).map((row) => rowObjectToValues(headers, row));
        sheets[sheetName] = makeFakeSheet(sheetName, headers, rowsBySheet[sheetName], writesBySheet);
    }

    register(V54_SHEETS.IDEMPOTENCY_LOG, source.idempotencyRows, source.idempotencyHeaders);
    register(V54_SHEETS.LANCAMENTOS_V54, source.lancamentosRows, source.lancamentosHeaders);
    register(V54_SHEETS.FATURAS, source.faturasRows, source.faturasHeaders);
    register(V54_SHEETS.COMPRAS_PARCELADAS, source.comprasRows, source.comprasHeaders);
    register(V54_SHEETS.PARCELAS_AGENDA, source.parcelasRows, source.parcelasHeaders);

    return {
        writesBySheet,
        requestedSheets,
        rowsBySheet,
        getSheetByName(name) {
            requestedSheets.push(name);
            if (source.missingSheet === name) return null;
            if (!sheets[name]) throw new Error(`Unexpected sheet requested: ${name}`);
            return sheets[name];
        },
    };
}

function baseEntry(overrides) {
    return Object.assign({
        tipo_evento: 'despesa',
        data: '2026-04-27',
        competencia: '2026-04',
        valor: 50,
        descricao: 'Mercado',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_GU',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: false,
    }, overrides || {});
}

function cardEntry(overrides) {
    return Object.assign(baseEntry({
        tipo_evento: 'compra_cartao',
        data: '2026-04-29',
        competencia: '2099-12',
        descricao: 'Compra no cartao',
        id_categoria: 'OPEX_RESTAURANTE_CASAL',
        id_cartao: 'CARD_NUBANK_GU',
        id_fonte: undefined,
        afeta_patrimonio: true,
    }), overrides || {});
}

function installmentEntry(overrides) {
    return Object.assign(baseEntry({
        tipo_evento: 'compra_parcelada',
        data: '2026-04-29',
        competencia: '2099-12',
        valor: 1200,
        descricao: 'Geladeira',
        id_categoria: 'OPEX_CASA_ITENS',
        id_cartao: 'CARD_NUBANK_GU',
        id_fonte: undefined,
        afeta_patrimonio: true,
        parcelamento: { parcelas_total: 3 },
    }), overrides || {});
}

function idempotencyInput(overrides) {
    return Object.assign({
        telegram_update_id: '91001',
        telegram_message_id: '77001',
        chat_id: '123456',
        payload: {
            update_id: 91001,
            message: {
                message_id: 77001,
                chat: { id: 123456 },
                text: '50 mercado',
            },
        },
    }, overrides || {});
}

function completedIdempotencyRow(overrides) {
    const input = idempotencyInput(overrides && overrides.input);
    return Object.assign({
        idempotency_key: `telegram:telegram_update_id:${input.telegram_update_id}`,
        source: 'telegram',
        telegram_update_id: String(input.telegram_update_id),
        telegram_message_id: String(input.telegram_message_id || ''),
        chat_id: String(input.chat_id || ''),
        payload_hash: hashPayload(input.payload),
        status: IDEMPOTENCY_STATUSES.COMPLETED,
        result_ref: IDEMPOTENT_REFS.id_lancamento,
        created_at: '2026-04-27T21:00:00.000Z',
        updated_at: '2026-04-27T21:01:00.000Z',
        error_code: '',
        observacao: '',
    }, overrides || {});
}

function lancamentoRow(overrides) {
    return Object.assign({
        id_lancamento: IDEMPOTENT_REFS.id_lancamento,
        data: '2026-04-27',
        competencia: '2026-04',
        tipo_evento: 'despesa',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        valor: 50,
        id_fonte: 'FONTE_CONTA_GU',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        id_cartao: '',
        id_fatura: '',
        id_compra: '',
        id_parcela: '',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: false,
        visibilidade: 'detalhada',
        descricao: 'Mercado',
        created_at: '2026-04-27T21:00:00.000Z',
    }, overrides || {});
}

function compraParceladaRow(overrides) {
    return Object.assign({
        id_compra: IDEMPOTENT_REFS.id_compra,
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
    }, overrides || {});
}

function deps(fake, overrides) {
    const source = Object.assign({ locks: [] }, overrides || {});
    return {
        getSpreadsheet: () => fake,
        withLock(label, fn) {
            source.locks.push(label);
            return fn();
        },
        now: () => '2026-04-27T21:00:00.000Z',
        makeId: () => source.makeIdValue || 'LAN_V54_ADAPTER_0001',
        makeCompraId: () => source.makeCompraIdValue || 'CP_ACTION_0001',
        mapSingleCardPurchaseContract,
        mapInstallmentScheduleContract,
        planExpectedFaturasUpsert,
        planV54IdempotentWrite,
        planStaleProcessingRecovery: source.planStaleProcessingRecovery || planStaleProcessingRecovery,
        idempotency: {
            enabled: true,
            input: source.idempotencyInput || idempotencyInput(),
            semanticEntry: source.semanticEntry,
            recovery: source.recovery || null,
        },
        readIdempotencyRows: source.readIdempotencyRows,
        readExistingMutationRefs: source.readExistingMutationRefs,
        cards: V54_SEED_DATA[V54_SHEETS.CARTOES].map((card) => ({ ...card })),
    };
}

function record(entry, fake, overrides) {
    const source = Object.assign({ locks: [] }, overrides || {});
    const { recordEntryV54 } = loadActionsV54();
    const result = recordEntryV54(entry, deps(fake, source));
    return { result, locks: source.locks };
}

let failed = 0;

failed += test('simple_event_idempotent_path_records_processing_applies_lancamento_and_marks_completed', () => {
    const fake = makeFakeSpreadsheet();
    const { result, locks } = record(baseEntry(), fake);

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.decision, 'planned_idempotent_write');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result.applied)), ['INSERT_IDEMPOTENCY_LOG', 'APPLY_DOMAIN_MUTATION', 'MARK_IDEMPOTENCY_COMPLETED']);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 2);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 1);
    assert.strictEqual(result.id_lancamento, IDEMPOTENT_REFS.id_lancamento);
    assert.deepStrictEqual(locks, ['recordEntryV54']);
});

failed += test('compra_cartao_idempotent_path_guards_lancamento_and_faturas_under_same_decision', () => {
    const fake = makeFakeSpreadsheet();
    const { result } = record(cardEntry(), fake);

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.domainMutation.kind, 'compra_cartao');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 1);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.FATURAS] || []).length, 1);
    assert.strictEqual(result.rowObject.id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
});

failed += test('compra_parcelada_idempotent_path_guards_compra_parcelas_and_faturas_without_lancamento', () => {
    const fake = makeFakeSpreadsheet();
    const { result } = record(installmentEntry(), fake);

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.domainMutation.kind, 'compra_parcelada');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.COMPRAS_PARCELADAS] || []).length, 1);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.PARCELAS_AGENDA] || []).length, 1);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.FATURAS] || []).length, 3);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
    assert.strictEqual(result.compra.rowObject.id_compra, IDEMPOTENT_REFS.id_compra);
    assert.strictEqual(result.parcelas.rowCount, 3);
});

failed += test('duplicate_completed_key_blocks_all_domain_mutations', () => {
    const fake = makeFakeSpreadsheet({ idempotencyRows: [completedIdempotencyRow()] });
    const { result } = record(cardEntry(), fake);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.decision, 'duplicate_completed');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.FATURAS] || []).length, 0);
});

failed += test('duplicate_processing_key_without_matching_domain_mutation_is_retryable_and_writes_nothing', () => {
    const processing = completedIdempotencyRow({ status: IDEMPOTENCY_STATUSES.PROCESSING, result_ref: '' });
    const fake = makeFakeSpreadsheet({ idempotencyRows: [processing] });
    const { result } = record(baseEntry(), fake);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.decision, 'duplicate_processing');
    assert.strictEqual(result.retryable, true);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
});

failed += test('processing_log_with_matching_domain_mutation_returns_completion_recovery_todo', () => {
    const processing = completedIdempotencyRow({ status: IDEMPOTENCY_STATUSES.PROCESSING, result_ref: IDEMPOTENT_REFS.id_lancamento });
    const fake = makeFakeSpreadsheet({
        idempotencyRows: [processing],
        lancamentosRows: [lancamentoRow()],
    });
    const { result } = record(baseEntry(), fake);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.decision, 'processing_with_financial_present_completion_missing');
    assert.strictEqual(result.retryable, false);
    assert.strictEqual(result.errors.some((error) => error.code === 'IDEMPOTENCY_COMPLETION_RECOVERY_TODO'), true);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
});

failed += test('processing_log_with_matching_compra_parcelada_mutation_returns_completion_recovery_todo', () => {
    const processing = completedIdempotencyRow({
        status: IDEMPOTENCY_STATUSES.PROCESSING,
        result_ref: IDEMPOTENT_REFS.id_compra,
    });
    const fake = makeFakeSpreadsheet({
        idempotencyRows: [processing],
        comprasRows: [compraParceladaRow()],
    });
    const { result } = record(installmentEntry(), fake);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.decision, 'processing_with_financial_present_completion_missing');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.COMPRAS_PARCELADAS] || []).length, 0);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.PARCELAS_AGENDA] || []).length, 0);
});

failed += test('stale_processing_adapter_returns_failed_transition_plan_without_domain_mutation', () => {
    const processing = completedIdempotencyRow({
        status: IDEMPOTENCY_STATUSES.PROCESSING,
        result_ref: '',
        updated_at: '2026-04-27T20:00:00.000Z',
    });
    const fake = makeFakeSpreadsheet({ idempotencyRows: [processing] });
    const { result } = record(baseEntry(), fake, {
        recovery: { enabled: true, staleAfterMs: 10 * 60 * 1000 },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.decision, 'stale_processing_retry_allowed');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result.plans.map((step) => step.action))), ['MARK_IDEMPOTENCY_FAILED']);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 0);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
});

failed += test('stale_processing_adapter_with_matching_lancamento_returns_completion_plan_without_duplicate', () => {
    const processing = completedIdempotencyRow({
        status: IDEMPOTENCY_STATUSES.PROCESSING,
        result_ref: IDEMPOTENT_REFS.id_lancamento,
        updated_at: '2026-04-27T20:00:00.000Z',
    });
    const fake = makeFakeSpreadsheet({
        idempotencyRows: [processing],
        lancamentosRows: [lancamentoRow()],
    });
    const { result } = record(baseEntry(), fake, {
        recovery: { enabled: true, staleAfterMs: 10 * 60 * 1000 },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.decision, 'completion_recovery_planned');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result.plans.map((step) => step.action))), ['MARK_IDEMPOTENCY_COMPLETED']);
    assert.strictEqual(result.plans[0].rowObject.status, IDEMPOTENCY_STATUSES.COMPLETED);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
});

failed += test('stale_processing_adapter_with_matching_compra_parcelada_returns_completion_plan_without_duplicate', () => {
    const processing = completedIdempotencyRow({
        status: IDEMPOTENCY_STATUSES.PROCESSING,
        result_ref: IDEMPOTENT_REFS.id_compra,
        updated_at: '2026-04-27T20:00:00.000Z',
    });
    const fake = makeFakeSpreadsheet({
        idempotencyRows: [processing],
        comprasRows: [compraParceladaRow()],
    });
    const { result } = record(installmentEntry(), fake, {
        recovery: { enabled: true, staleAfterMs: 10 * 60 * 1000 },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.decision, 'completion_recovery_planned');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result.plans.map((step) => step.action))), ['MARK_IDEMPOTENCY_COMPLETED']);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.COMPRAS_PARCELADAS] || []).length, 0);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.PARCELAS_AGENDA] || []).length, 0);
});

failed += test('same_payload_different_update_id_warns_and_allows_domain_mutation', () => {
    const payload = { message: { text: '50 mercado' } };
    const existing = completedIdempotencyRow({
        idempotency_key: 'telegram:telegram_update_id:91001',
        telegram_update_id: '91001',
        payload_hash: hashPayload(payload),
    });
    const fake = makeFakeSpreadsheet({ idempotencyRows: [existing] });
    const { result } = record(baseEntry(), fake, {
        idempotencyInput: idempotencyInput({
            telegram_update_id: '91002',
            telegram_message_id: '77002',
            payload,
        }),
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.warnings.some((warning) => warning.code === 'SAME_PAYLOAD_DIFFERENT_IDEMPOTENCY_KEY'), true);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 1);
});

failed += test('semantic_duplicate_warning_is_non_blocking_with_injected_idempotency_reader', () => {
    const semanticEntry = baseEntry();
    const existing = Object.assign(completedIdempotencyRow({
        idempotency_key: 'telegram:telegram_update_id:91000',
        telegram_update_id: '91000',
    }), {
        semantic_fingerprint: makeSemanticFingerprint(semanticEntry),
    });
    const fake = makeFakeSpreadsheet({ idempotencyRows: [existing] });
    const { result } = record(baseEntry(), fake, {
        idempotencyInput: idempotencyInput({ telegram_update_id: '91003', telegram_message_id: '77003' }),
        semanticEntry,
        readIdempotencyRows: () => [existing],
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.warnings.some((warning) => warning.code === 'POSSIBLE_SEMANTIC_DUPLICATE'), true);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 1);
});

failed += test('missing_idempotent_planner_dependency_fails_closed_without_mutation', () => {
    const fake = makeFakeSpreadsheet();
    const { recordEntryV54 } = loadActionsV54();
    const result = recordEntryV54(baseEntry(), {
        getSpreadsheet: () => fake,
        withLock: (label, fn) => fn(),
        now: () => '2026-04-27T21:00:00.000Z',
        makeId: () => 'LAN_V54_ADAPTER_0001',
        idempotency: { enabled: true, input: idempotencyInput() },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errors[0].code, 'IDEMPOTENT_WRITE_BOUNDARY_UNAVAILABLE');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 0);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
});

failed += test('idempotent_adapter_sources_do_not_use_forbidden_real_side_effect_clients', () => {
    [
        'SpreadsheetApp',
        'UrlFetchApp.fetch',
        'clasp',
        'deploy',
        'applySetupV54()',
        'applySeedV54()',
    ].forEach((needle) => {
        assert.strictEqual(idempotencyAdapterSource.includes(needle), false, `${needle} should not appear`);
    });
});



if (failed > 0) {
    console.error(`\n${failed} recordEntryV54 idempotent adapter check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll recordEntryV54 idempotent adapter checks passed.');
}
