'use strict';

const { V54_SHEETS } = require('./v54-schema');
const {
    IDEMPOTENCY_HEADERS,
    IDEMPOTENCY_STATUSES,
} = require('./v54-idempotency-contract');

const RECOVERY_EXECUTOR_ALLOWED_ACTIONS = [
    'MARK_IDEMPOTENCY_FAILED',
    'MARK_IDEMPOTENCY_COMPLETED',
];

function makeError(code, field, message) {
    return { code, field, message };
}

function normalizeText(value) {
    return String(value === undefined || value === null ? '' : value).trim();
}

function normalizePlans(input) {
    if (Array.isArray(input)) return input;
    if (input && Array.isArray(input.plans)) return input.plans;
    return [];
}

function rowToObject(row) {
    if (!Array.isArray(row)) return row && typeof row === 'object' ? row : {};
    return IDEMPOTENCY_HEADERS.reduce((acc, header, index) => {
        acc[header] = row[index] === undefined || row[index] === null ? '' : row[index];
        return acc;
    }, {});
}

function validateReviewedChecklist(plan, checklist) {
    const source = checklist || {};
    if (source.reviewed !== true) {
        return makeError('RECOVERY_REVIEW_REQUIRED', 'reviewed', 'Recovery plan must be explicitly reviewed before application.');
    }
    if (source.domainMutationWillNotBeApplied !== true) {
        return makeError('RECOVERY_DOMAIN_MUTATION_FORBIDDEN', 'domainMutationWillNotBeApplied', 'Recovery executor must not apply domain mutations.');
    }
    if (plan.action === 'MARK_IDEMPOTENCY_COMPLETED' && source.matchedResultRefVerified !== true) {
        return makeError('RECOVERY_MATCHED_RESULT_REF_REQUIRED', 'matchedResultRefVerified', 'Completion recovery requires verified matching result_ref/domain reference.');
    }
    if (plan.action === 'MARK_IDEMPOTENCY_FAILED' && source.noDomainMutationVerified !== true) {
        return makeError('RECOVERY_NO_DOMAIN_MUTATION_REQUIRED', 'noDomainMutationVerified', 'Failed recovery requires verified absence of matching domain mutation.');
    }
    return null;
}

function validateRecoveryPlan(plan, checklist) {
    if (!plan || typeof plan !== 'object') {
        return [makeError('RECOVERY_PLAN_INVALID', 'plan', 'Recovery plan must be an object.')];
    }
    const errors = [];
    if (RECOVERY_EXECUTOR_ALLOWED_ACTIONS.indexOf(plan.action) === -1) {
        errors.push(makeError('RECOVERY_PLAN_ACTION_FORBIDDEN', 'action', 'Recovery executor can only apply idempotency status updates.'));
    }
    if (plan.sheet !== V54_SHEETS.IDEMPOTENCY_LOG) {
        errors.push(makeError('RECOVERY_PLAN_SHEET_FORBIDDEN', 'sheet', 'Recovery executor can only update Idempotency_Log.'));
    }
    if (!normalizeText(plan.key)) {
        errors.push(makeError('RECOVERY_PLAN_KEY_REQUIRED', 'key', 'Recovery plan requires an idempotency key.'));
    }
    if (!plan.rowObject || typeof plan.rowObject !== 'object') {
        errors.push(makeError('RECOVERY_PLAN_ROW_REQUIRED', 'rowObject', 'Recovery plan requires rowObject.'));
    }
    const targetStatus = normalizeText(plan.rowObject && plan.rowObject.status);
    if (plan.action === 'MARK_IDEMPOTENCY_COMPLETED' && targetStatus !== IDEMPOTENCY_STATUSES.COMPLETED) {
        errors.push(makeError('RECOVERY_COMPLETED_STATUS_REQUIRED', 'status', 'Completion recovery must set status=completed.'));
    }
    if (plan.action === 'MARK_IDEMPOTENCY_FAILED' && targetStatus !== IDEMPOTENCY_STATUSES.FAILED) {
        errors.push(makeError('RECOVERY_FAILED_STATUS_REQUIRED', 'status', 'Failed recovery must set status=failed.'));
    }
    const checklistError = validateReviewedChecklist(plan, checklist);
    if (checklistError) errors.push(checklistError);
    return errors;
}

function applyReviewedIdempotencyRecovery(input, options) {
    const source = input || {};
    const opts = options || {};
    const plans = normalizePlans(source);
    const idempotencyRows = (source.idempotencyRows || []).map(rowToObject);
    const errors = [];

    if (plans.length === 0) {
        return {
            ok: false,
            applied: [],
            idempotencyRows,
            errors: [makeError('RECOVERY_PLANS_REQUIRED', 'plans', 'At least one recovery plan is required.')],
        };
    }

    plans.forEach((plan) => {
        errors.push(...validateRecoveryPlan(plan, opts.checklist || source.checklist));
    });
    if (errors.length > 0) {
        return { ok: false, applied: [], idempotencyRows, errors };
    }

    const applied = [];
    plans.forEach((plan) => {
        const key = normalizeText(plan.key);
        const index = idempotencyRows.findIndex((row) => normalizeText(row.idempotency_key) === key);
        if (index === -1) {
            errors.push(makeError('RECOVERY_ROW_NOT_FOUND', 'idempotency_key', 'Idempotency row was not found for recovery update.'));
            return;
        }
        idempotencyRows[index] = Object.assign({}, plan.rowObject);
        applied.push({
            action: plan.action,
            key,
            status: idempotencyRows[index].status,
            result_ref: idempotencyRows[index].result_ref || '',
        });
    });

    return {
        ok: errors.length === 0,
        applied,
        idempotencyRows,
        errors,
    };
}

module.exports = {
    RECOVERY_EXECUTOR_ALLOWED_ACTIONS,
    applyReviewedIdempotencyRecovery,
    validateRecoveryPlan,
};
