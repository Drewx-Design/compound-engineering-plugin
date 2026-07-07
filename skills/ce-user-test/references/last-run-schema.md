# .user-test-last-run.json Schema

Written to `tests/user-flows/.user-test-last-run.json` after Phase 4 completes.

## Behavior

- **Overwritten each run** — only the last run is committable
- `completed: false` if the run was interrupted — commit mode rejects it
- If Phase 4 is interrupted before writing this file, no committable output exists
- **Exception:** `novelty_fingerprints` accumulates across runs (read-merge-write). All other keys are overwritten.

## Schema

```json
{
  "run_timestamp": "2026-02-28T14:30:00Z",
  "schema_version": 12,
  "completed": true,
  "scenario_slug": "checkout",
  "git_sha": "abc1234",
  "areas": [
    {
      "slug": "cart-validation",
      "ux_score": 4,
      "quality_score": null,
      "time_seconds": 12,
      "skip_reason": null,
      "assessment": "Ready for promotion",
      "issues": [],
      "tactical_note": "filter → navigate → back → filter again surfaces stale state",
      "confirmed_selectors": {
        "activeFilters": "[data-filter-chip]",
        "resultCount": ".product-card",
        "sampleResults": ".product-card .title, .condition-badge"
      },
      "weakness_class": "stale-react-state",
      "adversarial_browser": false,
      "adversarial_trigger": null,
      "broad_exploration_start_index": 3,
      "engine": "agent-browser",
      "engine_failure_attempts": [],
      "evidence": [
        { "type": "action", "ref": 1, "note": "cart quantity update supported the UX score" }
      ]
    }
  ],
  "qualitative": {
    "best_moment": { "area": "cart-validation", "text": "Cart updates instantly on quantity change" },
    "worst_moment": { "area": "shipping-form", "text": "Shipping form accepts invalid zip codes" },
    "demo_readiness": "partial",
    "verdict": "Checkout works but shipping validation broken",
    "context": "shipping zip validation bypassed"
  },
  "explore_next_run": [
    { "priority": "P1", "area": "shipping-form", "mode": "Browser", "why": "Validation broken" },
    {
      "priority": "P1",
      "area": "[cross-area]",
      "mode": "Browser",
      "why": "stale-react-state in agent/filter-via-chat + browse/filters",
      "weakness_class": "stale-react-state",
      "affected_areas": ["agent/filter-via-chat", "browse/filters"],
      "adversarial_instruction": "Probe ALL navigation sequences that cross area boundaries..."
    }
  ],
  "anomalies": [],
  "ux_opportunities": [
    { "id": "UX001", "area": "shipping-form", "priority": "P1", "suggestion": "Should show inline validation before submit" }
  ],
  "good_patterns": [
    { "area": "cart-validation", "pattern": "Cart updates instantly on quantity change" }
  ],
  "verification_results": [
    { "area": "agent/filter-via-chat", "claims_checked": 8, "mismatches": [
      { "claim": "Condition: Like New", "actual": "Good", "element": "result-3 badge" }
    ]}
  ],
  "probes_run": [
    { "area": "agent/filter-via-chat", "query": "show me NWT only", "verify": "all badges say NWT", "status": "failing", "result_detail": "3 non-NWT results", "execution_index": 1 }
  ],
  "probes_generated": [
    { "area": "agent/filter-via-chat", "query": "show me good condition only", "verify": "no NWT/like-new badges visible", "priority": "P1", "generated_from": "run-2 condition mismatch" }
  ],
  "cross_area_probes_run": [
    {
      "trigger_area": "browse/product-grid",
      "action": "search 'dresses' via search bar",
      "observation_area": "agent/filter-via-chat",
      "verify": "agent chat responds without stale category filter",
      "status": "failing",
      "result_detail": "agent showed stale Dresses filter on follow-up",
      "related_bug": "B002"
    }
  ],
  "journeys_run": [
    {
      "id": "J001",
      "name": "Primary user flow",
      "status": "failing-at-5",
      "on_failure": "abort",
      "checkpoints": [
        { "step": 1, "area": "<area-slug-1>", "passed": true },
        { "step": 2, "area": "<area-slug-2>", "passed": true },
        { "step": 3, "area": "<area-slug-3>", "passed": true },
        { "step": 4, "area": "<area-slug-4>", "passed": true },
        { "step": 5, "area": "<area-slug-1>", "passed": false,
          "detail": "stale state from step 2 still active" }
      ],
      "engine_failure_attempts": [],
      "time_seconds": 45
    }
  ],
  "novelty_log": [],
  "novelty_fingerprints": {
    "agent/filter-via-chat": [
      "agent/filter-via-chat:edge-query:price-floor",
      "agent/filter-via-chat:edge-query:out-of-scope-question"
    ],
    "browse/filters": [
      "browse/filters:filter-combo:size+color"
    ]
  },
  "stable_queries_rotated": [],
  "disconnects": {
    "count": 0,
    "contexts": []
  },
  "final_execution_index": 3,
  "anomaly_ledger_digest": {
    "lines": 3,
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

## Engine Attribution Fields (v12 additions)

| Field | Type | Default | Written by |
|-------|------|---------|-----------|
| `schema_version` | integer | 12 | Phase 4 writes `12`; `migrate-run-json` writes `12` after defaulting a pre-v12 run |
| `areas[].engine` | string or null | null | Phase 4 scoring; one of `agent-browser`, `chrome`, or `cli` for newly scored areas. `null` means the area was scored before engine attribution existed |
| `areas[].engine_failure_attempts` | array of engine-failure entries | [] | Phase 4 failover handling; `migrate-run-json` for pre-v12 defaults |
| `areas[].engine_failure_attempts[].engine` | string | required when entry exists | Phase 4 failover handling; one of `agent-browser`, `chrome`, or `cli` |
| `areas[].engine_failure_attempts[].area` | string | required when entry exists | Phase 4 failover handling; area/checkpoint context for the failed attempt |
| `areas[].engine_failure_attempts[].why` | string | required when entry exists | Phase 4 failover handling; why the engine attempt failed |
| `journeys_run[].engine_failure_attempts` | array of engine-failure entries | [] | Journey execution; interrupted attempts stay in `journeys_run` alongside re-runs |
| `journeys_run[].engine_failure_attempts[].engine` | string | required when entry exists | Journey execution; one of `agent-browser`, `chrome`, or `cli` |
| `journeys_run[].engine_failure_attempts[].checkpoint` | integer or string | required when entry exists | Journey execution; failed checkpoint or checkpoint label |
| `journeys_run[].engine_failure_attempts[].why` | string | required when entry exists | Journey execution; why the engine attempt failed |
| `areas[].skip_reason` | string or null | null | Phase 4 scoring; v12 adds `engine-failure` for areas never re-run after both engines failed and `auth-blocked` for auth-gated areas in headless/pipeline contexts |
| `migration_defaults_applied` | array of field-name strings | absent | `migrate-run-json` only, when incoming `schema_version` is absent or below 12 |

`skip_reason: engine-failure` is reserved for areas never re-run. If an engine failure is followed by a fresh score, record the failure in `engine_failure_attempts` and keep `skip_reason: null`.

## Evidence and Ledger Fields (v11 additions)

| Field | Type | Default | Written by |
|-------|------|---------|-----------|
| `areas[].evidence` | array of evidence entries | [] | Phase 4 scoring; `migrate-run-json` for pre-v11 defaults |
| `areas[].evidence[].type` | string | required when entry exists | Phase 4 scoring; one of `action`, `dom`, `timing`, `count` |
| `areas[].evidence[].ref` | integer, string, number, or count string | required when entry exists | Phase 4 scoring; execution index for `action`, selector/value for `dom`, seconds for `timing`, count number or `N of M` string for `count` |
| `areas[].evidence[].note` | string | required when entry exists | Phase 4 scoring; states what the entry supports |
| `anomalies[]` | array of reconciled ledger anomaly entries | [] | Phase 4 reconciliation; `migrate-run-json` for pre-v11 defaults |
| `anomalies[].disposition` | string | required when entry exists | Phase 4 reconciliation; one of `filed`, `noted-in-area`, `explore-next-run`, `dismissed` |
| `anomalies[].issue_ref` | string | absent | Phase 4 may set it for pre-existing issues; `confirm-issues` backfills filed issue numbers for newly confirmed candidates |
| `anomalies[].reason` | string | required for `dismissed` | Phase 4 reconciliation; non-empty dismissal reason |
| `final_execution_index` | integer or null | null | Phase 4 reconciliation; must equal the run's last consumed execution index |
| `schema_version` | integer | absent before v11 | Introduced at v11; current Phase 4 writes the latest schema version |
| `migration_defaults_applied` | array of field-name strings | absent | `migrate-run-json` only, when incoming `schema_version` is absent or below the current version |
| `anomaly_ledger_digest` | object | absent | Phase 4 reconciliation |
| `anomaly_ledger_digest.lines` | integer | absent | Phase 4 reconciliation; number of ledger lines digested |
| `anomaly_ledger_digest.sha256` | string | absent | Phase 4 reconciliation; SHA-256 digest of the ledger contents |

`anomalies[]` entries copy the anomaly ledger line fields from [anomaly-ledger.md](./anomaly-ledger.md) and add the reconciliation fields above.

## Journey Fields (v9 additions)

| Field | Type | Description |
|-------|------|-------------|
| `journeys_run` | array | Per-journey results with checkpoint data |
| `journeys_run[].id` | string | Journey ID (e.g., "J001") |
| `journeys_run[].name` | string | Journey name |
| `journeys_run[].status` | string | `untested`, `passing`, `failing-at-N`, `flaky`, `stable`, or `interrupted` (an engine-failure attempt kept for calibration; commit writes no status/history for it) |
| `journeys_run[].on_failure` | string | `abort` or `continue` |
| `journeys_run[].checkpoints` | array | Per-step results: step, area, passed, detail |
| `journeys_run[].time_seconds` | number | Wall-clock time for the journey |

See [journeys.md](./journeys.md) for lifecycle, budget, and execution rules.

## Per-Area Fields (v8 additions)

| Field | Type | Default | Written by |
|-------|------|---------|-----------|
| `tactical_note` | string or null | null | Commit Mode — genuine tactical insight only |
| `confirmed_selectors` | object or {} | {} | Commit Mode — selectors confirmed by successful batch call |
| `weakness_class` | string, empty string, or null | null | Commit Mode — non-empty upserts the class; `""` deletes a resolved class; null/absent leaves unchanged |
| `adversarial_browser` | boolean | false | Phase 2.5 — CLI score 3 trigger |
| `adversarial_trigger` | string or null | null | Phase 2.5 — the query that triggered adversarial mode |
| `broad_exploration_start_index` | integer or null | null | Phase 3 — execution index when broad exploration began (v10) |

## Probe Execution Fields (v10 additions)

| Field | Type | Default | Written by |
|-------|------|---------|-----------|
| `probes_run[].execution_index` | integer | absent | Phase 3 — 0-based monotonically increasing counter across all areas |

The `execution_index` tracks the order of all probe and exploration actions across the entire run. Each probe execution and each broad exploration action increments the counter. Combined with `broad_exploration_start_index` per area, the eval can verify that probes ran before exploration: for each area, all `probes_run` entries must have `execution_index < broad_exploration_start_index`.

Historical run-JSON migration is owned by `../scripts/migrate-test-file.py` via the `migrate-run-json` subcommand.

## Explore Next Run Fields (v8 additions)

Cross-area synthesis entries include:

| Field | Type | Present when |
|-------|------|-------------|
| `weakness_class` | string | Entry is from cross-area synthesis |
| `affected_areas` | string[] | Entry is from cross-area synthesis |
| `adversarial_instruction` | string | Entry is from cross-area synthesis |

## Novelty Fingerprints

| Property | Value |
|----------|-------|
| Key | `novelty_fingerprints` (top-level) |
| Structure | Object keyed by area slug, each value an array of fingerprint strings |
| Format | `<area-slug>:<action-type>:<key-parameter>` |
| Cap | `novelty_fingerprints_per_area_cap` in `../scripts/caps-registry.json` |
| Accumulation | Read existing → merge with new → apply registry cap → write back |
| Resilience | Missing/corrupted → empty (graceful degradation) |

See [queries-and-multiturn.md](./queries-and-multiturn.md) for fingerprint normalization taxonomy.
