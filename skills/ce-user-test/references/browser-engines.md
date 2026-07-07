# Browser Engines

This file is the canonical home for ce-user-test browser engine behavior:
verb mapping, engine selection, resilience, failover, replay-before-blame,
login/session handling, and portable evaluate payloads.

## Verb Table

Use tool-neutral verbs in the skill phases. Dispatch each verb through the
selected engine.

| Verb | Chrome MCP | agent-browser CLI |
|---|---|---|
| navigate | `mcp__claude-in-chrome__navigate` | `agent-browser open <url>` |
| read-page | `mcp__claude-in-chrome__read_page` | `agent-browser get text`, `agent-browser get html`; use `agent-browser snapshot` for structure |
| evaluate | `mcp__claude-in-chrome__javascript_tool` | `agent-browser eval <js>` |
| screenshot | `mcp__claude-in-chrome__screenshot` | `agent-browser screenshot [path]` |
| click | `mcp__claude-in-chrome__click` | `agent-browser click @ref` |
| fill | `mcp__claude-in-chrome__fill` | `agent-browser fill @ref <value>` |
| find | `mcp__claude-in-chrome__find` | `agent-browser find <locator> <value>` |
| wait | `mcp__claude-in-chrome__javascript_tool` wait payload | `agent-browser wait <sel|ms>` |

Invoke agent-browser with the direct `agent-browser` binary. Never use
`npx agent-browser`.

Refs for `click` and `fill` come from `agent-browser snapshot -i`. A ref refresh
needed to complete an agent-browser verb is part of that verb, not a separate
budget charge.

Browser-call budget unit: one verb invocation. Any engine-internal snapshot,
ref refresh, or selector read needed to perform that verb counts inside the
verb. This keeps budgets comparable across Chrome MCP and agent-browser.

Chrome cannot automate file uploads through `<input type="file">`. Use
agent-browser for upload steps.

## Engine Selection

Run these checks in order at Phase 2 setup:

1. Check whether the test file frontmatter contains `engine: chrome`, or the
   user's invocation requested Chrome. Reason over the invocation text; never
   scan `$ARGUMENTS`.
2. If Chrome is requested, verify the chrome MCP is connected.
   - If connected, use Chrome.
   - If disconnected, prompt once: reconnect Chrome or run on agent-browser.
   - If the user chooses agent-browser, continue at the agent-browser setup
     check below.
   - If the user chooses reconnect, ask them to run `/chrome` and select
     Reconnect extension, then re-verify once.
   - If the re-verify is still disconnected, stop with the `/ce-setup` pointer.
   - Never silently fall back from a Chrome-requested run.
3. If Chrome was not requested, use agent-browser as the default. WSL always
   routes here; WSL is not an abort condition.
4. Verify agent-browser setup and run the Phase 2 smoke test.
   - If setup and smoke test pass, use agent-browser.
   - If setup or smoke test fails and chrome MCP is connected, offer Chrome.
   - If setup or smoke test fails and Chrome is unavailable, continue to the
     CLI-only check below.
5. If neither browser engine is available and `cli_test_command` covers all
   `scored_output` areas, offer the existing CLI-only run.
6. Otherwise stop with the `/ce-setup` pointer. Do not improvise another
   browser tool.

## Chrome-Engine Resilience

Replay-before-blame is the first step after a Chrome browser verb failure. Do
not retry first. A failure attributed to the app is scored and probed, and does
not increment `disconnect_counter`.

When replay-before-blame attributes the failure to the Chrome connection:

1. Display: "Extension disconnected. Run `/chrome` and select Reconnect
   extension."
2. Increment `disconnect_counter`.
3. Record the failed verb, current area or sequence, and current
   `mcp_call_counter`.
4. If `disconnect_counter >= failover_disconnect_threshold`, freeze the
   counter and enter the failover path at the next allowed boundary.
5. If the counter is below `failover_disconnect_threshold`, continue recovery
   after reconnect.

`disconnect_counter` is cumulative for the session. At failover, freeze its
value; agent-browser failures do not add to it. At run end, append a disconnect
analysis to SIGNALS when `disconnect_counter >= failover_disconnect_threshold`.
Both the failover trigger and the run-end SIGNALS threshold read
`failover_disconnect_threshold`; do not hardcode the threshold value in prose or
logic.

The proactive Chrome reload remains separate from failover because it targets
the extension service-worker idle bug:

1. Track `mcp_call_counter` for successful Chrome browser verb invocations.
2. When the counter reaches `mcp_restart_threshold` from
   `../scripts/caps-registry.json` or test-file frontmatter, navigate to
   `app_url` as a full page reload and reset `mcp_call_counter` to 0.
3. Log: "Proactive restart at call #N to prevent connection degradation."
4. Run the reload between areas. If the threshold is reached during an area,
   finish the area first. If it is reached during a journey or cross-area probe
   sequence, defer until the whole sequence completes.
5. In iterate mode, the between-run reset counts as a restart and resets
   `mcp_call_counter`.

The proactive reload clears extension message-channel state, in-memory
JavaScript variables, and pending network requests. It does not clear cookies,
session storage, IndexedDB, or service worker caches.

JavaScript dialogs (`alert`, `confirm`, `prompt`) block browser events. If
browser commands stop responding after an action that may have opened a dialog,
instruct the user to dismiss the dialog manually before continuing.

## agent-browser Failure Rule

agent-browser failures are process or browser-control failures, not Chrome
extension disconnects. Use replay-before-blame first, then a bounded retry. Do
not maintain a call counter for agent-browser, and do not run proactive reloads
for agent-browser.

If replay-before-blame attributes the failure to agent-browser:

1. Retry the failed verb within a bounded retry policy.
2. If the retry fails and chrome MCP is connected, offer the one-time
   area-boundary switch to Chrome.
3. If the user accepts, record that both failover directions are consumed. The
   switch persists across remaining iterate-mode runs, and the next failure on
   either engine is the terminal partial-run state.
4. If Chrome is not connected, the user declines the switch, or both directions
   are already consumed, enter terminal partial-run state.

Terminal partial-run state: remaining areas get `skip_reason: engine-failure`,
completed area results are written, and commit mode is skipped under the
existing partial-run safety rules.

## Failover

Normal failover is Chrome to agent-browser, once per run, at an area boundary.
After failover, agent-browser remains the engine for all remaining areas and
remaining iterate-mode runs.

The R34 reverse switch from agent-browser to Chrome is an emergency escape
hatch, not a second normal failover direction. If accepted, mark both directions
consumed; the next engine failure on either engine enters terminal partial-run
state.

No area's evidence mixes engines. If an engine dies mid-area, mark the area as
interrupted and re-run the area from scratch on the new engine after the
boundary switch.

Journeys and cross-area probe sequences are engine-atomic:

- If failover can wait until the sequence completes, defer failover.
- If the engine failure interrupts the sequence, record the interrupted attempt,
  switch engines at the boundary, and re-run the whole sequence or journey on
  the new engine.

If the new engine reaches a login wall and its profile is not authenticated,
use the one-time login pause described below before re-running the interrupted
work.

## Replay-Before-Blame

Replay-before-blame attributes a browser verb failure before recovery:

1. If the failed verb is exempt, apply the existing rule and do not replay.
2. Run the known-good action with its own timeout budget.
3. If the known-good action succeeds within budget, attribute the original
   failure to the app: score it, generate a probe, re-establish area context,
   and continue. Do not increment `disconnect_counter`.
4. If the known-good action completes slowly, attribute it to the app as a
   timing finding, not to the connection.
5. If the known-good action fails, attribute the failure to the active engine
   connection and enter that engine's recovery path.

The default known-good action outside journeys and cross-area probe sequences is
`navigate` to `app_url`, followed by re-establishing the area context before
resuming.

During journeys and cross-area probe sequences, the default known-good action
is a non-destructive current-tab read: `read-page`, or `evaluate` when the check
needs structured DOM state. If that read fails:

1. Mark the journey or sequence interrupted.
2. Open a fresh tab and run `navigate` to `app_url` as a second-stage
   discriminator.
3. If fresh-tab navigation succeeds, attribute the original failure to the app:
   score it, generate a probe, and re-run the journey or sequence from the
   beginning under the R12/R27 atomicity rules.
4. If the current-tab read and fresh-tab navigation both fail, attribute the
   failure to the active engine connection and enter recovery.

Exemptions:

- The known-good action itself is exempt from replay. Its failure routes
  directly to connection attribution; do not start nested replay.
- Screenshot failure keeps the existing graceful-degradation behavior: continue
  and note screenshots unavailable.
- Evaluate failure keeps the existing graceful-degradation behavior:
  fall back to per-element reads or interactions where available.

## Login / Session

agent-browser supports persistent browser state with `--profile <dir>` and
`--session` / `--restore`; cookies and localStorage survive restarts. Use a
persistent profile so the first successful sign-in carries later runs and
failovers.

On the first login wall in an interactive session:

1. Pause once.
2. Relaunch agent-browser with `--headed`.
3. Instruct the user to sign in.
4. Continue after the profile has the session.

The login pause fires at most once per session. In headless or pipeline
contexts where no user can sign in, mark auth-gated areas with
`skip_reason: auth-blocked` instead of blocking.

A second login wall mid-run is a ledger anomaly. Record and disposition it
through the anomaly ledger; never score it as area quality.

## Evaluate Payloads

The payloads below are JavaScript bodies for the `evaluate` verb. On Chrome,
pass the payload to `mcp__claude-in-chrome__javascript_tool`. On agent-browser,
pass the payload to `agent-browser eval <js>` with shell-appropriate quoting.

### React-Safe Input

React uses synthetic events and controlled components. Setting `.value`
directly bypasses framework state. Use the native setter pattern for `<input>`,
`<textarea>`, and `<select>` elements in React, Vue, and other virtual-DOM
frameworks.

```javascript
const el = document.querySelector('input[name="email"]');
const setter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
).set;
setter.call(el, 'test@example.com');
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
```

### Batched DOM Reads

Batch simple DOM checks into one `evaluate` verb.

```javascript
JSON.stringify({
  submitBtn: !!document.querySelector('[type=submit]'),
  errorMsg: !!document.querySelector('.error'),
  price: document.querySelector('.price')?.textContent,
  itemCount: document.querySelectorAll('.cart-item').length
})
```

### Async Wait

Use an async wait payload when the page needs API calls, animations, or state
updates to settle before a read.

```javascript
(async () => {
  const start = Date.now();
  const timeout = 10000;
  const selector = '.success-message';
  while (Date.now() - start < timeout) {
    if (document.querySelector(selector)) return 'found';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()
```

Adapt the selector and timeout per use case:

- Success message appears: `.success-message`, `.toast`, `[role="alert"]`
- Loading spinner gone: `!document.querySelector('.spinner')`
- Data rendered: `document.querySelectorAll('.result-item').length > 0`

### Agent Response Polling

After sending a query to an AI agent chat interface, poll for response
completion instead of using fixed waits. AI agents take variable time, so fixed
waits are usually either too short or too long.

```javascript
(async () => {
  const start = Date.now();
  const timeout = 30000;
  const interval = 1000;

  while (Date.now() - start < timeout) {
    const typing = document.querySelector('.typing-indicator, .loading-spinner');
    const response = document.querySelector('.agent-response:last-child, .message:last-child');
    const chips = document.querySelector('.suggestion-chips, .quick-replies');

    if (!typing && response && response.textContent.trim().length > 20) {
      await new Promise(r => setTimeout(r, 500));
      return JSON.stringify({
        status: 'complete',
        waitedMs: Date.now() - start,
        hasChips: !!chips,
        responseLength: response.textContent.trim().length
      });
    }
    await new Promise(r => setTimeout(r, interval));
  }
  return JSON.stringify({ status: 'timeout', waitedMs: Date.now() - start });
})()
```

Parameters: 1-second poll interval, 30-second maximum. The 500ms final buffer
allows post-streaming render such as chips or formatting.

A poll timeout is not a disconnect. The evaluate verb succeeded and the agent
response is slow. Log `waitedMs` in timing data, proceed with whatever DOM state
exists, and do not increment `disconnect_counter`.

Polling selectors vary per app. On first run, discover response indicators
during exploration and document them in area details:

```markdown
**Agent response selectors:** typing=`.typing-indicator`,
response=`.chat-message:last-child`, chips=`.suggestion-chip`
```

If selectors are unknown on a first run, use a 3-second fixed wait and then
`read-page`. The read shows whether a response appeared.
