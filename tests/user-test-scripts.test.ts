import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const REPO_ROOT = path.join(__dirname, "..")
const SCRIPT = path.join(
  REPO_ROOT,
  "skills/ce-user-test/scripts/migrate-test-file.py",
)
const FIXTURES = path.join(__dirname, "fixtures/user-test")
const PYTHON = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3")

function run(
  ...args: string[]
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(PYTHON, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function tempFixture(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ce-user-test-"))
  const dest = path.join(dir, name)
  copyFileSync(path.join(FIXTURES, name), dest)
  return dest
}

function read(pathname: string): string {
  return readFileSync(pathname, "utf8")
}

function withoutSchemaVersion(text: string): string {
  return text.replace(/^schema_version:\s*\d+\r?\n/m, "")
}

function withoutSchemaVersionAndEngine(text: string): string {
  return withoutSchemaVersion(text).replace(/^engine:\s*""\r?\n/m, "")
}

function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n")
}

describe("ce-user-test migrate-test-file.py", () => {
  test("migrates a v5 test file to v12 in one pass while retaining content", () => {
    const file = tempFixture("v5.md")
    const result = run("migrate", file)

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("MIGRATED 5 -> 12")
    expect(result.stderr).toBe("")

    const migrated = read(file)
    expect(migrated).toContain("schema_version: 12")
    expect(migrated).toContain("seams_read: false")
    expect(migrated).toContain('cli_test_command: ""')
    expect(migrated).toContain('engine: ""')
    expect(migrated).toContain("mcp_restart_threshold: 15")
    expect(migrated).toContain("zip code validation still surprising")
    expect(migrated).toContain(
      "| Query | Verify | Status | Priority | Confidence | Generated From | Run History | Related Bug |",
    )
    expect(migrated).toContain(
      "| \"ship to 00000\" | Inline error shown | failing | P1 | high | verification failure: invalid zip accepted | F,F | unlinked |",
    )
    expect(migrated).toContain(
      "| \"estimate international shipping\" | Helpful unsupported-region message | untested | P2 | high | score-based: low quality on shipping estimate |  | unlinked |",
    )
    expect(migrated).toContain(
      "| Query | Ideal Outcome | Check | Status | Notes |",
    )
    expect(migrated).toContain(
      "| \"ship this to 00000\" | Reject invalid zip code | Validation copy visible | active |  |",
    )
    expect(migrated).toContain("## Cross-Area Probes")
    expect(migrated).toContain("## Journeys")
  })

  test("migrates a v10 test file to v12 by changing only version and engine frontmatter", () => {
    const file = tempFixture("v10.md")
    const before = read(file)

    const result = run("migrate", file)

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("MIGRATED 10 -> 12")
    const migrated = read(file)
    expect(migrated).toContain("schema_version: 12")
    expect(migrated).toContain('engine: ""')
    expect(withoutSchemaVersionAndEngine(migrated)).toBe(withoutSchemaVersion(before))
  })

  test("schema_version 99 is UNKNOWN-VERSION and leaves bytes untouched", () => {
    const file = tempFixture("current-v11.md")
    const before = read(file).replace("schema_version: 11", "schema_version: 99")
    writeFileSync(file, before)

    const result = run("migrate", file)

    expect(result.code).toBe(1)
    expect(result.stdout.trim()).toBe("UNKNOWN-VERSION 99")
    expect(read(file)).toBe(before)
  })

  test("already-current v12 file returns CURRENT without bytes or mtime churn", () => {
    const file = tempFixture("current-v11.md")
    writeFileSync(
      file,
      read(file)
        .replace("schema_version: 11", "schema_version: 12")
        .replace('cli_test_command: ""\n', 'cli_test_command: ""\nengine: ""\n'),
    )
    const before = readFileSync(file)
    const beforeStat = statSync(file)

    const result = run("migrate", file)

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("CURRENT")
    expect(readFileSync(file)).toEqual(before)
    expect(statSync(file).mtimeMs).toBe(beforeStat.mtimeMs)
  })

  test("unknown frontmatter, unknown table columns, and custom sections survive migration", () => {
    const file = tempFixture("unknown-content.md")
    const result = run("migrate", file)

    expect(result.code).toBe(0)
    const migrated = read(file)
    expect(migrated).toContain("future_key: keep-me")
    expect(migrated).toContain("Mystery")
    expect(migrated).toContain("hidden-cell")
    expect(normalizeEol(migrated)).toContain(`## Custom Notes

This custom section is user-authored.
It must remain byte-for-byte within the migrated file body.`)
  })

  test("absent schema_version is CORRUPT and leaves bytes untouched", () => {
    const file = tempFixture("corrupt-missing-schema.md")
    const before = readFileSync(file)

    const result = run("migrate", file)

    expect(result.code).toBe(1)
    expect(result.stdout.startsWith("CORRUPT ")).toBe(true)
    expect(readFileSync(file)).toEqual(before)
  })

  test("CRLF input remains CRLF after migration", () => {
    const file = tempFixture("crlf-v5.md")
    const before = readFileSync(file, "utf8")
    expect(before).toContain("\r\n")

    const result = run("migrate", file)

    expect(result.code).toBe(0)
    const migrated = readFileSync(file, "utf8")
    expect(migrated).toContain("\r\n")
    expect(migrated.replace(/\r\n/g, "")).not.toContain("\n")
  })

  test("v1 missing optional sections gains empty current defaults", () => {
    const file = tempFixture("v1-minimal.md")
    const result = run("migrate", file)

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("MIGRATED 1 -> 12")
    const migrated = read(file)
    expect(migrated).toContain("schema_version: 12")
    expect(migrated).toContain('cli_test_command: ""')
    expect(migrated).toContain('engine: ""')
    expect(migrated).toContain("seams_read: false")
    expect(migrated).toContain("mcp_restart_threshold: 15")
    expect(migrated).toContain(
      "| Area | Status | Last Score | Last Quality | Last Time | Consecutive Passes | Notes |",
    )
    expect(migrated).toContain(
      "| Date | Areas Tested | Quality Avg | Delta | Pass Rate | Best Area | Worst Area | Demo Ready | Context | Key Finding |",
    )
    expect(migrated).toContain("## Area Trends")
    expect(migrated).toContain("## UX Opportunities Log")
    expect(migrated).toContain("## Good Patterns")
    expect(migrated).toContain("## Cross-Area Probes")
    expect(migrated).toContain("## Journeys")
  })

  test("v1 missing the maturity map is CORRUPT and leaves bytes untouched", () => {
    const file = tempFixture("v1-no-maturity-map.md")
    const before = readFileSync(file)

    const result = run("migrate", file)

    expect(result.code).toBe(1)
    expect(result.stdout.startsWith("CORRUPT ")).toBe(true)
    expect(readFileSync(file)).toEqual(before)
  })

  test("v9 fixture migrates to v12 without losing journey-era content", () => {
    const file = tempFixture("v9.md")
    const result = run("migrate", file)

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("MIGRATED 9 -> 12")
    const migrated = read(file)
    expect(migrated).toContain("schema_version: 12")
    expect(migrated).toContain("## Journeys")
    expect(migrated).toContain('cli_test_command: ""')
    expect(migrated).toContain('engine: ""')
    expect(migrated).toContain("avatar save works")
  })

  test("v11 migration fills default engine frontmatter and preserves chrome opt-in", () => {
    const defaultFile = tempFixture("current-v11.md")
    const defaultResult = run("migrate", defaultFile)

    expect(defaultResult.code).toBe(0)
    expect(defaultResult.stdout.trim()).toBe("MIGRATED 11 -> 12")
    expect(read(defaultFile)).toContain('engine: ""')

    const chromeFile = tempFixture("current-v11.md")
    writeFileSync(
      chromeFile,
      read(chromeFile).replace(/cli_test_command: ""(\r?\n)/, 'cli_test_command: ""$1engine: "chrome"$1'),
    )

    const chromeResult = run("migrate", chromeFile)

    expect(chromeResult.code).toBe(0)
    expect(chromeResult.stdout.trim()).toBe("MIGRATED 11 -> 12")
    expect(read(chromeFile)).toContain('engine: "chrome"')
  })

  test("migrate-run-json normalizes a v7-era last-run JSON", () => {
    const file = tempFixture("last-run-v7.json")
    const result = run("migrate-run-json", file)

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("MIGRATED-RUN-JSON")
    const migrated = JSON.parse(read(file))
    expect(migrated.novelty_fingerprints).toEqual({})
    expect(migrated.novelty_log).toEqual([])
    expect(migrated.journeys_run).toEqual([])
    expect(migrated.areas[0].tactical_note).toBeNull()
    expect(migrated.areas[0].confirmed_selectors).toEqual({})
    expect(migrated.areas[0].weakness_class).toBeNull()
    expect(migrated.areas[0].adversarial_browser).toBe(false)
    expect(migrated.areas[0].adversarial_trigger).toBeNull()
    expect(migrated.areas[0].evidence).toEqual([])
    expect(migrated.areas[0].engine).toBeNull()
    expect(migrated.areas[0].engine_failure_attempts).toEqual([])
    expect(migrated.anomalies).toEqual([])
    expect(migrated.final_execution_index).toBeNull()
    expect(migrated.schema_version).toBe(12)
    expect(migrated.migration_defaults_applied).toEqual([
      "areas[].evidence",
      "anomalies[]",
      "final_execution_index",
      "areas[].engine",
      "areas[].engine_failure_attempts",
      "schema_version",
    ])
    expect("execution_index" in migrated.probes_run[0]).toBe(false)
  })

  test("migrate-run-json migrates v11 input to v12 engine defaults", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ce-user-test-"))
    const file = path.join(dir, ".user-test-last-run.json")
    const before = {
      run_timestamp: "2026-06-20T12:00:00Z",
      schema_version: 11,
      completed: true,
      scenario_slug: "checkout-quality",
      areas: [
        {
          slug: "checkout/cart",
          ux_score: 4,
          quality_score: null,
          evidence: [
            { type: "action", ref: 1, note: "cart update supported the score" },
          ],
        },
      ],
      anomalies: [
        {
          area: "checkout/cart",
          kind: "anomaly",
          what: "toast lingered after save",
          evidence: [{ type: "timing", ref: 8, note: "toast duration" }],
          index_range: [1, 2],
          disposition: "explore-next-run",
        },
      ],
      journeys_run: [
        {
          id: "J001",
          name: "Primary user flow",
          status: "interrupted",
          checkpoints: [{ step: 1, area: "checkout/cart", passed: false }],
        },
      ],
    }
    writeFileSync(file, JSON.stringify(before, null, 2) + "\n")

    const result = run("migrate-run-json", file)

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe("MIGRATED-RUN-JSON")
    const migrated = JSON.parse(read(file))
    expect(migrated.migration_defaults_applied).toEqual([
      "final_execution_index",
      "areas[].engine",
      "areas[].engine_failure_attempts",
      "journeys_run[].engine_failure_attempts",
      "schema_version",
    ])
    expect(migrated.areas[0].evidence).toEqual(before.areas[0].evidence)
    expect(migrated.areas[0].engine).toBeNull()
    expect(migrated.areas[0].engine_failure_attempts).toEqual([])
    expect(migrated.anomalies).toEqual(before.anomalies)
    expect(migrated.journeys_run[0].engine_failure_attempts).toEqual([])
    expect(migrated.final_execution_index).toBeNull()
    expect(migrated.schema_version).toBe(12)
  })

  test("migrate-run-json rejects future schema versions without rewriting", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ce-user-test-"))
    const file = path.join(dir, ".user-test-last-run.json")
    const before = {
      run_timestamp: "2026-06-20T12:00:00Z",
      schema_version: 13,
      completed: true,
      scenario_slug: "checkout-quality",
      areas: [{ slug: "checkout/cart" }],
    }
    writeFileSync(file, JSON.stringify(before, null, 2) + "\n")

    const result = run("migrate-run-json", file)

    expect(result.code).toBe(1)
    expect(result.stdout.trim()).toBe("UNKNOWN-VERSION 13")
    expect(JSON.parse(read(file))).toEqual(before)
  })

  test("migrate-run-json refuses unrecognized shape without guessing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ce-user-test-"))
    const file = path.join(dir, ".user-test-last-run.json")
    const before = '{"completed":true,"areas":"not-an-array"}\n'
    writeFileSync(file, before)

    const result = run("migrate-run-json", file)

    expect(result.code).toBe(1)
    expect(result.stdout.startsWith("CORRUPT ")).toBe(true)
    expect(read(file)).toBe(before)
  })

  test("usage errors exit 2", () => {
    expect(run().code).toBe(2)
    expect(run("migrate").code).toBe(2)
    expect(run("migrate-run-json").code).toBe(2)
    expect(run("unknown", "file").code).toBe(2)
  })
})
