# Contrato HTTP

## Princípios

Os caminhos e métodos HTTP existentes são contratos de integração entre extensão, backend e Dashboard. Não renomear ou remover rotas sem atualizar consumidores, testes e `server/api/endpoints.json`.

As respostas devem manter os códigos HTTP e as propriedades relevantes já consumidas pelos clientes. Campos adicionais podem ser introduzidos com cuidado; mudanças incompatíveis exigem decisão registrada.

## Domínios

| Domínio | Consumidor principal | Regras |
|---|---|---|
| Saúde | Operação e testes | Deve responder rapidamente e sem autenticação quando definido pelo contrato atual. |
| Configurações | Extensão e Dashboard | Alterações administrativas devem respeitar papel e validação. |
| Releases | Extensão e Dashboard | Aprovação e bloqueio exigem autorização adequada. |
| Logs | Extensão e Dashboard | Consultas e ingestão devem seguir `docs/contracts/logs.md`. |
| Kanban | Extensão, overlay e Dashboard | Normalização e persistência devem seguir `docs/contracts/kanban.md`. |
| Sessão | Dashboard | Deve preservar autenticação, expiração e papéis `admin`/`viewer`. |

## Autorização

Operações administrativas devem exigir o papel `admin`. O papel `viewer` pode consultar somente os dados permitidos pelo contrato atual. Uma rota não deve implementar uma regra de permissão diferente da camada de autenticação.

## Alteração de contratos

Antes de alterar uma rota:

1. localizar consumidores na extensão e no Dashboard;
2. localizar testes que protegem a rota;
3. atualizar o contrato documentado;
4. implementar a mudança;
5. executar testes do domínio e verificar permissões.

Não usar este documento como substituto do código executável ou de `server/api/endpoints.json`; ambos devem permanecer coerentes.
