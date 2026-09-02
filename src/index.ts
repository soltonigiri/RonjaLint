import type { TextlintRuleModule } from "@textlint/types";
import emojiRegex from "emoji-regex";
import { RuleHelper } from "textlint-rule-helper";

export interface Options {
    /** Minimum number of consecutive full-width lowercase grass characters. */
    minGrass?: number;
    /** Require visible prose to end with a valid grass run. */
    requireLogicalEnding?: boolean;
    /** Optionally restrict the suffix immediately before the final grass run. */
    acceptedEndings?: string[];
    /** Report clear first- and second-person pronouns outside Logical Gohou. */
    checkPronouns?: boolean;
}

const grassRunPattern = /[wWＷｗ]+/gu;
const japaneseCharacterPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const firstPersonPattern = /(?:私|僕|俺)(?=(?:自身|たち|達|ら)?(?:は|が|の|も|を|に|なら|として|です|でした|だ|で|、|,|\s|$))/gu;
const secondPersonPattern = /(?:あなた|貴方|お前)(?=(?:自身|たち|達|ら)?(?:は|が|の|も|を|に|なら|として|です|でした|だ|で|、|,|\s|$))/gu;
const trailingClosingDelimiterPattern = /[」』）)】〉》〕］｝\]]+$/u;

const isGrassLike = (text: string, index: number, value: string): boolean => {
    if (/[Ｗｗ]/u.test(value)) {
        return true;
    }

    const previous = text[index - 1] ?? "";
    const next = text[index + value.length] ?? "";

    if (previous === "." || next === ".") {
        return false;
    }
    if (/[A-Za-z0-9_]/u.test(previous) || /[A-Za-z0-9_]/u.test(next)) {
        return false;
    }
    return value.length >= 2 || japaneseCharacterPattern.test(previous);
};

const isAsciiSentencePeriod = (text: string, index: number): boolean => {
    const previous = text[index - 1] ?? "";
    const next = text[index + 1] ?? "";

    if (previous === "." || next === ".") {
        return false;
    }
    return /[wWＷｗ]/u.test(previous) || japaneseCharacterPattern.test(previous);
};

const stripTrailingClosingDelimiters = (text: string): string => {
    let result = text.trimEnd();
    while (trailingClosingDelimiterPattern.test(result)) {
        result = result.replace(trailingClosingDelimiterPattern, "").trimEnd();
    }
    return result;
};

const report: TextlintRuleModule<Options> = (context, options = {}) => {
    const { Syntax, RuleError, report, getSource, locator } = context;
    const helper = new RuleHelper(context);
    const minGrass = options.minGrass ?? 3;
    const requireLogicalEnding = options.requireLogicalEnding ?? true;
    const acceptedEndings = options.acceptedEndings;
    const checkPronouns = options.checkPronouns ?? true;
    const visibleTexts: string[] = [];

    if (!Number.isInteger(minGrass) || minGrass < 1) {
        throw new Error("minGrass must be an integer greater than or equal to 1.");
    }
    if (typeof requireLogicalEnding !== "boolean") {
        throw new Error("requireLogicalEnding must be a boolean.");
    }
    if (typeof checkPronouns !== "boolean") {
        throw new Error("checkPronouns must be a boolean.");
    }
    if (
        acceptedEndings !== undefined &&
        (!Array.isArray(acceptedEndings) ||
            acceptedEndings.length === 0 ||
            acceptedEndings.some((ending) => typeof ending !== "string" || ending.trim().length === 0))
    ) {
        throw new Error("acceptedEndings must contain at least one non-empty string when specified.");
    }

    const ignoredNodeTypes = [
        Syntax.BlockQuote,
        Syntax.Link,
        Syntax.LinkReference,
        Syntax.Image,
        Syntax.ImageReference,
        Syntax.Code
    ];

    return {
        [Syntax.Str](node) {
            if (helper.isChildNode(node, ignoredNodeTypes)) {
                return;
            }

            const text = getSource(node);
            visibleTexts.push(text);

            for (const match of text.matchAll(grassRunPattern)) {
                const index = match.index ?? 0;
                const value = match[0];
                if (!isGrassLike(text, index, value)) {
                    continue;
                }

                if ([...value].some((character) => character !== "ｗ")) {
                    report(
                        node,
                        new RuleError("芝には全角小文字の「ｗ」だけを使ってください。", {
                            padding: locator.range([index, index + value.length])
                        })
                    );
                }

                if (value.length < minGrass) {
                    report(
                        node,
                        new RuleError(`芝は${minGrass}個以上続けてください。`, {
                            padding: locator.range([index, index + value.length])
                        })
                    );
                }
            }

            for (const match of text.matchAll(/[。．]/gu)) {
                const index = match.index ?? 0;
                report(
                    node,
                    new RuleError("ロジカル語法では句点を使わず、芝で文を区切ってください。", {
                        padding: locator.range([index, index + match[0].length])
                    })
                );
            }

            for (const match of text.matchAll(/\./gu)) {
                const index = match.index ?? 0;
                if (!isAsciiSentencePeriod(text, index)) {
                    continue;
                }
                report(
                    node,
                    new RuleError("ロジカル語法では句点を使わず、芝で文を区切ってください。", {
                        padding: locator.range([index, index + 1])
                    })
                );
            }

            for (const match of text.matchAll(/[wWＷｗ]+[ \t]*[!?！？]+/gu)) {
                const index = match.index ?? 0;
                const grass = match[0].match(/^[wWＷｗ]+/u)?.[0] ?? "";
                if (!isGrassLike(text, index, grass)) {
                    continue;
                }
                const punctuationIndex = index + match[0].search(/[!?！？]/u);
                report(
                    node,
                    new RuleError("疑問符と感嘆符は芝の前に置いてください。", {
                        padding: locator.range([punctuationIndex, index + match[0].length])
                    })
                );
            }

            for (const match of text.matchAll(/[!?！？]+/gu)) {
                const index = match.index ?? 0;
                const before = text.slice(0, index);
                if (/[wWＷｗ]+[ \t]*$/u.test(before)) {
                    continue;
                }

                const after = text.slice(index + match[0].length);
                const followingGrass = after.match(/^[ \t]*([wWＷｗ]+)/u);
                if (followingGrass !== null) {
                    const grass = followingGrass[1];
                    const grassIndex = index + match[0].length + followingGrass[0].indexOf(grass);
                    if (isGrassLike(text, grassIndex, grass)) {
                        continue;
                    }
                }

                report(
                    node,
                    new RuleError("疑問符と感嘆符の直後には芝を置いてください。", {
                        padding: locator.range([index, index + match[0].length])
                    })
                );
            }

            for (const match of text.matchAll(emojiRegex())) {
                const index = match.index ?? 0;
                report(
                    node,
                    new RuleError("純粋なロジカル語法では絵文字を使用しません。", {
                        padding: locator.range([index, index + match[0].length])
                    })
                );
            }

            if (checkPronouns) {
                for (const match of text.matchAll(firstPersonPattern)) {
                    const index = match.index ?? 0;
                    report(
                        node,
                        new RuleError("一人称には「我」を使ってください。", {
                            padding: locator.range([index, index + match[0].length])
                        })
                    );
                }
                for (const match of text.matchAll(secondPersonPattern)) {
                    const index = match.index ?? 0;
                    report(
                        node,
                        new RuleError("二人称には「貴殿」を使ってください。", {
                            padding: locator.range([index, index + match[0].length])
                        })
                    );
                }
            }
        },
        [`${Syntax.Document}:exit`](node) {
            if (!requireLogicalEnding || visibleTexts.length === 0) {
                return;
            }

            const visibleText = stripTrailingClosingDelimiters(
                visibleTexts.join("").replace(emojiRegex(), "").trim()
            );
            if (visibleText.length === 0) {
                return;
            }

            const endingLikePattern = new RegExp(`[wWＷｗ]+(?:[。．.!！?？])?$`, "u");
            const validGrassPattern = new RegExp(`ｗ{${minGrass},}$`, "u");
            if (!validGrassPattern.test(visibleText)) {
                if (!endingLikePattern.test(visibleText)) {
                    report(node, new RuleError(`文章を全角小文字の「ｗ」${minGrass}個以上で終えてください。`));
                }
                return;
            }

            if (acceptedEndings !== undefined) {
                const withoutGrass = visibleText.replace(new RegExp(`ｗ{${minGrass},}$`, "u"), "").trimEnd();
                const endingStem = withoutGrass.replace(/[!?！？]+$/u, "").trimEnd();
                if (!acceptedEndings.some((ending) => endingStem.endsWith(ending))) {
                    report(
                        node,
                        new RuleError(`文章を指定されたロジカル語尾と${minGrass}個以上の芝で終えてください。`)
                    );
                }
            }
        }
    };
};

export default report;
