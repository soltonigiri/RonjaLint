import type { TextlintRuleModule } from "@textlint/types";
import emojiRegex from "emoji-regex";
import { RuleHelper } from "textlint-rule-helper";

export interface Options {
    /** Minimum number of consecutive full-width lowercase grass characters. */
    minGrass?: number;
    /** Require each line of ordinary prose to end with a valid grass run. */
    requireLogicalEnding?: boolean;
    /** Optionally restrict the suffix immediately before each required grass run. */
    acceptedEndings?: string[];
    /** Report clear first- and second-person pronouns outside Logical Gohou. */
    checkPronouns?: boolean;
    /** Restrict question and exclamation marks to before grass, after grass, or either side. */
    punctuationPosition?: "before" | "after" | "either";
}

const grassRunPattern = /[wWＷｗ]+/gu;
const japaneseCharacterPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const firstPersonPattern = /(?:私|僕|俺)(?=(?:自身|たち|達|ら)?(?:は|が|の|も|を|に|なら|として|です|でした|だ|で|、|,|\s|$))/gu;
const secondPersonPattern = /(?:あなた|貴方|お前)(?=(?:自身|たち|達|ら)?(?:は|が|の|も|を|に|なら|として|です|でした|だ|で|、|,|\s|$))/gu;
const trailingClosingDelimiterPattern = /[」』）)】〉》〕］｝\]]+$/u;

interface VisiblePart {
    end: number;
    start: number;
    text: string;
}

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

const punctuationMessage = (position: "before" | "after" | "either"): string => {
    if (position === "before") {
        return "疑問符と感嘆符は芝の前に置いてください。";
    }
    if (position === "after") {
        return "疑問符と感嘆符は芝の後に置いてください。";
    }
    return "疑問符と感嘆符は芝の直前または直後に置いてください。";
};

const reconstructVisibleParagraph = (
    paragraphSource: string,
    paragraphStart: number,
    parts: VisiblePart[]
): string => {
    let cursor = 0;
    let visibleText = "";

    for (const part of [...parts].sort((left, right) => left.start - right.start)) {
        const localStart = part.start - paragraphStart;
        const localEnd = part.end - paragraphStart;
        if (localStart < cursor) {
            continue;
        }

        visibleText += paragraphSource.slice(cursor, localStart).replace(/[^\r\n]/g, " ");
        visibleText += part.text;
        cursor = localEnd;
    }

    visibleText += paragraphSource.slice(cursor).replace(/[^\r\n]/g, " ");
    return visibleText;
};

const report: TextlintRuleModule<Options> = (context, options = {}) => {
    const { Syntax, RuleError, report, getSource, locator } = context;
    const helper = new RuleHelper(context);
    const minGrass = options.minGrass ?? 3;
    const requireLogicalEnding = options.requireLogicalEnding ?? true;
    const acceptedEndings = options.acceptedEndings;
    const checkPronouns = options.checkPronouns ?? true;
    const punctuationPosition = options.punctuationPosition ?? "before";
    const paragraphParts = new Map<number, VisiblePart[]>();

    if (!Number.isInteger(minGrass) || minGrass < 1) {
        throw new Error("minGrass must be an integer greater than or equal to 1.");
    }
    if (typeof requireLogicalEnding !== "boolean") {
        throw new Error("requireLogicalEnding must be a boolean.");
    }
    if (typeof checkPronouns !== "boolean") {
        throw new Error("checkPronouns must be a boolean.");
    }
    if (!["before", "after", "either"].includes(punctuationPosition)) {
        throw new Error("punctuationPosition must be one of: before, after, either.");
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
        Syntax.Code,
        Syntax.Header
    ];

    return {
        [Syntax.Str](node) {
            if (helper.isChildNode(node, ignoredNodeTypes)) {
                return;
            }

            const text = getSource(node);
            const paragraph = helper.getParents(node).find((parent) => parent.type === Syntax.Paragraph);
            if (paragraph !== undefined) {
                const parts = paragraphParts.get(paragraph.range[0]) ?? [];
                parts.push({
                    end: node.range[1],
                    start: node.range[0],
                    text
                });
                paragraphParts.set(paragraph.range[0], parts);
            }

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

            for (const match of text.matchAll(/[!?！？]+/gu)) {
                const index = match.index ?? 0;
                const before = text.slice(0, index);
                const precedingGrassMatch = before.match(/([wWＷｗ]+)$/u);
                let hasPrecedingGrass = false;
                if (precedingGrassMatch !== null) {
                    const grass = precedingGrassMatch[1];
                    const grassIndex = before.length - precedingGrassMatch[0].length;
                    hasPrecedingGrass = isGrassLike(text, grassIndex, grass);
                }

                const after = text.slice(index + match[0].length);
                const followingGrass = after.match(/^([wWＷｗ]+)/u);
                let hasFollowingGrass = false;
                if (followingGrass !== null) {
                    const grass = followingGrass[1];
                    const grassIndex = index + match[0].length + followingGrass[0].indexOf(grass);
                    hasFollowingGrass = isGrassLike(text, grassIndex, grass);
                }

                const isAllowed =
                    (punctuationPosition !== "before" && hasPrecedingGrass) ||
                    (punctuationPosition !== "after" && hasFollowingGrass);
                if (isAllowed) {
                    continue;
                }

                report(
                    node,
                    new RuleError(punctuationMessage(punctuationPosition), {
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
        [`${Syntax.Paragraph}:exit`](node) {
            if (!requireLogicalEnding || helper.isChildNode(node, [Syntax.BlockQuote, Syntax.ListItem])) {
                return;
            }

            const parts = paragraphParts.get(node.range[0]) ?? [];
            const visibleParagraph = reconstructVisibleParagraph(
                getSource(node),
                node.range[0],
                parts
            );
            const endingLikePattern = new RegExp(
                `(?:[!?！？]+[wWＷｗ]+|[wWＷｗ]+(?:[。．.!！?？]+)?)$`,
                "u"
            );
            const beforePattern = new RegExp(`(?:[!?！？]+)?ｗ{${minGrass},}$`, "u");
            const afterPattern = new RegExp(`ｗ{${minGrass},}(?:[!?！？]+)?$`, "u");
            const linePattern = /[^\r\n]+/gu;

            for (const lineMatch of visibleParagraph.matchAll(linePattern)) {
                const rawLine = lineMatch[0];
                const visibleLine = stripTrailingClosingDelimiters(
                    rawLine.replace(emojiRegex(), "").trim()
                );
                if (visibleLine.length === 0) {
                    continue;
                }

                if (/ゴミ$/u.test(visibleLine)) {
                    if (acceptedEndings !== undefined) {
                        report(
                            node,
                            new RuleError(
                                `通常の本文を指定されたロジカル語尾と${minGrass}個以上の芝で終えてください。`
                            )
                        );
                    }
                    continue;
                }

                const hasValidEnding =
                    (punctuationPosition !== "after" && beforePattern.test(visibleLine)) ||
                    (punctuationPosition !== "before" && afterPattern.test(visibleLine));
                if (!hasValidEnding) {
                    if (!endingLikePattern.test(visibleLine)) {
                        report(
                            node,
                            new RuleError(
                                `通常の本文の各行を全角小文字の「ｗ」${minGrass}個以上で終えてください。`
                            )
                        );
                    }
                    continue;
                }

                if (acceptedEndings === undefined) {
                    continue;
                }

                const endingStem = visibleLine
                    .replace(/[!?！？]+$/u, "")
                    .replace(new RegExp(`ｗ{${minGrass},}$`, "u"), "")
                    .replace(/[!?！？]+$/u, "")
                    .trimEnd();
                if (!acceptedEndings.some((ending) => endingStem.endsWith(ending))) {
                    report(
                        node,
                        new RuleError(
                            `通常の本文を指定されたロジカル語尾と${minGrass}個以上の芝で終えてください。`
                        )
                    );
                }
            }
        }
    };
};

export default report;
