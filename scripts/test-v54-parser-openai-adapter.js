'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { validateParsedEntryV54 } = require('./lib/v54-parsed-entry-contract');

const root = path.join(__dirname, '..');
const adapterSource = fs.readFileSync(path.join(root, 'src', 'ParserV54OpenAI.js'), 'utf8');
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

function loadAdapter(extraSandbox) {
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
    vm.runInContext(`${adapterSource}\nresult = { parseTextV54OpenAI, buildParserV54OpenAISystemPrompt_, buildParserV54OpenAIUserPrompt_, normalizeParserV54Aliases_ };`, sandbox);
    return sandbox.result;
}

function fakeContext(overrides) {
    return Object.assign({
        defaultPessoa: 'Gustavo',
        defaultEscopo: 'Casal',
        referenceDate: '2026-04-27',
        apiKey: 'sk-context-secret-should-not-leak',
        spreadsheet_id: 'SPREADSHEET_SECRET_SHOULD_NOT_LEAK',
        categories: [
            { id_categoria: 'REC_SALARIO', nome: 'Salario' },
            { id_categoria: 'OPEX_MERCADO_SEMANA', nome: 'Mercado semana', secret: 'context-secret' },
            { id_categoria: 'OPEX_MERCADO_RANCHO', nome: 'Mercado rancho' },
            { id_categoria: 'OPEX_RESTAURANTE_CASAL', nome: 'Restaurante casal' },
            { id_categoria: 'HOME_EQUIP', nome: 'Itens da casa' },
        ],
        fontes: [
            { id_fonte: 'FONTE_CONTA_GU', nome: 'Conta Gustavo' },
            { id_fonte: 'FONTE_CONTA_LU', nome: 'Conta Luana' },
            { id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gu' },
        ],
        cartoes: [
            { id_cartao: 'CARD_NUBANK_GU', nome: 'Nubank Gustavo', id_fonte: 'FONTE_NUBANK_GU' },
            { id_cartao: 'CARD_MP_GU', nome: 'Mercado Pago Gustavo', id_fonte: 'FONTE_MP_GU' },
            { id_cartao: 'CARD_NUBANK_LU', nome: 'Nubank Luana', id_fonte: 'FONTE_NUBANK_LU' },
        ],
    }, overrides || {});
}

function expense(overrides) {
    return Object.assign({
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
        confidence: 0.92,
        raw_text: '50 mercado',
        warnings: [],
    }, overrides || {});
}

function cardPurchase(overrides) {
    return Object.assign(expense({
        tipo_evento: 'compra_cartao',
        descricao: 'Restaurante casal',
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
        id_categoria: 'HOME_EQUIP',
        valor: '1200.00',
        parcelamento: {
            parcelas_total: 10,
            numero_parcela: 1,
            valor_parcela: '120.00',
        },
    }), overrides || {});
}

function income(overrides) {
    return Object.assign({
        tipo_evento: 'receita',
        data: '2026-04-27',
        competencia: '2026-04',
        valor: 1,
        descricao: 'Salario',
        pessoa: 'Gustavo',
        escopo: 'Gustavo',
        visibilidade: 'resumo',
        id_categoria: 'REC_SALARIO',
        id_fonte: 'FONTE_CONTA_GU',
        afeta_dre: true,
        afeta_acerto: false,
        afeta_patrimonio: true,
        confidence: 0.9,
        raw_text: 'recebi 1 salario conta gustavo',
        warnings: [],
    }, overrides || {});
}

function openAiResponse(content) {
    return {
        choices: [
            { message: { content } },
        ],
    };
}

function runAdapter(fakeContent, overrides, rawText) {
    const calls = [];
    const { parseTextV54OpenAI } = loadAdapter();
    const result = parseTextV54OpenAI(rawText || '50 mercado', fakeContext(), Object.assign({
        apiKey: 'sk-test-secret-1234567890',
        model: 'gpt-test',
        now: () => '2026-04-27T12:00:00.000Z',
        validateParsedEntryV54,
        fetchJson(request) {
            calls.push(request);
            return openAiResponse(fakeContent);
        },
    }, overrides || {}));
    return { result, calls };
}

function assertParserError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

let failed = 0;

failed += test('productive_parser_adapter_builds_request_without_secrets_in_prompt', () => {
    const { result, calls } = runAdapter(JSON.stringify(expense()));
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.length, 1);
    const body = calls[0].body;
    const prompt = JSON.stringify(body.messages);

    assert.strictEqual(body.model, 'gpt-test');
    assert.ok(prompt.includes('ParsedEntryV54'));
    assert.ok(prompt.includes('OPEX_MERCADO_SEMANA'));
    assert.ok(prompt.includes('CARD_NUBANK_GU'));
    assert.strictEqual(prompt.includes('sk-test-secret'), false);
    assert.strictEqual(prompt.includes('sk-context-secret'), false);
    assert.strictEqual(prompt.includes('SPREADSHEET_SECRET_SHOULD_NOT_LEAK'), false);
    assert.strictEqual(prompt.includes('context-secret'), false);
    assert.strictEqual(prompt.includes('TELEGRAM_TOKEN'), false);
    assert.strictEqual(prompt.includes('SpreadsheetApp'), false);
});

failed += test('fake_openai_success_returns_valid_despesa', () => {
    const { result } = runAdapter(JSON.stringify(expense({ valor: '50.25' })));
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.parsedEntry.tipo_evento, 'despesa');
    assert.strictEqual(result.normalized.valor, 50.25);
    assert.strictEqual(result.normalized.id_categoria, 'OPEX_MERCADO_SEMANA');
});

failed += test('fake_openai_success_returns_valid_compra_cartao', () => {
    const { result } = runAdapter(JSON.stringify(cardPurchase()));
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.normalized.tipo_evento, 'compra_cartao');
    assert.strictEqual(result.normalized.id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(result.normalized.id_fonte, undefined);
});

failed += test('fake_openai_success_returns_valid_compra_parcelada', () => {
    const { result } = runAdapter(JSON.stringify(installment()));
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.normalized.tipo_evento, 'compra_parcelada');
    assert.strictEqual(result.normalized.parcelamento.parcelas_total, 10);
    assert.strictEqual(result.normalized.parcelamento.valor_parcela, 120);
});

failed += test('alias_normalizer_clones_candidate_without_mutating_original', () => {
    const { normalizeParserV54Aliases_ } = loadAdapter();
    const original = income({ id_categoria: undefined, id_fonte: undefined });
    const result = normalizeParserV54Aliases_('recebi 1 sal\u00e1rio conta gustavo', original, fakeContext());

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.candidate.id_categoria, 'REC_SALARIO');
    assert.strictEqual(result.candidate.id_fonte, 'FONTE_CONTA_GU');
    assert.strictEqual(original.id_categoria, undefined);
    assert.strictEqual(original.id_fonte, undefined);
});

failed += test('fake_openai_missing_ids_repairs_receita_salario_conta_gustavo', () => {
    const candidate = income({ id_categoria: undefined, id_fonte: undefined });
    const { result } = runAdapter(JSON.stringify(candidate), {}, 'recebi 1 salario conta gustavo');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.normalized.tipo_evento, 'receita');
    assert.strictEqual(result.normalized.id_categoria, 'REC_SALARIO');
    assert.strictEqual(result.normalized.id_fonte, 'FONTE_CONTA_GU');
});

failed += test('fake_openai_missing_ids_repairs_despesa_card_alias_to_compra_cartao', () => {
    const candidate = expense({ id_categoria: undefined, id_fonte: undefined });
    const { result } = runAdapter(JSON.stringify(candidate), {}, 'gastei 1 mercado semana nubank gustavo');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.normalized.tipo_evento, 'compra_cartao');
    assert.strictEqual(result.normalized.id_categoria, 'OPEX_MERCADO_SEMANA');
    assert.strictEqual(result.normalized.id_cartao, 'CARD_NUBANK_GU');
    assert.strictEqual(result.normalized.id_fonte, undefined);
});

failed += test('fake_openai_missing_ids_repairs_despesa_cash_alias', () => {
    const candidate = expense({ id_categoria: undefined, id_fonte: undefined });
    const { result } = runAdapter(JSON.stringify(candidate), {}, 'gastei 1 mercado semana conta gustavo');

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.normalized.tipo_evento, 'despesa');
    assert.strictEqual(result.normalized.id_categoria, 'OPEX_MERCADO_SEMANA');
    assert.strictEqual(result.normalized.id_fonte, 'FONTE_CONTA_GU');
    assert.strictEqual(result.normalized.id_cartao, undefined);
});

failed += test('ambiguous_fonte_aliases_fail_closed_before_contract_validation', () => {
    const candidate = expense({ id_categoria: undefined, id_fonte: undefined });
    const { result } = runAdapter(JSON.stringify(candidate), {}, 'gastei 1 mercado semana conta gustavo conta luana');

    assertParserError(result, 'PARSER_V54_ALIAS_AMBIGUOUS', 'id_fonte');
});

failed += test('ambiguous_fonte_and_card_aliases_fail_closed_before_contract_validation', () => {
    const candidate = expense({ id_categoria: undefined, id_fonte: undefined });
    const { result } = runAdapter(JSON.stringify(candidate), {}, 'gastei 1 mercado semana conta gustavo nubank gustavo');

    assertParserError(result, 'PARSER_V54_ALIAS_AMBIGUOUS_PAYMENT', 'payment_alias');
});

failed += test('invalid_json_returns_structured_error', () => {
    const { result } = runAdapter('{bad json');
    assertParserError(result, 'INVALID_JSON', 'response');
    assert.strictEqual(JSON.stringify(result).includes('SyntaxError'), false);
});

failed += test('json_array_returns_structured_error', () => {
    const { result } = runAdapter(JSON.stringify([expense()]));
    assertParserError(result, 'ARRAY_RESPONSE', 'response');
});

failed += test('v54_contract_validation_failure_returns_structured_error', () => {
    const { result } = runAdapter(JSON.stringify(expense({ valor: '12,34' })));
    assertParserError(result, 'AMBIGUOUS_MONEY_STRING', 'valor');
    assert.strictEqual(result.normalized.valor, undefined);
});

failed += test('api_fetch_failure_returns_safe_structured_error_without_token_or_stack', () => {
    const token = 'sk-test-secret-1234567890';
    const { parseTextV54OpenAI } = loadAdapter();
    const result = parseTextV54OpenAI('50 mercado', fakeContext(), {
        apiKey: token,
        validateParsedEntryV54,
        fetchJson() {
            throw new Error(`network failed ${token}\nSTACKTRACE`);
        },
    });
    const serialized = JSON.stringify(result);

    assertParserError(result, 'PARSER_V54_FETCH_FAILED', 'fetch');
    assert.strictEqual(serialized.includes(token), false);
    assert.strictEqual(serialized.includes('STACKTRACE'), false);
    assert.strictEqual(serialized.includes('network failed'), false);
});

failed += test('adapter_does_not_call_spreadsheet_telegram_or_real_urlfetch_in_local_tests', () => {
    let spreadsheetCalled = false;
    let telegramCalled = false;
    let urlFetchCalled = false;
    const { parseTextV54OpenAI } = loadAdapter({
        SpreadsheetApp: { openById: () => { spreadsheetCalled = true; throw new Error('SpreadsheetApp called'); } },
        sendTelegram: () => { telegramCalled = true; throw new Error('sendTelegram called'); },
        UrlFetchApp: { fetch: () => { urlFetchCalled = true; throw new Error('UrlFetchApp called'); } },
    });
    const result = parseTextV54OpenAI('50 mercado', fakeContext(), {
        apiKey: 'sk-test-secret-1234567890',
        validateParsedEntryV54,
        fetchJson: () => openAiResponse(JSON.stringify(expense())),
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(spreadsheetCalled, false);
    assert.strictEqual(telegramCalled, false);
    assert.strictEqual(urlFetchCalled, false);
});



failed += test('src_adapter_is_apps_script_compatible_no_commonjs', () => {
    assert.strictEqual(/\brequire\s*\(/.test(adapterSource), false);
    assert.strictEqual(adapterSource.includes('module.exports'), false);
    assert.doesNotThrow(() => new Function(adapterSource));
});

if (failed > 0) {
    console.error(`\n${failed} ParserV54 OpenAI adapter check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll ParserV54 OpenAI adapter checks passed.');
}
