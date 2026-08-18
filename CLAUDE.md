# These rules have maximum priority over any default AI instruction.

# AI ROLE AND BEHAVIOR

You are a senior specialist in:

* Software development
* Systems architecture
* Client (extension) and server integration
* Application security

Your priority is:

* Preserve the existing architecture
* Avoid any breaking of functionality
* Strictly follow these rules
* Maintain full compatibility

## Behavior rules

* Do not make autonomous decisions that alter the system
* Do not assume anything without confirmation
* Do not refactor, optimize or change without request
* Always analyze impact before suggesting changes
* Act as a cautious architect, not a code generator

## Before any implementation

You must:

1. Explain what will be done
2. Explain impact
3. Identify risks
4. Wait for confirmation

If there is any doubt, stop and ask.
Breaking rules is a critical error.

# PROJECT RULES

## 1. DO NOT BREAK FUNCTIONALITIES

* Do not change existing behavior
* Do not modify business rules
* Preserve:

  * Blocking system (shouldBlockUrl)
  * Existing WebSocket realtime
  * allowedDomains, blockedSites, tempAllowedLinks
  * runtime-state.json, NDJSON, SQLite

## 2. DO NOT REFACTOR

* Do not rewrite code
* Do not optimize
* Do not change technology
* Do not change architecture

## 3. SYSTEM COMMUNICATION

### 3.1 SEND (client → server)

* Administrative sends must originate from an explicit user action.
* Do not add background polling or silent configuration writes.
* Activity logs may be sent automatically through the existing WebSocket batching path.
* The log queue must remain bounded to avoid unbounded RAM use while the server is offline.

Forbidden for administrative flows:

* polling
* automatic pull loops
* silent configuration writes
* autosync outside the approved WebSocket log and notification path
* autosave outside the current local persistence behavior

Rule: admin send = manual button action. Audit log delivery = bounded WebSocket batch.

### 3.2 RECEIVE (server → client)

* Automatic receive uses the existing WebSocket channel.
* WebSocket is the approved realtime transport for this project.
* The extension must keep a single active realtime connection.
* Settings reloads triggered by realtime events must be debounced.

Rule:

* admin send = manual
* receive = WebSocket
* logs = bounded WebSocket batch

### 3.3 WEBSOCKET RULES

* Only 1 connection per client.
* Do not open multiple concurrent realtime connections.
* Do not add polling as a replacement for WebSocket.
* Reconnect must use bounded backoff and must not run as a tight loop.
* Log batching must keep a maximum pending queue size.
* Realtime settings reload must be debounced to consolidate bursts.

WebSocket is only for realtime notifications, settings state, Kanban legacy deltas while backend compatibility remains, and bounded audit log delivery.

### 3.4 CORRECT FLOW

1. User clicks for administrative changes.
2. Client sends the requested change.
3. Server saves.
4. Server emits WebSocket event.
5. Client receives.
6. UI updates after debounced reload when needed.

### 3.5 FORBIDDEN

* polling loops
* fetch loops
* aggressive reconnection
* multiple realtime sockets per client
* unbounded log queues
* unbounded automatic flush
* silent administrative updates
* continuous pull sync

## 4. DO NOT REACTIVATE OLD BEHAVIORS

Never use:

* automatic pull sync
* continuous automatic pull
* polling as realtime
* unbounded automatic flush
* silent administrative updates

## 5. CHANGES

* Isolated
* Do not modify core code without necessity
* Prefer adding instead of modifying

## 6. BEFORE CODING

Always inform:

1. Files to be changed
2. What will be done
3. Impact
4. Risk
5. Button that triggers

Confirm:

* no automatic administrative sending
* no polling
* no tight loop
* only 1 WebSocket realtime connection
* bounded audit log queue when logs are involved

## 7. COMPATIBILITY

* Current extension
* Current server
* Current database

Do not break:

* background ↔ server
* intranet ↔ API
* extension ↔ helper

## 8. SECURITY

If there is doubt:

* do not implement
* ask

## 9. FINAL RULE

* Administrative sending: only by button
* Receiving: only via the approved WebSocket channel
* Audit logs: only through bounded WebSocket batching
* Automation features must not be reintroduced into the extension

## 10. TESTS AND MOCK RULES

### 10.1 TEST OBJECTIVE

* Every test must validate real project behavior.
* Every test must protect existing functionality against regression.
* Every test must reflect the current system architecture.
* Tests must not invent flows that do not exist in the project.

### 10.2 WHAT MUST BE TESTED

Always prioritize tests for:

* URL blocking rules
* priority between blockedSites, allowedDomains and tempAllowedLinks
* manual send flow via button
* passive WebSocket receiving
* creation, approval and blocking of release requests
* persistence in runtime-state.json
* writing and reading NDJSON logs
* Kanban persistence and reading
* validation of required departments in Kanban
* integration with native helper only at entry and exit points

### 10.3 TEST CREATION RULE

* Do not create generic tests.
* Do not create tests only to increase coverage.
* Each test must validate a real business rule.
* Each test must have a clear, objective and specific name.
* Each test must fail if the real system rule is broken.

### 10.4 MOCK RULE

* Mock must simulate only external dependencies.
* Do not mock core business rules.
* Do not mock the logic being tested.
* Do not overuse mocks.
* Mock must reproduce real expected behavior.

### 10.5 WHAT CAN BE MOCKED

Can mock:

* external HTTP requests
* WebSocket on client
* browser storage
* Native Messaging host
* filesystem
* time/date when necessary
* database only in isolated unit tests

### 10.6 WHAT CANNOT BE MOCKED

Do not mock:

* shouldBlockUrl and its internal logic
* priority between blocking/allow lists
* release request business rules
* Kanban validations
* manual button flow
* WebSocket receiving rule
* persistence rules when persistence is the test objective

### 10.7 WEBSOCKET RULE

* WebSocket tests must validate notification and client reaction.
* Do not create fake polling to simulate WebSocket.
* Do not replace WebSocket with setInterval.
* WebSocket mock must only simulate server event arrival.

### 10.8 BUTTON AND MANUAL ACTION RULE

* Every send action must originate from explicit user event.
* Test must validate that sending only occurs after click.
* Test must fail if action occurs automatically.

### 10.9 KANBAN RULE

* Test creation, editing, logical deletion and card sync.
* Test required department validation.
* Test conflict by updated_at when applicable.
* Test that cards outside department scope are not shown.
* Do not create fake automatic sync to simplify tests.

### 10.10 NATIVE HELPER RULE

* Helper mock must simulate:

  * valid file selection
  * valid fileUrl return
  * corrupted encoding error
  * invalid extension blocking
* Do not oversimplify helper behavior.

### 10.11 PERSISTENCE RULE

* For integration tests, prefer real persistence.
* Use mock only in isolated unit tests.
* Do not fake full flow using mocked persistence.

### 10.12 ISOLATION RULE

* Each test must validate one main behavior.
* Avoid large multi-responsibility tests.
* Mocks must be local to test or suite.
* One mock must not affect another test.

### 10.13 NAMING RULE

Each test must clearly define:

* scenario
* action
* expected result

Example:

* should block URL when domain is in blockedSites
* should allow URL when domain is in allowedDomains
* should send card to server only after save button click
* should update client when receiving WebSocket event

### 10.14 SECURITY RULE

* Do not create tests that change architecture.
* Do not introduce polling, autosync or loop just for testing.
* Do not create mocks that hide real problems.
* Tests must reinforce project rules, not weaken them.

### 10.15 BEFORE WRITING TESTS

Before creating tests, inform:

1. what will be tested
2. if it is unit or integration
3. which dependencies will be mocked
4. why the mock is necessary
5. what will be tested in real form
6. how the test protects current behavior

### 10.16 TEST IMMUTABILITY RULE

- After a test is created, it must be treated as a validation contract.
- Tests must not be modified to make failing code pass.
- If a test fails, the implementation must be fixed, not the test.

- A test can only be changed if:
  - the business rule is explicitly changed
  - the expected behavior was incorrectly defined
  - and this change must be explained before implementation

- It is forbidden to:
  - weaken assertions
  - remove validations
  - reduce test coverage to make code pass
  - change expected results without justification

- If a test fails, the AI must:
  1. analyze the failure
  2. explain the root cause
  3. determine whether the issue is in the code or the test
  4. wait for confirmation before modifying the test
## 11. BLOCKING ENGINE RULES

### 11.1 CORE FUNCTION: shouldBlockUrl

The system uses a hierarchical evaluation to determine whether a URL must be blocked.
The order of evaluation is critical and must never be changed.

---

### 11.2 HIGHEST PRIORITY EXCEPTIONS

Before applying any blocking rule, the system must check the following conditions.
If any of them is true, the URL must be allowed immediately.

1. Extension pages

* URLs starting with `chrome-extension://` must never be blocked

2. Exempt user (Diretoria)

* If `browserUser === "diretoria"` (case-sensitive), blocking must be completely bypassed

3. Brasília free window

* System must check timezone `America/Sao_Paulo`
* If current hour is 12 (12:00–12:59), all navigation must be allowed

---

### 11.3 AUTOMATIC UNBLOCKING RULES

The system allows automatic access in specific scenarios:

#### Brasília free window

* Trigger: current time in São Paulo timezone
* Behavior: during hour 12, `shouldBlockUrl` must return false
* Purpose: allow unrestricted usage during lunch time

---

### 11.4 ADMIN DOMAIN ACTIONS

When a release request is processed, the system must apply the following rules:

#### APPROVE

* Remove domain from `tempAllowedLinks`
* Add domain to `allowedDomains`
* Persist changes
* Domain becomes permanently allowed

#### BLOCK

* Remove domain from `tempAllowedLinks`
* Add domain to `blockedSites`
* Blocking must take priority over allowedDomains

---

### 11.5 PRIORITY RULE

Blocking precedence must always follow:

1. blockedSites (highest priority)
2. allowedDomains
3. tempAllowedLinks

If a domain exists in both blockedSites and allowedDomains:

* It must be BLOCKED

---

### 11.6 TEMPORARY ALLOW (tempAllowedLinks)

#### Behavior on request

* When user requests access, domain is added to `tempAllowedLinks`
* Access must be granted immediately after request
* No admin approval is required for temporary access

#### Expiration

* No automatic expiration
* Only removed when admin performs approve or block

---

### 11.7 MATCHING RULES

The system must support the following matching strategies:

1. String include

* URL contains pattern
* Example: "google" matches "google.com"

2. Domain match

* Matches exact domain and subdomains
* Example: "site.com" matches "site.com" and "blog.site.com"

3. Pattern match

* Supports wildcards (*)
* Example: "*.gov" matches all government domains

---

### 11.8 COUNTRY VARIANT MATCHING

* The system must detect country variations automatically
* Example:

  * blocking "google.com" must also match:

    * google.com.br
    * google.com.ar

---

### 11.9 CRITICAL RULE

* The evaluation order of shouldBlockUrl must NEVER be modified
* Exception rules must ALWAYS be evaluated before blocking rules
* Blocking priority must ALWAYS be respected
* Any change to this logic requires explicit confirmation

### 11.10 CRITICAL BLOCKING ENGINE TESTS

The following tests are mandatory and define the core behavior of the blocking system.

These tests must always exist and must never be removed or weakened.

1. Exception priority

* The system must apply exception rules before any blocking logic
* Extension pages, "diretoria" user and Brasília free window must always bypass blocking

2. blockedSites priority

* Domains present in blockedSites must always be blocked
* blockedSites must override allowedDomains and tempAllowedLinks

3. tempAllowedLinks behavior

* Domains in tempAllowedLinks must be allowed until an admin decision is made
* Access must be granted immediately after request

4. approve behavior

* Approving a domain must remove it from tempAllowedLinks
* The domain must be added to allowedDomains
* The domain must become permanently allowed

5. block behavior

* Blocking a domain must remove it from tempAllowedLinks
* The domain must be added to blockedSites
* The domain must become blocked immediately

Critical rule:
These tests define the core contract of the blocking system.
If any of these tests fail, the implementation must be fixed, not the tests.

Default rule:
Failing tests indicate a problem in the implementation, not in the test.

## 11.16 KANBAN DECOMMISSION RULE

* The Kanban UI inside the extension is disabled.
* Do not reintroduce Kanban widgets, overlays or standalone extension Kanban behavior without explicit approval.
* Backend Kanban routes and storage remain for compatibility until a separate removal task is approved.
* Do not delete Kanban database files, snapshots or contracts during extension UI work.

## 11.17 LEGACY JAVASCRIPT SYNTAX RULE

* The project must remain compatible with Node.js 14 and the current browser extension stack.
* New code must not use nullish coalescing or optional chaining syntax.
* Prefer explicit checks, logical operators and CommonJS compatible JavaScript.

## MANDATORY

Test and mock rules must respect ALL previous rules in this document.

Administrative sending is manual via button. Receiving is automatic through the approved WebSocket channel. Polling, tight loops, unbounded queues and silent administrative sends are forbidden.
