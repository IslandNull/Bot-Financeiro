'use strict';

const { V54_SHEETS } = require('./v54-schema');
const {
    IDEMPOTENCY_HEADERS,
    IDEMPOTENCY_STATUSES,
} = require('./v54-idempotency-contract');

const STALE_PROCESSING_ERROR_CODES = {
    NO_DOMAIN_MUTATION: 'STALE_PROCESSING_NO_DOMAIN_MUTATION',
    DOMAIN_MUTATION_REVIEW_REQUIRED: 'STALE_PROCESSING_DOMAIN_MUTATION_REVIEW_REQUIRED',
};

function makeError(code, field, message) {
    return { code, field, message };
}

function normalizeText(value) {
    return String(value === undefined || value === null ? '' : value).trim();
}

function parseTimeMs(value) {
    const text = normalizeText(value);
    if (!text) return null;
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? ms : null;
}

function rowToObject(row) {
    if (!Array.isArray(row)) return row && typeof row === 'object' ? row : {};
    return IDEMPOTENCY_HEADERS.reduce((acc, header, index) => {
        acc[header] = row[index] === undefined || row[index] === null ? '' : row[index];
        return acc;
    }, {});
}

function objectToValues(rowObject) {
    return IDEMPOTENCY_HEADERS.map((header) => rowObject[header] === undefined || rowObject[header] === null ? '' : rowObject[header]);
}

function normalizeFinancialRows(rows) {
    return (rows || []).map((row) => row && typeof row === 'object' ? row : {});
}

function refMatches(row, resultRef) {
    const wanted = normalizeText(resultRef);
    if (!wanted) return false;
    return [
        row.result_ref,
        row.id_lancamento,
        row.id_compra,
        row.id_parcela,
    ].some((value) => normalizeText(value) === wanted);
}

function findMatchingDomainMutation(existingFinancialRows, resultRef) {
    return normalizeFinancialRows(existingFinancialRows).find((row) => refMatches(row, resultRef)) || null;
}

function findPossibleDomainMutations(existingFinancialRows) {
    return normalizeFinancialRows(existingFinancialRows).filter((row) => {
        return normalizeText(row.result_ref)
            || normalizeText(row.id_lancamento)
            || normalizeText(row.id_compra)
            || normalizeText(row.id_parcela);
    });
}

function makeUpdatePlan(processingRowObject, updates) {
    const rowObject = Object.assign({}, processingRowObject, updates);
    return {
        action: updates.status === IDEMPOTENCY_STATUSES.COMPLETED
            ? 'MARK_IDEMPOTENCY_COMPLETED'
            : 'MARK_IDEMPOTENCY_FAILED',
        sheet: V54_SHEETS.IDEMPOTENCY_LOG,
        key: rowObject.idempotency_key,
        result_ref: rowObject.result_ref || '',
        headers: [...IDEMPOTENCY_HEADERS],
        rowObject,
        rowValues: objectToValues(rowObject),
    };
}

function makeBaseResult(fields) {
    return Object.assign({
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
    }, fields || {});
}

function planStaleProcessingRecovery(input, options) {
    const source = input || {};
    const opts = options || {};
    const nowIso = typeof opts.now === 'function' ? opts.now() : new Date().toISOString();
    const staleAfterMs = Number(opts.staleAfterMs);
    const processingRow = rowToObject(source.processingRow || source.existing);
    const status = normalizeText(processingRow.status);
    const resultRef = normalizeText(processingRow.result_ref || source.result_ref);

    if (status !== IDEMPOTENCY_STATUSES.PROCESSING) {
        return makeBaseResult({
            decision: 'recovery_policy_not_applicable',
            recovery: { required: false, automatic: false },
            errors: [makeError('RECOVERY_POLICY_NOT_PROCESSING', 'status', 'Recovery policy only applies to processing rows.')],
        });
    }

    if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
        return makeBaseResult({
            decision: 'recovery_policy_invalid_threshold',
            errors: [makeError('STALE_AFTER_MS_REQUIRED', 'staleAfterMs', 'staleAfterMs must be a non-negative number.')],
        });
    }

    const nowMs = parseTimeMs(nowIso);
    const startedMs = parseTimeMs(processingRow.updated_at) || parseTimeMs(processingRow.created_at);
    if (nowMs === null || startedMs === null) {
        return makeBaseResult({
            decision: 'processing_timestamp_review_required',
            errors: [makeError('PROCESSING_TIMESTAMP_INVALID', 'updated_at', 'Cannot determine processing age; manual review required.')],
        });
    }

    const ageMs = Math.max(0, nowMs - startedMs);
    const matchingDomainMutation = findMatchingDomainMutation(source.existingFinancialRows, resultRef);
    const possibleDomainMutations = findPossibleDomainMutations(source.existingFinancialRows);
    const isStale = ageMs > staleAfterMs;

    if (matchingDomainMutation) {
        return makeBaseResult({
            ok: true,
            decision: 'completion_recovery_planned',
            recovery: {
                required: true,
                automatic: false,
                ageMs,
                staleAfterMs,
                matchedResultRef: resultRef,
                matchedSheet: matchingDomainMutation.sheet || '',
            },
            plans: [
                makeUpdatePlan(processingRow, {
                    status: IDEMPOTENCY_STATUSES.COMPLETED,
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
        return makeBaseResult({
            decision: 'duplicate_processing',
            retryable: true,
            recovery: {
                required: false,
                automatic: false,
                ageMs,
                staleAfterMs,
            },
            errors: [makeError('IDEMPOTENCY_PROCESSING_RETRY', 'idempotency_key', 'Idempotency key is still fresh processing; retry later.')],
        });
    }

    if (isStale && possibleDomainMutations.length === 0) {
        return makeBaseResult({
            ok: true,
            decision: 'stale_processing_retry_allowed',
            recovery: {
                required: true,
                automatic: false,
                ageMs,
                staleAfterMs,
                nextStep: 'review_and_apply_failed_transition_before_retry',
            },
            plans: [
                makeUpdatePlan(processingRow, {
                    status: IDEMPOTENCY_STATUSES.FAILED,
                    result_ref: '',
                    updated_at: nowIso,
                    error_code: STALE_PROCESSING_ERROR_CODES.NO_DOMAIN_MUTATION,
                    observacao: 'stale processing recovery planned; no matching domain mutation found',
                }),
            ],
            warnings: [
                makeError('STALE_PROCESSING_RETRY_REQUIRES_REVIEW', 'Idempotency_Log', 'Apply the failed transition explicitly before any reviewed retry.'),
            ],
            errors: [],
        });
    }

    return makeBaseResult({
        decision: 'stale_processing_review_required',
        recovery: {
            required: true,
            automatic: false,
            ageMs,
            staleAfterMs,
            possibleDomainMutationCount: possibleDomainMutations.length,
        },
        errors: [
            makeError(
                STALE_PROCESSING_ERROR_CODES.DOMAIN_MUTATION_REVIEW_REQUIRED,
                'result_ref',
                'Processing row has possible or mismatched domain mutation state; manual review required.'
            ),
        ],
    });
}

module.exports = {
    STALE_PROCESSING_ERROR_CODES,
    findMatchingDomainMutation,
    planStaleProcessingRecovery,
};
