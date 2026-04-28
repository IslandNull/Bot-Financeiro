// ============================================================
// RUNNER V54 GATE - reviewed manual-only invocation
// ============================================================
// Manual envelope only. This file is not wired into web routes or routing.

var V54_RUNNER_GATE_DEFAULT_MODE = 'fake_shadow';
var V54_RUNNER_GATE_ALLOWED_MODES = ['dry_run', 'fake_shadow', 'real_manual'];
var V54_RUNNER_GATE_REQUIRED_CHECKS = [
    'reviewed',
    'manualOnly',
    'doPostUnchanged',
    'telegramSendDisabled',
];

function invokeV54ManualShadowGate(input, options) {
    var deps = normalizeRunnerV54GateDeps_(options);
    var guard = validateRunnerV54GateInput_(input, deps);
    if (!guard.ok) return makeRunnerV54GateFailure_('gate_blocked', guard.mode, guard.errors);

    if (guard.mode === 'real_manual') {
        var policy = evaluateRunnerV54GateRealManualPolicy_(input, deps);
        if (!policy.ok) return makeRunnerV54GateFailure_('gate_real_manual_policy_blocked', guard.mode, policy.errors);
        guard.realManualPolicy = policy;
    }

    if (!deps.runner) {
        return makeRunnerV54GateFailure_('gate_dependency_missing', guard.mode, [
            makeRunnerV54GateError_('RUNNER_V54_GATE_RUNNER_REQUIRED', 'runV54ManualShadow', 'Manual V54 gate requires an injected or global runner.'),
        ]);
    }

    if (guard.mode === 'dry_run') {
        return {
            ok: true,
            status: 'gate_dry_run_passed',
            mode: guard.mode,
            gate: makeRunnerV54GateSummary_(guard),
            runner: null,
            errors: [],
        };
    }

    try {
        var runnerResult = deps.runner(input.update, input.runnerOptions || {});
        return {
            ok: runnerResult && runnerResult.ok === true,
            status: runnerResult && runnerResult.ok === true ? 'gate_runner_completed' : 'gate_runner_failed',
            mode: guard.mode,
            gate: makeRunnerV54GateSummary_(guard),
            runner: sanitizeRunnerV54GateResult_(runnerResult),
            errors: runnerResult && Array.isArray(runnerResult.errors) ? runnerResult.errors : [],
        };
    } catch (error) {
        return makeRunnerV54GateFailure_('gate_runner_exception', guard.mode, [
            makeRunnerV54GateError_('RUNNER_V54_GATE_RUNNER_EXCEPTION', 'runV54ManualShadow', 'Manual V54 gate runner failed safely.'),
        ]);
    }
}

function runV54ManualShadowGate(input, options) {
    return invokeV54ManualShadowGate(input, options);
}

function normalizeRunnerV54GateDeps_(options) {
    var source = options || {};
    return {
        runner: typeof source.runV54ManualShadow === 'function'
            ? source.runV54ManualShadow
            : (typeof runV54ManualShadow === 'function' ? runV54ManualShadow : null),
        defaultMode: source.defaultMode || V54_RUNNER_GATE_DEFAULT_MODE,
        evaluateRealManualPolicy: typeof source.evaluateRealManualPolicy === 'function'
            ? source.evaluateRealManualPolicy
            : (typeof evaluateRunnerV54RealManualPolicy === 'function' ? evaluateRunnerV54RealManualPolicy : null),
        realManualPolicyOptions: source.realManualPolicyOptions && typeof source.realManualPolicyOptions === 'object'
            ? source.realManualPolicyOptions
            : {},
    };
}

function validateRunnerV54GateInput_(input, deps) {
    var errors = [];
    var mode = normalizeRunnerV54GateMode_(input, deps);

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return {
            ok: false,
            mode: mode,
            errors: [makeRunnerV54GateError_('RUNNER_V54_GATE_INPUT_REQUIRED', 'input', 'Manual V54 gate requires an explicit input object.')],
        };
    }

    if (isRunnerV54GateWebEventLike_(input)) {
        errors.push(makeRunnerV54GateError_('RUNNER_V54_GATE_WEB_EVENT_REJECTED', 'input', 'Manual V54 gate rejects web event shaped input.'));
    }

    if (V54_RUNNER_GATE_ALLOWED_MODES.indexOf(mode) === -1) {
        errors.push(makeRunnerV54GateError_('RUNNER_V54_GATE_MODE_INVALID', 'mode', 'Manual V54 gate mode must be dry_run, fake_shadow, or real_manual.'));
    }

    var checklist = input.checklist;
    if (!checklist || typeof checklist !== 'object' || Array.isArray(checklist)) {
        errors.push(makeRunnerV54GateError_('RUNNER_V54_GATE_CHECKLIST_REQUIRED', 'checklist', 'Manual V54 gate requires a checklist object.'));
    } else {
        V54_RUNNER_GATE_REQUIRED_CHECKS.forEach(function(field) {
            if (checklist[field] !== true) {
                errors.push(makeRunnerV54GateError_('RUNNER_V54_GATE_CHECK_REQUIRED', 'checklist.' + field, 'Manual V54 gate checklist requires ' + field + ' === true.'));
            }
        });
        if (mode === 'real_manual' && checklist.realRunApproved !== true) {
            errors.push(makeRunnerV54GateError_('RUNNER_V54_GATE_REAL_RUN_REVIEW_REQUIRED', 'checklist.realRunApproved', 'Manual V54 real execution requires realRunApproved === true.'));
        }
    }

    if (mode !== 'dry_run' && (!input.update || typeof input.update !== 'object' || Array.isArray(input.update))) {
        errors.push(makeRunnerV54GateError_('RUNNER_V54_GATE_UPDATE_REQUIRED', 'update', 'Manual V54 gate requires an update object for non-dry-run modes.'));
    }

    return { ok: errors.length === 0, mode: mode, errors: errors };
}

function normalizeRunnerV54GateMode_(input, deps) {
    var source = input && typeof input === 'object' ? input.mode : '';
    return String(source || (deps && deps.defaultMode) || V54_RUNNER_GATE_DEFAULT_MODE);
}

function isRunnerV54GateWebEventLike_(input) {
    if (!input || typeof input !== 'object') return false;
    if (input.postData && typeof input.postData === 'object') return true;
    if (input.parameter && typeof input.parameter === 'object') return true;
    if (input.parameters && typeof input.parameters === 'object') return true;
    if (typeof input.queryString === 'string') return true;
    if (input.contextPath !== undefined) return true;
    if (input.contentLength !== undefined && input.postData) return true;
    return false;
}

function makeRunnerV54GateSummary_(guard) {
    var summary = {
        reviewed: true,
        manualOnly: true,
        doPostUnchanged: true,
        telegramSendDisabled: true,
        mode: guard.mode,
    };
    if (guard.realManualPolicy) {
        summary.realManualPolicy = sanitizeRunnerV54GateResult_(guard.realManualPolicy);
    }
    return summary;
}

function evaluateRunnerV54GateRealManualPolicy_(input, deps) {
    if (!deps.evaluateRealManualPolicy) {
        return {
            ok: false,
            errors: [makeRunnerV54GateError_('RUNNER_V54_GATE_REAL_MANUAL_POLICY_REQUIRED', 'evaluateRealManualPolicy', 'real_manual mode requires reviewed policy diagnostics.')],
        };
    }
    try {
        var result = deps.evaluateRealManualPolicy(input, deps.realManualPolicyOptions || {});
        if (result && result.ok === true) return { ok: true, result: result, errors: [] };
        return {
            ok: false,
            errors: result && Array.isArray(result.errors) && result.errors.length > 0
                ? result.errors
                : [makeRunnerV54GateError_('RUNNER_V54_GATE_REAL_MANUAL_POLICY_BLOCKED', 'realManualPolicy', 'real_manual policy diagnostics blocked execution.')],
        };
    } catch (error) {
        return {
            ok: false,
            errors: [makeRunnerV54GateError_('RUNNER_V54_GATE_REAL_MANUAL_POLICY_EXCEPTION', 'evaluateRealManualPolicy', 'real_manual policy diagnostics failed safely.')],
        };
    }
}

function makeRunnerV54GateFailure_(status, mode, errors) {
    return {
        ok: false,
        status: status,
        mode: mode || V54_RUNNER_GATE_DEFAULT_MODE,
        gate: null,
        runner: null,
        errors: normalizeRunnerV54GateErrors_(errors),
    };
}

function normalizeRunnerV54GateErrors_(errors) {
    var source = Array.isArray(errors) ? errors : [];
    var normalized = source
        .filter(function(error) { return error && typeof error === 'object'; })
        .map(function(error) {
            return makeRunnerV54GateError_(
                error.code || 'RUNNER_V54_GATE_ERROR',
                error.field || 'gate',
                error.message || 'Manual V54 gate failed safely.'
            );
        });
    if (normalized.length > 0) return normalized;
    return [makeRunnerV54GateError_('RUNNER_V54_GATE_ERROR', 'gate', 'Manual V54 gate failed safely.')];
}

function makeRunnerV54GateError_(code, field, message) {
    return {
        code: String(code || 'RUNNER_V54_GATE_ERROR'),
        field: String(field || 'gate'),
        message: String(message || 'Manual V54 gate failed safely.'),
    };
}

function sanitizeRunnerV54GateResult_(result) {
    if (!result || typeof result !== 'object') return result || null;
    return JSON.parse(JSON.stringify(result));
}
