const assert = require('assert');

const {
    ALLOWED_TIPO_EVENTO,
    validateParsedEntryV54,
} = require('./lib/v54-parsed-entry-contract');

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

function baseEntry(overrides) {
    return Object.assign({
        tipo_evento: 'despesa',
        data: '2026-04-26',
        competencia: '2026-04',
        valor: 12.34,
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
        raw_text: '12,34 mercado semana',
        warnings: [],
    }, overrides || {});
}

function assertValid(entry, assertions) {
    const result = validateParsedEntryV54(entry);
    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.ok, true);
    if (assertions) assertions(result.normalized);
    return result.normalized;
}

function assertInvalid(entry, code, field) {
    const result = validateParsedEntryV54(entry);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
    return result.errors;
}

let failed = 0;

failed += test('allowed_tipo_evento_values_are_explicit', () => {
    assert.deepStrictEqual(ALLOWED_TIPO_EVENTO, [
        'despesa',
        'receita',
        'transferencia',
        'compra_cartao',
        'compra_parcelada',
        'pagamento_fatura',
        'ajuste',
        'aporte',
        'divida_pagamento',
    ]);
});

failed += test('valid_simple_cash_expense', () => {
    assertValid(baseEntry(), (normalized) => {
        assert.strictEqual(normalized.tipo_evento, 'despesa');
        assert.strictEqual(normalized.valor, 12.34);
    });
});

failed += test('valid_income', () => {
    assertValid(baseEntry({
        tipo_evento: 'receita',
        valor: '3400.00',
        descricao: 'Salario Gustavo',
        id_categoria: 'REC_SALARIO',
        id_fonte: 'FONTE_CONTA_GU',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'resumo',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
    }), (normalized) => {
        assert.strictEqual(normalized.valor, 3400);
    });
});

failed += test('valid_transfer_aporte_that_does_not_affect_dre', () => {
    assertValid(baseEntry({
        tipo_evento: 'aporte',
        valor: 1400,
        descricao: 'Aporte reserva',
        id_categoria: 'INV_APORTE',
        id_fonte: 'FONTE_CONTA_GU',
        afeta_dre: false,
        afeta_acerto: true,
        afeta_patrimonio: true,
        visibilidade: 'resumo',
    }));
});

failed += test('valid_credit_card_purchase_requires_id_cartao', () => {
    assertValid(baseEntry({
        tipo_evento: 'compra_cartao',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'Restaurante casal',
        id_categoria: 'OPEX_RESTAURANTE_CASAL',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
    }));
});

failed += test('valid_installment_purchase_requires_card_and_installment_metadata', () => {
    assertValid(baseEntry({
        tipo_evento: 'compra_parcelada',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        descricao: 'Geladeira',
        id_categoria: 'OPEX_CASA_ITENS',
        valor: '1200.00',
        parcelamento: {
            parcelas_total: '10',
            numero_parcela: 1,
            valor_parcela: '120.00',
        },
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
    }), (normalized) => {
        assert.deepStrictEqual(normalized.parcelamento, {
            parcelas_total: 10,
            numero_parcela: 1,
            valor_parcela: 120,
        });
    });
});

failed += test('invalid_missing_tipo_evento', () => {
    const entry = baseEntry();
    delete entry.tipo_evento;
    assertInvalid(entry, 'REQUIRED_FIELD', 'tipo_evento');
});

failed += test('invalid_unknown_tipo_evento', () => {
    assertInvalid(baseEntry({ tipo_evento: 'lanche_mistico' }), 'INVALID_ENUM', 'tipo_evento');
});

failed += test('invalid_missing_valor', () => {
    const entry = baseEntry();
    delete entry.valor;
    assertInvalid(entry, 'REQUIRED_FIELD', 'valor');
});

failed += test('invalid_zero_or_negative_valor', () => {
    assertInvalid(baseEntry({ valor: 0 }), 'INVALID_POSITIVE_NUMBER', 'valor');
    assertInvalid(baseEntry({ valor: -1 }), 'INVALID_POSITIVE_NUMBER', 'valor');
});

failed += test('invalid_missing_id_categoria_for_dre_affecting_transaction', () => {
    const entry = baseEntry({ afeta_dre: true });
    delete entry.id_categoria;
    assertInvalid(entry, 'REQUIRED_FOR_DRE', 'id_categoria');
});

failed += test('invalid_missing_id_fonte_when_needed', () => {
    const entry = baseEntry({ tipo_evento: 'despesa' });
    delete entry.id_fonte;
    assertInvalid(entry, 'REQUIRED_FOR_EVENT', 'id_fonte');
});

failed += test('invalid_compra_cartao_without_id_cartao', () => {
    assertInvalid(baseEntry({
        tipo_evento: 'compra_cartao',
        id_fonte: undefined,
        id_cartao: undefined,
    }), 'REQUIRED_FOR_EVENT', 'id_cartao');
});

failed += test('invalid_pessoa', () => {
    assertInvalid(baseEntry({ pessoa: 'Visitante' }), 'INVALID_ENUM', 'pessoa');
});

failed += test('invalid_escopo', () => {
    assertInvalid(baseEntry({ escopo: 'Todos' }), 'INVALID_ENUM', 'escopo');
});

failed += test('invalid_visibilidade', () => {
    assertInvalid(baseEntry({ visibilidade: 'publica' }), 'INVALID_ENUM', 'visibilidade');
});

failed += test('invalid_booleans', () => {
    assertInvalid(baseEntry({ afeta_dre: 'true' }), 'INVALID_BOOLEAN', 'afeta_dre');
    assertInvalid(baseEntry({ afeta_acerto: 1 }), 'INVALID_BOOLEAN', 'afeta_acerto');
    assertInvalid(baseEntry({ afeta_patrimonio: 'false' }), 'INVALID_BOOLEAN', 'afeta_patrimonio');
});

failed += test('normalization_trims_strings', () => {
    assertValid(baseEntry({
        descricao: '  Restaurante casal  ',
        id_categoria: '  OPEX_RESTAURANTE_CASAL  ',
        id_fonte: '  FONTE_CONTA_GU  ',
        raw_text: '  105 restaurante casal  ',
        warnings: ['  baixa confianca  ', ''],
    }), (normalized) => {
        assert.strictEqual(normalized.descricao, 'Restaurante casal');
        assert.strictEqual(normalized.id_categoria, 'OPEX_RESTAURANTE_CASAL');
        assert.strictEqual(normalized.id_fonte, 'FONTE_CONTA_GU');
        assert.strictEqual(normalized.raw_text, '105 restaurante casal');
        assert.deepStrictEqual(normalized.warnings, ['baixa confianca']);
    });
});

failed += test('normalization_converts_safe_numeric_strings', () => {
    assertValid(baseEntry({ valor: '12.34', confidence: '0.75' }), (normalized) => {
        assert.strictEqual(normalized.valor, 12.34);
        assert.strictEqual(normalized.confidence, 0.75);
    });
});

failed += test('rejects_ambiguous_comma_money_strings', () => {
    assertInvalid(baseEntry({ valor: '12,34' }), 'AMBIGUOUS_MONEY_STRING', 'valor');
});

failed += test('rejects_extra_unknown_fields_strictly', () => {
    // Phase 2A intentionally rejects unknown fields so a future LLM parser cannot
    // smuggle unreviewed data into the V54 write path contract.
    assertInvalid(baseEntry({ moeda: 'BRL' }), 'UNKNOWN_FIELD', 'moeda');
});

failed += test('pagamento_fatura_requires_invoice_and_never_affects_dre', () => {
    assertValid(baseEntry({
        tipo_evento: 'pagamento_fatura',
        id_categoria: undefined,
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_fonte: 'FONTE_CONTA_GU',
        descricao: 'Pagamento fatura Nubank',
        afeta_dre: false,
        afeta_acerto: true,
        afeta_patrimonio: true,
    }));
    assertInvalid(baseEntry({
        tipo_evento: 'pagamento_fatura',
        id_categoria: undefined,
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        afeta_dre: true,
    }), 'INVALID_DRE_FLAG', 'afeta_dre');
});

failed += test('compra_parcelada_blocks_invalid_installment_metadata', () => {
    assertInvalid(baseEntry({
        tipo_evento: 'compra_parcelada',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        parcelamento: { parcelas_total: 1 },
    }), 'INVALID_MINIMUM', 'parcelamento.parcelas_total');
    assertInvalid(baseEntry({
        tipo_evento: 'compra_parcelada',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        parcelamento: { parcelas_total: 3, numero_parcela: 4 },
    }), 'INVALID_INSTALLMENT_NUMBER', 'parcelamento.numero_parcela');
});

if (failed > 0) {
    console.error(`\n${failed} ParsedEntryV54 contract check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll ParsedEntryV54 contract checks passed.');
}
