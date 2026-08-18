# WebSocket como realtime oficial e desativação do Kanban na extensão

## Data

2026-08-18

## Status

Aceita

## Contexto

A extensão Organife estava funcional no commit usado como base de estabilidade e utiliza WebSocket para realtime. A documentação interna ainda citava SSE e proibia WebSocket, criando risco de manutenção futura quebrar o comportamento atual. O Kanban deixará de ser mantido dentro da extensão, pois a gestão de tarefas será feita por outra aplicação.

## Decisão

WebSocket é o transporte realtime oficial do projeto. A extensão deve manter uma conexão ativa por cliente, reconectar com backoff e evitar loops apertados. Atualizações de configurações recebidas por realtime devem ser consolidadas com debounce. A fila de logs enviada por WebSocket deve ter limite máximo para evitar crescimento indefinido em memória.

O Kanban da extensão fica desativado na Intranet e na página standalone da extensão. O backend Kanban, contratos e persistência permanecem preservados como legado de compatibilidade até uma tarefa separada de remoção.

## Alternativas consideradas

- Migrar para SSE agora. Rejeitada porque WebSocket é o comportamento funcional atual e foi definido como decisão do projeto.
- Remover todo o Kanban, incluindo backend e banco. Rejeitada nesta etapa pelo risco de quebrar contratos, dados e consumidores legados.

## Consequências

- Futuras mudanças devem tratar WebSocket como arquitetura aprovada.
- Não se deve reintroduzir automação ou Kanban na extensão sem aprovação explícita.
- A remoção total do Kanban backend precisa de novo plano, atualização de contratos e testes.

## Arquivos e contratos afetados

- `CLAUDE.md`
- `background.js`
- `intranet.html`
- `intranet.js`
- `kanban.html`
- `docs/architecture.md`
- `docs/contracts/logs.md`
- `docs/contracts/websocket.md`
- `docs/contracts/kanban.md`
