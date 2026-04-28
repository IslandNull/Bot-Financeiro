'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { validateParsedEntryV54 } = require('./lib/v54-parsed-entry-contract');
const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');

const root = path.join(__dirname, '..');
const contextSource = fs.readFileSync(path.join(root, 'src', 'ParserV54Context.js'), 'utf8');
const openAiSource = fs.readFileSync(path.join(root, 'src', 'ParserV54OpenAI.js'), 'utf8');
const actionsSource = fs.readFileSync(path.join(root, 'src', 'ActionsV54.js'), 'utf8');
const parserSource = fs.readFileSync(path.join(root, 'src', 'ParserV54.js'), 'utf8');
const viewsSource = fs.readFileSync(path.join(root, 'src', 'ViewsV54.js'), 'utf8');
const handlerSource = fs.readFileSync(path.join(root, 'src', 'HandlerV54.js'), 'utf8');
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

function loadContext(extraSandbox) {
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
        `${contextSource}\nresult = { getParserContextV54, V54_PARSER_CONTEXT_HEADERS };`,
        sandbox,
    );
    return sandbox.result;
}

function loadOpenAiWithContext(extraSandbox) {
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
        `${contextSource}\n${openAiSource}\nresult = { parseTextV54OpenAI, getParserContextV54 };`,
        sandbox,
    );
    return sandbox.result;
}

function loadHandler() {
    const sandbox = { console, Date, Math, JSON, Number, String, Boolean, Object, Array, RegExp };
    vm.createContext(sandbox);
    vm.runInContext(
        `${actionsSource}\n${parserSource}\n${viewsSource}\n${handlerSource}\nresult = { handleTelegramUpdateV54 };`,
        sandbox,
    );
    return sandbox.result;
}

function makeSheet(headers, rows) {
    const calls = { getRange: [], getValues: [], setValues: 0, clearContent: 0, appendRow: 0 };
    const sheet = {
        calls,
        getLastRow() {
            return rows.length + 1;
        },
        getLastColumn() {
            return headers.length;
        },
        getRange(row, column, numRows, numColumns) {
            calls.getRange.push({ row, column, numRows, numColumns });
            return {
                getValues() {
                    calls.getValues.push({ row, column, numRows, numColumns });
                    if (row === 1) return [headers.slice(0, numColumns)];
                    return rows.slice(row - 2, row - 2 + numRows).map((item) => {
                        return headers.slice(0, numColumns).map((header) => item[header] === undefined ? '' : item[header]);
                    });
                },
                setValues() {
                    calls.setValues += 1;
                    throw new Error('setValues must not be called');
                },
                clearContent() {
                    calls.clearContent += 1;
                    throw new Error('clearContent must not be called');
                },
            };
        },
        appendRow() {
            calls.appendRow += 1;
            throw new Error('appendRow must not be called');
        },
    };
    return sheet;
}

function makeSpreadsheet(overrides) {
    const sheets = Object.assign({
        [V54_SHEETS.CONFIG_CATEGORIAS]: makeSheet(V54_HEADERS[V54_SHEETS.CONFIG_CATEGORIAS], [
            { id_categoria: 'OPEX_MERCADO_SEMANA', nome: 'Mercado semana', grupo: 'Casa', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'variavel', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true, secret: 'leak' },
            { id_categoria: 'OPEX_INATIVA', nome: 'Inativa', grupo: 'Casa', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'variavel', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: false },
            { id_categoria: 'OPEX_RESTAURANTE_CASAL', nome: 'Restaurante casal', grupo: 'Lazer', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'limite_mensal', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: 'TRUE' },
        ]),
        [V54_SHEETS.CONFIG_FONTES]: makeSheet(V54_HEADERS[V54_SHEETS.CONFIG_FONTES], [
            { id_fonte: 'FONTE_CONTA_GU', nome: 'Conta Gustavo', tipo: 'conta', titular: 'Gustavo', ativo: true, token: '123456:SECRET_SHOULD_NOT_LEAK' },
            { id_fonte: 'FONTE_INATIVA', nome: 'Fonte inativa', tipo: 'conta', titular: 'Luana', ativo: false },
            { id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gu', tipo: 'cartao', titular: 'Gustavo', ativo: true },
        ]),
        [V54_SHEETS.CARTOES]: makeSheet(V54_HEADERS[V54_SHEETS.CARTOES], [
            { id_cartao: 'CARD_NUBANK_GU', id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gustavo', titular: 'Gustavo', fechamento_dia: 30, vencimento_dia: 7, limite: 10550, ativo: true, api_key: 'sk-test-should-not-leak' },
            { id_cartao: 'CARD_INATIVO', id_fonte: 'FONTE_INATIVA', nome: 'Inativo', titular: 'Luana', fechamento_dia: 1, vencimento_dia: 8, limite: 1, ativo: false },
        ]),
    }, overrides || {});
    return {
        sheets,
        getSheetByName(name) {
            return this.sheets[name] || null;
        },
    };
}

function getContext(options, runtimeContext) {
    const { getParserContextV54 } = loadContext();
    return getParserContextV54(Object.assign({
        defaultPessoa: 'Gustavo',
        defaultEscopo: 'Casal',
        referenceDate: '2026-04-27',
    }, runtimeContext || {}), Object.assign({
        getSpreadsheet: () => makeSpreadsheet(),
        now: () => '2026-04-27T12:00:00.000Z',
    }, options || {}));
}

function validExpense() {
    return {
        tipo_evento: 'despesa',
        data: '2026-04-27',
        competencia: '2026-04',
        valor: 50,
        descricao: 'Mercado semana',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_GU',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: false,
    };
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

let failed = 0;

failed += test('parser_context_headers_match_canonical_schema_for_required_sheets', () => {
    const { V54_PARSER_CONTEXT_HEADERS } = loadContext();
    assert.strictEqual(JSON.stringify(V54_PARSER_CONTEXT_HEADERS.Config_Categorias), JSON.stringify(V54_HEADERS[V54_SHEETS.CONFIG_CATEGORIAS]));
    assert.strictEqual(JSON.stringify(V54_PARSER_CONTEXT_HEADERS.Config_Fontes), JSON.stringify(V54_HEADERS[V54_SHEETS.CONFIG_FONTES]));
    assert.strictEqual(JSON.stringify(V54_PARSER_CONTEXT_HEADERS.Cartoes), JSON.stringify(V54_HEADERS[V54_SHEETS.CARTOES]));
});

failed += test('reads_fake_v54_categories_fontes_and_cartoes_into_parser_context', () => {
    const result = getContext();
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(Object.keys(result.context).sort(), ['cartoes', 'categories', 'defaultEscopo', 'defaultPessoa', 'fontes', 'referenceDate'].sort());
    assert.strictEqual(result.context.categories[0].id_categoria, 'OPEX_MERCADO_SEMANA');
    assert.strictEqual(result.context.fontes[0].id_fonte, 'FONTE_CONTA_GU');
    assert.strictEqual(result.context.cartoes[0].id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(result.context.defaultPessoa, 'Gustavo');
    assert.strictEqual(result.context.defaultEscopo, 'Casal');
    assert.strictEqual(result.context.referenceDate, '2026-04-27');
});

failed += test('filters_inactive_rows_when_schema_has_ativo', () => {
    const result = getContext();
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.context.categories.some((row) => row.id_categoria === 'OPEX_INATIVA'), false);
    assert.strictEqual(result.context.fontes.some((row) => row.id_fonte === 'FONTE_INATIVA'), false);
    assert.strictEqual(result.context.cartoes.some((row) => row.id_cartao === 'CARD_INATIVO'), false);
});

failed += test('strips_secrets_tokens_api_and_spreadsheet_fields_from_context', () => {
    const result = getContext(null, {
        defaultPessoa: 'Gustavo token=123456:SECRET_SHOULD_NOT_LEAK',
        defaultEscopo: 'Casal api_key=sk-test-should-not-leak',
        referenceDate: '2026-04-27 spreadsheet_id=SPREADSHEET_SECRET',
    });
    const serialized = JSON.stringify(result);

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(serialized.includes('SECRET_SHOULD_NOT_LEAK'), false);
    assert.strictEqual(serialized.includes('sk-test-should-not-leak'), false);
    assert.strictEqual(serialized.includes('SPREADSHEET_SECRET'), false);
    assert.strictEqual(serialized.includes('"secret"'), false);
    assert.strictEqual(serialized.includes('"token"'), false);
    assert.strictEqual(serialized.includes('"api_key"'), false);
    assert.strictEqual(serialized.includes('"limite"'), false, 'card limit is not parser context');
});

failed += test('missing_sheet_fails_closed_with_structured_error', () => {
    const spreadsheet = makeSpreadsheet({ [V54_SHEETS.CARTOES]: null });
    const result = getContext({ getSpreadsheet: () => spreadsheet });
    assertError(result, 'PARSER_CONTEXT_MISSING_SHEET', 'Cartoes');
});

failed += test('header_mismatch_fails_closed', () => {
    const badHeaders = V54_HEADERS[V54_SHEETS.CONFIG_FONTES].slice();
    badHeaders[0] = 'wrong_id';
    const spreadsheet = makeSpreadsheet({
        [V54_SHEETS.CONFIG_FONTES]: makeSheet(badHeaders, []),
    });
    const result = getContext({ getSpreadsheet: () => spreadsheet });
    assertError(result, 'PARSER_CONTEXT_HEADER_MISMATCH', 'Config_Fontes');
});

failed += test('provider_does_not_mutate_fake_sheets', () => {
    const spreadsheet = makeSpreadsheet();
    const result = getContext({ getSpreadsheet: () => spreadsheet });
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    Object.values(spreadsheet.sheets).forEach((sheet) => {
        assert.strictEqual(sheet.calls.setValues, 0);
        assert.strictEqual(sheet.calls.clearContent, 0);
        assert.strictEqual(sheet.calls.appendRow, 0);
    });
});

failed += test('provider_does_not_call_openai_telegram_or_urlfetch', () => {
    let urlFetchCalled = false;
    let telegramCalled = false;
    const { getParserContextV54 } = loadContext({
        UrlFetchApp: { fetch: () => { urlFetchCalled = true; throw new Error('UrlFetchApp called'); } },
        sendTelegram: () => { telegramCalled = true; throw new Error('sendTelegram called'); },
    });
    const result = getParserContextV54({}, {
        getSpreadsheet: () => makeSpreadsheet(),
        now: () => '2026-04-27T12:00:00.000Z',
    });
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(urlFetchCalled, false);
    assert.strictEqual(telegramCalled, false);
});

failed += test('parser_v54_openai_consumes_provider_output_in_fake_success', () => {
    const calls = [];
    const { parseTextV54OpenAI, getParserContextV54 } = loadOpenAiWithContext();
    const result = parseTextV54OpenAI('50 mercado', { defaultPessoa: 'Gustavo', defaultEscopo: 'Casal' }, {
        apiKey: 'sk-test-secret-1234567890',
        model: 'gpt-test',
        now: () => '2026-04-27T12:00:00.000Z',
        validateParsedEntryV54,
        getParserContext: (runtimeContext) => getParserContextV54(runtimeContext, {
            getSpreadsheet: () => makeSpreadsheet(),
            now: () => '2026-04-27T12:00:00.000Z',
        }),
        fetchJson(request) {
            calls.push(request);
            return { choices: [{ message: { content: JSON.stringify(validExpense()) } }] };
        },
    });
    const prompt = JSON.stringify(calls[0].body.messages);

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.normalized.id_categoria, 'OPEX_MERCADO_SEMANA');
    assert.ok(prompt.includes('OPEX_MERCADO_SEMANA'));
    assert.ok(prompt.includes('FONTE_CONTA_GU'));
    assert.ok(prompt.includes('CARD_NUBANK_GU'));
});

failed += test('handler_can_receive_get_parser_context_through_injected_parser_options', () => {
    const { handleTelegramUpdateV54 } = loadHandler();
    const calls = { parserOptions: null };
    const result = handleTelegramUpdateV54({
        update_id: 1,
        message: { message_id: 2, chat: { id: 123 }, text: '50 mercado' },
    }, {
        user: { pessoa: 'Gustavo' },
        parserOptions: {
            getParserContext: () => ({ ok: true, context: { categories: [], fontes: [], cartoes: [], defaultPessoa: 'Gustavo', defaultEscopo: 'Casal', referenceDate: '2026-04-27' }, errors: [] }),
        },
        parseTextV54(text, context, parserOptions) {
            calls.parserOptions = parserOptions;
            return { ok: true, normalized: validExpense() };
        },
        validateParsedEntryV54,
        recordEntryV54() {
            return { ok: true, errors: [] };
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(typeof calls.parserOptions.getParserContext, 'function');
});



failed += test('src_context_provider_is_apps_script_compatible_no_commonjs', () => {
    assert.strictEqual(/\brequire\s*\(/.test(contextSource), false);
    assert.strictEqual(contextSource.includes('module.exports'), false);
    assert.doesNotThrow(() => new Function(contextSource));
});

if (failed > 0) {
    console.error(`\n${failed} ParserV54 context provider check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll ParserV54 context provider checks passed.');
}
