'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcFiles = [
    'src/000_V54Schema.js',
    'src/HandlerV54.js',
    'src/ParserV54Context.js',
    'src/ParserV54OpenAI.js'
];

let globalCode = '';
for (const file of srcFiles) {
    globalCode += fs.readFileSync(path.join(__dirname, '..', file), 'utf8') + '\n\n';
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

function createSandbox() {
    const sandbox = Object.assign({
        console: console,
        CONFIG: { MODEL: 'test' },
        SpreadsheetApp: {},
        _loadSecrets: () => {},
        cloneV54PlainObject_: (obj) => JSON.parse(JSON.stringify(obj || {})),
        makeV54ContractError_: (code, field, message) => ({ code, field, message })
    });
    vm.createContext(sandbox);
    vm.runInContext(globalCode, sandbox);
    return sandbox;
}

let failed = 0;

failed += test('1. Luana com user={nome:"Luana", pagador:"Luana"} e raw "25 farmacia" corrige para Luana/Luana/false/privada.', () => {
    const sandbox = createSandbox();
    const entry = {
        id_categoria: 'OPEX_FARMACIA',
        pessoa: 'Luana',
        escopo: 'Casal', // Simulated OpenAI mistake
        afeta_acerto: true,
        visibilidade: 'detalhada'
    };
    const context = {
        text: '25 farmacia',
        user: { nome: 'Luana', pagador: 'Luana', pessoa: '' }
    };
    const result = sandbox.reviewParsedEntryV54Safety_(entry, context);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.normalized.pessoa, 'Luana');
    assert.strictEqual(result.normalized.escopo, 'Luana');
    assert.strictEqual(result.normalized.afeta_acerto, false);
    assert.strictEqual(result.normalized.visibilidade, 'privada');
});

failed += test('2. Mesmo teste com "25 farmácia".', () => {
    const sandbox = createSandbox();
    const entry = {
        id_categoria: 'OPEX_FARMACIA',
        pessoa: 'Luana',
        escopo: 'Casal',
        afeta_acerto: true,
        visibilidade: 'detalhada'
    };
    const context = {
        text: '25 farmácia',
        user: { nome: 'Luana', pagador: 'Luana', pessoa: '' }
    };
    const result = sandbox.reviewParsedEntryV54Safety_(entry, context);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.normalized.pessoa, 'Luana');
    assert.strictEqual(result.normalized.escopo, 'Luana');
    assert.strictEqual(result.normalized.afeta_acerto, false);
    assert.strictEqual(result.normalized.visibilidade, 'privada');
});

failed += test('3. Gustavo com user={nome:"Gustavo", pagador:"Gustavo"} e "18 lanches trabalho" corrige para Gustavo.', () => {
    const sandbox = createSandbox();
    const entry = {
        id_categoria: 'OPEX_LANCHES_TRABALHO',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        afeta_acerto: true,
        visibilidade: 'detalhada'
    };
    const context = {
        text: '18 lanches trabalho',
        user: { nome: 'Gustavo', pagador: 'Gustavo', pessoa: '' }
    };
    const result = sandbox.reviewParsedEntryV54Safety_(entry, context);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.normalized.pessoa, 'Gustavo');
    assert.strictEqual(result.normalized.escopo, 'Gustavo');
    assert.strictEqual(result.normalized.afeta_acerto, false);
});

failed += test('4. "30 combustível moto" não pode permanecer Casal se não houver marcador explícito compartilhado.', () => {
    const sandbox = createSandbox();
    const entry = {
        id_categoria: 'OPEX_COMBUSTIVEL_MOTO',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        afeta_acerto: true,
        visibilidade: 'detalhada'
    };
    const context = {
        text: '30 combustível moto',
        user: { nome: 'Gustavo', pagador: 'Gustavo', pessoa: '' }
    };
    const result = sandbox.reviewParsedEntryV54Safety_(entry, context);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.normalized.pessoa, 'Gustavo');
    assert.strictEqual(result.normalized.escopo, 'Gustavo');
    assert.strictEqual(result.normalized.afeta_acerto, false);
});

failed += test('5. getParserContextV54 sem escopo retorna defaultEscopo === "".', () => {
    const sandbox = createSandbox();
    sandbox.readParserContextV54Sheet_ = () => ({ ok: true, rows: [] });
    const result = sandbox.getParserContextV54({}, { now: () => '2026-04-28', getSpreadsheet: () => ({}) });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.context.defaultEscopo, '');
});

failed += test('6. getParserContextV54 com defaultEscopo="Casal" preserva Casal.', () => {
    const sandbox = createSandbox();
    sandbox.readParserContextV54Sheet_ = () => ({ ok: true, rows: [] });
    const result = sandbox.getParserContextV54({ defaultEscopo: 'Casal' }, { now: () => '2026-04-28', getSpreadsheet: () => ({}) });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.context.defaultEscopo, 'Casal');
});

failed += test('7. getParserContextV54 com escopo="Luana" preserva Luana.', () => {
    const sandbox = createSandbox();
    sandbox.readParserContextV54Sheet_ = () => ({ ok: true, rows: [] });
    const result = sandbox.getParserContextV54({ escopo: 'Luana' }, { now: () => '2026-04-28', getSpreadsheet: () => ({}) });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.context.defaultEscopo, 'Luana');
});

failed += test('8. buildParserV54OpenAIUserPrompt não inclui "Default escopo: Casal" quando defaultEscopo está vazio.', () => {
    const sandbox = createSandbox();
    const prompt = sandbox.buildParserV54OpenAIUserPrompt_('10 teste', { defaultEscopo: '' }, { now: () => '2026-04-28' });
    assert.strictEqual(prompt.includes('Default escopo:'), false);
});

failed += test('9. "1 mercado conta luana nubank luana" continua fail-safe.', () => {
    const sandbox = createSandbox();
    const result = sandbox.normalizeParserV54Aliases_(
        '1 mercado conta luana nubank luana',
        { tipo_evento: 'despesa', id_categoria: 'OPEX_MERCADO_SEMANA' },
        { 
            fontes: [{ id_fonte: 'FONTE_CONTA_LU', aliases: ['conta luana'] }],
            cartoes: [{ id_cartao: 'CARD_NUBANK_LU', aliases: ['nubank luana'] }]
        }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errors[0].code, 'PARSER_V54_ALIAS_AMBIGUOUS_PAYMENT');
    
    // Also test the safety guardrail itself just in case
    const safetyResult = sandbox.reviewParsedEntryV54Safety_(
        { id_categoria: 'OPEX_MERCADO_SEMANA', pessoa: 'Luana', escopo: 'Casal' },
        { text: '1 mercado conta luana nubank luana', user: { nome: 'Luana' } }
    );
    assert.strictEqual(safetyResult.ok, false);
    assert.strictEqual(safetyResult.errors[0].code, 'V54_SAFETY_CONFLICT');
});

if (failed > 0) {
    console.error(`\n${failed} V54 Phase 6K test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 Phase 6K tests passed.');
}
