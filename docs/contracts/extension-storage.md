# Contrato de armazenamento da extensão

## IndexedDB de logs

A base local de logs é um mecanismo de resiliência offline. O nome da base, versão, object stores, `keyPath` e índices existentes devem ser preservados.

| Elemento | Regra |
|---|---|
| Nome da base | Não alterar sem migração explícita. |
| Versão | Incrementar somente quando houver upgrade controlado. |
| Object store | Preservar nomes e finalidade. |
| `keyPath` | Não alterar, pois isso pode invalidar registros existentes. |
| Índices | Adicionar somente em upgrade compatível e documentado. |

## Migrações

Toda mudança de schema deve declarar versão de origem, versão de destino, transformação de dados, comportamento em caso de falha e estratégia para logs não sincronizados.

Uma migração não deve apagar dados locais silenciosamente. O fluxo deve preservar registros que ainda não foram enviados ao backend.

## Service worker

Os módulos `background-db.js`, `background-ws.js`, `background-tracker.js`, `background-id.js` e `background-blocker.js` são carregados pelo `background.js` via `importScripts`. A ordem de carregamento e o escopo compartilhado são contratos do Manifest V3.

## Estado local versus servidor

Configurações locais podem ser usadas para inicialização rápida, mas o backend é a fonte remota definida pelos contratos de configuração. Logs locais devem permanecer disponíveis durante indisponibilidade de rede e só devem ser considerados confirmados após a resposta prevista no contrato WebSocket.

## Testes

Testes de armazenamento devem usar IndexedDB isolado ou uma implementação de teste equivalente. Não utilizar o perfil real do navegador nem apagar a base operacional do desenvolvedor.
