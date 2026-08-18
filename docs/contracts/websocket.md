# Contrato WebSocket

## Endpoint e handshake

O endpoint de tempo real é `/ws`, servido pelo mesmo servidor HTTP do backend. O cliente deve enviar uma mensagem de apresentação indicando seu tipo:

```json
{
  "type": "hello",
  "client": "extension"
}
```

Os tipos de cliente reconhecidos são `extension` e `dashboard`. O servidor deve responder ao handshake e associar a conexão à sala correspondente.

## Salas

| Sala | Cliente | Uso |
|---|---|---|
| `extension` | Service worker da extensão | Atualizações de configuração, deltas do Kanban e ingestão de logs. |
| `dashboard` | Dashboard administrativo | Atualizações de estado, solicitações e monitoramento. |

Mensagens destinadas a uma sala não devem ser enviadas indiscriminadamente a clientes de outra sala quando o contrato exigir isolamento.

## Mensagens principais

| Tipo | Direção | Finalidade |
|---|---|---|
| `hello` | Cliente → servidor | Identificar o tipo de cliente. |
| `hello_ack` | Servidor → cliente | Confirmar handshake e sala. |
| `state_update` | Servidor → clientes | Informar mudança de estado; o payload contém `kind` e timestamp. |
| `settings_state` | Servidor → cliente | Entregar configurações iniciais ou atualizadas. |
| `logs_batch` | Extensão → servidor | Enviar lote de logs. O payload contém `logs` e pode conter `droppedLogCount`. |
| `logs_ack` | Servidor → extensão | Confirmar aceitação do lote e informar a quantidade. |

## Heartbeat

O servidor deve manter heartbeat para detectar conexões mortas. Clientes devem tratar fechamento inesperado e reconectar com backoff exponencial, sem abrir conexões concorrentes indefinidas.

## Reconexão

A extensão e o Dashboard devem reconectar após falha de rede. O atraso deve aumentar progressivamente até um limite e ser reiniciado após conexão bem-sucedida. A extensão deve consolidar eventos de atualização de configurações com debounce antes de consultar o estado completo. Mensagens não confirmadas devem seguir a política do contrato específico; para logs, consultar `docs/contracts/logs.md`.

## Evolução

Novos tipos de mensagem devem ser aditivos quando possível. Alterar o formato de uma mensagem existente exige atualizar extensão, backend, Dashboard, testes e este documento.
