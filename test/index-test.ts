import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TextlintKernelDescriptor } from "@textlint/kernel";
import markdownPlugin from "@textlint/textlint-plugin-markdown";
import { createLinter } from "textlint";
import rule, { type Options } from "../src/index";

const lintMessages = async (text: string, options: Options = {}): Promise<string[]> => {
    const descriptor = new TextlintKernelDescriptor({
        rules: [
            {
                ruleId: "ronjalint",
                rule,
                options
            }
        ],
        plugins: [
            {
                pluginId: "markdown",
                plugin: markdownPlugin,
                options: true
            }
        ],
        filterRules: []
    });
    const linter = createLinter({ descriptor });
    const result = await linter.lintText(text, "reply.md");
    return result.messages.map((message) => message.message);
};

test("accepts representative Logical Gohou responses", async () => {
    const validCases: Array<{ text: string; options?: Options }> = [
        { text: "我の結論では、この設定が妥当ですなｗｗｗ" },
        { text: "貴殿の案を採用する以外ありえないｗｗｗｗ" },
        { text: "んんｗｗｗ" },
        { text: "いかがでしたかな？ｗｗｗ" },
        { text: "細かいですがなｗｗｗ" },
        { text: "この条件なら十分でしょうなｗｗｗ" },
        { text: "検証済みですからなｗｗｗ" },
        { text: "この形でも問題ありませんがなｗｗｗ" },
        { text: "検証完了ｗｗｗ" },
        { text: "（補足ですぞｗｗｗ）" },
        {
            text: "我の結論は以上ですYOｗｗｗ",
            options: {
                acceptedEndings: ["ですYO"],
                minGrass: 3
            }
        },
        {
            text: "`www.example.com` は検査対象外ですぞｗｗｗ\n\n> 私は通常の文章です。😀www\n\n我の結論は変わりませんなｗｗｗ"
        },
        {
            text: "Windows、W3C、https://www.example.com/path を確認しますぞｗｗｗ"
        },
        {
            text: "私有地と俺流という語を例示しますぞｗｗｗ"
        }
    ];

    for (const validCase of validCases) {
        assert.deepEqual(await lintMessages(validCase.text, validCase.options), []);
    }
});

test("reports mechanically detectable style violations", async () => {
    const invalidCases: Array<{ text: string; options?: Options; messages: string[] }> = [
        {
            text: "これは半角芝ですなwww",
            options: { requireLogicalEnding: false },
            messages: ["芝には全角小文字の「ｗ」だけを使ってください。"]
        },
        {
            text: "これは大文字芝ですなＷＷＷ",
            options: { requireLogicalEnding: false },
            messages: ["芝には全角小文字の「ｗ」だけを使ってください。"]
        },
        {
            text: "芝が不足していますなｗｗ",
            messages: ["芝は3個以上続けてください。"]
        },
        {
            text: "句点は不要ですなｗｗｗ。",
            messages: ["ロジカル語法では句点を使わず、芝で文を区切ってください。"]
        },
        {
            text: "これは通常の敬語です。",
            messages: [
                "文章を全角小文字の「ｗ」3個以上で終えてください。",
                "ロジカル語法では句点を使わず、芝で文を区切ってください。"
            ]
        },
        {
            text: "絵文字は使いませんな😀ｗｗｗ",
            messages: ["純粋なロジカル語法では絵文字を使用しません。"]
        },
        {
            text: "最小値を変更しますなｗｗｗ",
            options: { minGrass: 4 },
            messages: ["芝は4個以上続けてください。"]
        },
        {
            text: "混在芝は不可ですなｗwｗ",
            messages: ["芝には全角小文字の「ｗ」だけを使ってください。"]
        },
        {
            text: "疑問符の位置が逆ですかなｗｗｗ？",
            messages: ["疑問符と感嘆符は芝の前に置いてください。"]
        },
        {
            text: "途中の質問だけ通常ですか？結論はこちらですなｗｗｗ",
            messages: ["疑問符と感嘆符の直後には芝を置いてください。"]
        },
        {
            text: "途中の感嘆文だけ通常です！結論はこちらですぞｗｗｗ",
            messages: ["疑問符と感嘆符の直後には芝を置いてください。"]
        },
        {
            text: "途中に通常文があります。結論はこちらですなｗｗｗ",
            messages: ["ロジカル語法では句点を使わず、芝で文を区切ってください。"]
        },
        {
            text: "ASCII句点も不可です. 結論ですぞｗｗｗ",
            messages: ["ロジカル語法では句点を使わず、芝で文を区切ってください。"]
        },
        {
            text: "旗も使いませんな🇯🇵ｗｗｗ",
            messages: ["純粋なロジカル語法では絵文字を使用しません。"]
        },
        {
            text: "キーキャップも使いませんな1️⃣ｗｗｗ",
            messages: ["純粋なロジカル語法では絵文字を使用しません。"]
        },
        {
            text: "私はこの設定を採用しますなｗｗｗ",
            messages: ["一人称には「我」を使ってください。"]
        },
        {
            text: "あなたの案を確認しますぞｗｗｗ",
            messages: ["二人称には「貴殿」を使ってください。"]
        }
    ];

    for (const invalidCase of invalidCases) {
        assert.deepEqual(await lintMessages(invalidCase.text, invalidCase.options), invalidCase.messages);
    }
});

test("does not treat a plain URL as grass", async () => {
    assert.deepEqual(
        await lintMessages("www.example.com を確認しました", {
            requireLogicalEnding: false
        }),
        []
    );
});

test("allows disabling only the final-grass requirement", async () => {
    assert.deepEqual(
        await lintMessages("途中に句点があります。", {
            requireLogicalEnding: false
        }),
        ["ロジカル語法では句点を使わず、芝で文を区切ってください。"]
    );
});

test("keeps acceptedEndings as an optional strict restriction", async () => {
    assert.deepEqual(
        await lintMessages("自由な語尾ですなｗｗｗ", {
            acceptedEndings: ["ですぞ"]
        }),
        ["文章を指定されたロジカル語尾と3個以上の芝で終えてください。"]
    );
    assert.deepEqual(
        await lintMessages("指定された語尾ですぞｗｗｗ", {
            acceptedEndings: ["ですぞ"]
        }),
        []
    );
});

test("allows conservative pronoun checks to be disabled", async () => {
    assert.deepEqual(
        await lintMessages("私はこの設定を採用しますなｗｗｗ", {
            checkPronouns: false
        }),
        []
    );
});

test("rejects invalid options", async () => {
    await assert.rejects(
        lintMessages("確認しますぞｗｗｗ", { minGrass: 0 }),
        /minGrass must be an integer greater than or equal to 1/u
    );
    await assert.rejects(
        lintMessages("確認しますぞｗｗｗ", { acceptedEndings: [] }),
        /acceptedEndings must contain at least one non-empty string when specified/u
    );
    await assert.rejects(
        lintMessages("確認しますぞｗｗｗ", { acceptedEndings: ["   "] }),
        /acceptedEndings must contain at least one non-empty string when specified/u
    );
    await assert.rejects(
        lintMessages("確認しますぞｗｗｗ", {
            checkPronouns: "yes"
        } as unknown as Options),
        /checkPronouns must be a boolean/u
    );
});

test("keeps the distributed examples in sync with the rule", async () => {
    const validExample = await readFile(new URL("../examples/valid.md", import.meta.url), "utf8");
    const invalidExample = await readFile(new URL("../examples/invalid.md", import.meta.url), "utf8");

    assert.deepEqual(await lintMessages(validExample), []);

    const invalidMessages = await lintMessages(invalidExample);
    const expectedMessages = [
        "一人称には「我」を使ってください。",
        "純粋なロジカル語法では絵文字を使用しません。",
        "芝には全角小文字の「ｗ」だけを使ってください。",
        "芝には全角小文字の「ｗ」だけを使ってください。",
        "ロジカル語法では句点を使わず、芝で文を区切ってください。",
        "疑問符と感嘆符は芝の前に置いてください。",
        "疑問符と感嘆符の直後には芝を置いてください。"
    ];
    assert.deepEqual(invalidMessages.toSorted(), expectedMessages.toSorted());
});
