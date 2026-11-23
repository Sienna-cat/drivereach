# DriveReach AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable used-car seller-lead outbound orchestration demo that proves lead cleaning, deterministic multi-turn extraction, routing to human/callback, predictive dialing simulation, monitoring, and reproducible evaluation.

**Architecture:** A dependency-free Node HTTP server serves a static ES-module application and JSON APIs. Pure domain functions own lead states, evidence, routing, idempotency, and dispatch simulation. The browser uses a deterministic conversation adapter until a real model endpoint is configured; all model/simulation modes are labeled and persisted locally.

**Tech Stack:** Node 24 bundled runtime, native ES modules, semantic HTML, CSS, browser JavaScript, Node test runner, Python Playwright for rendered QA.

**Spec:** [design.md](design.md)

## Global Constraints

- All leads, conversations, vehicles, and phone outcomes are synthetic and labeled as demo data.
- No claim of production conversion, call quality, or business uplift is allowed without real measurement.
- Demo date is 2026-11-19 in Asia/Shanghai.
- Refusal, complaint, sold-vehicle and identity-mismatch states block marketing progression.
- A model suggestion cannot directly mutate route, refusal, callback, or completion state.
- Current-call transfer and confirmed future callback are separate records and outcomes.
- Every important field update includes quoted evidence and turn ID; missing evidence stays missing.
- Repeated writes use idempotency keys and never create duplicate active tasks.
- The deterministic adapter is the baseline; an optional model endpoint can be added later without changing business rules.

---

### Task 1: Domain rules and deterministic conversation baseline

**Files:**
- Create: `drive-reach-web/package.json`
- Create: `drive-reach-web/src/data.mjs`
- Create: `drive-reach-web/src/domain.mjs`
- Create: `drive-reach-web/src/conversation.mjs`
- Create: `drive-reach-web/tests/domain.test.mjs`

**Interfaces:**
- `createInitialState()` returns `{ version, leads, conversations, callTasks, handoffs, callbacks, agentStates, events, evaluations }`.
- `startConversation(state, leadId)` returns a conversation with a deterministic opening turn.
- `processTurn(state, conversationId, text)` returns `{ reply, updates, route, conversation }` and appends a turn/event.
- `requestHandoff(state, conversationId, reason, idempotencyKey)` and `scheduleCallback(state, leadId, agreedAt, consentQuote, idempotencyKey)` are idempotent writes.
- `simulateDispatch(state, input)` returns queue events and metrics with a fixed seed.

- [ ] Write failing tests for field extraction with evidence, refusal blocking, complaint routing, sold-vehicle closure, current-call handoff vs future callback, duplicate writes, and fixed-seed dispatch.
- [ ] Run `node --test tests/domain.test.mjs`; confirm failures are missing behaviors, not syntax errors.
- [ ] Implement the smallest pure functions and synthetic fixtures to make the tests pass.
- [ ] Run the focused test file, then the full test suite; save a JSON evaluation fixture under `drive-reach-web/evidence/`.

### Task 2: HTTP boundary and persistence-safe API

**Files:**
- Create: `drive-reach-web/server.mjs`
- Create: `drive-reach-web/tests/server.test.mjs`
- Create: `drive-reach-web/.env.example`
- Create: `drive-reach-web/README.md`

**Interfaces:**
- `GET /api/config` returns `{ mode, demoDate, persistence }` without secrets.
- `GET /api/state` returns the synthetic initial state for a fresh browser session.
- `POST /api/conversations` starts a conversation for a valid lead.
- `POST /api/conversations/:id/turns` accepts `{ text }` and returns the deterministic result.
- `POST /api/handoffs` and `POST /api/callbacks` perform validated idempotent writes.
- `POST /api/dispatch/simulate` accepts capacity and probability controls and returns reproducible metrics.
- Static serving is restricted to `public/` and never exposes source, tests, or env files.

- [ ] Write failing integration tests for config, malformed input, unknown leads, valid turn processing, blocked leads, idempotent callback, and static path boundaries.
- [ ] Run the server tests and inspect the expected red output.
- [ ] Implement the HTTP server with JSON error responses and no external dependencies.
- [ ] Add optional model configuration only as a reported capability; do not call a model in the baseline.
- [ ] Run all Node tests and record the command/output in `evidence/verification.md`.

### Task 3: Three-page web demo

**Files:**
- Create: `drive-reach-web/public/index.html`
- Create: `drive-reach-web/public/app.js`
- Create: `drive-reach-web/public/styles.css`
- Create: `drive-reach-web/public/modules/ui.mjs`

**Interfaces:**
- Lead/task view selects one synthetic lead and starts or resumes a conversation.
- Conversation/handoff view shows turns, extracted fields, source quotes, route reason, agent capacity, and callback consent.
- Operations/quality view shows funnel, dispatch simulation controls, events, evaluation runs, and limitations.
- Browser local storage persists session state and offers an explicit reset.

- [ ] Add a failing browser smoke script for lead selection, turn submission, evidence rendering, refusal blocking, callback confirmation, and navigation between pages.
- [ ] Build semantic HTML and responsive CSS with a visible “synthetic demo / deterministic baseline” label.
- [ ] Wire API calls and local state updates; show failed writes as recoverable states.
- [ ] Add evaluation run button and JSON export for the current run.
- [ ] Run the smoke script at desktop and mobile viewport sizes; fix runtime errors and overflow.

### Task 4: Evaluation, process evidence, and final presentation

**Files:**
- Create: `drive-reach-web/evaluation/cases.mjs`
- Create: `drive-reach-web/evaluation/run.mjs`
- Create: `drive-reach-web/evidence/README.md`
- Create: `drive-reach-web/evidence/verification.md`
- Create: `drive-reach-web/portfolio.html`
- Create: `drive-reach-web/portfolio.css`

**Interfaces:**
- Evaluation cases are split into development and holdout sets before tuning.
- The runner emits per-case `{ expected, actual, verdict, failureType }` and aggregate counts, never only a percentage.
- Portfolio page links to the runnable demo, explains completed vs simulated work, and embeds current verification evidence.

- [ ] Write cases for normal extraction, unit ambiguity, correction, refusal, complaint, sold vehicle, handoff capacity, callback consent, duplicate write, tool failure, and dispatch overload.
- [ ] Run the baseline evaluation and save the actual JSON output.
- [ ] Make one measured rule change based on a real failing case, rerun development and holdout sets, and save a before/after record.
- [ ] Create the portfolio page from actual evidence; do not insert invented users, interviews, or uplift.
- [ ] Run the full verification matrix and capture final screenshots outside the repository.

## Verification Matrix

- Node behavior tests: all pass, including refusal, evidence, routing, idempotency, and deterministic dispatch.
- HTTP tests: all pass, including malformed input, blocked actions, API mode labeling, and static path boundaries.
- Browser flow: lead selection → start conversation → submit text → inspect evidence → request handoff → confirm callback → refresh state.
- Quality flow: run evaluation → inspect per-case results → export JSON → view portfolio validation section.
- Responsive QA: 1440×1000 and 390×844, no blank page, framework overlay, console error, clipped control, or hidden primary action.

