const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'Main.js'), 'utf8');

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

failed += test('routing_mode_foundation', () => {
    let currentPropValue = null;
    let doPostCalledHandleEntry = false;
    let doPostCalledHandleCommand = false;

    const mockEnv = {
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (k) => {
                    if (k === 'V54_ROUTING_MODE') return currentPropValue;
                    if (k === 'WEBHOOK_SECRET') return 'secret-123';
                    if (k === 'AUTHORIZED') return JSON.stringify({ '123': { pagador: 'Teste' } });
                    return null;
                }
            })
        },
        ContentService: {
            createTextOutput: (s) => ({
                setMimeType: () => {}
            })
        },
        console: { warn: () => {}, error: () => {} },
        handleCommand: () => { doPostCalledHandleCommand = true; },
        handleEntry: () => { doPostCalledHandleEntry = true; }
    };

    const context = vm.createContext(mockEnv);
    vm.runInContext(main, context);

    // 1. default sem propriedade => V53_CURRENT
    currentPropValue = null;
    assert.strictEqual(context.getRoutingMode_(), 'V53_CURRENT', 'Should default to V53_CURRENT when missing');

    // 2. propriedade vazia => V53_CURRENT
    currentPropValue = '';
    assert.strictEqual(context.getRoutingMode_(), 'V53_CURRENT', 'Should default to V53_CURRENT when empty');

    // 3. propriedade inválida => V53_CURRENT
    currentPropValue = 'QUALQUER_OUTRA_COISA';
    assert.strictEqual(context.getRoutingMode_(), 'V53_CURRENT', 'Should default to V53_CURRENT when invalid');

    // 4. V54_ROUTING_MODE=V53_CURRENT => V53_CURRENT
    currentPropValue = 'V53_CURRENT';
    assert.strictEqual(context.getRoutingMode_(), 'V53_CURRENT', 'Should return V53_CURRENT explicitly');

    // 5. V54_ROUTING_MODE=V54_SHADOW => V54_SHADOW
    currentPropValue = 'V54_SHADOW';
    assert.strictEqual(context.getRoutingMode_(), 'V54_SHADOW', 'Should return V54_SHADOW');

    // 6. V54_ROUTING_MODE=V54_PRIMARY => V54_PRIMARY
    currentPropValue = 'V54_PRIMARY';
    assert.strictEqual(context.getRoutingMode_(), 'V54_PRIMARY', 'Should return V54_PRIMARY');

    // 7. doPost ainda preserva fluxo produtivo atual (roteia pro handleEntry/handleCommand atual)
    // Sem secret pra garantir que doPost não foi quebrado.
    let e = { parameter: { webhook_secret: 'secret-123' }, postData: { contents: JSON.stringify({ message: { text: '10 ifood', chat: { id: 123 } } }) } };
    
    doPostCalledHandleEntry = false;
    doPostCalledHandleCommand = false;
    context.doPost(e);
    assert.strictEqual(doPostCalledHandleEntry, true, 'doPost should continue calling handleEntry for texts');
    assert.strictEqual(doPostCalledHandleCommand, false);

    e.postData.contents = JSON.stringify({ message: { text: '/saldo', chat: { id: 123 } } });
    doPostCalledHandleEntry = false;
    doPostCalledHandleCommand = false;
    context.doPost(e);
    assert.strictEqual(doPostCalledHandleCommand, true, 'doPost should continue calling handleCommand for commands');
    assert.strictEqual(doPostCalledHandleEntry, false);
});

failed += test('diagnose_routing_mode', () => {
    let currentPropValue = null;
    const mockEnv = {
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (k) => {
                    if (k === 'V54_ROUTING_MODE') return currentPropValue;
                    if (k === 'WEBHOOK_SECRET') return 'secret-123';
                    if (k === 'AUTHORIZED') return JSON.stringify({ '123': { pagador: 'Teste' } });
                    return null;
                }
            })
        },
        console: { warn: () => {}, error: () => {}, log: () => {} },
    };

    const context = vm.createContext(mockEnv);
    vm.runInContext(main, context);

    function assertReport(prop, expectedEffective, expectedFallbackReason) {
        currentPropValue = prop;
        const report = context.diagnoseRoutingMode();
        assert.strictEqual(report.ok, true);
        assert.strictEqual(report.effectiveMode, expectedEffective);
        assert.strictEqual(report.fallbackReason, expectedFallbackReason);
        assert.ok(Array.isArray(report.allowedModes));
        assert.ok(report.allowedModes.includes('V53_CURRENT'));
        assert.ok(report.allowedModes.includes('V54_SHADOW'));
        assert.ok(report.allowedModes.includes('V54_PRIMARY'));
        assert.strictEqual(report.WEBHOOK_SECRET, undefined, 'Must not leak secrets');
        assert.strictEqual(report.OPENAI_API_KEY, undefined, 'Must not leak secrets');
        assert.strictEqual(report.TELEGRAM_TOKEN, undefined, 'Must not leak secrets');
    }

    assertReport(null, 'V53_CURRENT', 'missing');
    assertReport(undefined, 'V53_CURRENT', 'missing');
    assertReport('', 'V53_CURRENT', 'empty');
    assertReport('BLABLA', 'V53_CURRENT', 'invalid');
    assertReport('V53_CURRENT', 'V53_CURRENT', 'none');
    assertReport('V54_SHADOW', 'V54_SHADOW', 'none');
    assertReport('V54_PRIMARY', 'V54_PRIMARY', 'none');
});

if (failed > 0) {
    console.error(`\n${failed} routing mode check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll routing mode checks passed.');
}
