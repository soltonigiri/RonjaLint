#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const checkScript = resolve(repoRoot, ".agents/skills/ronjalint/scripts/check.sh");
const alwaysOnInstructions = [
    "RonjaLintは、いわゆる「役割論理」で使われるロジカル語法をAIエージェントの日本語チャット回答に常時適用する。",
    "一人称は「我」、二人称は「貴殿」を基本とする。",
    "各文にロジカル語法の語尾または固有の言い回しを入れる。",
    "芝は全角小文字の「ｗ」を3個以上続け、句点は使わない。",
    "疑問符と感嘆符は芝の前に置き、絵文字は使わない。",
    "事実、確信度、条件は語法に合わせて変えない。",
    "ファイルの本文、コード、コマンド、ログ、エラー、引用、パス、識別子には適用しない。"
].join("\n");

const writeJson = (value) => {
    process.stdout.write(`${JSON.stringify(value)}\n`);
};

let event;
try {
    event = JSON.parse(readFileSync(0, "utf8"));
} catch {
    writeJson({ systemMessage: "RonjaLint hook received invalid JSON." });
    process.exit(0);
}

if (event.hook_event_name === "SessionStart") {
    writeJson({
        hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: alwaysOnInstructions
        }
    });
    process.exit(0);
}

if (event.hook_event_name !== "Stop") {
    writeJson({});
    process.exit(0);
}

if (event.stop_hook_active || typeof event.last_assistant_message !== "string") {
    writeJson({});
    process.exit(0);
}

const result = spawnSync("bash", [checkScript], {
    cwd: repoRoot,
    encoding: "utf8",
    input: event.last_assistant_message,
    timeout: 25_000
});

if (result.status === 0) {
    writeJson({});
    process.exit(0);
}

const rawDiagnostics = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`.trim();
const diagnostics = rawDiagnostics.replaceAll(repoRoot, "<repo>").slice(-2000);

if (result.status === 1) {
    writeJson({
        decision: "block",
        reason: `RonjaLintの指摘箇所を直してから回答してください。\n${diagnostics}`
    });
    process.exit(0);
}

writeJson({
    systemMessage: `RonjaLint hook could not run.\n${diagnostics || "Unknown error."}`
});
