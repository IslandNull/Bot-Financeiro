'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { validateParsedEntryV54 } = require('./lib/v54-parsed-entry-contract');

const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'src', '000_V54Schema.js'), 'utf8');
const actionsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ActionsV54.js'), 'utf8');
const actionsHelpersSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ActionsV54Helpers.js'), 'utf8');
const parserSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ParserV54.js'), 'utf8');
const viewsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ViewsV54.js'), 'utf8');
const handlerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'HandlerV54.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'Main.js'), 'utf8');

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

function loadHandlerV54() {
    const sandbox = { console, Date, Math, JSON, Number, String, Boolean, Object, Array, RegExp };
    vm.createContext(sandbox);
    vm.runInContext(
        `${schemaSource}\n${actionsSource}\n${actionsHelpersSource}\n${parserSource}\n${viewsSource}\n${handlerSource}\nresult = { handleTelegramUpdateV54, formatV54HandlerResponse_ };`,
        sandbox,
    );
    return sandbox.result;
}

function telegramUpdate(overrides) {
    return Object.assign({
        update_id: 91001,
        message: {
            message_id: 77001,
            chat: { id: 123456 },
            text: '50 mercado',
        },
    }, overrides || {});
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
        descricao: 'Restaurante',
        id_categoria: 'OPEX_RESTAURANTE_CASAL',
        id_fonte: undefined,
        id_cartao: 'CARD_NUBANK_GU',
        afeta_patrimonio: true,
    }), overrides || {});
}

function installmentEntry(overrides) {
    return Object.assign(cardEntry({
        tipo_evento: 'compra_parcelada',
        descricao: 'Geladeira',
        valor: 1200,
        parcelamento: { parcelas_total: 3 },
    }), overrides || {});
}

function handlerDeps(overrides) {
    const source = overrides || {};
    const calls = source.calls || { parser: [], record: [] };
    return {
        user: source.user === undefined ? { pessoa: 'Gustavo', nome: 'Gustavo' } : source.user,
        parseTextV54(text, context) {
            calls.parser.push({ text, context });
            if (source.parserResult) return source.parserResult;
            return { ok: true, normalized: source.entry || baseEntry() };
        },
        validateParsedEntryV54,
        recordEntryV54(parsedEntry, options) {
            calls.record.push({ parsedEntry, options });
            if (source.recordResult) return source.recordResult;
            return {
                ok: true,
                decision: 'planned_idempotent_write',
                result_ref: parsedEntry.tipo_evento === 'compra_parcelada' ? 'CP_V54_IDEMP_TEST' : 'LAN_V54_IDEMP_TEST',
                errors: [],
            };
        },
        recordOptions: Object.assign({
            getSpreadsheet: () => { throw new Error('real SpreadsheetApp must not be called'); },
            withLock: (label, fn) => fn(),
            planV54IdempotentWrite: function fakePlanner() {},
            mapSingleCardPurchaseContract: source.mapSingleCardPurchaseContract || null,
            mapInstallmentScheduleContract: source.mapInstallmentScheduleContract || null,
            planExpectedFaturasUpsert: source.planExpectedFaturasUpsert || null,
            cards: source.cards || [{ id_cartao: 'CARD_NUBANK_GU', id_fonte: 'FONTE_NUBANK_GU', ativo: true }],
        }, source.recordOptions || {}),
    };
}

function run(overrides, update) {
    const calls = { parser: [], record: [] };
    const { handleTelegramUpdateV54 } = loadHandlerV54();
    const result = handleTelegramUpdateV54(update || telegramUpdate(), handlerDeps(Object.assign({}, overrides || {}, { calls })));
    return { result, calls };
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

let failed = 0;

failed += test('v54_handler_accepts_fake_telegram_update_and_calls_injected_parser', () => {
    const { result, calls } = run();

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.parser.length, 1);
    assert.strictEqual(calls.parser[0].text, '50 mercado');
    assert.strictEqual(calls.parser[0].context.chat_id, '123456');
    assert.strictEqual(calls.record.length, 1);
});

failed += test('valid_despesa_calls_record_entry_with_idempotency_enabled', () => {
    const { result, calls } = run({ entry: baseEntry() });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.record.length, 1);
    assert.strictEqual(calls.record[0].options.idempotency.enabled, true);
    assert.strictEqual(calls.record[0].options.idempotency.input.telegram_update_id, '91001');
    assert.strictEqual(calls.record[0].options.idempotency.input.telegram_message_id, '77001');
    assert.strictEqual(calls.record[0].options.idempotency.input.chat_id, '123456');
    assert.strictEqual(calls.record[0].parsedEntry.tipo_evento, 'despesa');
});

failed += test('valid_compra_cartao_passes_required_card_and_fatura_dependencies', () => {
    const fakeCardMapper = function fakeCardMapper() {};
    const fakeFaturasPlanner = function fakeFaturasPlanner() {};
    const { result, calls } = run({
        entry: cardEntry(),
        mapSingleCardPurchaseContract: fakeCardMapper,
        planExpectedFaturasUpsert: fakeFaturasPlanner,
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.record[0].parsedEntry.tipo_evento, 'compra_cartao');
    assert.strictEqual(calls.record[0].options.mapSingleCardPurchaseContract, fakeCardMapper);
    assert.strictEqual(calls.record[0].options.planExpectedFaturasUpsert, fakeFaturasPlanner);
});

failed += test('valid_compra_parcelada_passes_required_installment_and_fatura_dependencies', () => {
    const fakeInstallmentMapper = function fakeInstallmentMapper() {};
    const fakeFaturasPlanner = function fakeFaturasPlanner() {};
    const { result, calls } = run({
        entry: installmentEntry(),
        mapInstallmentScheduleContract: fakeInstallmentMapper,
        planExpectedFaturasUpsert: fakeFaturasPlanner,
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.record[0].parsedEntry.tipo_evento, 'compra_parcelada');
    assert.strictEqual(calls.record[0].options.mapInstallmentScheduleContract, fakeInstallmentMapper);
    assert.strictEqual(calls.record[0].options.planExpectedFaturasUpsert, fakeFaturasPlanner);
});

failed += test('parser_failure_returns_structured_error_and_no_write', () => {
    const { result, calls } = run({
        parserResult: {
            ok: false,
            errors: [{ code: 'INVALID_JSON', field: 'response', message: 'bad json' }],
        },
    });

    assert.strictEqual(result.status, 'parser_failed');
    assertError(result, 'INVALID_JSON', 'response');
    assert.strictEqual(calls.record.length, 0);
});

failed += test('parsed_entry_validation_failure_returns_structured_error_and_no_write', () => {
    const { result, calls } = run({
        entry: baseEntry({ valor: '12,34' }),
    });

    assert.strictEqual(result.status, 'validation_failed');
    assertError(result, 'AMBIGUOUS_MONEY_STRING', 'valor');
    assert.strictEqual(calls.record.length, 0);
});

failed += test('duplicate_completed_returns_duplicate_safe_response_and_no_domain_mutation', () => {
    const { result, calls } = run({
        recordResult: {
            ok: false,
            decision: 'duplicate_completed',
            retryable: false,
            shouldCreateFinancialEntry: false,
            errors: [{ code: 'IDEMPOTENCY_COMPLETED_DUPLICATE', field: 'idempotency_key', message: 'duplicate' }],
        },
    });

    assert.strictEqual(result.status, 'duplicate_completed');
    assert.strictEqual(result.record.shouldCreateFinancialEntry, false);
    assert.strictEqual(result.responseText, 'V54: lançamento já registrado anteriormente.');
    assert.strictEqual(calls.record.length, 1);
});

failed += test('processing_retryable_returns_retry_safe_response', () => {
    const { result } = run({
        recordResult: {
            ok: false,
            decision: 'duplicate_processing',
            retryable: true,
            shouldCreateFinancialEntry: false,
            errors: [{ code: 'IDEMPOTENCY_PROCESSING_RETRY', field: 'idempotency_key', message: 'processing' }],
        },
    });

    assert.strictEqual(result.status, 'processing_retryable');
    assert.strictEqual(result.retryable, true);
    assert.strictEqual(result.responseText, 'V54: mensagem já está em processamento. Tente novamente em instantes.');
});

failed += test('unsupported_event_returns_safe_response', () => {
    const { result } = run({
        entry: baseEntry({
            tipo_evento: 'pagamento_fatura',
            id_categoria: undefined,
            id_fatura: 'FAT_TEST',
            afeta_dre: false,
            afeta_patrimonio: true,
        }),
        recordResult: {
            ok: false,
            errors: [{ code: 'UNSUPPORTED_EVENT', field: 'tipo_evento', message: 'unsupported' }],
        },
    });

    assert.strictEqual(result.status, 'unsupported_event');
    assert.strictEqual(result.responseText, 'V54: esse tipo de lançamento ainda não é suportado.');
});

failed += test('missing_user_context_fails_before_parser_or_write', () => {
    const { result, calls } = run({ user: null });

    assert.strictEqual(result.status, 'unauthorized');
    assertError(result, 'V54_USER_CONTEXT_REQUIRED', 'user');
    assert.strictEqual(calls.parser.length, 0);
    assert.strictEqual(calls.record.length, 0);
});

failed += test('handler_and_view_do_not_expose_stack_traces_tokens_spreadsheet_ids_or_raw_secrets', () => {
    const { result } = run({
        recordResult: {
            ok: false,
            decision: 'record_failed',
            retryable: false,
            token: '123456:SECRET',
            stack: 'Error: leaked stack',
            spreadsheet_id: 'SPREADSHEET_REAL_ID',
            nested: { webhook_secret: 'super-secret' },
            errors: [{ code: 'X', field: 'Y', message: 'safe message' }],
        },
    });
    const serialized = JSON.stringify(result);

    assert.strictEqual(serialized.includes('123456:SECRET'), false);
    assert.strictEqual(serialized.includes('leaked stack'), false);
    assert.strictEqual(serialized.includes('SPREADSHEET_REAL_ID'), false);
    assert.strictEqual(serialized.includes('super-secret'), false);
    assert.strictEqual(serialized.includes('[REDACTED]'), true);
    assert.strictEqual(result.responseText.includes('Error:'), false);
});

failed += test('handler_sources_do_not_use_forbidden_real_side_effect_clients', () => {
    const source = `${parserSource}\n${viewsSource}\n${handlerSource}`;
    [
        'SpreadsheetApp',
        'UrlFetchApp',
        'sendTelegram',
        'TELEGRAM_TOKEN',
        'OPENAI_API_KEY',
        'clasp',
        'deploy',
        'applySetupV54',
        'applySeedV54',
        'module.exports',
    ].forEach((needle) => {
        assert.strictEqual(source.includes(needle), false, `${needle} should not appear`);
    });
    assert.strictEqual(/\brequire\s*\(/.test(source), false, 'require() should not appear');
});

// --- SAFETY GUARDRAIL TESTS ---

failed += test('safety_ambiguous_personal_expenses_are_corrected_to_default_pessoa', () => {
    const { result, calls } = run({
        user: { pessoa: 'Luana', nome: 'Luana' },
        entry: baseEntry({
            pessoa: 'Luana',
            id_fonte: 'FONTE_NUBANK_LU',
            descricao: 'farmacia',
            escopo: 'Casal',
            afeta_acerto: true,
            id_categoria: 'OPEX_FARMACIA'
        }),
    }, telegramUpdate({ message: { message_id: 77001, chat: { id: 123456 }, text: '25 farmacia' } }));

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.record[0].parsedEntry.escopo, 'Luana');
    assert.strictEqual(calls.record[0].parsedEntry.afeta_acerto, false);
    assert.strictEqual(calls.record[0].parsedEntry.visibilidade, 'privada');
});

failed += test('safety_ambiguous_personal_expenses_are_corrected_to_gustavo', () => {
    const { result, calls } = run({
        user: { pessoa: 'Gustavo', nome: 'Gustavo' },
        entry: baseEntry({
            descricao: 'farmacia',
            escopo: 'Casal',
            afeta_acerto: true,
            id_categoria: 'OPEX_FARMACIA'
        }),
    }, telegramUpdate({ message: { message_id: 77001, chat: { id: 123456 }, text: '25 farmacia' } }));

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.record[0].parsedEntry.escopo, 'Gustavo');
    assert.strictEqual(calls.record[0].parsedEntry.afeta_acerto, false);
    assert.strictEqual(calls.record[0].parsedEntry.visibilidade, 'privada');
});

failed += test('safety_shared_household_expenses_are_allowed_as_casal', () => {
    const { result, calls } = run({
        entry: baseEntry({
            descricao: 'mercado semana',
            escopo: 'Casal',
            afeta_acerto: true,
            id_categoria: 'OPEX_MERCADO_SEMANA'
        }),
    }, telegramUpdate({ message: { message_id: 77001, chat: { id: 123456 }, text: '80 mercado semana' } }));

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.record[0].parsedEntry.escopo, 'Casal');
    assert.strictEqual(calls.record[0].parsedEntry.afeta_acerto, true);
});

failed += test('safety_lanche_trabalho_is_corrected_to_default_pessoa', () => {
    const { result, calls } = run({
        user: { pessoa: 'Gustavo', nome: 'Gustavo' },
        entry: baseEntry({
            descricao: 'lanche trabalho',
            escopo: 'Casal',
            afeta_acerto: true,
            id_categoria: 'OPEX_LANCHE_TRABALHO'
        }),
    }, telegramUpdate({ message: { message_id: 77001, chat: { id: 123456 }, text: '18 lanche trabalho' } }));

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.record[0].parsedEntry.escopo, 'Gustavo');
    assert.strictEqual(calls.record[0].parsedEntry.afeta_acerto, false);
    assert.strictEqual(calls.record[0].parsedEntry.visibilidade, 'privada');
});

failed += test('safety_explicit_casal_is_allowed_even_for_personal_categories', () => {
    const { result, calls } = run({
        entry: baseEntry({
            descricao: 'roupa',
            escopo: 'Casal',
            afeta_acerto: true,
            id_categoria: 'OPEX_ROUPA'
        }),
    }, telegramUpdate({ message: { message_id: 77001, chat: { id: 123456 }, text: '120 roupa casal' } }));

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.record[0].parsedEntry.escopo, 'Casal');
    assert.strictEqual(calls.record[0].parsedEntry.afeta_acerto, true);
});

failed += test('safety_blocks_conflicting_person_markers', () => {
    const { result, calls } = run({
        user: { pessoa: 'Gustavo', nome: 'Gustavo' },
        entry: baseEntry({
            descricao: 'farmacia',
            escopo: 'Casal',
            id_cartao: 'CARD_NUBANK_LU'
        }),
    }, telegramUpdate({ message: { message_id: 77001, chat: { id: 123456 }, text: '50 farmacia nubank luana' } }));

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'safety_blocked');
    assertError(result, 'V54_SAFETY_CONFLICT', 'pessoa');
    assert.strictEqual(calls.record.length, 0);
});

failed += test('safety_blocks_ambiguous_source_and_card_markers', () => {
    const { result, calls } = run({
        user: { pessoa: 'Luana', nome: 'Luana' },
        entry: baseEntry({
            pessoa: 'Luana',
            id_fonte: 'FONTE_NUBANK_LU',
            descricao: 'mercado',
            escopo: 'Casal'
        }),
    }, telegramUpdate({ message: { message_id: 77001, chat: { id: 123456 }, text: '1 mercado conta luana nubank luana' } }));

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'safety_blocked');
    assertError(result, 'V54_SAFETY_CONFLICT', 'conta');
    assert.strictEqual(calls.record.length, 0);
});

if (failed > 0) {
    console.error(`\n${failed} V54 handler runtime check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 handler runtime checks passed.');
}
