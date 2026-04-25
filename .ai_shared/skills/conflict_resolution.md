# Conflict Resolution Matrix

Regras para resolver divergências técnicas entre as IAs.

## ⚖️ Hierarquia de Decisão
1. **Segurança e Estabilidade:** Gemini tem a palavra final.
2. **Legibilidade e Manutenibilidade:** Claude tem a palavra final.
3. **Performance e Lógica Pura:** Codex tem a palavra final.

## 🛠 Procedimento em caso de impasse
1. Se o Codex sugerir algo que o Claude considera "feio" (bad smell), o Claude deve propor uma refatoração IMEDIATA, mas sem quebrar a lógica do Codex.
2. Se houver dúvida sobre o impacto na planilha, o Gemini deve simular o comportamento e decidir.
3. Se o impasse persistir por mais de 2 turnos, a decisão deve ser levada ao Usuário (Luana) via `ask_user`.
