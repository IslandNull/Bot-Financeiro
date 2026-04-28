// ============================================================
// RUNNER V54 - manual/shadow runtime composition, fake-first
// ============================================================
// This file intentionally does not alter doPost, send Telegram messages, or
// choose real Apps Script services by default. It composes V54 runtime pieces
// only when explicit dependencies are injected.

function runV54ManualShadow(update, options) {
    var deps = normalizeRunnerV54Deps_(options);
    var guard = validateRunnerV54Deps_(deps);
    if (!guard.ok) return makeRunnerV54Failure_('runner_dependency_missing', guard.errors);

    try {
        return deps.handleTelegramUpdateV54(update, buildRunnerV54HandlerOptions_(deps));
    } catch (error) {
        return makeRunnerV54Failure_(
            'runner_failed',
            [makeRunnerV54Error_('RUNNER_V54_EXCEPTION', 'runner', 'V54 manual/shadow runner failed safely.')]
        );
    }
}

function runManualShadowV54(update, options) {
    return runV54ManualShadow(update, options);
}

function normalizeRunnerV54Deps_(options) {
    var source = options || {};
    var parserOptions = source.parserOptions && typeof source.parserOptions === 'object'
        ? cloneRunnerV54PlainObject_(source.parserOptions)
        : {};
    var recordOptions = source.recordOptions && typeof source.recordOptions === 'object'
        ? cloneRunnerV54PlainObject_(source.recordOptions)
        : {};

    return {
        user: source.user || null,
        usersByChatId: source.usersByChatId || null,
        handleTelegramUpdateV54: typeof source.handleTelegramUpdateV54 === 'function'
            ? source.handleTelegramUpdateV54
            : (typeof handleTelegramUpdateV54 === 'function' ? handleTelegramUpdateV54 : null),
        parseTextV54: typeof source.parseTextV54 === 'function'
            ? source.parseTextV54
            : (typeof source.parserFake === 'function' ? source.parserFake : null),
        parseTextV54OpenAI: typeof source.parseTextV54OpenAI === 'function'
            ? source.parseTextV54OpenAI
            : (typeof parseTextV54OpenAI === 'function' ? parseTextV54OpenAI : null),
        getParserContext: typeof source.getParserContext === 'function'
            ? source.getParserContext
            : (typeof getParserContextV54 === 'function' ? getParserContextV54 : null),
        recordEntryV54: typeof source.recordEntryV54 === 'function'
            ? source.recordEntryV54
            : (typeof recordEntryV54 === 'function' ? recordEntryV54 : null),
        getSpreadsheet: typeof source.getSpreadsheet === 'function' ? source.getSpreadsheet : null,
        withLock: typeof source.withLock === 'function' ? source.withLock : null,
        fetchJson: typeof source.fetchJson === 'function' ? source.fetchJson : null,
        apiKey: source.apiKey || parserOptions.apiKey || '',
        model: source.model || parserOptions.model || '',
        validateParsedEntryV54: typeof source.validateParsedEntryV54 === 'function'
            ? source.validateParsedEntryV54
            : null,
        planV54IdempotentWrite: typeof source.planV54IdempotentWrite === 'function'
            ? source.planV54IdempotentWrite
            : null,
        mapSingleCardPurchaseContract: typeof source.mapSingleCardPurchaseContract === 'function'
            ? source.mapSingleCardPurchaseContract
            : null,
        mapInstallmentScheduleContract: typeof source.mapInstallmentScheduleContract === 'function'
            ? source.mapInstallmentScheduleContract
            : null,
        planExpectedFaturasUpsert: typeof source.planExpectedFaturasUpsert === 'function'
            ? source.planExpectedFaturasUpsert
            : null,
        now: typeof source.now === 'function' ? source.now : null,
        makeId: typeof source.makeId === 'function' ? source.makeId : null,
        makeCompraId: typeof source.makeCompraId === 'function' ? source.makeCompraId : null,
        cards: Array.isArray(source.cards) ? cloneRunnerV54PlainObject_(source.cards) : null,
        parserOptions: parserOptions,
        recordOptions: recordOptions,
        formatResponse: typeof source.formatResponse === 'function' ? source.formatResponse : null,
    };
}

function validateRunnerV54Deps_(deps) {
    var errors = [];
    requireRunnerV54Function_(deps.handleTelegramUpdateV54, 'handleTelegramUpdateV54', errors);
    requireRunnerV54Function_(deps.recordEntryV54, 'recordEntryV54', errors);
    requireRunnerV54Function_(deps.getSpreadsheet, 'getSpreadsheet', errors);
    requireRunnerV54Function_(deps.withLock, 'withLock', errors);
    requireRunnerV54Function_(deps.validateParsedEntryV54, 'validateParsedEntryV54', errors);
    requireRunnerV54Function_(deps.planV54IdempotentWrite, 'planV54IdempotentWrite', errors);

    if (!deps.parseTextV54) {
        requireRunnerV54Function_(deps.parseTextV54OpenAI, 'parseTextV54OpenAI', errors);
        requireRunnerV54Function_(deps.getParserContext, 'getParserContext', errors);
        requireRunnerV54Function_(deps.fetchJson, 'fetchJson', errors);
        if (!deps.apiKey) {
            errors.push(makeRunnerV54Error_('RUNNER_V54_API_KEY_REQUIRED', 'apiKey', 'V54 runner requires an explicit apiKey or fake apiKey when using the OpenAI parser adapter.'));
        }
    }

    return { ok: errors.length === 0, errors: errors };
}

function requireRunnerV54Function_(value, field, errors) {
    if (typeof value === 'function') return;
    errors.push(makeRunnerV54Error_(
        'RUNNER_V54_DEPENDENCY_REQUIRED',
        field,
        'V54 manual/shadow runner requires injected dependency: ' + field + '.'
    ));
}

function buildRunnerV54HandlerOptions_(deps) {
    return {
        user: deps.user,
        usersByChatId: deps.usersByChatId,
        parseTextV54: buildRunnerV54Parser_(deps),
        parserOptions: buildRunnerV54ParserOptions_(deps),
        validateParsedEntryV54: deps.validateParsedEntryV54,
        recordEntryV54: deps.recordEntryV54,
        recordOptions: buildRunnerV54RecordOptions_(deps),
        formatResponse: deps.formatResponse || (typeof formatV54HandlerResponse_ === 'function' ? formatV54HandlerResponse_ : null),
    };
}

function buildRunnerV54Parser_(deps) {
    if (deps.parseTextV54) return deps.parseTextV54;
    return function(text, context, parserOptions) {
        return deps.parseTextV54OpenAI(text, context, parserOptions);
    };
}

function buildRunnerV54ParserOptions_(deps) {
    var parserOptions = cloneRunnerV54PlainObject_(deps.parserOptions || {});
    parserOptions.getParserContext = function(runtimeContext) {
        return deps.getParserContext(runtimeContext || {}, {
            getSpreadsheet: deps.getSpreadsheet,
            now: deps.now,
            defaultPessoa: parserOptions.defaultPessoa,
            defaultEscopo: parserOptions.defaultEscopo,
        });
    };
    parserOptions.fetchJson = deps.fetchJson;
    parserOptions.apiKey = deps.apiKey;
    parserOptions.model = deps.model || parserOptions.model;
    parserOptions.validateParsedEntryV54 = deps.validateParsedEntryV54;
    if (deps.now) parserOptions.now = deps.now;
    return parserOptions;
}

function buildRunnerV54RecordOptions_(deps) {
    var recordOptions = cloneRunnerV54PlainObject_(deps.recordOptions || {});
    recordOptions.getSpreadsheet = deps.getSpreadsheet;
    recordOptions.withLock = deps.withLock;
    recordOptions.planV54IdempotentWrite = deps.planV54IdempotentWrite;
    recordOptions.mapSingleCardPurchaseContract = deps.mapSingleCardPurchaseContract;
    recordOptions.mapInstallmentScheduleContract = deps.mapInstallmentScheduleContract;
    recordOptions.planExpectedFaturasUpsert = deps.planExpectedFaturasUpsert;
    if (deps.now) recordOptions.now = deps.now;
    if (deps.makeId) recordOptions.makeId = deps.makeId;
    if (deps.makeCompraId) recordOptions.makeCompraId = deps.makeCompraId;
    if (Array.isArray(deps.cards)) recordOptions.cards = cloneRunnerV54PlainObject_(deps.cards);
    return recordOptions;
}

function makeRunnerV54Failure_(status, errors) {
    return {
        ok: false,
        status: status,
        context: null,
        parsedEntry: null,
        record: null,
        decision: '',
        retryable: false,
        errors: normalizeRunnerV54Errors_(errors),
        responseText: 'V54: runner manual/shadow bloqueado por dependencias ausentes.',
    };
}

function normalizeRunnerV54Errors_(errors) {
    var source = Array.isArray(errors) ? errors : [];
    var normalized = source
        .filter(function(error) { return error && typeof error === 'object'; })
        .map(function(error) {
            return makeRunnerV54Error_(
                error.code || 'RUNNER_V54_ERROR',
                error.field || 'runner',
                error.message || 'V54 manual/shadow runner failed safely.'
            );
        });
    if (normalized.length > 0) return normalized;
    return [makeRunnerV54Error_('RUNNER_V54_ERROR', 'runner', 'V54 manual/shadow runner failed safely.')];
}

function makeRunnerV54Error_(code, field, message) {
    return {
        code: String(code || 'RUNNER_V54_ERROR'),
        field: String(field || 'runner'),
        message: String(message || 'V54 manual/shadow runner failed safely.'),
    };
}

function cloneRunnerV54PlainObject_(input) {
    if (!input || typeof input !== 'object') return input;
    return JSON.parse(JSON.stringify(input));
}
