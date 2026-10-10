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
