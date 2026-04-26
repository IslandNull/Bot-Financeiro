const assert = require('assert');
const fs = require('fs');
const path = require('path');

const setupPath = path.join(__dirname, '..', 'src', 'Setup.js');
const source = fs.readFileSync(setupPath, 'utf8');

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

let failed = 0;

failed += test('planSetupV54_exists', () => {
    assert.ok(source.includes('function planSetupV54()'));
    assert.ok(source.includes('function planSetupV54ForState(state)'));
    assert.ok(source.includes('function getV54Schema()'));
});

failed += test('planSetupV54_does_not_call_mutating_sheet_apis', () => {
    const body = [
        extractFunction('planSetupV54'),
        extractFunction('planSetupV54ForState'),
        extractFunction('getV54Schema'),
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
    assert.ok(body.includes("Parcelas_Agenda: ['id_parcela', 'id_compra'"));
    assert.ok(body.includes("Lancamentos_V54: ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_compra', 'id_parcela', 'afeta_dre', 'afeta_acerto', 'afeta_patrimonio', 'visibilidade'"));
    assert.ok(body.includes("Dividas: ['id_divida', 'nome', 'credor'"));
    assert.ok(body.includes("Fechamentos_Mensais: ['competencia', 'status', 'receitas_operacionais'"));
});

if (failed > 0) {
    console.error(`\n${failed} V54 setup dry-run check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 setup dry-run checks passed.');
}
