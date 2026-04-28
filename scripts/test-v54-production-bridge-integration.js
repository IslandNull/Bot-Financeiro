'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcFiles = [
    'src/000_V54Schema.js',
    'src/Main.js',
    'src/TelegramNotification.js',
    'src/TelegramSendLogV54.js',
    'src/RunnerV54ProductionBridge.js',
    'src/HandlerV54.js',
    'src/ParserV54.js',
    'src/ParserV54OpenAI.js',
    'src/ParserV54Context.js',
    'src/ActionsV54.js',
    'src/ActionsV54Helpers.js',
    'src/CardContractsV54.js',
    'src/IdempotencyV54.js',
    'src/ActionsV54Idempotency.js',
    'src/ViewsV54.js'
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
        console.error(`FAIL ${name} - ${error.stack}`);
        return 1;
    }
}

function createSandbox(overrides) {
    const calls = {
        openById: 0,
        fetch: 0,
        setValues: 0,
        sendTelegram: 0,
        handleEntryV53: 0,
    };

    const sandbox = Object.assign({
        CONFIG: {
            MODEL: 'gpt-5-nano',
            SPREADSHEET_ID: 'sheet-123',
            OPENAI_API_KEY: 'api-key',
            TELEGRAM_TOKEN: 'tg-token',
            AUTHORIZED: JSON.stringify({ '12345': 'Gustavo' }),
            WEBHOOK_SECRET: 'test-secret'
        },
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (k) => {
                    if (k === 'V54_ROUTING_MODE') return overrides.ROUTING_MODE || 'V53_CURRENT';
                    return sandbox.CONFIG[k] || '';
                }
            })
        },
        SpreadsheetApp: {
            openById() {
                calls.openById += 1;
                return {
                    getSheetByName: (name) => {
                        return {
                            getLastRow: () => 1,
                            getRange: () => ({
                                getValues: () => {
                                    if (name === 'Config_Categorias') return [['id_categoria', 'nome', 'grupo', 'tipo_movimento', 'classe_dre', 'escopo', 'comportamento_orcamento', 'afeta_acerto', 'afeta_dre', 'visibilidade_padrao', 'ativo']];
                                    if (name === 'Config_Fontes') return [['id_fonte', 'nome', 'tipo', 'titular', 'ativo']];
                                    if (name === 'Cartoes') return [['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo']];
                                    if (name === 'Faturas') return [['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'fonte_pagamento', 'status']];
                                    if (name === 'Lancamentos_V54') return [['id_lancamento','data','competencia','tipo_evento','id_categoria','valor','id_fonte','pessoa','escopo','id_cartao','id_fatura','id_compra','id_parcela','afeta_dre','afeta_acerto','afeta_patrimonio','visibilidade','descricao','created_at']];
                                    if (name === 'Idempotency_Log') return [['idempotency_key', 'source', 'telegram_update_id', 'telegram_message_id', 'chat_id', 'payload_hash', 'status', 'result_ref', 'created_at', 'updated_at', 'error_code', 'observacao']];
                                    return [[]];
                                },
                                setValues: (v) => {
                                    calls.setValues += 1;
                                }
                            })
                        };
                    }
                };
            },
        },
        UrlFetchApp: {
            fetch(url, options) {
                calls.fetch += 1;
                if (url.includes('telegram')) {
                    calls.sendTelegram += 1;
                    return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
                }
                return {
                    getResponseCode: () => 200,
                    getContentText: () => JSON.stringify({
                        choices: [{ message: { content: JSON.stringify({
                            tipo_evento: "despesa",
                            data: "2026-04-28",
                            competencia: "2026-04",
                            valor: 10,
                            descricao: "Teste",
                            pessoa: "Gustavo",
                            escopo: "Casal",
                            visibilidade: "resumo",
                            afeta_dre: true,
                            afeta_acerto: true,
                            afeta_patrimonio: true,
                            id_categoria: "cat-1",
                            id_fonte: "font-1"
                        }) } }]
                    }),
                };
            },
        },
        LockService: {
            getScriptLock: () => ({
                waitLock: () => {},
                releaseLock: () => {}
            })
        },
        ContentService: {
            createTextOutput: (s) => s,
            MimeType: { TEXT: 'text/plain' }
        },
        console: console,
        handleEntry: () => {
            calls.handleEntryV53 += 1;
        }
    }, overrides || {});

    vm.createContext(sandbox);
    vm.runInContext(globalCode, sandbox);
    return { sandbox, calls };
}

let failed = 0;

failed += test('src_runtime_exposes_v54_primary_bridge_dependencies', () => {
    const { sandbox } = createSandbox({ ROUTING_MODE: 'V54_PRIMARY' });

    assert.strictEqual(typeof sandbox.planV54IdempotentWrite, 'function');
    assert.strictEqual(typeof sandbox.planIdempotencyForUpdate, 'function');
    assert.strictEqual(typeof sandbox.mapSingleCardPurchaseContract, 'function');
    assert.strictEqual(typeof sandbox.mapInstallmentScheduleContract, 'function');
    assert.strictEqual(typeof sandbox.planExpectedFaturasUpsert, 'function');
});

failed += test('V54_PRIMARY_bridge_build_uses_src_runtime_contracts', () => {
    const { sandbox } = createSandbox({ ROUTING_MODE: 'V54_PRIMARY' });
    sandbox._loadSecrets();
    const result = sandbox.buildV54ProductionBridgeDeps_({ mode: 'V54_PRIMARY' }, {});

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.errors.some((error) => error.code === 'V54_IDEMPOTENCY_REQUIRED'), false);
    assert.strictEqual(result.errors.some((error) => error.code === 'V54_CARD_MAPPER_REQUIRED'), false);
    assert.strictEqual(result.errors.some((error) => error.code === 'V54_INSTALLMENT_MAPPER_REQUIRED'), false);
    assert.strictEqual(result.errors.some((error) => error.code === 'V54_FATURAS_PLANNER_REQUIRED'), false);
    assert.strictEqual(result.deps.recordOptions.planV54IdempotentWrite, sandbox.planV54IdempotentWrite);
    assert.strictEqual(result.deps.recordOptions.mapSingleCardPurchaseContract, sandbox.mapSingleCardPurchaseContract);
    assert.strictEqual(result.deps.recordOptions.mapInstallmentScheduleContract, sandbox.mapInstallmentScheduleContract);
    assert.strictEqual(result.deps.recordOptions.planExpectedFaturasUpsert, sandbox.planExpectedFaturasUpsert);
});

failed += test('V54_PRIMARY_dependency_completeness', () => {
    const { sandbox, calls } = createSandbox({ ROUTING_MODE: 'V54_PRIMARY' });
    
    // Simulate webhook
    sandbox.doPost({
        postData: { contents: JSON.stringify({ message: { chat: { id: 12345 }, text: "Gastei 10" } }) },
        parameter: { webhook_secret: 'test-secret' }
    });

    assert.strictEqual(calls.handleEntryV53, 0, 'Should not call V53 fallback');
    assert.strictEqual(calls.sendTelegram, 1, 'Should send telegram reply');
    assert.ok(calls.setValues > 0, 'Should have mutated spreadsheet');
});

failed += test('V54_PRIMARY_missing_dependency', () => {
    const { sandbox, calls } = createSandbox({ ROUTING_MODE: 'V54_PRIMARY' });
    // Remove one dependency from the sandbox after creation
    vm.runInContext('planV54IdempotentWrite = undefined;', sandbox);
    
    sandbox.doPost({
        postData: { contents: JSON.stringify({ message: { chat: { id: 12345 }, text: "Gastei 10" } }) },
        parameter: { webhook_secret: 'test-secret' }
    });

    assert.strictEqual(calls.handleEntryV53, 0, 'Should not call V53 fallback');
    assert.strictEqual(calls.setValues, 0, 'Should not mutate spreadsheet because bridge failed closed');
});

failed += test('V54_SHADOW_no_write', () => {
    const { sandbox, calls } = createSandbox({ ROUTING_MODE: 'V54_SHADOW' });
    
    sandbox.doPost({
        postData: { contents: JSON.stringify({ message: { chat: { id: 12345 }, text: "Gastei 10" } }) },
        parameter: { webhook_secret: 'test-secret' }
    });

    assert.strictEqual(calls.handleEntryV53, 1, 'Should call V53 fallback in shadow mode');
    assert.strictEqual(calls.setValues, 0, 'Should not mutate spreadsheet through V54');
});

if (failed > 0) {
    console.error(`\n${failed} V54 integration check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 integration checks passed.');
}
