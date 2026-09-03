import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hookPath = resolve(repoRoot, ".agents/hooks/ronjalint.mjs");
const guidancePath = resolve(
    repoRoot,
    ".agents/skills/ronjalint/references/agent-guidance.json"
);

const runHook = (event) => {
    const result = spawnSync(process.execPath, [hookPath], {
        cwd: repoRoot,
        encoding: "utf8",
        input: JSON.stringify(event)
    });

    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
};

test("hook configuration enables SessionStart and Stop", () => {
    const config = JSON.parse(readFileSync(resolve(repoRoot, ".codex/hooks.json"), "utf8"));

    assert.equal(config.hooks.SessionStart[0].hooks[0].type, "command");
    assert.equal(config.hooks.Stop[0].hooks[0].type, "command");
});

test("SessionStart adds the always-on style instructions", () => {
    const output = runHook({ hook_event_name: "SessionStart", source: "startup" });
    const guidance = JSON.parse(readFileSync(guidancePath, "utf8"));
    const context = output.hookSpecificOutput.additionalContext;

    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(context.startsWith(guidance.intro), true);
    for (const instruction of [
        ...guidance.workflow,
        ...guidance.scope,
        ...guidance.instructions.map((item) => item.instruction)
    ]) {
        assert.equal(context.includes(instruction), true, instruction);
    }
});

test("Stop accepts a valid response", () => {
    assert.deepEqual(
        runHook({
            hook_event_name: "Stop",
            stop_hook_active: false,
            last_assistant_message: "我の結論では、この設定が妥当ですなｗｗｗ"
        }),
        {}
    );
});

test("Stop continues an invalid response with diagnostics", () => {
    const output = runHook({
        hook_event_name: "Stop",
        stop_hook_active: false,
        last_assistant_message: "私はこの設定が妥当だと思います。"
    });

    assert.equal(output.decision, "block");
    assert.match(output.reason, /RonjaLintの指摘/u);
});

test("Stop accepts canonical repetition of basic endings", () => {
    assert.deepEqual(runHook({
        hook_event_name: "Stop",
        stop_hook_active: false,
        last_assistant_message: [
            "差分を確認しましたなｗｗｗ",
            "テストも通りましたなｗｗｗ",
            "公開準備も整いましたなｗｗｗ"
        ].join("\n")
    }), {});
});

test("Stop continues a response with an unmarked hard-break utterance", () => {
    const output = runHook({
        hook_event_name: "Stop",
        stop_hook_active: false,
        last_assistant_message: "これは通常の説明文  \n結論ですぞｗｗｗ"
    });

    assert.equal(output.decision, "block");
    assert.match(output.reason, /通常の本文の各発話/u);
});

test("Stop accepts a soft-wrapped utterance", () => {
    assert.deepEqual(runHook({
        hook_event_name: "Stop",
        stop_hook_active: false,
        last_assistant_message: "我の結論では、この設定は\n妥当ですなｗｗｗ"
    }), {});
});

test("Stop checks prose list items", () => {
    const output = runHook({
        hook_event_name: "Stop",
        stop_hook_active: false,
        last_assistant_message: "- この案を採用します"
    });

    assert.equal(output.decision, "block");
    assert.match(output.reason, /通常の本文の各発話/u);
});

test("Stop does not continue twice", () => {
    assert.deepEqual(
        runHook({
            hook_event_name: "Stop",
            stop_hook_active: true,
            last_assistant_message: "通常の文章です。"
        }),
        {}
    );
});
