# Advanced Prompt Engineering Skill

Instruções para otimizar o processamento de linguagem natural do bot.

## 🧠 Structured Output
- Sempre exija JSON do modelo (usar `response_format: { type: "json_object" }`).
- Forneça "Few-shot examples" claros dentro do prompt.

## 🧪 Validação
- Se o prompt for alterado, teste com os exemplos:
  - "50 ifood luana nubank lu"
  - "resgate 200 do cdb para conta gustavo"
  - "aportei 500 no cdb"

## 🛠 Heurísticas
- Priorizar palavras-chave: "aporte", "resgate", "rendimento", "transferência".
- Tratar ambiguidade: Se o pagador não for mencionado, usar o `AUTHORIZED` chat ID.
