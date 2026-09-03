import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installer = resolve(repoRoot, "scripts/install-agent.mjs");

const withTemporaryProject = (callback) => {
    const target = mkdtempSync(resolve(tmpdir(), "ronjalint-install-"));
    try {
        callback(target);
    } finally {
        rmSync(target, { recursive: true, force: true });
    }
};

const runInstaller = (target, ...arguments_) => spawnSync(
    process.execPath,
    [installer, ...arguments_, "--target", target],
    { cwd: repoRoot, encoding: "utf8" }
);

test("installs only the on-demand Skill", () => {
    withTemporaryProject((target) => {
        const result = runInstaller(target, "--skill");

        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(resolve(target, ".agents/skills/ronjalint/SKILL.md")), true);
        assert.equal(existsSync(resolve(target, ".agents/hooks/ronjalint.mjs")), false);
        assert.equal(existsSync(resolve(target, ".codex/hooks.json")), false);
    });
});

test("installs Hooks with their Skill and preserves existing configuration", () => {
    withTemporaryProject((target) => {
        const configPath = resolve(target, ".codex/hooks.json");
        mkdirSync(dirname(configPath), { recursive: true });
        writeFileSync(configPath, `${JSON.stringify({
            description: "Existing hooks",
            hooks: {
                Stop: [
                    {
                        hooks: [
                            { type: "command", command: "node existing.mjs" }
                        ]
                    }
                ]
            }
        }, null, 2)}\n`);

        const result = runInstaller(target, "--hooks");
        const config = JSON.parse(readFileSync(configPath, "utf8"));

        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(resolve(target, ".agents/skills/ronjalint/SKILL.md")), true);
        assert.equal(existsSync(resolve(target, ".agents/hooks/ronjalint.mjs")), true);
        assert.equal(config.description, "Existing hooks");
        assert.equal(config.hooks.Stop[0].hooks[0].command, "node existing.mjs");
        assert.equal(config.hooks.Stop.length, 2);
        assert.equal(config.hooks.SessionStart.length, 1);

        const hookResult = spawnSync(
            process.execPath,
            [resolve(target, ".agents/hooks/ronjalint.mjs")],
            {
                cwd: target,
                encoding: "utf8",
                input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" })
            }
        );
        const hookOutput = JSON.parse(hookResult.stdout);

        assert.equal(hookResult.status, 0, hookResult.stderr);
        assert.match(hookOutput.hookSpecificOutput.additionalContext, /役割論理/u);

        const reinstall = runInstaller(target, "--hooks", "--force");
        const reinstalledConfig = JSON.parse(readFileSync(configPath, "utf8"));

        assert.equal(reinstall.status, 0, reinstall.stderr);
        assert.equal(reinstalledConfig.hooks.Stop.length, 2);
        assert.equal(reinstalledConfig.hooks.SessionStart.length, 1);
    });
});

test("refuses to overwrite an existing RonjaLint installation without --force", () => {
    withTemporaryProject((target) => {
        const skillPath = resolve(target, ".agents/skills/ronjalint");
        mkdirSync(skillPath, { recursive: true });
        writeFileSync(resolve(skillPath, "local.txt"), "keep\n");

        const result = runInstaller(target, "--skill");

        assert.equal(result.status, 2);
        assert.match(result.stderr, /--force/u);
        assert.equal(readFileSync(resolve(skillPath, "local.txt"), "utf8"), "keep\n");
    });
});

test("--force replaces stale Skill files", () => {
    withTemporaryProject((target) => {
        const skillPath = resolve(target, ".agents/skills/ronjalint");
        mkdirSync(skillPath, { recursive: true });
        writeFileSync(resolve(skillPath, "stale.txt"), "remove\n");

        const result = runInstaller(target, "--skill", "--force");

        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(resolve(skillPath, "stale.txt")), false);
        assert.equal(existsSync(resolve(skillPath, "SKILL.md")), true);
    });
});

test("--dry-run reports all Hook files without changing the target", () => {
    withTemporaryProject((target) => {
        const result = runInstaller(target, "--hooks", "--dry-run");

        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /.agents\/skills\/ronjalint/u);
        assert.match(result.stdout, /.agents\/hooks\/ronjalint.mjs/u);
        assert.match(result.stdout, /.codex\/hooks.json/u);
        assert.equal(existsSync(resolve(target, ".agents")), false);
        assert.equal(existsSync(resolve(target, ".codex")), false);
    });
});
