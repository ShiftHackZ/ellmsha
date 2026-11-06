---
name: automation-secrets
description: Use scoped automation credentials with existing Aion approvals and human MFA.
---

# Automation Secrets

Use ellmsha_global_secrets_list and, only in Standard project chats, ellmsha_project_secrets_list to find an exact record ID and service/environment/tenant binding. Duplicate names are not identity. Never fall back to another project or global record without explicit selection.

Raw reads intentionally deliver passwords to the model. Use only the selected credential for the requested action. Do not echo secret values, write them to memory, logs or unrelated files, or copy them into tool approval descriptions. Provider transcripts and agent-authored echoes may retain plaintext.

Reuse normal Aion approval options; setup/unlock is not tool authorization. Locked vaults require the human to unlock in Secrets. Never request a master passphrase through tools.

For required or unknown MFA, pause and use existing ellmsha_ask_user. Prefer direct user approval on the website/device. If a code must be relayed, mark the question isSecret and disclose that the model receives the answer. Never save codes, TOTP seeds, recovery material or passkey private keys. A received code is not proof authentication succeeded.

Writes use UUID operation IDs, updates/deletes use the exact metadata incarnation and revision (expected_incarnation/expected_revision); updates use patches; omitted fields remain, explicit null removes a field. Bindings may intentionally share a secret. Distinct credentials need distinct records. No implicit scope moves. A restore changes the incarnation: re-read metadata and obtain a new approval before retrying a mutation prepared before restore.

History search returns unverified candidates from canonical messages only. Save selected values through ordinary scoped write before masking if requested. Mask only selected candidate handles with a UUID operation ID. Masking does not erase active model context, provider/native replay, attachments, old exports/backups, memory, WAL, or existing fork copies. Do not interrupt sessions or claim complete erasure.
