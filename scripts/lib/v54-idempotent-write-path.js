'use strict';

const { V54_SHEETS } = require('./v54-schema');
const {
    IDEMPOTENCY_HEADERS,
    IDEMPOTENCY_STATUSES,
    planIdempotencyForUpdate,
} = require('./v54-idempotency-contract');
const { mapParsedEntryToLancamentoV54 } = require('./v54-lancamentos-mapper');

const FAILURE_WINDOWS = {
    PROCESSING_LOG_WITHOUT_FINANCIAL_ROW: 'PROCESSING_LOG_WITHOUT_FINANCIAL_ROW',
    FINANCIAL_ROW_WITHOUT_COMPLETED_LOG: 'FINANCIAL_ROW_WITHOUT_COMPLETED_LOG',
    FAILED_OR_STALE_PROCESSING_REQUIRES_POLICY: 'FAILED_OR_STALE_PROCESSING_REQUIRES_POLICY',
};

function makeError(code, field, message) {
    return { code, field, message };
}

function normalizeText(value) {
    return String(value === undefined || value === null ? '' : value).trim();
}

function rowToObject(row, headers) {
    if (!Array.isArray(row)) return row && typeof row === 'object' ? row : {};
    return headers.reduce((acc, header, index) => {
        acc[header] = row[index] === undefined || row[index] === null ? '' : row[index];
        return acc;
    }, {});
}

function makeTelegramIdempotencyInput(input) {
    const source = input && typeof input === 'object' ? input : {};
    const update = source.telegramUpdate || source.payload || {};
    const message = update.message || update.edited_message || update.channel_post || {};
    const chat = message.chat || {};

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

function defaultFinancialPlanner(parsedEntry, options) {
    const mapped = mapParsedEntryToLancamentoV54(parsedEntry, options && options.mapperOptions);
    if (!mapped.ok) {
        return {
            ok: false,
            errors: mapped.errors,
            plan: null,
            result_ref: '',
            mapped,
        };
    }

    return {
        ok: true,
        errors: [],
        result_ref: mapped.rowObject.id_lancamento,
        plan: {
            action: 'INSERT_FINANCIAL_ENTRY',
            sheet: V54_SHEETS.LANCAMENTOS_V54,
            headers: mapped.headers,
            rowObject: mapped.rowObject,
            rowValues: mapped.rowValues,
        },
        mapped,
    };
}

function findFinancialByResultRef(existingFinancialRows, resultRef) {
    const wanted = normalizeText(resultRef);
    if (!wanted) return null;
    return (existingFinancialRows || [])
        .map((row) => rowToObject(row, []))
        .find((row) => normalizeText(row.id_lancamento) === wanted || normalizeText(row.result_ref) === wanted) || null;
}

function makeCompletionPlan(processingRowObject, resultRef, now) {
    const rowObject = Object.assign({}, processingRowObject, {
        status: IDEMPOTENCY_STATUSES.COMPLETED,
        result_ref: resultRef,
        updated_at: now,
        error_code: '',
    });

    return {
        action: 'MARK_IDEMPOTENCY_COMPLETED',
        sheet: V54_SHEETS.IDEMPOTENCY_LOG,
        key: rowObject.idempotency_key,
        result_ref: resultRef,
        headers: [...IDEMPOTENCY_HEADERS],
        rowObject,
        rowValues: IDEMPOTENCY_HEADERS.map((header) => rowObject[header] === undefined || rowObject[header] === null ? '' : rowObject[header]),
    };
}

function makeBaseResult(fields) {
    return Object.assign({
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
    }, fields || {});
}

function planV54IdempotentWrite(input, options) {
    const source = input || {};
    const opts = options || {};
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const financialPlanner = typeof opts.financialPlanner === 'function' ? opts.financialPlanner : defaultFinancialPlanner;
    const idempotencySource = Object.assign({}, source.idempotencyInput || {});
    if (!source.idempotencyInput) idempotencySource.telegramUpdate = source.telegramUpdate;
    idempotencySource.semantic_entry = source.semanticEntry || source.parsedEntry;
    const idempotencyInput = makeTelegramIdempotencyInput(idempotencySource);

    const financial = financialPlanner(source.parsedEntry, {
        mapperOptions: {
            now,
            makeId: opts.makeId,
        },
    });

    if (!financial || financial.ok !== true) {
        return makeBaseResult({
            decision: 'financial_plan_rejected',
            financial: financial || null,
            errors: financial && Array.isArray(financial.errors)
                ? financial.errors
                : [makeError('FINANCIAL_PLAN_INVALID', 'financial', 'Financial planner returned an invalid result.')],
        });
    }

    const idempotency = planIdempotencyForUpdate(
        idempotencyInput,
        source.existingIdempotencyRows || [],
        { now }
    );

    if (idempotency.ok !== true) {
        const existingFinancial = findFinancialByResultRef(source.existingFinancialRows, idempotency.result_ref || financial.result_ref);
        const failureWindows = [];
        const errors = [...(idempotency.errors || [])];
        let decision = idempotency.decision;
        let retryable = idempotency.retryable === true;

        if (idempotency.decision === 'duplicate_processing' && existingFinancial) {
            decision = 'processing_with_financial_present_completion_missing';
            retryable = false;
            failureWindows.push({
                code: FAILURE_WINDOWS.FINANCIAL_ROW_WITHOUT_COMPLETED_LOG,
                message: 'Financial row exists while idempotency log is still processing. Do not insert again; completion recovery policy is TODO.',
                todo: 'Define reviewed recovery path to mark Idempotency_Log completed from existing result_ref.',
            });
            errors.push(makeError('IDEMPOTENCY_COMPLETION_RECOVERY_TODO', 'Idempotency_Log', 'Completion recovery policy is not implemented yet.'));
        } else if (idempotency.decision === 'duplicate_processing') {
            failureWindows.push({
                code: FAILURE_WINDOWS.PROCESSING_LOG_WITHOUT_FINANCIAL_ROW,
                message: 'Idempotency log is processing and no matching financial row was found. Retry later or handle with future stale-processing policy.',
                todo: 'Define stale processing timeout and explicit retry/failed transition policy.',
            });
        } else if (idempotency.decision === 'duplicate_failed') {
            failureWindows.push({
                code: FAILURE_WINDOWS.FAILED_OR_STALE_PROCESSING_REQUIRES_POLICY,
                message: 'Failed idempotency state requires an explicit reviewed retry policy.',
                todo: 'Define failed retry semantics before enabling production routing.',
            });
        }

        return makeBaseResult({
            ok: false,
            decision,
            retryable,
            shouldCreateFinancialEntry: false,
            idempotency,
            financial,
            warnings: idempotency.warnings || [],
            failureWindows,
            errors,
        });
    }

    const completionPlan = makeCompletionPlan(
        idempotency.plan.rowObject,
        financial.result_ref,
        now()
    );

    return makeBaseResult({
        ok: true,
        decision: 'planned_idempotent_write',
        retryable: false,
        shouldCreateFinancialEntry: true,
        idempotency,
        financial,
        plans: [
            idempotency.plan,
            financial.plan,
            completionPlan,
        ],
        warnings: idempotency.warnings || [],
        failureWindows: [
            {
                code: FAILURE_WINDOWS.PROCESSING_LOG_WITHOUT_FINANCIAL_ROW,
                message: 'If execution stops after the processing log insert, retry sees processing and must not insert another financial row.',
            },
            {
                code: FAILURE_WINDOWS.FINANCIAL_ROW_WITHOUT_COMPLETED_LOG,
                message: 'If execution stops after the financial insert before completion update, retry must not insert another financial row; recovery policy remains TODO.',
                todo: 'Define reviewed completion recovery before production routing.',
            },
        ],
        errors: [],
    });
}

function createInMemoryV54WriteStore(seed) {
    const source = seed || {};
    const state = {
        idempotencyRows: (source.idempotencyRows || []).map((row) => Object.assign({}, row)),
        financialRows: (source.financialRows || []).map((row) => Object.assign({}, row)),
    };

    return {
        state,
        existingIdempotencyRows() {
            return state.idempotencyRows.map((row) => Object.assign({}, row));
        },
        existingFinancialRows() {
            return state.financialRows.map((row) => Object.assign({}, row));
        },
        applyPlan(plan, options) {
            const opts = options || {};
            const applied = [];
            for (let i = 0; i < plan.plans.length; i++) {
                const step = plan.plans[i];
                if (opts.stopBeforeAction === step.action) break;
                if (step.action === 'INSERT_IDEMPOTENCY_LOG') {
                    state.idempotencyRows.push(Object.assign({}, step.rowObject));
                    applied.push(step.action);
                }
                if (step.action === 'INSERT_FINANCIAL_ENTRY') {
                    state.financialRows.push(Object.assign({}, step.rowObject));
                    applied.push(step.action);
                }
                if (step.action === 'MARK_IDEMPOTENCY_COMPLETED') {
                    const row = state.idempotencyRows.find((candidate) => candidate.idempotency_key === step.key);
                    if (row) Object.assign(row, step.rowObject);
                    applied.push(step.action);
                }
                if (opts.stopAfterAction === step.action) break;
            }
            return { ok: true, applied, state };
        },
    };
}

module.exports = {
    FAILURE_WINDOWS,
    createInMemoryV54WriteStore,
    defaultFinancialPlanner,
    makeTelegramIdempotencyInput,
    planV54IdempotentWrite,
};
