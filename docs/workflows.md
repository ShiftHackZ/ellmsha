# Working effectively with eLLMsha

## Give a task a testable finish line

A useful request names the project, desired behavior, constraints and evidence required for acceptance:

> In this product's API and web roots, add the new filter. Preserve the existing API contract. Show the changed behavior, run focused checks and request an independent read-only review before calling it complete.

Keep implementation sequential when tasks share a dirty checkout. Parallel read-only research or review is useful; parallel writers need genuinely isolated checkouts and a deliberate integration step.

## Use three kinds of context deliberately

| Need | Tool/context |
| --- | --- |
| Why a decision was made | Durable project memory |
| What a previous agent actually did | Chat history |
| Where behavior is implemented now | Current files and code indexes |

Ask the agent to distinguish current evidence from old notes. After an important decision, save a concise self-contained memory entry and read it back. Do not store credentials or full transient logs as memory.

## Plan larger changes with BMAD

Use the planning workflows when a task needs requirements, architecture, stories or an adversarial review. Keep artifacts in the configured project memory namespace so a fresh chat can continue. Small fixes do not need a full planning ceremony.

A practical sequence is **requirements → architecture → bounded story → implementation → focused tests → read-only review → native acceptance**. Test results are evidence for the paths tested, not proof of the entire product.

## Delegate with a clear boundary

Give each child an objective, relevant workspace and output contract. Let it retrieve needed durable context. Ask for exact paths and verified outcomes. A parent waiting for a child is still working; a finished parent with an independently running child is a different state. Use both the chat indicator and the child history when diagnosing activity.

## Connect integrations carefully

Connect accounts in a plugin's detail page. State the service workspace/account when it is ambiguous. Reading issues and attachments is a useful first check; successful OAuth alone does not prove every tool or account-isolation path works. Confirm external writes such as comments or time entries explicitly.

## Local models

Choose the generation model for the task and a stable embedding model for recall. Check tool-calling behavior with a small task before trusting a long autonomous run. Local inference reduces reliance on a cloud generation endpoint, but plugins and explicitly configured services can still use the network.

## Auto Router

Configure **Auto Router** from **Settings → Agents**, then select it when starting a chat. The editable diagram uses existing provider accounts and supported agent runtimes. Click a node to choose its account/model or edit its policy; optional model hints stay in advanced settings.

```text
Root ──→ Default subagents
  └────→ Classifier ──→ Coding / QA / other custom task classes
```

The default branch runs directly when there are no custom classes. With classes, the selected classifier returns one matching class ID or no match. A match chooses that class's child target. No match, an invalid response or classifier timeout uses the default branch with an explicit reason. An unavailable matched target fails clearly; it is not silently replaced. Classification never changes the root and never fans out into every class.

| Mode | Root | Default children |
| --- | --- | --- |
| Auto | Selected for the initial task | Selected for each child assignment |
| Semi-auto | Your fixed target | Selected for each child assignment |
| Manual | Your fixed target | Your fixed child target |

Each mode × optimization preset owns its complete saved graph: targets, classifier, classes, pool, hints and restrictions. Switching back restores that slot; editing another slot does not change it. New slots may copy custom classes once, then evolve independently. Incomplete inactive drafts can be saved, but the active slot needs its required models/classifier before it can be used. Cancel discards the editor's unsaved changes.

Cost, Speed, Quality, Balanced and Local-only provide preset policies. Before a chat runs, the diagram shows the policy rather than claiming a model has already been selected. Prices, latency, capabilities and task strengths entered as model hints are user estimates, not benchmarks. Unknown dimensions are excluded from ranking; insufficient evidence uses a disclosed stable baseline. Reasoning effort remains a separate model setting.

V2 host-managed children are visible conversations in the same workspace and user scope. Supported native/API, Codex and Claude roots can delegate through the host tools to a different supported runtime/account/model. Child approvals stay in the child chat; cancellation propagates and unfinished children are cancelled when the parent turn ends. Provider-internal children remain controlled by that CLI and are outside Auto Router's policy. A catalog entry being configured does not prove its runtime supports host delegation: unsupported or unhealthy choices remain visible with a reason.

Root and child targets are frozen for their conversations, including resume. A conflicting saved runtime selection is rejected before new work. Start a new chat to change its target. Existing V1 conversation snapshots and their future children retain their original routing behavior; migrating global settings does not rewrite those snapshots. Teams retain their existing separate delegation path.

**Local-only** forbids cloud inference, including classification. A local target needs an explicit local-inference hint and a loopback API endpoint. Conflicting saved assignments stay visible and block execution rather than being erased. This setting is not a network sandbox for tools or plugins. Router memory retrieval is skipped in this mode because a local memory endpoint does not establish where its embedding calls run. Otherwise, retrieval uses bounded current-project memory. Explicit user review of a completed answer contributes to that workspace's routing history; completion and an agent's claim of success do not. Reviews remain user assessments, not objective correctness scores or proof of savings.

The chat's route badge shows the selected target and decision reasons. The configured/live adapter model is used to detect route drift; optimistic runtime metadata alone is not proof of which model a remote provider actually executed. Actual cross-runtime behavior, approvals and cancellation require real task acceptance in addition to unit tests.

## Finish with evidence

- Verify the behavior in the actual UI when UI is part of the requirement.
- Test fresh, resumed and child sessions when changing agent context or tools.
- Check empty/loading/error states and the selected theme.
- Preserve uncommitted work and user data; commit or publish only when requested.
- Record remaining account, permission or platform gates without claiming they passed.


## Three starting recipes

### One product, several codebases

Open the product folder and attach the API, web and mobile roots. Index the repositories you want searched, then ask:

> Trace this API change through the web and mobile clients. Read current source, identify affected contracts and propose the smallest coordinated change. Implement one step at a time; report verification separately for each root.

Refresh affected code indexes after changing source. An old index is a navigation aid, not evidence that a symbol still has its previous behavior.

### Continue tomorrow in a fresh chat

Before leaving, ask:

> Save the decision, changed behavior, verification results and remaining work to this project's memory. Include the exact artifact paths and read the saved entry back. Do not save credentials or raw logs.

In the next chat:

> Retrieve the project's latest handoff and relevant chat history. Check the current working tree before continuing. Preserve existing uncommitted changes and distinguish unfinished work from verified results.

### Add an integration

Start with the [plugin-authoring skill](../plugins/plugin-dev/skills/plugin-authoring/SKILL.md) and the [template](../plugins/plugin-dev/templates/basic-plugin). Ask for a read-only tool first, explicit errors and a focused check. Keep account connections independent of project folders. Once a read works, verify the intended account and authorize any external write separately.
