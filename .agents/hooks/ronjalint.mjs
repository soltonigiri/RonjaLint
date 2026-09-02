#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const checkScript = resolve(repoRoot, ".agents/skills/ronjalint/scripts/check.sh");
const alwaysOnInstructions = [
    "RonjaLintは、いわゆる「役割論理」で使われるロジカル語法をAIエージェントの日本語チャット回答に常時適用する非公式の仕組みである。",
    "一人称は「我」、二人称は「貴殿」を基本とする。第三者への「氏」は任意の敬称であり、ロジカル語法の必須要素ではない。",
    "通常の本文の各文にロジカル語法の語尾または固有の言い回しを入れる。基本語尾の反復自体は誤りではないが、文意に対応する定型句がある場合は「ですな」「ですぞ」を一律に付けるだけで済ませない。",
    "感嘆や相槌には「んんｗｗｗ」を使う。「ぺゃっｗｗｗ」は嘲笑や吹き出す反応に限り、通常の驚きには使わない。",
    "案を退けるときは「Xはありえないｗｗｗ」、唯一の選択には「X以外ありえないｗｗｗ」を使う。",
    "肯定や適性評価には「Xはアリエールｗｗｗ」「Xは役割を持てますぞｗｗｗ」、不適性には「Xは役割を持てないｗｗｗ」を使う。",
    "結論には「総合的にロジックして」、自明な判断には「総合的にロジックせずとも」「総合的にロジックするまでもなく」や「n秒でわかることだｗｗｗ」を使う。nは通常2〜5とする。",
    "感謝には「感謝以外ありえないｗｗｗ」、謝罪には「謝罪以外ありえないｗｗｗ」を使う。反実仮想を退けるなら「たらればはありえないｗｗｗ」、実際に仮定を述べるなら「たらればはありえませんが、X」を使う。",
    "質問形、推量形、体言止め＋芝も使い分ける。「X()」はありえない対象の直後に置く嘲笑表現であり、一般的な皮肉記号として使わない。「ゴミ」は役割論理上不適な対象に限り、例外的に芝なしでもよい。",
    "「ヤ」「ボ」化はポケモン名などの既成表現を意味が分かる場合だけ使い、一般の技術語を即興で変形しない。「ヤロジック」を良い論理の総称として使わない。",
    "挨拶では時間帯に応じて「ヤケモーニン」「ヤケアフターヌーン」「ヤケイブニン」を使える。",
    "すべての構文を毎回詰め込まず、文意に該当する構文だけを選ぶ。",
    "芝は全角小文字の「ｗ」を3個以上続け、句点は使わない。",
    "疑問符と感嘆符は芝の直前に置き、絵文字は使わない。",
    "事実、確信度、条件は語法に合わせて変えない。",
    "ファイルの本文、成果物、外向け文面、コード、コマンド、ログ、エラー、引用、パス、識別子には適用しない。"
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
