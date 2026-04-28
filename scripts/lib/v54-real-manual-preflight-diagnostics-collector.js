'use strict';

const { buildV54RealManualPreflightReport } = require('./v54-real-manual-preflight-report');

const FORBIDDEN_RUNTIME_TOKENS = Object.freeze([
    'RunnerV54',
    'RunnerV54Gate',
    'runV54ManualShadow',
    'runManualShadowV54',
    'invokeV54ManualShadowGate',
    'real_manual',
    'manual_shadow',
    'parseTextV54OpenAI',
    'getParserContextV54',
    'recordEntryV54',
]);

function collectV54RealManualPreflightDiagnostics(input, deps) {
    const source = asObject(input);
    const services = asObject(deps);
    const errors = [];
    const routingDiagnostics = {};

    const mainJsPath = typeof source.mainJsPath === 'string' && source.mainJsPath.trim() !== ''
        ? source.mainJsPath
        : 'src/Main.js';

    const reader = services.readTextFile;
    if (typeof reader !== 'function') {
        addError_(errors, 'READ_TEXT_FILE_MISSING', 'deps.readTextFile', 'deps.readTextFile must be provided as a function.');
    }

    let mainJsSource;
    if (typeof reader === 'function') {
        try {
            mainJsSource = reader(mainJsPath);
        } catch (error) {
            addError_(errors, 'READ_MAIN_JS_FAILED', 'deps.readTextFile', 'Failed to read src/Main.js through injected reader.');
        }
    }

    if (typeof mainJsSource !== 'string' || mainJsSource.trim() === '') {
        addError_(errors, 'MAIN_JS_SOURCE_MISSING', mainJsPath, 'src/Main.js source must be a non-empty string.');
    }

    const incomingRouting = asObject(source.routingDiagnostics);
    if (typeof incomingRouting.mainJsDiffEmpty !== 'boolean') {
        addError_(errors, 'MAIN_JS_DIFF_DIAGNOSTIC_MISSING', 'routingDiagnostics.mainJsDiffEmpty', 'routingDiagnostics.mainJsDiffEmpty is required.');
    }
    routingDiagnostics.mainJsDiffEmpty = incomingRouting.mainJsDiffEmpty;

    const doPostResult = extractRouteAndDetect_(mainJsSource, 'doPost', errors);
    const doGetResult = extractRouteAndDetect_(mainJsSource, 'doGet', errors);

    if (doPostResult.ok) {
        routingDiagnostics.doPostSource = doPostResult.functionSource;
        routingDiagnostics.doPostV54RefsAbsent = doPostResult.forbiddenTokens.length === 0;
    }

    if (doGetResult.ok) {
        routingDiagnostics.doGetSource = doGetResult.functionSource;
        routingDiagnostics.doGetV54RefsAbsent = doGetResult.forbiddenTokens.length === 0;
    }

    const collectorDiagnostics = {
        ok: errors.length === 0,
        mainJsPath,
        routingDiagnostics,
        forbiddenTokenHits: {
            doPost: doPostResult.forbiddenTokens,
            doGet: doGetResult.forbiddenTokens,
        },
        errors,
    };

    let preflightReport;
    try {
        preflightReport = buildV54RealManualPreflightReport({
            referenceDate: source.referenceDate,
            routingDiagnostics,
            evidence: source.evidence,
            parserContextDiagnostics: source.parserContextDiagnostics,
            spreadsheetDiagnostics: source.spreadsheetDiagnostics,
        }, services);
    } catch (error) {
        addError_(errors, 'PREFLIGHT_REPORT_BUILD_FAILED', 'buildV54RealManualPreflightReport', 'Failed to build preflight report safely.');
        collectorDiagnostics.ok = false;
    }

    return {
        ok: errors.length === 0 && preflightReport && preflightReport.ok === true,
        mode: 'real_manual_preflight_collector',
        collectorDiagnostics,
        preflightReport,
    };
}

function extractRouteAndDetect_(sourceText, routeName, errors) {
    const missingCode = routeName === 'doPost' ? 'DO_POST_MISSING' : 'DO_GET_MISSING';
    const unbalancedCode = routeName === 'doPost' ? 'DO_POST_BRACES_UNBALANCED' : 'DO_GET_BRACES_UNBALANCED';
    const forbiddenCode = routeName === 'doPost' ? 'DO_POST_FORBIDDEN_RUNTIME_REF' : 'DO_GET_FORBIDDEN_RUNTIME_REF';

    if (typeof sourceText !== 'string' || sourceText.trim() === '') {
        return { ok: false, forbiddenTokens: [] };
    }

    const extracted = extractFunctionBalanced_(sourceText, routeName);
    if (!extracted.found) {
        addError_(errors, missingCode, `src/Main.js:${routeName}`, `${routeName} function is required in src/Main.js.`);
        return { ok: false, forbiddenTokens: [] };
    }
    if (!extracted.ok) {
        addError_(errors, unbalancedCode, `src/Main.js:${routeName}`, `${routeName} body parsing failed due to unbalanced braces.`);
        return { ok: false, forbiddenTokens: [] };
    }

    const forbiddenTokens = FORBIDDEN_RUNTIME_TOKENS.filter((token) => extracted.body.indexOf(token) !== -1);
    if (forbiddenTokens.length > 0) {
        addError_(errors, forbiddenCode, `src/Main.js:${routeName}`, `${routeName} contains forbidden V54 runtime routing references.`, forbiddenTokens);
    }

    return {
        ok: true,
        body: extracted.body,
        functionSource: extracted.functionSource,
        forbiddenTokens,
    };
}

function extractFunctionBalanced_(source, functionName) {
    const marker = `function ${functionName}(`;
    const start = source.indexOf(marker);
    if (start === -1) {
        return { found: false, ok: false };
    }

    const bodyStart = source.indexOf('{', start);
    if (bodyStart === -1) {
        return { found: true, ok: false };
    }

    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = bodyStart; i < source.length; i++) {
        const ch = source[i];
        const prev = i > 0 ? source[i - 1] : '';
        const next = i + 1 < source.length ? source[i + 1] : '';

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }

        if (inBlockComment) {
            if (prev === '*' && ch === '/') inBlockComment = false;
            continue;
        }

        if (inSingle) {
            if (ch === '\'' && prev !== '\\') inSingle = false;
            continue;
        }

        if (inDouble) {
            if (ch === '"' && prev !== '\\') inDouble = false;
            continue;
        }

        if (inTemplate) {
            if (ch === '`' && prev !== '\\') inTemplate = false;
            continue;
        }

        if (ch === '/' && next === '/') {
            inLineComment = true;
            i += 1;
            continue;
        }

        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i += 1;
            continue;
        }

        if (ch === '\'') {
            inSingle = true;
            continue;
        }

        if (ch === '"') {
            inDouble = true;
            continue;
        }

        if (ch === '`') {
            inTemplate = true;
            continue;
        }

        if (ch === '{') {
            depth += 1;
            continue;
        }

        if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return {
                    found: true,
                    ok: true,
                    functionSource: source.slice(start, i + 1),
                    body: source.slice(bodyStart + 1, i),
                };
            }
            if (depth < 0) {
                return { found: true, ok: false };
            }
        }
    }

    return { found: true, ok: false };
}

function asObject(value) {
    return isObject(value) ? value : {};
}

function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function addError_(errors, code, field, message, details) {
    const item = {
        code: String(code),
        field: String(field || 'collector'),
        message: String(message || 'real_manual collector failed safely.'),
    };
    if (Array.isArray(details) && details.length > 0) {
        item.details = details;
    }
    errors.push(item);
}

module.exports = {
    FORBIDDEN_RUNTIME_TOKENS,
    collectV54RealManualPreflightDiagnostics,
};
