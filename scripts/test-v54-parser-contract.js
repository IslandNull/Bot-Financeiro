const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
    buildParserV54SystemPrompt,
    buildParserV54UserPrompt,
    parseParserV54JsonResponse,
    parseV54CandidateFromJson,
    validateParserV54Candidate,
} = require('./lib/v54-parser-contract');

const parserSource = fs.readFileSync(path.join(__dirname, 'lib', 'v54-parser-contract.js'), 'utf8');

const fakeContext = {
    defaultPessoa: 'Gustavo',
    defaultEscopo: 'Casal',
    referenceDate: '2026-04-26',
    categories: [
        { id_categoria: 'OPEX_MERCADO_SEMANA', nome: 'Mercado semana' },
        { id_categoria: 'OPEX_RESTAURANTE_CASAL', nome: 'Restaurante casal' },
        { id_categoria: 'REC_SALARIO', nome: 'Salario' },
        { id_categoria: 'INV_APORTE', nome: 'Aporte investimento' },
        { id_categoria: 'DEBT_VASCO', nome: 'Vasco' },
    ],
    fontes: [
        { id_fonte: 'FONTE_CONTA_GU', nome: 'Conta Gustavo' },
        { id_fonte: 'FONTE_CONTA_LU', nome: 'Conta Luana' },
        { id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gu' },
    ],
    cartoes: [
        { id_cartao: 'CARD_NUBANK_GU', nome: 'Nubank Gustavo', id_fonte: 'FONTE_NUBANK_GU' },
    ],
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

function validExpense(overrides) {
    return Object.assign({
        tipo_evento: 'despesa',
        data: '2026-04-26',
        competencia: '2026-04',
        valor: 25,
        descricao: 'Mercado semana',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_GU',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: false,
        confidence: 0.9,
        raw_text: '25 mercado semana',
        warnings: [],
    }, overrides || {});
}

function json(value) {
    return JSON.stringify(value);
}

function assertContractError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

let failed = 0;

failed += test('builds_prompt_containing_allowed_enum_guidance', () => {
    const prompt = buildParserV54SystemPrompt(fakeContext);
    assert.ok(prompt.includes('Allowed tipo_evento: despesa, receita, transferencia'));
    assert.ok(prompt.includes('Allowed pessoa: Gustavo, Luana, Casal'));
    assert.ok(prompt.includes('Allowed visibilidade: detalhada, resumo, privada'));
    assert.ok(prompt.includes('Use dot decimal numeric values'));
    assert.ok(prompt.includes('Use ISO dates'));
    assert.ok(prompt.includes('Use real JSON booleans'));
});

failed += test('builds_prompt_containing_canonical_ids', () => {
    const prompt = buildParserV54SystemPrompt(fakeContext);
    [
        'OPEX_MERCADO_SEMANA',
        'OPEX_RESTAURANTE_CASAL',
        'REC_SALARIO',
        'INV_APORTE',
        'DEBT_VASCO',
        'FONTE_CONTA_GU',
        'FONTE_CONTA_LU',
        'FONTE_NUBANK_GU',
        'CARD_NUBANK_GU',
    ].forEach((id) => assert.ok(prompt.includes(id), `Missing ${id}`));
});

failed += test('builds_user_prompt_without_secrets_or_mutation_language', () => {
    const prompt = buildParserV54UserPrompt('105 restaurante casal nubank', fakeContext);
    assert.ok(prompt.includes('"105 restaurante casal nubank"'));
    assert.ok(prompt.includes('Default pessoa: Gustavo'));
    assert.ok(!prompt.includes('OPENAI_API_KEY'));
    assert.ok(!prompt.includes('TELEGRAM_TOKEN'));
    assert.ok(!prompt.includes('SpreadsheetApp'));
});

failed += test('parses_valid_raw_json_object', () => {
    const result = parseParserV54JsonResponse(json(validExpense()));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value.tipo_evento, 'despesa');
});

failed += test('parses_valid_json_inside_markdown_fence', () => {
    const result = parseParserV54JsonResponse(`\`\`\`json\n${json(validExpense())}\n\`\`\``);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value.id_categoria, 'OPEX_MERCADO_SEMANA');
});

failed += test('rejects_invalid_json_with_structured_error', () => {
    const result = parseParserV54JsonResponse('{bad json');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'INVALID_JSON');
});

failed += test('rejects_array_output', () => {
    const result = parseParserV54JsonResponse(json([validExpense()]));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'ARRAY_RESPONSE');
});

failed += test('rejects_unknown_top_level_field_through_contract', () => {
    const result = parseV54CandidateFromJson(json(validExpense({ moeda: 'BRL' })));
    assertContractError(result, 'UNKNOWN_FIELD', 'moeda');
});

failed += test('rejects_comma_money_string_through_contract', () => {
    const result = parseV54CandidateFromJson(json(validExpense({ valor: '12,34' })));
    assertContractError(result, 'AMBIGUOUS_MONEY_STRING', 'valor');
});

failed += test('accepts_safe_dot_decimal_numeric_string_through_contract', () => {
    const result = parseV54CandidateFromJson(json(validExpense({ valor: '12.34' })));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.normalized.valor, 12.34);
});

failed += test('validates_simple_expense', () => {
    const result = validateParserV54Candidate(validExpense());
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.normalized.tipo_evento, 'despesa');
});

failed += test('validates_income', () => {
    const result = parseV54CandidateFromJson(json(validExpense({
        tipo_evento: 'receita',
        valor: 3400,
        descricao: 'Salario Gustavo',
        id_categoria: 'REC_SALARIO',
        id_fonte: 'FONTE_CONTA_GU',
        visibilidade: 'resumo',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
    })));
    assert.strictEqual(result.ok, true);
});

failed += test('validates_card_purchase', () => {
    const result = parseV54CandidateFromJson(json(validExpense({
        tipo_evento: 'compra_cartao',
        descricao: 'Restaurante casal',
        id_categoria: 'OPEX_RESTAURANTE_CASAL',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        afeta_patrimonio: true,
    })));
    assert.strictEqual(result.ok, true);
});

failed += test('validates_installment_purchase_with_parcelamento', () => {
    const result = parseV54CandidateFromJson(json(validExpense({
        tipo_evento: 'compra_parcelada',
        descricao: 'Compra parcelada casa',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        valor: '1200.00',
        parcelamento: {
            parcelas_total: 10,
            numero_parcela: 1,
            valor_parcela: '120.00',
        },
        afeta_patrimonio: true,
    })));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.normalized.parcelamento.parcelas_total, 10);
});

failed += test('rejects_card_purchase_without_id_cartao', () => {
    const result = parseV54CandidateFromJson(json(validExpense({
        tipo_evento: 'compra_cartao',
        id_fonte: undefined,
        id_cartao: undefined,
    })));
    assertContractError(result, 'REQUIRED_FOR_EVENT', 'id_cartao');
});

failed += test('rejects_payment_of_invoice_with_afeta_dre_true', () => {
    const result = parseV54CandidateFromJson(json(validExpense({
        tipo_evento: 'pagamento_fatura',
        id_categoria: undefined,
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        afeta_dre: true,
        afeta_patrimonio: true,
    })));
    assertContractError(result, 'INVALID_DRE_FLAG', 'afeta_dre');
});

failed += test('returns_contract_errors_without_throwing', () => {
    assert.doesNotThrow(() => {
        const result = parseV54CandidateFromJson(json({ tipo_evento: 'despesa' }));
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.length > 0);
    });
});

failed += test('does_not_import_or_call_openai', () => {
    assert.strictEqual(/openai/i.test(parserSource), false);
    assert.strictEqual(/chat\/completions/i.test(parserSource), false);
    assert.strictEqual(/UrlFetchApp/.test(parserSource), false);
});

failed += test('does_not_import_apps_script_globals', () => {
    [
        'SpreadsheetApp',
        'PropertiesService',
        'CacheService',
        'LockService',
        'ScriptApp',
        'ContentService',
        'Telegram',
    ].forEach((name) => {
        assert.strictEqual(parserSource.includes(name), false, `Unexpected Apps Script/global token: ${name}`);
    });
});

if (failed > 0) {
    console.error(`\n${failed} ParserV54 contract adapter check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll ParserV54 contract adapter checks passed.');
}
