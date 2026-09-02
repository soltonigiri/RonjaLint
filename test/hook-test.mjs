import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hookPath = resolve(repoRoot, ".agents/hooks/ronjalint.mjs");

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

    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(output.hookSpecificOutput.additionalContext, /RonjaLint/u);
    assert.match(output.hookSpecificOutput.additionalContext, /役割論理/u);
    assert.match(output.hookSpecificOutput.additionalContext, /絵文字は使わない/u);
    assert.match(output.hookSpecificOutput.additionalContext, /基本語尾の反復自体は誤りではない/u);
    assert.match(output.hookSpecificOutput.additionalContext, /一律に付けるだけで済ませない/u);
    assert.match(output.hookSpecificOutput.additionalContext, /んんｗｗｗ/u);
    assert.match(output.hookSpecificOutput.additionalContext, /ぺゃっｗｗｗ.*嘲笑/u);
    assert.match(output.hookSpecificOutput.additionalContext, /以外ありえないｗｗｗ/u);
    assert.match(output.hookSpecificOutput.additionalContext, /役割を持て/u);
    assert.match(output.hookSpecificOutput.additionalContext, /総合的にロジックして/u);
    assert.match(output.hookSpecificOutput.additionalContext, /n秒でわかることだｗｗｗ/u);
    assert.match(output.hookSpecificOutput.additionalContext, /nは通常2〜5/u);
    assert.match(output.hookSpecificOutput.additionalContext, /技術語を即興で変形しない/u);
    assert.match(output.hookSpecificOutput.additionalContext, /ヤロジック.*総称として使わない/u);
    assert.match(output.hookSpecificOutput.additionalContext, /疑問符と感嘆符は芝の直前/u);
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

test("Stop continues a response with an unmarked prose line", () => {
    const output = runHook({
        hook_event_name: "Stop",
        stop_hook_active: false,
        last_assistant_message: "これは通常の説明文\n結論ですぞｗｗｗ"
    });

    assert.equal(output.decision, "block");
    assert.match(output.reason, /通常の本文の各行/u);
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
