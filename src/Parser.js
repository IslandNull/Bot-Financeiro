// LEGACY V53 PROTOTYPE.
// Do not add new features here.
// V54 MVP work must happen in ActionsV54 / future ParserV54 / ViewsV54.
// ============================================================
// PARSER — interface com OpenAI (parseWithOpenAI, buildSystemPrompt),
// validação pós-parse (validateParse) e leitura cacheada das listas
// (getListsCached). Depende do CONFIG global declarado em Main.js.
// ============================================================

// ============================================================
// PARSE — chama OpenAI com structured output
// ============================================================
function parseWithOpenAI(text, pagadorDefault) {
    const { categorias, fontes, pagadores, catMap } = getListsCached();

    const systemPrompt = buildSystemPrompt(categorias, fontes, pagadores, pagadorDefault);

    const body = {
        model: CONFIG.MODEL,
        reasoning_effort: 'low',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
        ],
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'lancamento',
                strict: true,
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        tipo: { type: 'string', enum: ['Despesa', 'Receita', 'Transferência'] },
                        valor: { type: 'number' },
                        categoria: { type: 'string' },
                        pagador: { type: 'string', enum: pagadores },
                        fonte: { type: 'string' },
                        descricao: { type: 'string' },
                        error: { type: ['string', 'null'] }
                    },
                    required: ['tipo', 'valor', 'categoria', 'pagador', 'fonte', 'descricao', 'error']
                }
            }
        }
    };

    const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + CONFIG.OPENAI_API_KEY },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const respText = response.getContentText();

    if (code !== 200) {
        throw new Error('OpenAI ' + code + ': ' + respText.substring(0, 200));
    }

    const data = JSON.parse(respText);
    const content = JSON.parse(data.choices[0].message.content);
    
    // Adiciona o ID_CATEGORIA no resultado preservando o nome original em categoria
    if (content.categoria && catMap[content.categoria]) {
        content.id_categoria = catMap[content.categoria];
    } else {
        content.id_categoria = content.categoria; // fallback
    }
    
    return content;
}

function buildSystemPrompt(categorias, fontes, pagadores, pagadorDefault) {
    return `<identidade>
Você é o parser de mensagens financeiras do bot doméstico do casal Gustavo e Luana.
Sua única função é transformar mensagens em português brasileiro informal
em registros estruturados de gastos, receitas ou transferências entre contas.
</identidade>

<regras_globais>
1. TIPO: assuma "Despesa" por padrão. Marque "Receita" SOMENTE quando a mensagem
   descrever recebimento (salário, bônus, reembolso, PIX recebido, estorno).
   Marque "Transferência" para movimentação entre contas/investimentos (regra 8).

2. VALOR: extraia o número exatamente como informado, PRESERVANDO casas decimais.
   "R$ 52,75" → 52.75 (não arredonde para 53).
   Aceite formatos: "52", "52,50", "R$ 52", "52 reais", "52.50".
   Sempre positivo.

3. CATEGORIA: escolha SEMPRE uma das opções em <mapeamento_categorias>.
   Se nenhuma encaixar com segurança, use "Outros" E preencha "descricao"
   com o termo original da mensagem E preencha "error" com:
   "Não encontrei categoria exata. Confirma 'Outros' ou manda a categoria?"

4. PAGADOR: use o valor passado em <contexto_pagador_default> por padrão
   (é quem mandou a mensagem no Telegram).
   Altere SOMENTE quando a mensagem citar explicitamente a outra pessoa
   ("luana pagou", "foi o gustavo", "ela comprou").
   Valores aceitos: ${pagadores.join(' ou ')}.

5. FONTE: escolha SEMPRE uma das opções em <mapeamento_fontes>.
   Se a mensagem não dá pista da fonte, use "Outro" (é uma opção válida).
   Para Transferência: FONTE = conta/investimento de ORIGEM do dinheiro.

6. DESCRICAO: texto livre curto, opcional. Preencha quando houver
   informação adicional útil (nome do estabelecimento, motivo).
   Caso contrário, retorne string vazia "".

7. ERROR: retorne null quando o parse foi bem-sucedido.
   Preencha com uma pergunta curta ao usuário APENAS nestes casos:
   (a) categoria sem encaixe (ver regra 3),
   (b) valor ausente ou ambíguo na mensagem,
   (c) tipo (Despesa/Receita/Transferência) realmente ambíguo.
   Nesses casos, ainda retorne um JSON válido: use valor=0 e
   categoria="Outros" como placeholders.

8. TRANSFERÊNCIA: use tipo="Transferência" quando a mensagem descrever
   movimentação entre contas ou para/de investimentos.
   Heurísticas: "aportei", "resgatei", "separei", "mandei pro cdb", "tirei do cdb".
   FONTE = origem (ex: "Conta Gustavo" para aporte; "CDB 115% CDI" para resgate).
   CATEGORIA = destino (ex: "CDB 115% CDI" para aporte; "Conta Gustavo" para resgate).
   ATENÇÃO: fonte NUNCA pode ser igual à categoria (auto-transferência é inválida).

9. RENDIMENTOS: use tipo="Receita" e categoria="Rendimento CDB" quando
   a mensagem descrever rendimento de investimento.
   Heurísticas: "rendeu", "rende do cdb", "rendimento do cdb".
   FONTE = "CDB 115% CDI".
</regras_globais>

<contexto_pagador_default>
${pagadorDefault}
</contexto_pagador_default>

<mapeamento_categorias>
<opcoes_validas>
${categorias.map(c => `- ${c}`).join('\n')}
</opcoes_validas>

<regras_de_inferencia>
- "ifood", "rappi", "delivery", "pedi comida" → Delivery
- "mercado", "zaffari", "carrefour", "compra do mês" → Supermercado
- "feira", "hortifruti", "ceasa" → Feira
- "açougue", "padaria" (compra estruturada) → Açougue/padaria
- "café", "padaria na rua", "cafezinho" (consumo rápido recorrente) → Padaria/café (semana)
- "lanche", "lanchinho", "pastel", "coxinha", "salgado" (consumo esporádico) → Lanches esporádicos
- "salão", "barba", "manicure", "cabelo" → Cuidado pessoal
- "uber", "99", "taxi" (da luana pro trabalho) → Uber Luana
- "gasolina", "combustível" (moto do gustavo) → Combustível moto
- "netflix", "disney", "prime", "max", "globoplay" → Streaming
- "shopee", "mercado livre", "aliexpress" → Compras Shopee/ML
- "restaurante", "jantar fora" (casal) → Restaurante casal
- "luz", "cemig", "rge", "cpfl" → Luz
- "água", "saneamento" → Água
- "condomínio" → Condomínio
- "financiamento caixa", "parcela casa" → Financ. Caixa
- "vasco" (financiamento da entrada) → Financ. Vasco
- "salário" + pagador → Salário Gustavo ou Salário Luana
- "aportei", "mandei pro cdb" → categoria=CDB 115% CDI (tipo=Transferência)
- "resgatei", "tirei do cdb" → categoria=Conta Gustavo (tipo=Transferência, fonte=CDB 115% CDI)
- "rendeu", "rendimento cdb" → categoria=Rendimento CDB (tipo=Receita, fonte=CDB 115% CDI)
</regras_de_inferencia>
</mapeamento_categorias>

<mapeamento_fontes>
<opcoes_validas>
${fontes.map(f => `- ${f}`).join('\n')}
</opcoes_validas>

<regras_de_inferencia>
- "cartão" ou "nubank" + pagador Gustavo → Nubank Gu
- "cartão" ou "nubank" + pagador Luana → Nubank Lu
- "mercado pago", "mp" → Mercado Pago Gu
- "pix", "débito", "conta" + pagador → Conta Gustavo ou Conta Luana
- "vr", "va", "vale refeição", "vale alimentação" → VR/VA Gustavo
- "auxílio combustível", "aux combustível" → Aux. Combustível Gustavo
- Sem pista → Outro
- Receita de salário/VR/aux (tipo=Receita) → Folha (crédito em conta)
- Aporte ao CDB: fonte=Conta Gustavo (ou Conta Luana)
- Resgate do CDB: fonte=CDB 115% CDI
- Rendimento CDB: fonte=CDB 115% CDI
</regras_de_inferencia>
</mapeamento_fontes>

<formato_saida>
JSON com os campos: tipo, valor, categoria, pagador, fonte, descricao, error.
O schema é aplicado pela API — preencha todos os campos obrigatórios,
respeitando os tipos e as opções válidas dos mapeamentos acima.
</formato_saida>

<exemplos>
<exemplo_1>
Entrada: "52 ifood luana nubank"
Saída: {"tipo":"Despesa","valor":52,"categoria":"Delivery","pagador":"Luana","fonte":"Nubank Lu","descricao":"","error":null}
</exemplo_1>

<exemplo_2>
Entrada: "gastei 35,50 no café" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":35.50,"categoria":"Padaria/café (semana)","pagador":"Gustavo","fonte":"Nubank Gu","descricao":"","error":null}
</exemplo_2>

<exemplo_3>
Entrada: "1910 financiamento caixa" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":1910,"categoria":"Financ. Caixa","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"","error":null}
</exemplo_3>

<exemplo_4>
Entrada: "420,75 mercado zaffari vr" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":420.75,"categoria":"Supermercado","pagador":"Gustavo","fonte":"VR/VA Gustavo","descricao":"Zaffari","error":null}
</exemplo_4>

<exemplo_5>
Entrada: "recebi salário 3800 luana"
Saída: {"tipo":"Receita","valor":3800,"categoria":"Salário Luana","pagador":"Luana","fonte":"Folha (crédito em conta)","descricao":"","error":null}
</exemplo_5>

<exemplo_6>
Entrada: "aportei 500 no cdb" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Transferência","valor":500,"categoria":"CDB 115% CDI","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"","error":null}
</exemplo_6>

<exemplo_7>
Entrada: "resgatei 300 do cdb" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Transferência","valor":300,"categoria":"Conta Gustavo","pagador":"Gustavo","fonte":"CDB 115% CDI","descricao":"","error":null}
</exemplo_7>

<exemplo_8>
Entrada: "o cdb rendeu 45,80 esse mês" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Receita","valor":45.80,"categoria":"Rendimento CDB","pagador":"Gustavo","fonte":"CDB 115% CDI","descricao":"","error":null}
</exemplo_8>

<exemplo_9>
Entrada: "gastei algumas coisas" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":0,"categoria":"Outros","pagador":"Gustavo","fonte":"Outro","descricao":"","error":"Qual o valor e a categoria?"}
</exemplo_9>

<exemplo_10>
Entrada: "50 ração do cachorro pix" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":50,"categoria":"Outros","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"ração cachorro","error":"Não encontrei categoria exata. Confirma 'Outros' ou manda a categoria?"}
</exemplo_10>
</exemplos>`;
}

// ============================================================
// VALIDAÇÃO PÓS-PARSE — rede de segurança
// ============================================================
function validateParse(p) {
    const { categorias, fontes, pagadores } = getListsCached();

    if (typeof p.valor !== 'number' || p.valor <= 0) {
        return { ok: false, message: `Valor inválido: "${p.valor}". Precisa ser um número maior que zero.` };
    }
    if (!['Despesa', 'Receita', 'Transferência'].includes(p.tipo)) {
        return { ok: false, message: `Tipo "${p.tipo}" inválido.` };
    }
    if (!pagadores.includes(p.pagador)) {
        return { ok: false, message: `Pagador "${p.pagador}" inválido. Use Gustavo ou Luana.` };
    }
    if (!fontes.includes(p.fonte)) {
        return { ok: false, message: `Fonte "${p.fonte}" não existe. Ex: Nubank Gu, Conta Gustavo, CDB 115% CDI.` };
    }
    // For Transferência, categoria is the destination — can be a category OR a fonte (account)
    if (p.tipo === 'Transferência') {
        if (!categorias.includes(p.categoria) && !fontes.includes(p.categoria)) {
            return { ok: false, message: `Destino "${p.categoria}" inválido para Transferência. Use uma conta ou investimento válido.` };
        }
        if (p.fonte === p.categoria) {
            return { ok: false, message: `Transferência inválida: origem e destino são iguais (${p.fonte}).` };
        }
    } else {
        if (!categorias.includes(p.categoria)) {
            return { ok: false, message: `Categoria "${p.categoria}" não existe. Ex: Delivery, Supermercado, Financ. Caixa.` };
        }
    }
    return { ok: true };
}

// ============================================================
// LEITURA DAS LISTAS (CACHE)
// ============================================================
function getListsCached() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('lists_v1');
    if (cached) return JSON.parse(cached);

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const cfg = ss.getSheetByName(CONFIG.SHEETS.config);

    // V53 Layout:
    // Dicionário: A12:F
    // Fontes: H12:H
    // Pagadores: J12:J
    
    const pagadores = cfg.getRange('J12:J30').getValues().flat().filter(String);
    const fontes = cfg.getRange('H12:H50').getValues().flat().filter(String);
    
    // Ler o dicionário relacional (A = ID, B = Nome)
    const dictData = cfg.getRange('A12:B100').getValues().filter(r => r[0] && r[1]);
    const categorias = dictData.map(r => r[1]); // Apenas os nomes para o prompt da OpenAI
    
    const catMap = {};
    dictData.forEach(r => catMap[r[1]] = r[0]);

    const lists = {
        pagadores,
        fontes,
        categorias,
        catMap
    };

    cache.put('lists_v1', JSON.stringify(lists), 3600); // 1 hora
    return lists;
}
