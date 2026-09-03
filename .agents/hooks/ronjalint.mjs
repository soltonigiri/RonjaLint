#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const checkScript = resolve(repoRoot, ".agents/skills/ronjalint/scripts/check.sh");
const guidancePath = resolve(
    repoRoot,
    ".agents/skills/ronjalint/references/agent-guidance.json"
);

const loadAlwaysOnInstructions = () => {
    const guidance = JSON.parse(readFileSync(guidancePath, "utf8"));
    if (
        typeof guidance.intro !== "string" ||
        !Array.isArray(guidance.workflow) ||
        !Array.isArray(guidance.scope) ||
        !Array.isArray(guidance.instructions)
    ) {
        throw new Error("Generated RonjaLint guidance is invalid.");
    }

    return [
        guidance.intro,
        "作成手順:",
        ...guidance.workflow.map((instruction, index) => `${index + 1}. ${instruction}`),
        "適用範囲:",
        ...guidance.scope.map((instruction) => `- ${instruction}`),
        "語法:",
        ...guidance.instructions.map(({ instruction }) => `- ${instruction}`)
    ].join("\n");
};

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
    try {
        writeJson({
            hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: loadAlwaysOnInstructions()
            }
        });
    } catch (error) {
        writeJson({
            systemMessage: `RonjaLint guidance could not be loaded.\n${error instanceof Error ? error.message : "Unknown error."}`
        });
    }
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
