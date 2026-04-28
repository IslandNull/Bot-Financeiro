'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const gateSource = fs.readFileSync(path.join(root, 'src', 'RunnerV54Gate.js'), 'utf8');
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

function loadGate(extraSandbox) {
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
    vm.runInContext(`${gateSource}\nresult = { invokeV54ManualShadowGate, runV54ManualShadowGate };`, sandbox);
    return sandbox.result;
}

function checklist(overrides) {
    return Object.assign({
        reviewed: true,
        manualOnly: true,
        doPostUnchanged: true,
        telegramSendDisabled: true,
    }, overrides || {});
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

function manualInput(overrides) {
    return Object.assign({
        mode: 'fake_shadow',
        checklist: checklist(),
        update: update(),
        runnerOptions: {
            fake: true,
        },
    }, overrides || {});
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

let failed = 0;

failed += test('missing_checklist_fails_closed_and_does_not_call_runner', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGate();
    const result = invokeV54ManualShadowGate(manualInput({ checklist: undefined }), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
    });

    assertError(result, 'RUNNER_V54_GATE_CHECKLIST_REQUIRED', 'checklist');
    assert.strictEqual(calls, 0);
});

failed += test('incomplete_checklist_fails_closed', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGate();
    const result = invokeV54ManualShadowGate(manualInput({
        checklist: checklist({ doPostUnchanged: false }),
    }), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
    });

    assertError(result, 'RUNNER_V54_GATE_CHECK_REQUIRED', 'checklist.doPostUnchanged');
    assert.strictEqual(calls, 0);
});

failed += test('valid_fake_checklist_calls_injected_runner_once', () => {
    const calls = [];
    const { invokeV54ManualShadowGate } = loadGate();
    const input = manualInput();
    const result = invokeV54ManualShadowGate(input, {
        runV54ManualShadow(updateArg, optionsArg) {
            calls.push({ update: updateArg, options: optionsArg });
            return {
                ok: true,
                status: 'recorded',
                errors: [],
            };
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.status, 'gate_runner_completed');
    assert.strictEqual(result.mode, 'fake_shadow');
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0].update, input.update);
    assert.deepStrictEqual(calls[0].options, input.runnerOptions);
});

failed += test('input_resembling_doPost_event_fails_closed', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGate();
    const result = invokeV54ManualShadowGate({
        postData: { contents: JSON.stringify(update()) },
        checklist: checklist(),
        update: update(),
    }, {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
    });

    assertError(result, 'RUNNER_V54_GATE_WEB_EVENT_REJECTED', 'input');
    assert.strictEqual(calls, 0);
});

failed += test('input_resembling_doGet_query_event_fails_closed', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGate();
    const result = invokeV54ManualShadowGate({
        parameter: { action: 'runV54ManualShadow' },
        queryString: 'action=runV54ManualShadow',
        checklist: checklist(),
        update: update(),
    }, {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
    });

    assertError(result, 'RUNNER_V54_GATE_WEB_EVENT_REJECTED', 'input');
    assert.strictEqual(calls, 0);
});

failed += test('real_manual_requires_real_run_approved', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGate();
    const result = invokeV54ManualShadowGate(manualInput({
        mode: 'real_manual',
        checklist: checklist({ realRunApproved: false }),
    }), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
    });

    assertError(result, 'RUNNER_V54_GATE_REAL_RUN_REVIEW_REQUIRED', 'checklist.realRunApproved');
    assert.strictEqual(calls, 0);
});

failed += test('dry_run_validates_gate_without_calling_runner', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGate();
    const result = invokeV54ManualShadowGate(manualInput({
        mode: 'dry_run',
        update: undefined,
    }), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.status, 'gate_dry_run_passed');
    assert.strictEqual(result.runner, null);
    assert.strictEqual(calls, 0);
});

failed += test('gate_never_calls_telegram_real_openai_urlfetch_or_real_spreadsheet_in_local_tests', () => {
    let telegramCalled = false;
    let urlFetchCalled = false;
    let spreadsheetCalled = false;
    const { invokeV54ManualShadowGate } = loadGate({
        sendTelegram: () => { telegramCalled = true; throw new Error('telegram called'); },
        UrlFetchApp: { fetch: () => { urlFetchCalled = true; throw new Error('url fetch called'); } },
        SpreadsheetApp: { openById: () => { spreadsheetCalled = true; throw new Error('spreadsheet called'); } },
    });
    const result = invokeV54ManualShadowGate(manualInput(), {
        runV54ManualShadow() {
            return { ok: true, errors: [] };
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(telegramCalled, false);
    assert.strictEqual(urlFetchCalled, false);
    assert.strictEqual(spreadsheetCalled, false);
});

failed += test('main_doPost_does_not_call_manual_gate_or_manual_runner_directly', () => {
    assert.strictEqual(mainSource.includes('invokeV54ManualShadowGate'), false);
    assert.strictEqual(mainSource.includes('runV54ManualShadowGate'), false);
    assert.strictEqual(mainSource.includes('runV54ManualShadow'), false);
    assert.strictEqual(mainSource.includes('runManualShadowV54'), false);
    assert.strictEqual(mainSource.includes('handleTelegramUpdateV54'), true);
    assert.strictEqual(mainSource.includes('routeV54PrimaryEntry_('), true);
    assert.strictEqual(mainSource.includes('runV54ShadowDiagnostics_('), true);
    assert.strictEqual(mainSource.includes('recordEntryV54ShadowNoWrite_'), true);
    assert.strictEqual(mainSource.includes('handleEntry(text, chatId, user)'), true);
    assert.strictEqual(mainSource.includes('handleCommand(text, chatId, user)'), true);
});

failed += test('main_doGet_does_not_expose_gate_or_runner', () => {
    assert.strictEqual(mainSource.includes('RunnerV54Gate'), false);
    assert.strictEqual(mainSource.includes('invokeV54ManualShadowGate'), false);
    assert.strictEqual(mainSource.includes('runV54ManualShadowGate'), false);
    assert.strictEqual(mainSource.includes('runV54ManualShadow'), false);
});

failed += test('gate_src_is_apps_script_compatible_and_has_no_forbidden_side_effect_clients', () => {
    assert.strictEqual(/\brequire\s*\(/.test(gateSource), false);
    assert.strictEqual(gateSource.includes('module.exports'), false);
    ['sendTelegram', 'UrlFetchApp', 'SpreadsheetApp', 'clasp', 'deploy', 'applySetupV54', 'applySeedV54'].forEach((needle) => {
        assert.strictEqual(gateSource.includes(needle), false, `${needle} should not appear`);
    });
    assert.doesNotThrow(() => new Function(gateSource));
});

failed += test('existing_runner_source_still_has_no_web_route_exposure', () => {
    assert.strictEqual(/\bfunction\s+doGet\s*\(/.test(runnerSource), false);
    assert.strictEqual(/\bfunction\s+doPost\s*\(/.test(runnerSource), false);
    assert.strictEqual(runnerSource.includes('sendTelegram'), false);
});

if (failed > 0) {
    console.error(`\n${failed} V54 manual/shadow gate check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 manual/shadow gate checks passed.');
}
