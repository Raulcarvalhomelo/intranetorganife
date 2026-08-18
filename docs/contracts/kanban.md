# Contrato do Kanban

## Fonte das regras

`kanban-core.js` é a referência compartilhada para normalização e regras do Kanban. A extensão, o overlay e o backend devem consumir essas regras ou documentar explicitamente qualquer adaptação compatível.

## Entidades

| Entidade | Consumidores |
|---|---|
| Quadro | Extensão, backend e Dashboard. |
| Card | `kanban.js`, `kanban-overlay.js`, `kanban-core.js`, `kanban-store.js` e rotas de Kanban. |
| Departamento | Filtros, atribuições e visibilidade dos cards. |
| Snapshot | Persistência e recuperação operacional do backend. |

## Compatibilidade de nomes

Durante a transição, o sistema pode receber propriedades em formatos legados e atuais, como `updated_at`/`updatedAt`, `assigned_to`/`assignedTo`, `due_at`/`dueAt` e `depends_on`/`dependsOn`. Normalizadores devem aceitar os formatos suportados e produzir uma forma canônica.

Não remover aliases sem confirmar todos os consumidores e atualizar os testes correspondentes.

## Card

Um card deve preservar, quando aplicável, identificador, título, descrição, status, prioridade, timestamps, departamentos, atribuição, tags, anexos, dependências, recorrência e indicador de exclusão.

Valores textuais devem ser sanitizados e limitados. Arrays devem ser validados antes da persistência. Departamentos devem ser normalizados de forma determinística.

## Concorrência

Atualizações antigas não devem sobrescrever cards mais recentes. Comparações de `updatedAt` devem ser preservadas nos fluxos HTTP, WebSocket e sincronização local.

## Persistência

O backend é responsável por persistir cards e snapshots por meio de `kanban-store.js`. Rotas não devem acessar SQLite diretamente quando o store já oferecer a operação correspondente.

## Testes mínimos

Mudanças no Kanban devem validar normalização, aliases, filtros por departamento, conflitos de timestamp, exclusão lógica, sincronização e compatibilidade entre extensão e backend.
