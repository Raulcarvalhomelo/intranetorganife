# Decisões arquiteturais

Este diretório registra decisões que alteram ou condicionam a arquitetura do projeto. O objetivo é preservar contexto para desenvolvedores e agentes, evitando que soluções já descartadas sejam reintroduzidas.

## Quando registrar uma decisão

Registre uma decisão quando houver mudança de runtime, persistência, contrato HTTP/WebSocket, schema do IndexedDB, estratégia de sincronização, autenticação, organização de módulos ou política de testes.

## Estrutura recomendada

Cada decisão deve conter:

1. **Título e data.**
2. **Status:** proposta, aceita, substituída ou rejeitada.
3. **Contexto:** problema e restrições.
4. **Decisão:** solução escolhida.
5. **Alternativas consideradas.**
6. **Consequências:** benefícios, custos e riscos.
7. **Arquivos e contratos afetados.**
8. **Plano de migração ou reversão**, quando aplicável.

## Regras

Uma decisão não substitui o código nem os contratos; ela explica por que eles devem permanecer de determinada forma. Decisões aceitas devem ser refletidas em `CLAUDE.md`, `AGENTS.md` ou `docs/contracts/` quando criarem uma regra operacional permanente.

Não registrar credenciais, tokens ou dados operacionais. Não alterar uma decisão histórica; registre uma nova decisão que a substitua e mantenha o histórico.
