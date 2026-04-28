// ============================================================
// IDEMPOTENCY V54 - Apps Script runtime planner
// ============================================================
// Global Apps Script mirror of scripts/lib/v54-idempotency-*.js.
// This file intentionally avoids CommonJS, Node hashing APIs,
// spreadsheet clients, and external services.

var V54_IDEMPOTENCY_STATUSES_RUNTIME = {
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
};

var V54_IDEMPOTENCY_FAILURE_WINDOWS_RUNTIME = {
    PROCESSING_LOG_WITHOUT_FINANCIAL_ROW: 'PROCESSING_LOG_WITHOUT_FINANCIAL_ROW',
    FINANCIAL_ROW_WITHOUT_COMPLETED_LOG: 'FINANCIAL_ROW_WITHOUT_COMPLETED_LOG',
    FAILED_OR_STALE_PROCESSING_REQUIRES_POLICY: 'FAILED_OR_STALE_PROCESSING_REQUIRES_POLICY',
};

var V54_STALE_PROCESSING_ERROR_CODES_RUNTIME = {
    NO_DOMAIN_MUTATION: 'STALE_PROCESSING_NO_DOMAIN_MUTATION',
    DOMAIN_MUTATION_REVIEW_REQUIRED: 'STALE_PROCESSING_DOMAIN_MUTATION_REVIEW_REQUIRED',
};

function getV54IdempotencyHeaders_() {
    if (typeof V54_IDEMPOTENCY_LOG_HEADERS !== 'undefined' && Array.isArray(V54_IDEMPOTENCY_LOG_HEADERS)) {
        return V54_IDEMPOTENCY_LOG_HEADERS.slice();
    }
    return [
        'idempotency_key',
        'source',
        'telegram_update_id',
        'telegram_message_id',
        'chat_id',
        'payload_hash',
        'status',
        'result_ref',
        'created_at',
        'updated_at',
        'error_code',
        'observacao',
    ];
}

function getV54IdempotencyLogSheetName_() {
    return typeof V54_IDEMPOTENCY_LOG_SHEET !== 'undefined' ? V54_IDEMPOTENCY_LOG_SHEET : 'Idempotency_Log';
}

function getV54LancamentosSheetName_() {
    return typeof V54_LANCAMENTOS_SHEET !== 'undefined' ? V54_LANCAMENTOS_SHEET : 'Lancamentos_V54';
}

function makeV54IdempotencyError_(code, field, message) {
    return { code: code, field: field, message: message };
}

function stableStringifyV54_(value) {
    if (value === null || value === undefined) return JSON.stringify(value);
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringifyV54_).join(',') + ']';
    }
    if (typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(function(key) {
            return JSON.stringify(key) + ':' + stableStringifyV54_(value[key]);
        }).join(',') + '}';
    }
    return JSON.stringify(value);
}

function hashPayload(payload, options) {
    var text = stableStringifyV54_(payload);
    return hashV54Text_(text, options);
}

function hashV54Text_(text, options) {
    if (options && typeof options.hashText === 'function') {
        return String(options.hashText(String(text)));
    }
    if (typeof Utilities !== 'undefined'
        && Utilities
        && typeof Utilities.computeDigest === 'function'
        && Utilities.DigestAlgorithm
        && Utilities.DigestAlgorithm.SHA_256) {
        var charset = Utilities.Charset && Utilities.Charset.UTF_8 ? Utilities.Charset.UTF_8 : undefined;
        var digest = charset
            ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), charset)
            : Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text));
        return digest.map(function(byteValue) {
            var value = byteValue;
            if (value < 0) value += 256;
            return ('0' + value.toString(16)).slice(-2);
        }).join('');
    }
    return fallbackHashV54Text_(String(text));
}

function fallbackHashV54Text_(text) {
    var seeds = [2166136261, 16777619, 2166136261 ^ 0x9e3779b9, 0x811c9dc5 ^ 0x85ebca6b];
    var parts = [];
    for (var seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
        var hash = seeds[seedIndex] >>> 0;
        for (var i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
        parts.push(('00000000' + hash.toString(16)).slice(-8));
    }
    return (parts.join('') + parts.slice().reverse().join('')).slice(0, 64);
}

function normalizeV54IdempotencyText_(value) {
    return String(value === undefined || value === null ? '' : value).trim();
}

function valueToV54IdempotencyKeyPart_(value) {
    return normalizeV54IdempotencyText_(value).replace(/\s+/g, '_');
}

function makeIdempotencyKey(input) {
    var source = valueToV54IdempotencyKeyPart_(input.source || 'telegram');
    if (input.telegram_update_id !== undefined && input.telegram_update_id !== null && String(input.telegram_update_id) !== '') {
        return source + ':telegram_update_id:' + valueToV54IdempotencyKeyPart_(input.telegram_update_id);
    }
    if (input.chat_id && input.telegram_message_id) {
        return source + ':message:' + valueToV54IdempotencyKeyPart_(input.chat_id) + ':' + valueToV54IdempotencyKeyPart_(input.telegram_message_id);
    }
    return source + ':payload:' + input.payload_hash;
}

function normalizeV54IdempotencyInput_(input, options) {
    var source = input && typeof input === 'object' ? input : {};
    var payload = source.payload === undefined ? source : source.payload;
    var payloadHash = source.payload_hash || hashPayload(payload, options);
    var normalized = {
        source: normalizeV54IdempotencyText_(source.source || 'telegram'),
        telegram_update_id: normalizeV54IdempotencyText_(source.telegram_update_id),
        telegram_message_id: normalizeV54IdempotencyText_(source.telegram_message_id),
        chat_id: normalizeV54IdempotencyText_(source.chat_id),
        payload_hash: payloadHash,
        payload: payload,
        result_ref: normalizeV54IdempotencyText_(source.result_ref),
        error_code: normalizeV54IdempotencyText_(source.error_code),
        observacao: normalizeV54IdempotencyText_(source.observacao),
        semantic_fingerprint: normalizeV54IdempotencyText_(source.semantic_fingerprint || makeSemanticFingerprint(source.semantic_entry, options)),
    };
    normalized.idempotency_key = normalizeV54IdempotencyText_(source.idempotency_key) || makeIdempotencyKey(normalized);
    normalized.now = options && typeof options.now === 'function' ? options.now() : new Date().toISOString();
    return normalized;
}

function makeSemanticFingerprint(entry, options) {
    if (!entry || typeof entry !== 'object') return '';
    var fields = ['data', 'valor', 'descricao', 'pessoa', 'id_fonte'];
    var parts = fields.map(function(field) {
        return normalizeV54IdempotencyText_(entry[field]).toLowerCase();
    });
    if (parts.every(function(part) { return !part; })) return '';
    return hashPayload(parts, options);
}

function rowToV54IdempotencyObject_(row) {
    var headers = getV54IdempotencyHeaders_();
    if (!Array.isArray(row)) return row && typeof row === 'object' ? row : {};
    return headers.reduce(function(acc, header, index) {
        acc[header] = row[index] === undefined || row[index] === null ? '' : row[index];
        return acc;
    }, {});
}

function objectToV54IdempotencyValues_(rowObject) {
    return getV54IdempotencyHeaders_().map(function(header) {
        return rowObject[header] === undefined || rowObject[header] === null ? '' : rowObject[header];
    });
}

function findV54IdempotencyExistingByKey_(existingRows, key) {
    var rows = existingRows || [];
    for (var i = 0; i < rows.length; i++) {
        var row = rowToV54IdempotencyObject_(rows[i]);
        if (normalizeV54IdempotencyText_(row.idempotency_key) === key) return row;
    }
    return null;
}

function findV54PayloadMatches_(existingRows, normalized) {
    return (existingRows || []).map(rowToV54IdempotencyObject_).filter(function(row) {
        return normalizeV54IdempotencyText_(row.payload_hash) === normalized.payload_hash
            && normalizeV54IdempotencyText_(row.idempotency_key) !== normalized.idempotency_key;
    });
}

function findV54SemanticMatches_(existingRows, normalized) {
    if (!normalized.semantic_fingerprint) return [];
    return (existingRows || []).map(rowToV54IdempotencyObject_).filter(function(row) {
        return normalizeV54IdempotencyText_(row.semantic_fingerprint) === normalized.semantic_fingerprint
            && normalizeV54IdempotencyText_(row.idempotency_key) !== normalized.idempotency_key;
    });
}

function makeV54IdempotencyInsertPlan_(normalized, existingRows) {
    var warnings = [];
    if (findV54PayloadMatches_(existingRows, normalized).length > 0) {
        warnings.push(makeV54IdempotencyError_(
            'SAME_PAYLOAD_DIFFERENT_IDEMPOTENCY_KEY',
            'payload_hash',
            'Same payload hash appeared with a different idempotency key; do not silently merge it.'
        ));
    }
    if (findV54SemanticMatches_(existingRows, normalized).length > 0) {
        warnings.push(makeV54IdempotencyError_(
            'POSSIBLE_SEMANTIC_DUPLICATE',
            'semantic_fingerprint',
            'Potential semantic duplicate detected; future write path must warn or block explicitly.'
        ));
    }

    var rowObject = {
        idempotency_key: normalized.idempotency_key,
        source: normalized.source,
        telegram_update_id: normalized.telegram_update_id,
        telegram_message_id: normalized.telegram_message_id,
        chat_id: normalized.chat_id,
        payload_hash: normalized.payload_hash,
        status: V54_IDEMPOTENCY_STATUSES_RUNTIME.PROCESSING,
        result_ref: '',
        created_at: normalized.now,
        updated_at: normalized.now,
        error_code: '',
        observacao: normalized.observacao,
    };

    return {
        ok: true,
        decision: 'insert_processing',
        duplicate: false,
        retryable: false,
        shouldCreateFinancialEntry: true,
        idempotency_key: normalized.idempotency_key,
        payload_hash: normalized.payload_hash,
        warnings: warnings,
        plan: {
            action: 'INSERT_IDEMPOTENCY_LOG',
            sheet: getV54IdempotencyLogSheetName_(),
            headers: getV54IdempotencyHeaders_(),
            rowObject: rowObject,
            rowValues: objectToV54IdempotencyValues_(rowObject),
        },
        existing: null,
        errors: [],
    };
}

function evaluateV54IdempotencyExisting_(existing, normalized) {
    var status = normalizeV54IdempotencyText_(existing.status);
    var base = {
        ok: false,
        duplicate: true,
        shouldCreateFinancialEntry: false,
        idempotency_key: normalized.idempotency_key,
        payload_hash: normalized.payload_hash,
        plan: null,
        existing: existing,
        warnings: [],
    };

    if (status === V54_IDEMPOTENCY_STATUSES_RUNTIME.COMPLETED) {
        base.decision = 'duplicate_completed';
        base.retryable = false;
        base.result_ref = normalizeV54IdempotencyText_(existing.result_ref);
        base.errors = [makeV54IdempotencyError_('IDEMPOTENCY_COMPLETED_DUPLICATE', 'idempotency_key', 'Idempotency key already completed.')];
        return base;
    }

    if (status === V54_IDEMPOTENCY_STATUSES_RUNTIME.PROCESSING) {
        base.decision = 'duplicate_processing';
        base.retryable = true;
        base.result_ref = normalizeV54IdempotencyText_(existing.result_ref);
        base.errors = [makeV54IdempotencyError_('IDEMPOTENCY_PROCESSING_RETRY', 'idempotency_key', 'Idempotency key is already processing; retry later.')];
        return base;
    }

    base.decision = 'duplicate_failed';
    base.retryable = false;
    base.result_ref = normalizeV54IdempotencyText_(existing.result_ref);
    base.errors = [makeV54IdempotencyError_('IDEMPOTENCY_FAILED_REVIEW_REQUIRED', 'idempotency_key', 'Idempotency key previously failed; manual or explicit retry policy required.')];
    return base;
}

function planIdempotencyForUpdate(input, existingRows, options) {
    var normalized = normalizeV54IdempotencyInput_(input, options);
    var existing = findV54IdempotencyExistingByKey_(existingRows, normalized.idempotency_key);
    if (existing) return evaluateV54IdempotencyExisting_(existing, normalized);
    return makeV54IdempotencyInsertPlan_(normalized, existingRows || []);
}

function makeStableV54RefSuffix_(idempotencyKey, options) {
    return hashV54Text_(normalizeV54IdempotencyText_(idempotencyKey), options).slice(0, 20).toUpperCase();
}

function makeDeterministicIdempotentResultRefs(idempotencyKey, options) {
    var suffix = makeStableV54RefSuffix_(idempotencyKey, options);
    return {
        id_lancamento: 'LAN_V54_IDEMP_' + suffix,
        id_compra: 'CP_V54_IDEMP_' + suffix,
    };
}

function makeTelegramIdempotencyInput(input) {
    var source = input && typeof input === 'object' ? input : {};
    var update = source.telegramUpdate || source.payload || {};
    var message = update.message || update.edited_message || update.channel_post || {};
    var chat = message.chat || {};

    return {
        source: source.source || 'telegram',
        telegram_update_id: source.telegram_update_id !== undefined ? source.telegram_update_id : update.update_id,
        telegram_message_id: source.telegram_message_id !== undefined ? source.telegram_message_id : message.message_id,
        chat_id: source.chat_id !== undefined ? source.chat_id : chat.id,
        payload: source.payload !== undefined ? source.payload : update,
        payload_hash: source.payload_hash,
        idempotency_key: source.idempotency_key,
        observacao: source.observacao,
        semantic_entry: source.semantic_entry,
        semantic_fingerprint: source.semantic_fingerprint,
    };
}

function defaultV54IdempotentFinancialPlanner_(parsedEntry, options) {
    if (typeof mapParsedEntryToLancamentoV54_ !== 'function') {
        return {
            ok: false,
            errors: [makeV54IdempotencyError_('FINANCIAL_PLANNER_UNAVAILABLE', 'mapParsedEntryToLancamentoV54_', 'mapParsedEntryToLancamentoV54_ is required for default V54 idempotent financial planning.')],
            plan: null,
            result_ref: '',
            mapped: null,
        };
    }
    var mapped = mapParsedEntryToLancamentoV54_(parsedEntry, options && options.mapperOptions);
    if (!mapped.ok) {
        return {
            ok: false,
            errors: mapped.errors,
            plan: null,
            result_ref: '',
            mapped: mapped,
        };
    }
    return {
        ok: true,
        errors: [],
        result_ref: mapped.rowObject.id_lancamento,
        plan: {
            action: 'INSERT_FINANCIAL_ENTRY',
            sheet: getV54LancamentosSheetName_(),
            headers: mapped.headers,
            rowObject: mapped.rowObject,
            rowValues: mapped.rowValues,
        },
        mapped: mapped,
    };
}

function findV54FinancialByResultRef_(existingFinancialRows, resultRef) {
    var wanted = normalizeV54IdempotencyText_(resultRef);
    if (!wanted) return null;
    var rows = existingFinancialRows || [];
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i] && typeof rows[i] === 'object' ? rows[i] : {};
        if (normalizeV54IdempotencyText_(row.id_lancamento) === wanted
            || normalizeV54IdempotencyText_(row.id_compra) === wanted
            || normalizeV54IdempotencyText_(row.id_parcela) === wanted
            || normalizeV54IdempotencyText_(row.result_ref) === wanted) {
            return row;
        }
    }
    return null;
}

function makeV54CompletionPlan_(processingRowObject, resultRef, now) {
    var rowObject = {};
    Object.keys(processingRowObject || {}).forEach(function(key) {
        rowObject[key] = processingRowObject[key];
    });
    rowObject.status = V54_IDEMPOTENCY_STATUSES_RUNTIME.COMPLETED;
    rowObject.result_ref = resultRef;
    rowObject.updated_at = now;
    rowObject.error_code = '';

    return {
        action: 'MARK_IDEMPOTENCY_COMPLETED',
        sheet: getV54IdempotencyLogSheetName_(),
        key: rowObject.idempotency_key,
        result_ref: resultRef,
        headers: getV54IdempotencyHeaders_(),
        rowObject: rowObject,
        rowValues: objectToV54IdempotencyValues_(rowObject),
    };
}

function makeV54IdempotentBaseResult_(fields) {
    var result = {
        ok: false,
        decision: '',
        retryable: false,
        shouldCreateFinancialEntry: false,
        idempotency: null,
        financial: null,
        plans: [],
        warnings: [],
        failureWindows: [],
        errors: [],
    };
    fields = fields || {};
    Object.keys(fields).forEach(function(key) {
        result[key] = fields[key];
    });
    return result;
}

function recoveryPolicyV54Enabled_(options) {
    return Boolean(options && options.recoveryPolicy && options.recoveryPolicy.enabled === true);
}

function evaluateV54ProcessingRecovery_(idempotency, source, financial, options, now) {
    if (!recoveryPolicyV54Enabled_(options)) return null;
    var planner = typeof options.planStaleProcessingRecovery === 'function'
        ? options.planStaleProcessingRecovery
        : planStaleProcessingRecovery;
    return planner({
        processingRow: idempotency.existing,
        result_ref: idempotency.result_ref || financial.result_ref,
        existingFinancialRows: source.existingFinancialRows || [],
    }, {
        now: now,
        staleAfterMs: options.recoveryPolicy.staleAfterMs,
    });
}

function planV54IdempotentWrite(input, options) {
    var source = input || {};
    var opts = options || {};
    var now = typeof opts.now === 'function' ? opts.now : function() { return new Date().toISOString(); };
    var financialPlanner = typeof opts.financialPlanner === 'function' ? opts.financialPlanner : defaultV54IdempotentFinancialPlanner_;
    var idempotencySource = {};
    Object.keys(source.idempotencyInput || {}).forEach(function(key) {
        idempotencySource[key] = source.idempotencyInput[key];
    });
    if (!source.idempotencyInput) idempotencySource.telegramUpdate = source.telegramUpdate;
    idempotencySource.semantic_entry = source.semanticEntry || source.parsedEntry;

    var hashOptions = {
        hashText: typeof opts.hashText === 'function' ? opts.hashText : null,
    };
    var idempotencyInput = makeTelegramIdempotencyInput(idempotencySource);
    var idempotency = planIdempotencyForUpdate(
        idempotencyInput,
        source.existingIdempotencyRows || [],
        {
            now: now,
            hashText: hashOptions.hashText,
        }
    );
    var deterministicRefs = makeDeterministicIdempotentResultRefs(idempotency.idempotency_key, hashOptions);
    var useDeterministicResultRefs = opts.deterministicResultRefs !== false;
    var financial = financialPlanner(source.parsedEntry, {
        mapperOptions: {
            now: now,
            makeId: useDeterministicResultRefs ? function() { return deterministicRefs.id_lancamento; } : opts.makeId,
        },
        idempotencyInput: idempotencyInput,
        idempotency: idempotency,
        deterministicResultRefs: deterministicRefs,
        makeId: useDeterministicResultRefs ? function() { return deterministicRefs.id_lancamento; } : opts.makeId,
        makeCompraId: useDeterministicResultRefs ? function() { return deterministicRefs.id_compra; } : opts.makeCompraId,
    });

    if (!financial || financial.ok !== true) {
        return makeV54IdempotentBaseResult_({
            decision: 'financial_plan_rejected',
            financial: financial || null,
            errors: financial && Array.isArray(financial.errors)
                ? financial.errors
                : [makeV54IdempotencyError_('FINANCIAL_PLAN_INVALID', 'financial', 'Financial planner returned an invalid result.')],
        });
    }

    if (idempotency.ok !== true) {
        var recovery = idempotency.decision === 'duplicate_processing'
            ? evaluateV54ProcessingRecovery_(idempotency, source, financial, opts, now)
            : null;
        if (recovery) {
            return makeV54IdempotentBaseResult_({
                ok: false,
                decision: recovery.decision || idempotency.decision,
                retryable: recovery.retryable === true,
                shouldCreateFinancialEntry: false,
                idempotency: idempotency,
                financial: financial,
                plans: Array.isArray(recovery.plans) ? recovery.plans : [],
                warnings: (idempotency.warnings || []).concat(Array.isArray(recovery.warnings) ? recovery.warnings : []),
                failureWindows: recovery.decision === 'completion_recovery_planned'
                    ? [{
                        code: V54_IDEMPOTENCY_FAILURE_WINDOWS_RUNTIME.FINANCIAL_ROW_WITHOUT_COMPLETED_LOG,
                        message: 'Matching domain mutation exists while idempotency log is still processing; completion recovery is planned and must be reviewed/applied explicitly.',
                    }]
                    : [{
                        code: V54_IDEMPOTENCY_FAILURE_WINDOWS_RUNTIME.PROCESSING_LOG_WITHOUT_FINANCIAL_ROW,
                        message: 'Processing log recovery was evaluated by the injected stale-processing policy.',
                    }],
                errors: Array.isArray(recovery.errors) ? recovery.errors : [],
                recovery: recovery.recovery || null,
            });
        }

        var existingFinancial = findV54FinancialByResultRef_(source.existingFinancialRows, idempotency.result_ref || financial.result_ref);
        var failureWindows = [];
        var errors = (idempotency.errors || []).slice();
        var decision = idempotency.decision;
        var retryable = idempotency.retryable === true;

        if (idempotency.decision === 'duplicate_processing' && existingFinancial) {
            decision = 'processing_with_financial_present_completion_missing';
            retryable = false;
            failureWindows.push({
                code: V54_IDEMPOTENCY_FAILURE_WINDOWS_RUNTIME.FINANCIAL_ROW_WITHOUT_COMPLETED_LOG,
                message: 'Financial row exists while idempotency log is still processing. Do not insert again; completion recovery policy is TODO.',
                todo: 'Define reviewed recovery path to mark Idempotency_Log completed from existing result_ref.',
            });
            errors.push(makeV54IdempotencyError_('IDEMPOTENCY_COMPLETION_RECOVERY_TODO', 'Idempotency_Log', 'Completion recovery policy is not implemented yet.'));
        } else if (idempotency.decision === 'duplicate_processing') {
            failureWindows.push({
                code: V54_IDEMPOTENCY_FAILURE_WINDOWS_RUNTIME.PROCESSING_LOG_WITHOUT_FINANCIAL_ROW,
                message: 'Idempotency log is processing and no matching financial row was found. Retry later or handle with future stale-processing policy.',
                todo: 'Define stale processing timeout and explicit retry/failed transition policy.',
            });
        } else if (idempotency.decision === 'duplicate_failed') {
            failureWindows.push({
                code: V54_IDEMPOTENCY_FAILURE_WINDOWS_RUNTIME.FAILED_OR_STALE_PROCESSING_REQUIRES_POLICY,
                message: 'Failed idempotency state requires an explicit reviewed retry policy.',
                todo: 'Define failed retry semantics before enabling production routing.',
            });
        }

        return makeV54IdempotentBaseResult_({
            ok: false,
            decision: decision,
            retryable: retryable,
            shouldCreateFinancialEntry: false,
            idempotency: idempotency,
            financial: financial,
            warnings: idempotency.warnings || [],
            failureWindows: failureWindows,
            errors: errors,
        });
    }

    var completionPlan = makeV54CompletionPlan_(idempotency.plan.rowObject, financial.result_ref, now());

    return makeV54IdempotentBaseResult_({
        ok: true,
        decision: 'planned_idempotent_write',
        retryable: false,
        shouldCreateFinancialEntry: true,
        idempotency: idempotency,
        financial: financial,
        plans: [
            idempotency.plan,
            financial.plan,
            completionPlan,
        ],
        warnings: idempotency.warnings || [],
        failureWindows: [
            {
                code: V54_IDEMPOTENCY_FAILURE_WINDOWS_RUNTIME.PROCESSING_LOG_WITHOUT_FINANCIAL_ROW,
                message: 'If execution stops after the processing log insert, retry sees processing and must not insert another financial row.',
            },
            {
                code: V54_IDEMPOTENCY_FAILURE_WINDOWS_RUNTIME.FINANCIAL_ROW_WITHOUT_COMPLETED_LOG,
                message: 'If execution stops after the financial insert before completion update, retry must not insert another financial row; recovery policy remains TODO.',
                todo: 'Define reviewed completion recovery before production routing.',
            },
        ],
        errors: [],
    });
}

function parseV54IdempotencyTimeMs_(value) {
    var text = normalizeV54IdempotencyText_(value);
    if (!text) return null;
    var ms = Date.parse(text);
    return Number.isFinite(ms) ? ms : null;
}

function normalizeV54RecoveryFinancialRows_(rows) {
    return (rows || []).map(function(row) {
        return row && typeof row === 'object' ? row : {};
    });
}

function refMatchesV54Recovery_(row, resultRef) {
    var wanted = normalizeV54IdempotencyText_(resultRef);
    if (!wanted) return false;
    return [
        row.result_ref,
        row.id_lancamento,
        row.id_compra,
        row.id_parcela,
    ].some(function(value) {
        return normalizeV54IdempotencyText_(value) === wanted;
    });
}

function findMatchingDomainMutation(inputRows, resultRef) {
    var rows = normalizeV54RecoveryFinancialRows_(inputRows);
    for (var i = 0; i < rows.length; i++) {
        if (refMatchesV54Recovery_(rows[i], resultRef)) return rows[i];
    }
    return null;
}

function findPossibleV54DomainMutations_(inputRows) {
    return normalizeV54RecoveryFinancialRows_(inputRows).filter(function(row) {
        return normalizeV54IdempotencyText_(row.result_ref)
            || normalizeV54IdempotencyText_(row.id_lancamento)
            || normalizeV54IdempotencyText_(row.id_compra)
            || normalizeV54IdempotencyText_(row.id_parcela);
    });
}

function makeV54RecoveryUpdatePlan_(processingRowObject, updates) {
    var rowObject = {};
    Object.keys(processingRowObject || {}).forEach(function(key) {
        rowObject[key] = processingRowObject[key];
    });
    Object.keys(updates || {}).forEach(function(key) {
        rowObject[key] = updates[key];
    });
    return {
        action: updates.status === V54_IDEMPOTENCY_STATUSES_RUNTIME.COMPLETED
            ? 'MARK_IDEMPOTENCY_COMPLETED'
            : 'MARK_IDEMPOTENCY_FAILED',
        sheet: getV54IdempotencyLogSheetName_(),
        key: rowObject.idempotency_key,
        result_ref: rowObject.result_ref || '',
        headers: getV54IdempotencyHeaders_(),
        rowObject: rowObject,
        rowValues: objectToV54IdempotencyValues_(rowObject),
    };
}

function makeV54RecoveryBaseResult_(fields) {
    var result = {
        ok: false,
        decision: '',
        retryable: false,
        shouldCreateFinancialEntry: false,
        recovery: {
            required: true,
            automatic: false,
        },
        plans: [],
        warnings: [],
        errors: [],
    };
    fields = fields || {};
    Object.keys(fields).forEach(function(key) {
        result[key] = fields[key];
    });
    return result;
}

function planStaleProcessingRecovery(input, options) {
    var source = input || {};
    var opts = options || {};
    var nowIso = typeof opts.now === 'function' ? opts.now() : new Date().toISOString();
    var staleAfterMs = Number(opts.staleAfterMs);
    var processingRow = rowToV54IdempotencyObject_(source.processingRow || source.existing);
    var status = normalizeV54IdempotencyText_(processingRow.status);
    var resultRef = normalizeV54IdempotencyText_(processingRow.result_ref || source.result_ref);

    if (status !== V54_IDEMPOTENCY_STATUSES_RUNTIME.PROCESSING) {
        return makeV54RecoveryBaseResult_({
            decision: 'recovery_policy_not_applicable',
            recovery: { required: false, automatic: false },
            errors: [makeV54IdempotencyError_('RECOVERY_POLICY_NOT_PROCESSING', 'status', 'Recovery policy only applies to processing rows.')],
        });
    }

    if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
        return makeV54RecoveryBaseResult_({
            decision: 'recovery_policy_invalid_threshold',
            errors: [makeV54IdempotencyError_('STALE_AFTER_MS_REQUIRED', 'staleAfterMs', 'staleAfterMs must be a non-negative number.')],
        });
    }

    var nowMs = parseV54IdempotencyTimeMs_(nowIso);
    var startedMs = parseV54IdempotencyTimeMs_(processingRow.updated_at) || parseV54IdempotencyTimeMs_(processingRow.created_at);
    if (nowMs === null || startedMs === null) {
        return makeV54RecoveryBaseResult_({
            decision: 'processing_timestamp_review_required',
            errors: [makeV54IdempotencyError_('PROCESSING_TIMESTAMP_INVALID', 'updated_at', 'Cannot determine processing age; manual review required.')],
        });
    }

    var ageMs = Math.max(0, nowMs - startedMs);
    var matchingDomainMutation = findMatchingDomainMutation(source.existingFinancialRows, resultRef);
    var possibleDomainMutations = findPossibleV54DomainMutations_(source.existingFinancialRows);
    var isStale = ageMs > staleAfterMs;

    if (matchingDomainMutation) {
        return makeV54RecoveryBaseResult_({
            ok: true,
            decision: 'completion_recovery_planned',
            recovery: {
                required: true,
                automatic: false,
                ageMs: ageMs,
                staleAfterMs: staleAfterMs,
                matchedResultRef: resultRef,
                matchedSheet: matchingDomainMutation.sheet || '',
            },
            plans: [
                makeV54RecoveryUpdatePlan_(processingRow, {
                    status: V54_IDEMPOTENCY_STATUSES_RUNTIME.COMPLETED,
                    result_ref: resultRef,
                    updated_at: nowIso,
                    error_code: '',
                    observacao: 'completion recovery planned from matching domain mutation',
                }),
            ],
            warnings: [],
            errors: [],
        });
    }

    if (!isStale && possibleDomainMutations.length === 0) {
        return makeV54RecoveryBaseResult_({
            decision: 'duplicate_processing',
            retryable: true,
            recovery: {
                required: false,
                automatic: false,
                ageMs: ageMs,
                staleAfterMs: staleAfterMs,
            },
            errors: [makeV54IdempotencyError_('IDEMPOTENCY_PROCESSING_RETRY', 'idempotency_key', 'Idempotency key is still fresh processing; retry later.')],
        });
    }

    if (isStale && possibleDomainMutations.length === 0) {
        return makeV54RecoveryBaseResult_({
            ok: true,
            decision: 'stale_processing_retry_allowed',
            recovery: {
                required: true,
                automatic: false,
                ageMs: ageMs,
                staleAfterMs: staleAfterMs,
                nextStep: 'review_and_apply_failed_transition_before_retry',
            },
            plans: [
                makeV54RecoveryUpdatePlan_(processingRow, {
                    status: V54_IDEMPOTENCY_STATUSES_RUNTIME.FAILED,
                    result_ref: '',
                    updated_at: nowIso,
                    error_code: V54_STALE_PROCESSING_ERROR_CODES_RUNTIME.NO_DOMAIN_MUTATION,
                    observacao: 'stale processing recovery planned; no matching domain mutation found',
                }),
            ],
            warnings: [
                makeV54IdempotencyError_('STALE_PROCESSING_RETRY_REQUIRES_REVIEW', 'Idempotency_Log', 'Apply the failed transition explicitly before any reviewed retry.'),
            ],
            errors: [],
        });
    }

    return makeV54RecoveryBaseResult_({
        decision: 'stale_processing_review_required',
        recovery: {
            required: true,
            automatic: false,
            ageMs: ageMs,
            staleAfterMs: staleAfterMs,
            possibleDomainMutationCount: possibleDomainMutations.length,
        },
        errors: [
            makeV54IdempotencyError_(
                V54_STALE_PROCESSING_ERROR_CODES_RUNTIME.DOMAIN_MUTATION_REVIEW_REQUIRED,
                'result_ref',
                'Processing row has possible or mismatched domain mutation state; manual review required.'
            ),
        ],
    });
}
