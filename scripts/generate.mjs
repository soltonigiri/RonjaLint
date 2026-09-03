#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = resolve(repoRoot, "grammar/ronjalint.json");
const checkOnly = process.argv.includes("--check");

const spec = JSON.parse(readFileSync(specPath, "utf8"));

const generatedHeader = "Generated from grammar/ronjalint.json. Do not edit directly.";

const profileSource = `// ${generatedHeader}\n\nexport const PROFILE_DEFAULTS = ${JSON.stringify(spec.profiles, null, 4)} as const;\n\nexport type RonjaProfileName = keyof typeof PROFILE_DEFAULTS;\n`;

const guidance = {
    specVersion: spec.specVersion,
    intro: spec.agent.intro,
    workflow: spec.agent.workflow,
    scope: spec.agent.scope,
    instructions: spec.features
        .filter((feature) => typeof feature.agentInstruction === "string")
        .map((feature) => ({
            id: feature.id,
            instruction: feature.agentInstruction,
            status: feature.status
        }))
};
const guidanceSource = `${JSON.stringify(guidance, null, 2)}\n`;

const statusLabels = {
    normative: "本家で明示",
    common: "論者の一般的用法",
    contextual: "文脈限定",
    "project-policy": "RonjaLint独自方針",
    historical: "歴史的用法"
};
const mechanicalLabels = {
    error: "機械検査",
    review: "意味確認",
    none: "生成時のみ"
};

const featureSections = spec.features.map((feature) => {
    const forms = feature.forms.length > 0
        ? feature.forms.map((form) => `\`${form}\``).join("、")
        : "なし";
    const sources = feature.sources.length > 0
        ? feature.sources.map((source) => `\`${source}\``).join("、")
        : "RonjaLint独自方針";

    return [
        `### ${feature.id}`,
        "",
        `- 区分: ${statusLabels[feature.status]}`,
        `- 判定: ${mechanicalLabels[feature.mechanical]}`,
        `- 要点: ${feature.summary}`,
        `- 主な形: ${forms}`,
        `- 使う場面: ${feature.useWhen}`,
        `- 避ける場面: ${feature.avoidWhen}`,
        `- 根拠: ${sources}`,
        ""
    ].join("\n");
}).join("\n");

const referenceSource = `<!-- ${generatedHeader} -->

# ロジカル語法仕様

この文書は、役割論理専用wikiの規範記述と論者の用例を、AIチャット向けに再構成した仕様である。

## 生成手順

${spec.agent.workflow.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## 適用範囲

${spec.agent.scope.map((item) => `- ${item}`).join("\n")}

## 機能一覧

「本家で明示」と「論者の一般的用法」は同じ強さではない。「文脈限定」は、文字列が一致しても適切とは限らない。「RonjaLint独自方針」は、本家の必須規則として説明しない。

${featureSections}## 出典

${spec.sources.map((source) => `- \`${source.id}\`: [${source.title}](${source.url})（${source.kind}、${source.checkedAt}確認）`).join("\n")}
`;

const outputs = new Map([
    [resolve(repoRoot, "src/generated-profile.ts"), profileSource],
    [resolve(repoRoot, ".agents/skills/ronjalint/references/agent-guidance.json"), guidanceSource],
    [resolve(repoRoot, ".agents/skills/ronjalint/references/logical-gohou.md"), referenceSource]
]);

let mismatch = false;
for (const [path, expected] of outputs) {
    if (checkOnly) {
        const actual = existsSync(path) ? readFileSync(path, "utf8") : "";
        if (actual !== expected) {
            process.stderr.write(`${path.slice(repoRoot.length + 1)} is out of date. Run npm run generate.\n`);
            mismatch = true;
        }
        continue;
    }

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, expected);
}

if (mismatch) {
    process.exit(1);
}
