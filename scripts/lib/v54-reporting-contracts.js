function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function cloneList(items) {
    return (items || []).map((item) => ({ ...item }));
}

const OPERATIONAL_DRE_EVENT_TYPES = new Set(['receita', 'despesa']);

function isActive(record) {
    if (!record) return false;
    if (record.ativo === false) return false;
    if (!record.status) return true;
    return ['ativa', 'ativo', 'aberta', 'aberto'].includes(String(record.status).toLowerCase());
}

function summarizeOperationalDreFromLancamentos(lancamentos) {
    return cloneList(lancamentos).reduce((summary, entry) => {
        if (entry.afeta_dre !== true) return summary;

        const tipoEvento = String(entry.tipo_evento || '').toLowerCase();
        if (!OPERATIONAL_DRE_EVENT_TYPES.has(tipoEvento)) return summary;

        const value = roundMoney(entry.valor);
        if (tipoEvento === 'receita') summary.receitas_operacionais = roundMoney(summary.receitas_operacionais + value);
        if (tipoEvento === 'despesa') summary.despesas_operacionais = roundMoney(summary.despesas_operacionais + value);
        summary.included_ids.push(entry.id_lancamento || '');
        summary.saldo_operacional = roundMoney(summary.receitas_operacionais - summary.despesas_operacionais);
        return summary;
    }, {
        receitas_operacionais: 0,
        despesas_operacionais: 0,
        saldo_operacional: 0,
        included_ids: [],
    });
}

function summarizeReserveAssets(assets) {
    return cloneList(assets).reduce((summary, asset) => {
        if (!isActive(asset)) {
            summary.inactive_assets.push(asset.id_ativo || asset.nome || '');
            return summary;
        }

        const value = roundMoney(asset.saldo_atual);
        const destinacao = String(asset.destinacao || '').toLowerCase();
        if (asset.conta_reserva_emergencia === true) {
            summary.reserva_total = roundMoney(summary.reserva_total + value);
            summary.reserve_assets.push(asset.id_ativo || asset.nome || '');
        } else if (destinacao === 'casa' || destinacao === 'home') {
            summary.home_earmarked_total = roundMoney(summary.home_earmarked_total + value);
            summary.home_earmarked_assets.push(asset.id_ativo || asset.nome || '');
        } else {
            summary.other_assets_total = roundMoney(summary.other_assets_total + value);
        }
        return summary;
    }, {
        reserva_total: 0,
        home_earmarked_total: 0,
        other_assets_total: 0,
        reserve_assets: [],
        home_earmarked_assets: [],
        inactive_assets: [],
    });
}

function draftNetWorth({ assets = [], debts = [] } = {}) {
    const ativos_total = cloneList(assets).reduce((sum, asset) => {
        if (!isActive(asset)) return sum;
        return roundMoney(sum + Number(asset.saldo_atual || 0));
    }, 0);

    const dividas_total = cloneList(debts).reduce((sum, debt) => {
        if (!isActive(debt)) return sum;
        return roundMoney(sum + Number(debt.saldo_devedor || 0));
    }, 0);

    return {
        ativos_total,
        dividas_total,
        patrimonio_liquido: roundMoney(ativos_total - dividas_total),
    };
}

function summarizeDebts(debts) {
    const activeDebts = cloneList(debts).filter(isActive);
    return {
        dividas_total: roundMoney(activeDebts.reduce((sum, debt) => sum + Number(debt.saldo_devedor || 0), 0)),
        debts: activeDebts.map((debt) => ({
            id_divida: debt.id_divida || '',
            nome: debt.nome || '',
            credor: debt.credor || '',
            saldo_devedor: roundMoney(debt.saldo_devedor),
            valor_parcela: roundMoney(debt.valor_parcela),
            principal_interest_split_known: Boolean(debt.principal_interest_split_known),
            limitation: debt.principal_interest_split_known ? '' : 'principal_interest_split_unknown',
        })),
    };
}

function draftCoupleSettlement({ lancamentos = [], incomes = {} } = {}) {
    const entries = cloneList(lancamentos).filter((entry) => (
        entry.afeta_acerto === true &&
        entry.escopo === 'Casal' &&
        String(entry.tipo_evento || '').toLowerCase() !== 'receita' &&
        (entry.pessoa === 'Gustavo' || entry.pessoa === 'Luana')
    ));
    const people = ['Gustavo', 'Luana'];
    const totalIncome = people.reduce((sum, person) => sum + Number(incomes[person] || 0), 0);
    const totalCasal = roundMoney(entries.reduce((sum, entry) => sum + Number(entry.valor || 0), 0));
    const byPerson = {};

    people.forEach((person) => {
        const share = totalIncome > 0 ? Number(incomes[person] || 0) / totalIncome : 0.5;
        const paid = roundMoney(entries
            .filter((entry) => entry.pessoa === person)
            .reduce((sum, entry) => sum + Number(entry.valor || 0), 0));
        const quota = roundMoney(totalCasal * share);
        byPerson[person] = {
            quota_esperada: quota,
            valor_pago_casal: paid,
            diferenca: roundMoney(paid - quota),
        };
    });

    const tolerance = 0.01;
    const status = people.every((person) => Math.abs(byPerson[person].diferenca) <= tolerance)
        ? 'balanced'
        : 'pending_transfer';

    return {
        total_casal: totalCasal,
        status,
        people: byPerson,
        included_ids: entries.map((entry) => entry.id_lancamento || ''),
    };
}

function filterSharedDetailedEntries(lancamentos) {
    return cloneList(lancamentos)
        .filter((entry) => entry.visibilidade !== 'privada')
        .map((entry) => {
            if (entry.visibilidade !== 'resumo') return entry;
            return {
                ...entry,
                descricao: '',
                id_fonte: '',
                id_cartao: '',
                summarized: true,
            };
        });
}

function buildMonthlyClosingDraft({
    competencia,
    lancamentos = [],
    assets = [],
    debts = [],
    incomes = {},
    now = () => '',
} = {}) {
    const dre = summarizeOperationalDreFromLancamentos(lancamentos);
    const reserve = summarizeReserveAssets(assets);
    const netWorth = draftNetWorth({ assets, debts });
    const acerto = draftCoupleSettlement({ lancamentos, incomes });

    return {
        competencia,
        status: 'draft',
        receitas_operacionais: dre.receitas_operacionais,
        despesas_operacionais: dre.despesas_operacionais,
        saldo_operacional: dre.saldo_operacional,
        faturas_60d: 0,
        parcelas_futuras: 0,
        taxa_poupanca: 0,
        reserva_total: reserve.reserva_total,
        patrimonio_liquido: netWorth.patrimonio_liquido,
        acerto_status: acerto.status,
        decisao_1: 'PLACEHOLDER_RULE_BASED_DECISION_1',
        decisao_2: 'PLACEHOLDER_RULE_BASED_DECISION_2',
        decisao_3: 'PLACEHOLDER_RULE_BASED_DECISION_3',
        created_at: now(),
        closed_at: '',
    };
}

module.exports = {
    buildMonthlyClosingDraft,
    draftCoupleSettlement,
    draftNetWorth,
    filterSharedDetailedEntries,
    summarizeDebts,
    summarizeOperationalDreFromLancamentos,
    summarizeReserveAssets,
};
