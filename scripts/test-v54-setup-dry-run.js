const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const setupPath = path.join(__dirname, '..', 'src', 'Setup.js');
const source = fs.readFileSync(setupPath, 'utf8');
const { V54_HEADERS } = require('./lib/v54-schema');

function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Function not found: ${name}`);

    let depth = 0;
    let seenBody = false;
    for (let i = start; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
            seenBody = true;
        }
        if (source[i] === '}') {
            depth--;
            if (seenBody && depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`Could not parse function body: ${name}`);
}

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

function loadPlanningFunctions() {
    const sandbox = {};
    const functions = [
        'isBlankHeaderRow_',
        'hasExistingDataRows_',
        'getV54Schema',
        'planSetupV54ForState',
    ].map(extractFunction).join('\n');

    vm.runInNewContext(`${functions}\nresult = { getV54Schema, planSetupV54ForState };`, sandbox);
    return sandbox.result;
}

function loadApplyFunctions(stubs) {
    const sandbox = Object.assign({ console: { log() {} } }, stubs || {});
    const functions = [
        'isBlankHeaderRow_',
        'hasExistingDataRows_',
        'getV54Schema',
        'planSetupV54ForState',
        'readV54SetupState_',
        'writeV54Headers_',
        'applySetupV54',
    ].map(extractFunction).join('\n');

    vm.runInNewContext(`${functions}\nresult = { getV54Schema, applySetupV54 };`, sandbox);
    return sandbox.result;
}

function makeFakeSpreadsheet(initialState) {
    const mutations = [];
    const sheets = {};

    function makeSheet(sheetName, sheetState) {
        return {
            getLastRow() {
                return Number(sheetState.lastRow || 0);
            },
            getLastColumn() {
                return Number(sheetState.lastColumn || 0);
            },
            getRange(row, column, numRows, numColumns) {
                return {
                    getValues() {
                        const headers = sheetState.headers || [];
                        const padded = Array.from({ length: numColumns }, (_, index) => headers[index] || '');
                        return [padded];
                    },
                    setValues(values) {
                        mutations.push({ type: 'setValues', sheet: sheetName, row, column, numRows, numColumns, values });
                        sheetState.headers = [...values[0]];
                        sheetState.lastColumn = values[0].length;
                        sheetState.lastRow = Math.max(Number(sheetState.lastRow || 0), 1);
                    },
                };
            },
            setFrozenRows(rows) {
                mutations.push({ type: 'setFrozenRows', sheet: sheetName, rows });
            },
        };
    }

    Object.keys(initialState || {}).forEach((sheetName) => {
        sheets[sheetName] = makeSheet(sheetName, Object.assign({}, initialState[sheetName]));
    });

    return {
        mutations,
        getSheetByName(sheetName) {
            return sheets[sheetName] || null;
        },
        insertSheet(sheetName) {
            if (sheets[sheetName]) throw new Error(`Sheet already exists: ${sheetName}`);
            mutations.push({ type: 'insertSheet', sheet: sheetName });
            sheets[sheetName] = makeSheet(sheetName, { headers: [], lastRow: 0, lastColumn: 0 });
            return sheets[sheetName];
        },
    };
}

function stateWithAllSheets(headersForSheet) {
    const { getV54Schema } = loadPlanningFunctions();
    const schema = getV54Schema();
    return Object.keys(schema).reduce((acc, sheetName) => {
        acc[sheetName] = {
            headers: headersForSheet(sheetName, schema[sheetName]),
            lastRow: 1,
            lastColumn: schema[sheetName].length,
        };
        return acc;
    }, {});
}

function actionsBySheet(plan) {
    return plan.actions.reduce((acc, action) => {
        acc[action.sheet] = action;
        return acc;
    }, {});
}

let failed = 0;

failed += test('planSetupV54_exists', () => {
    assert.ok(source.includes('function planSetupV54()'));
    assert.ok(source.includes('function planSetupV54ForState(state)'));
    assert.ok(source.includes('function getV54Schema()'));
    assert.ok(source.includes('function isBlankHeaderRow_(headers)'));
    assert.ok(source.includes('function hasExistingDataRows_(sheetState)'));
    assert.ok(source.includes('function readV54SetupState_(ss, schema)'));
    assert.ok(source.includes('function applySetupV54()'));
});

failed += test('planSetupV54_does_not_call_mutating_sheet_apis', () => {
    const body = [
        extractFunction('planSetupV54'),
        extractFunction('planSetupV54ForState'),
        extractFunction('getV54Schema'),
        extractFunction('isBlankHeaderRow_'),
        extractFunction('hasExistingDataRows_'),
    ].join('\n');

    [
        '.insertSheet(',
        '.deleteSheet(',
        '.setValue(',
        '.setValues(',
        '.setFormula(',
        '.clearContent(',
        '.clear(',
        '.deleteRows(',
        '.appendRow(',
    ].forEach((forbidden) => {
        assert.strictEqual(body.includes(forbidden), false, `Forbidden call found: ${forbidden}`);
    });
});

failed += test('planSetupV54_schema_contains_key_decisions', () => {
    const body = extractFunction('getV54Schema');
    assert.ok(body.includes("Config_Categorias: ['id_categoria', 'nome', 'grupo', 'tipo_movimento', 'classe_dre', 'escopo', 'comportamento_orcamento', 'afeta_acerto', 'afeta_dre', 'visibilidade_padrao', 'ativo']"));
    assert.ok(body.includes("Config_Fontes: ['id_fonte', 'nome', 'tipo', 'titular', 'ativo']"));
    assert.ok(body.includes("Cartoes: ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo']"));
    assert.ok(body.includes("Pagamentos_Fatura: ['id_pagamento', 'id_fatura'"));
    assert.ok(body.includes("Idempotency_Log: ['idempotency_key', 'source'"));
    assert.ok(body.includes("Telegram_Send_Log: ['id_notificacao', 'created_at', 'route', 'chat_id', 'phase', 'status', 'status_code', 'error', 'result_ref', 'id_lancamento', 'idempotency_key', 'text_preview', 'sent_at']"));
    assert.ok(body.includes("Parcelas_Agenda: ['id_parcela', 'id_compra'"));
    assert.ok(body.includes("Lancamentos_V54: ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_compra', 'id_parcela', 'afeta_dre', 'afeta_acerto', 'afeta_patrimonio', 'visibilidade'"));
    assert.ok(body.includes("Dividas: ['id_divida', 'nome', 'credor'"));
    assert.ok(body.includes("Fechamentos_Mensais: ['competencia', 'status', 'receitas_operacionais'"));
});

failed += test('planSetupV54_schema_matches_local_v54_headers_exactly', () => {
    const { getV54Schema } = loadPlanningFunctions();
    const appScriptSchema = JSON.parse(JSON.stringify(getV54Schema()));
    assert.deepStrictEqual(appScriptSchema, V54_HEADERS);
});

failed += test('planSetupV54_reports_create_sheet_for_empty_state', () => {
    const { planSetupV54ForState } = loadPlanningFunctions();
    const plan = planSetupV54ForState({});
    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.summary.createSheet, Object.keys(V54_HEADERS).length);
    assert.strictEqual(plan.summary.blocked, 0);
    assert.strictEqual(plan.actions.length, Object.keys(V54_HEADERS).length);
    assert.ok(plan.actions.every((action) => action.action === 'CREATE_SHEET'));
});

failed += test('planSetupV54_reports_ok_for_perfect_state', () => {
    const { planSetupV54ForState } = loadPlanningFunctions();
    const state = stateWithAllSheets((_, headers) => [...headers]);
    const plan = planSetupV54ForState(state);
    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.summary.ok, Object.keys(V54_HEADERS).length);
    assert.strictEqual(plan.summary.blocked, 0);
    assert.ok(plan.actions.every((action) => action.action === 'OK'));
});

failed += test('planSetupV54_initializes_headers_only_for_blank_existing_sheet', () => {
    const { getV54Schema, planSetupV54ForState } = loadPlanningFunctions();
    const schema = getV54Schema();
    const state = stateWithAllSheets((_, headers) => [...headers]);
    state.Config_Categorias = {
        headers: schema.Config_Categorias.map(() => ''),
        lastRow: 0,
        lastColumn: 0,
    };

    const plan = planSetupV54ForState(state);
    const actions = actionsBySheet(plan);
    assert.strictEqual(plan.ok, true);
    assert.strictEqual(actions.Config_Categorias.action, 'INITIALIZE_HEADERS');
    assert.strictEqual(plan.summary.initializeHeaders, 1);
});

failed += test('planSetupV54_blocks_header_mismatch_without_data', () => {
    const { planSetupV54ForState } = loadPlanningFunctions();
    const state = stateWithAllSheets((_, headers) => [...headers]);
    state.Cartoes.headers = ['id_cartao', 'nome_antigo'];
    state.Cartoes.lastColumn = 2;
    state.Cartoes.lastRow = 1;

    const plan = planSetupV54ForState(state);
    const actions = actionsBySheet(plan);
    assert.strictEqual(plan.ok, false);
    assert.strictEqual(actions.Cartoes.action, 'BLOCKED_HEADER_MISMATCH');
    assert.strictEqual(plan.summary.blocked, 1);
});

failed += test('planSetupV54_blocks_existing_data_with_header_mismatch', () => {
    const { planSetupV54ForState } = loadPlanningFunctions();
    const state = stateWithAllSheets((_, headers) => [...headers]);
    state.Faturas.headers = ['id_fatura', 'schema_manual'];
    state.Faturas.lastColumn = 2;
    state.Faturas.lastRow = 2;

    const plan = planSetupV54ForState(state);
    const actions = actionsBySheet(plan);
    assert.strictEqual(plan.ok, false);
    assert.strictEqual(actions.Faturas.action, 'BLOCKED_EXISTING_DATA');
    assert.strictEqual(plan.summary.blocked, 1);
});

failed += test('planSetupV54_blocks_extra_headers', () => {
    const { planSetupV54ForState } = loadPlanningFunctions();
    const state = stateWithAllSheets((_, headers) => [...headers]);
    state.Rendas.headers = [...state.Rendas.headers, 'campo_extra'];
    state.Rendas.lastColumn = state.Rendas.headers.length;

    const plan = planSetupV54ForState(state);
    const actions = actionsBySheet(plan);
    assert.strictEqual(plan.ok, false);
    assert.strictEqual(actions.Rendas.action, 'BLOCKED_EXTRA_HEADERS');
    assert.deepStrictEqual(actions.Rendas.extraHeaders, ['campo_extra']);
    assert.strictEqual(actions.Rendas.extraColumnCount, 1);
});

failed += test('planSetupV54_blocks_extra_blank_header_column_with_data_below', () => {
    const { planSetupV54ForState } = loadPlanningFunctions();
    const state = stateWithAllSheets((_, headers) => [...headers]);
    state.Rendas.headers = [...state.Rendas.headers, ''];
    state.Rendas.lastColumn = state.Rendas.headers.length;
    state.Rendas.lastRow = 2;

    const plan = planSetupV54ForState(state);
    const actions = actionsBySheet(plan);
    assert.strictEqual(plan.ok, false);
    assert.strictEqual(actions.Rendas.action, 'BLOCKED_EXTRA_HEADERS');
    assert.deepStrictEqual(actions.Rendas.extraHeaders, []);
    assert.strictEqual(actions.Rendas.extraColumnCount, 1);
    assert.strictEqual(actions.Rendas.lastColumn, state.Rendas.lastColumn);
});

failed += test('planSetupV54_ignores_v53_sheets_in_state', () => {
    const { planSetupV54ForState } = loadPlanningFunctions();
    const state = {
        Config: { headers: ['ID_CATEGORIA'], lastRow: 20, lastColumn: 6 },
        Lancamentos: { headers: ['Data'], lastRow: 50, lastColumn: 8 },
        Dashboard: { headers: ['Dashboard'], lastRow: 108, lastColumn: 7 },
        Investimentos: { headers: ['Ativo'], lastRow: 4, lastColumn: 6 },
        Parcelas: { headers: ['Descricao'], lastRow: 4, lastColumn: 8 },
    };

    const plan = planSetupV54ForState(state);
    assert.strictEqual(plan.ok, true);
    assert.ok(plan.actions.every((action) => !Object.prototype.hasOwnProperty.call(state, action.sheet)));
    assert.ok(plan.actions.every((action) => action.action === 'CREATE_SHEET'));
});

failed += test('planSetupV54_reads_full_existing_header_width', () => {
    const body = extractFunction('readV54SetupState_');
    assert.ok(body.includes('Math.max(schema[sheetName].length, lastColumn)'));
    assert.ok(body.includes('lastRow'));
    assert.ok(body.includes('lastColumn'));
});

failed += test('planSetupV54_no_longer_proposes_update_headers', () => {
    const body = extractFunction('planSetupV54ForState');
    assert.strictEqual(body.includes('UPDATE_HEADERS'), false);
    assert.ok(body.includes('BLOCKED_HEADER_MISMATCH'));
    assert.ok(body.includes('BLOCKED_EXTRA_HEADERS'));
    assert.ok(body.includes('BLOCKED_EXISTING_DATA'));
});

failed += test('applySetupV54_uses_lock_and_aborts_blocked_actions', () => {
    const schema = V54_HEADERS;
    const state = Object.keys(schema).reduce((acc, sheetName) => {
        acc[sheetName] = {
            headers: [...schema[sheetName]],
            lastRow: 1,
            lastColumn: schema[sheetName].length,
        };
        return acc;
    }, {});
    state.Cartoes = {
        headers: ['id_cartao', 'schema_manual'],
        lastRow: 2,
        lastColumn: 2,
    };

    const fakeSpreadsheet = makeFakeSpreadsheet(state);
    const locks = [];
    const { applySetupV54 } = loadApplyFunctions({
        CONFIG: { SPREADSHEET_ID: 'TEST' },
        _loadSecrets() {},
        SpreadsheetApp: { openById: () => fakeSpreadsheet },
        withScriptLock(label, fn) {
            locks.push(label);
            return fn();
        },
    });

    const result = applySetupV54();
    assert.deepStrictEqual(locks, ['applySetupV54']);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.applied, false);
    assert.strictEqual(result.blockedActions[0].action, 'BLOCKED_EXISTING_DATA');
    assert.deepStrictEqual(fakeSpreadsheet.mutations, []);
});

failed += test('applySetupV54_creates_only_missing_v54_sheets_with_headers', () => {
    const fakeSpreadsheet = makeFakeSpreadsheet({});
    const { getV54Schema, applySetupV54 } = loadApplyFunctions({
        CONFIG: { SPREADSHEET_ID: 'TEST' },
        _loadSecrets() {},
        SpreadsheetApp: { openById: () => fakeSpreadsheet },
        withScriptLock(label, fn) {
            assert.strictEqual(label, 'applySetupV54');
            return fn();
        },
    });

    const schema = getV54Schema();
    const result = applySetupV54();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.appliedActions.length, Object.keys(schema).length);
    assert.strictEqual(fakeSpreadsheet.mutations.filter((mutation) => mutation.type === 'insertSheet').length, Object.keys(schema).length);
    assert.strictEqual(fakeSpreadsheet.mutations.filter((mutation) => mutation.type === 'setValues').length, Object.keys(schema).length);
    assert.strictEqual(fakeSpreadsheet.mutations.filter((mutation) => mutation.type === 'setFrozenRows').length, Object.keys(schema).length);
    assert.ok(fakeSpreadsheet.mutations.every((mutation) => !['Config', 'Lancamentos', 'Dashboard', 'Investimentos', 'Parcelas'].includes(mutation.sheet)));
});

failed += test('applySetupV54_creates_telegram_send_log_with_exact_headers', () => {
    const fakeSpreadsheet = makeFakeSpreadsheet({});
    const { applySetupV54 } = loadApplyFunctions({
        CONFIG: { SPREADSHEET_ID: 'TEST' },
        _loadSecrets() {},
        SpreadsheetApp: { openById: () => fakeSpreadsheet },
        withScriptLock(label, fn) {
            assert.strictEqual(label, 'applySetupV54');
            return fn();
        },
    });

    const result = applySetupV54();
    const headerWrite = fakeSpreadsheet.mutations.find((mutation) => (
        mutation.type === 'setValues' && mutation.sheet === 'Telegram_Send_Log'
    ));

    assert.strictEqual(result.ok, true);
    assert.ok(headerWrite, 'Telegram_Send_Log headers must be written');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(headerWrite.values[0])), [
        'id_notificacao',
        'created_at',
        'route',
        'chat_id',
        'phase',
        'status',
        'status_code',
        'error',
        'result_ref',
        'id_lancamento',
        'idempotency_key',
        'text_preview',
        'sent_at',
    ]);
});

failed += test('applySetupV54_static_surface_is_additive_and_non_formula', () => {
    const body = [
        extractFunction('applySetupV54'),
        extractFunction('writeV54Headers_'),
    ].join('\n');

    assert.ok(body.includes("withScriptLock('applySetupV54'"));
    assert.ok(body.includes("action.action === 'CREATE_SHEET'"));
    assert.ok(body.includes("action.action === 'INITIALIZE_HEADERS'"));
    assert.ok(body.includes("action.action.indexOf('BLOCKED_') === 0"));
    assert.ok(body.includes('.insertSheet('));
    assert.ok(body.includes('.setValues('));

    [
        '.deleteSheet(',
        '.setValue(',
        '.setFormula(',
        '.clearContent(',
        '.clear(',
        '.deleteRows(',
        '.deleteColumns(',
        '.appendRow(',
        '.copyTo(',
    ].forEach((forbidden) => {
        assert.strictEqual(body.includes(forbidden), false, `Forbidden call found: ${forbidden}`);
    });
});

if (failed > 0) {
    console.error(`\n${failed} V54 setup dry-run check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 setup dry-run checks passed.');
}
