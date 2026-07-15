# v1.4.23.2-C checksum reconciliation - 2026-06-20

## Purpose

This report closes the remaining checksum mismatch blocker by auditable reconciliation, not by rewriting `public.schema_migrations`.

The migration safety gate still treats applied migration SQL as immutable evidence. A mismatch is considered reconciled only when `server/migrations/checksum-reconciliations.json` records all of the following:

- migration filename and version;
- current canonical file checksum;
- live applied ledger checksum;
- reviewer and review time;
- this evidence report reference.

If either the current file checksum or the live ledger checksum changes, the reconciliation no longer matches and the gate blocks again.

## Search performed

Exact historical SQL matching the live ledger hash was searched in:

- current git history for `server/migrations`;
- sibling WorkBuddy checkout migration directories under `C:\Users\jjj64\WorkBuddy`;
- direct file bytes plus LF / CRLF / BOM / final-newline normalization variants.

No exact source SQL was found for the 14 remaining hashes.

## Reconciled rows

| Migration | Version | Current file checksum | Live ledger checksum | Resolution |
| --- | --- | --- | --- | --- |
| `002_add_phase1_tables.sql` | `002` | `0a39a3c82162e0bb4929f9aa629d5c7c717756512ddd50b557081333f8978c3a` | `8edfef3e44a0a42d84d945f91fb43fc71c2f6ec847bf9af75ea708f662803881` | Reconciled by hash-bound registry; ledger unchanged. |
| `068_normalize_acceptance_flow_model.sql` | `068` | `6023995c8b2725a476974fd8cb5c477bce8fd7ce207f33874b533fede07b3274` | `ca9258f12f2916946a361e81be8f64fcdb144d9339d71339e5f4a0cd2bd74a9a` | Reconciled by hash-bound registry; ledger unchanged. |
| `084a_reconcile_live_schema_after_baseline_adoption.sql` | `084a` | `2511a6da6aaa0bbfef1663a3d927dbe5d4f9c204866f3b146e07f6d51b28b6fd` | `631230277d6db3b81ae6538c13bc4529e643930f05f9aae969d9d79d7615b43b` | Reconciled by hash-bound registry; ledger unchanged. |
| `103_patch_schema_gaps_e4.sql` | `103` | `f31540277ba81216aaaeba84d6212f77db5c524bdb8e28fc1c45a83d4a64d106` | `1619eb5fc544f0e38be18021a2e39883b502625d5e18a0f5523c842f1d37f9c9` | Reconciled by hash-bound registry; ledger unchanged. |
| `120_create_engineering_objects.sql` | `120` | `1e25699dfa98e912d0a37dddb822a205b11de2458d2b029ce6787d9c8f6fbe8a` | `fe336f426fab90bee2b246cc43286e12123036aaddd3f18274bf1e6fe6d0d553` | Reconciled by hash-bound registry; ledger unchanged. |
| `121_add_wbs_engineering_categories.sql` | `121` | `c783d0e3e88a5e123bea93002c180e70a2b722292abf2a0244d1ea274fb7b551` | `09e621fa427ca7f045ae5ddffced2b03fd35cf2693b8fc47e683f98ead1faac6` | Reconciled by hash-bound registry; ledger unchanged. |
| `122_create_construction_task_standard_model.sql` | `122` | `fd3158a76b14d27626afbe40cead9c29a1ceedbd9668adf279b28b6d9b27f9d7` | `5bea9322437e83b6c240b8f235ddd64e6f0e6a76196d262faefe8fa6f1a11d88` | Reconciled by hash-bound registry; ledger unchanged. |
| `123_create_task_code_rules.sql` | `123` | `c5b49d577043e9b7afb21bdc1c3f0c6c9a335edb870539819d9f4fbf4d285c35` | `0513a76f67446d6d30b99bf056696c4db0a06c7b94eb6cde9cb55923056d3ea5` | Reconciled by hash-bound registry; ledger unchanged. |
| `136_v1472_wbs_template_generation.sql` | `136` | `664df41d47e7f1269c7249f45b9b27d6ccbce76bc8eca06b546309c2ad7062a5` | `004e60516bd5b1b47941e7c0acf9303818f49923158d0cb3f7d536e162c36899` | Reconciled by hash-bound registry; ledger unchanged. |
| `136a_v1472_wbs_template_candidates.sql` | `136a` | `7a0087c0cffec1ecdd6c63860c60e6d24be86054bf21e78e1182282e633268fa` | `12da8e3649021dbcfe42abcdfa8ef5bd67750f9ef25f6abf2a1e74a6e4dcedbb` | Reconciled by hash-bound registry; ledger unchanged. |
| `137_company_workspace_isolation.sql` | `137` | `7941fa867534c7f9b5e4519fa64485f692939ab07f176aebed5067658e8debde` | `e16204fdf87c4d685cfb830635fd117c05ed24a7938178919c5889a3a9325c5f` | Reconciled by hash-bound registry; ledger unchanged. |
| `139a_v1421_material_lifecycle_fields.sql` | `139a` | `30350c0f395544d8e29846f3dc2bd8acba5c11e7bd10e8de2e8fb12459493a39` | `4f7dada50cf30d6286e92ed9bf224bec72414dcda5fcf66bb720d90f97399612` | Reconciled by hash-bound registry; ledger unchanged. |
| `140_v1418_duration_experience_tables.sql` | `140` | `a13c89ae2fd57f1f792e2600afaadfa062d9af2a5f0695b8012f0dbe8cf30ca4` | `f32534c63c018e51a3c67641c19a982618c145b99f0eff00ad81a7b0977f25e3` | Reconciled by hash-bound registry; ledger unchanged. |
| `143_v1420_workspace_tables.sql` | `143` | `c16fc91b447464a3186e56c9f2e75feaff9b5313e339fc1fd0cbd976ff6cde6e` | `d24a45e4d0bcdb63013eb246bb1306b55699d8f87daf7ade975a8365b617db4f` | Reconciled by hash-bound registry; ledger unchanged. |

## Guardrail

This reconciliation is not a checksum bypass. It does not mutate live ledger rows and does not allow future file edits to remain hidden. It converts a known historical mismatch into explicit release evidence so pending migrations can be evaluated without losing the audit trail.
