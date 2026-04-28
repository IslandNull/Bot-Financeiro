'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const { V54_SEED_DATA } = require('./lib/v54-seed');
const { validateParsedEntryV54 } = require('./lib/v54-parsed-entry-contract');
const { planV54IdempotentWrite } = require('./lib/v54-idempotent-write-path');
const { mapSingleCardPurchaseContract } = require('./lib/v54-card-purchase-contract');
const { mapInstallmentScheduleContract } = require('./lib/v54-installment-schedule-contract');
const { planExpectedFaturasUpsert } = require('./lib/v54-faturas-expected-upsert');

const root = path.join(__dirname, '..');
const actionsSource = fs.readFileSync(path.join(root, 'src', 'ActionsV54.js'), 'utf8');
const idempotencySource = fs.readFileSync(path.join(root, 'src', 'ActionsV54Idempotency.js'), 'utf8');
const parserSource = fs.readFileSync(path.join(root, 'src', 'ParserV54.js'), 'utf8');
const contextSource = fs.readFileSync(path.join(root, 'src', 'ParserV54Context.js'), 'utf8');
const openAiSource = fs.readFileSync(path.join(root, 'src', 'ParserV54OpenAI.js'), 'utf8');
const viewsSource = fs.readFileSync(path.join(root, 'src', 'ViewsV54.js'), 'utf8');
const handlerSource = fs.readFileSync(path.join(root, 'src', 'HandlerV54.js'), 'utf8');
const runnerSource = fs.readFileSync(path.join(root, 'src', 'RunnerV54.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'src', 'Main.js'), 'utf8');

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

function loadRunner(extraSandbox) {
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
    }, extraSandbox || {});
    vm.createContext(sandbox);
    vm.runInContext(
        [
            actionsSource,
            idempotencySource,
            parserSource,
            contextSource,
            openAiSource,
            viewsSource,
            handlerSource,
            runnerSource,
            'result = { runV54ManualShadow, runManualShadowV54 };',
        ].join('\n'),
        sandbox,
    );
    return sandbox.result;
}

function rowObjectToValues(headers, rowObject) {
    return headers.map((header) => rowObject[header] === undefined || rowObject[header] === null ? '' : rowObject[header]);
}

function makeFakeSheet(name, headers, rowObjects, writesBySheet) {
    const rows = (rowObjects || []).map((row) => rowObjectToValues(headers, row));
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
                    if (row >= 2 && column === 1) {
                        return rows
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
                        if (targetIndex >= 0 && targetIndex < rows.length) {
                            rows[targetIndex] = [...valueRow];
                        } else {
                            rows.push([...valueRow]);
                        }
                    });
                },
            };
        },
    };
}

function makeFakeSpreadsheet(overrides) {
    const source = overrides || {};
    const requestedSheets = [];
    const writesBySheet = {};
    const sheets = {};

    function register(sheetName, rowObjects, headersOverride) {
        sheets[sheetName] = makeFakeSheet(sheetName, headersOverride || V54_HEADERS[sheetName], rowObjects || [], writesBySheet);
    }

    register(V54_SHEETS.CONFIG_CATEGORIAS, [
        { id_categoria: 'OPEX_MERCADO_SEMANA', nome: 'Mercado semana', grupo: 'Casa', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'variavel', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
        { id_categoria: 'OPEX_RESTAURANTE_CASAL', nome: 'Restaurante casal', grupo: 'Lazer', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'variavel', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
        { id_categoria: 'OPEX_CASA_ITENS', nome: 'Itens da casa', grupo: 'Casa', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'planejado', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
    ]);
    register(V54_SHEETS.CONFIG_FONTES, [
        { id_fonte: 'FONTE_CONTA_GU', nome: 'Conta Gustavo', tipo: 'conta', titular: 'Gustavo', ativo: true },
        { id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gu', tipo: 'cartao', titular: 'Gustavo', ativo: true },
    ]);
    register(V54_SHEETS.CARTOES, V54_SEED_DATA[V54_SHEETS.CARTOES].map((card) => ({ ...card })));
    register(V54_SHEETS.IDEMPOTENCY_LOG, source.idempotencyRows || []);
    register(V54_SHEETS.LANCAMENTOS_V54, source.lancamentosRows || []);
    register(V54_SHEETS.FATURAS, source.faturasRows || []);
    register(V54_SHEETS.COMPRAS_PARCELADAS, source.comprasRows || []);
    register(V54_SHEETS.PARCELAS_AGENDA, source.parcelasRows || []);

    return {
        requestedSheets,
        writesBySheet,
        getSheetByName(name) {
            requestedSheets.push(name);
            if (source.missingSheet === name) return null;
            if (!sheets[name]) throw new Error(`Unexpected sheet requested: ${name}`);
            return sheets[name];
        },
    };
}

function update(overrides) {
    return Object.assign({
        update_id: 91001,
        message: {
            message_id: 77001,
            chat: { id: 123456 },
            text: '50 mercado',
        },
    }, overrides || {});
}

function expense(overrides) {
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

function cardPurchase(overrides) {
    return Object.assign(expense({
        tipo_evento: 'compra_cartao',
        data: '2026-04-29',
        competencia: '2099-12',
        descricao: 'Restaurante',
        id_categoria: 'OPEX_RESTAURANTE_CASAL',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        afeta_patrimonio: true,
    }), overrides || {});
}

function installment(overrides) {
    return Object.assign(cardPurchase({
        tipo_evento: 'compra_parcelada',
        descricao: 'Geladeira',
        id_categoria: 'OPEX_CASA_ITENS',
        valor: 1200,
        parcelamento: { parcelas_total: 3 },
    }), overrides || {});
}

function openAiResponse(entry) {
    return {
        choices: [
            { message: { content: JSON.stringify(entry) } },
        ],
    };
}

function baseOptions(fake, entry, overrides) {
    const source = overrides || {};
    const calls = source.calls || { fetch: [], locks: [] };
    return {
        user: { pessoa: 'Gustavo', nome: 'Gustavo' },
        getSpreadsheet: () => fake,
        withLock(label, fn) {
            calls.locks.push(label);
            return fn();
        },
        fetchJson(request) {
            calls.fetch.push(request);
            return openAiResponse(entry || expense());
        },
        apiKey: 'sk-fake-runner-test-key',
        model: 'gpt-fake-runner',
        now: () => '2026-04-27T21:00:00.000Z',
        validateParsedEntryV54,
        planV54IdempotentWrite,
        mapSingleCardPurchaseContract,
        mapInstallmentScheduleContract,
        planExpectedFaturasUpsert,
        cards: V54_SEED_DATA[V54_SHEETS.CARTOES].map((card) => ({ ...card })),
    };
}

function run(entry, overrides) {
    const fake = makeFakeSpreadsheet(overrides && overrides.spreadsheet);
    const calls = { fetch: [], locks: [] };
    const { runV54ManualShadow } = loadRunner(overrides && overrides.sandbox);
    const result = runV54ManualShadow(update(), Object.assign(baseOptions(fake, entry, { calls }), overrides && overrides.options ? overrides.options : {}));
    return { result, fake, calls };
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

function assertNoWrites(fake) {
    Object.values(fake.writesBySheet).forEach((writes) => {
        assert.strictEqual(writes.length, 0);
    });
}

let failed = 0;

failed += test('runner_composes_context_openai_handler_and_record_path_with_fakes', () => {
    const { result, fake, calls } = run(expense());

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.status, 'recorded');
    assert.strictEqual(calls.fetch.length, 1);
    assert.ok(JSON.stringify(calls.fetch[0].body.messages).includes('OPEX_MERCADO_SEMANA'));
    assert.ok(fake.requestedSheets.includes(V54_SHEETS.CONFIG_CATEGORIAS));
    assert.ok(fake.requestedSheets.includes(V54_SHEETS.CONFIG_FONTES));
    assert.ok(fake.requestedSheets.includes(V54_SHEETS.CARTOES));
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 2);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 1);
    assert.deepStrictEqual(calls.locks, ['recordEntryV54']);
});

failed += test('runner_fake_successful_despesa_returns_success_response', () => {
    const { result } = run(expense({ valor: '50.25' }));

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.parsedEntry.tipo_evento, 'despesa');
    assert.strictEqual(result.responseText, 'V54: lançamento registrado com idempotência.');
});

failed += test('runner_fake_successful_compra_cartao_passes_card_and_fatura_dependencies', () => {
    const { result, fake } = run(cardPurchase());

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.parsedEntry.tipo_evento, 'compra_cartao');
    assert.strictEqual(result.record.domainMutation.kind, 'compra_cartao');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 1);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.FATURAS] || []).length, 1);
    assert.strictEqual(result.responseText, 'V54: compra no cartão registrada com idempotência.');
});

failed += test('runner_fake_successful_compra_parcelada_passes_installment_and_fatura_dependencies', () => {
    const { result, fake } = run(installment());

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.parsedEntry.tipo_evento, 'compra_parcelada');
    assert.strictEqual(result.record.domainMutation.kind, 'compra_parcelada');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.COMPRAS_PARCELADAS] || []).length, 1);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.PARCELAS_AGENDA] || []).length, 1);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.FATURAS] || []).length, 3);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.LANCAMENTOS_V54] || []).length, 0);
    assert.strictEqual(result.responseText, 'V54: compra parcelada registrada com idempotência.');
});

failed += test('runner_missing_get_spreadsheet_fails_closed', () => {
    const fake = makeFakeSpreadsheet();
    const { runV54ManualShadow } = loadRunner();
    const result = runV54ManualShadow(update(), Object.assign(baseOptions(fake, expense()), { getSpreadsheet: null }));

    assertError(result, 'RUNNER_V54_DEPENDENCY_REQUIRED', 'getSpreadsheet');
    assertNoWrites(fake);
});

failed += test('runner_missing_parser_or_fetch_dependency_fails_closed', () => {
    const fake = makeFakeSpreadsheet();
    const { runV54ManualShadow } = loadRunner();
    const result = runV54ManualShadow(update(), Object.assign(baseOptions(fake, expense()), { fetchJson: null }));

    assertError(result, 'RUNNER_V54_DEPENDENCY_REQUIRED', 'fetchJson');
    assertNoWrites(fake);
});

failed += test('runner_missing_idempotency_boundary_dependency_fails_closed', () => {
    const fake = makeFakeSpreadsheet();
    const { runV54ManualShadow } = loadRunner();
    const result = runV54ManualShadow(update(), Object.assign(baseOptions(fake, expense()), { planV54IdempotentWrite: null }));

    assertError(result, 'RUNNER_V54_DEPENDENCY_REQUIRED', 'planV54IdempotentWrite');
    assertNoWrites(fake);
});

failed += test('runner_parser_context_failure_returns_parser_context_error_and_no_write', () => {
    const { result, fake } = run(expense(), {
        spreadsheet: { missingSheet: V54_SHEETS.CARTOES },
    });

    assert.strictEqual(result.status, 'parser_failed');
    assertError(result, 'PARSER_CONTEXT_MISSING_SHEET', 'Cartoes');
    assertNoWrites(fake);
});

failed += test('runner_does_not_call_telegram_real_openai_urlfetch_or_real_spreadsheet_in_tests', () => {
    let telegramCalled = false;
    let urlFetchCalled = false;
    let spreadsheetCalled = false;
    const { result } = run(expense(), {
        sandbox: {
            sendTelegram: () => { telegramCalled = true; throw new Error('sendTelegram called'); },
            UrlFetchApp: { fetch: () => { urlFetchCalled = true; throw new Error('UrlFetchApp called'); } },
            SpreadsheetApp: { openById: () => { spreadsheetCalled = true; throw new Error('SpreadsheetApp called'); } },
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(telegramCalled, false);
    assert.strictEqual(urlFetchCalled, false);
    assert.strictEqual(spreadsheetCalled, false);
});

failed += test('runner_src_is_apps_script_compatible_and_no_forbidden_side_effect_clients', () => {
    assert.strictEqual(/\brequire\s*\(/.test(runnerSource), false);
    assert.strictEqual(runnerSource.includes('module.exports'), false);
    ['sendTelegram', 'UrlFetchApp', 'SpreadsheetApp', 'clasp', 'deploy', 'applySetupV54', 'applySeedV54'].forEach((needle) => {
        assert.strictEqual(runnerSource.includes(needle), false, `${needle} should not appear`);
    });
    assert.doesNotThrow(() => new Function(runnerSource));
});

if (failed > 0) {
    console.error(`\n${failed} V54 manual/shadow runner check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 manual/shadow runner checks passed.');
}
