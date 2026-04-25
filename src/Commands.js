// ============================================================
// COMMANDS — switch principal de comandos do Telegram (handleCommand)
// e mensagem de ajuda (helpText). As funções de View/Action vivem em
// Views.js e Actions.js (escopo global compartilhado pelo Apps Script).
// ============================================================

// ============================================================
// COMANDOS
// ============================================================
function handleCommand(text, chatId, user) {
    const cmd = text.split(/\s+/)[0].toLowerCase();
    const arg = text.substring(cmd.length).trim();

    switch (cmd) {
        case '/start':
        case '/help':
            return sendTelegram(chatId, helpText());
        case '/resumo':
            return sendTelegram(chatId, getResumoMes());
        case '/saldo':
            return sendTelegram(chatId, arg ? getSaldoCategoria(arg) : getSaldoTop5());
        case '/hoje':
            return sendTelegram(chatId, getLancamentosHoje());
        case '/desfazer':
            return desfazerUltimo(chatId, user);
        case '/transferir':
            return sendTelegram(chatId, getAcertoMes());
        case '/invest':
        case '/investimentos':
            return sendTelegram(chatId, getInvestSaldo());
        case '/manter':
            return handleManter(chatId, user);
        case '/parcela':
            return handleParcela(arg, chatId, user);
        case '/parcelas':
            return sendTelegram(chatId, getParcelasAtivas());
        case '/fatura':
            return sendTelegram(chatId, getFatura(arg));
        default:
            return sendTelegram(chatId, `Comando "${cmd}" não reconhecido. Mande /help pra ver os comandos.`);
    }
}

function helpText() {
    return `🤖 *Bot Financeiro*

*Lançar gasto:* mande no formato livre
• "52 ifood luana nubank"
• "gastei 35 no café"
• "1910 financiamento caixa"

*Investimentos:*
• "aportei 500 no cdb"
• "resgatei 300 do cdb"
• "cdb rendeu 45,80"

*Parcelas:*
/parcela 360 3 nubank calçado — cadastra 3x de R$ 120

*Comandos:*
/resumo — visão geral do mês
/saldo — top 5 categorias
/saldo calçado — categoria específica (provisão: mostra envelope acumulado)
/hoje — lançamentos de hoje
/invest — saldo do CDB
/fatura — faturas dos cartões
/parcelas — parcelas ativas
/manter — registrar acerto mensal (Luana)
/transferir — quanto Luana transfere
/desfazer — apaga o último lançamento
/help — esta ajuda`;
}
