import type { TextlintRuleModule } from "@textlint/types";
import emojiRegex from "emoji-regex";
import { RuleHelper } from "textlint-rule-helper";
import { PROFILE_DEFAULTS, type RonjaProfileName } from "./generated-profile";

export type { RonjaProfileName } from "./generated-profile";

type PunctuationPosition = "before" | "after" | "either";

export interface Options {
    /** Select the current source-based rules, Ronja chat policy, or unrestricted customization. */
    profile?: RonjaProfileName;
    /** Minimum number of consecutive full-width lowercase grass characters. */
    minGrass?: number;
    /** Require each ordinary utterance to end with a valid grass run. */
    requireLogicalEnding?: boolean;
    /** Optionally restrict the suffix immediately before each required grass run. */
    acceptedEndings?: string[];
    /** Report clear first- and second-person pronouns outside Logical Gohou. */
    checkPronouns?: boolean;
    /** Restrict question and exclamation marks to before grass, after grass, or either side. */
    punctuationPosition?: PunctuationPosition;
    /** Report emoji. Enabled by the Ronja chat profile, not by the canonical profile. */
    checkEmoji?: boolean;
    /** Protect paired inline quotations from style checks. */
    protectInlineQuotes?: boolean;
    /** Permit the contextual bare-gomi ending. Its semantic appropriateness is not validated. */
    allowBareGomiEnding?: boolean;
}

const grassRunPattern = /[wWＷｗ]+/gu;
const japaneseCharacterPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const firstPersonPattern = /(?:私|僕|俺)(?=(?:自身|たち|達|ら)?(?:は|が|の|も|を|に|なら|として|です|でした|だ|で|、|,|\s|$))/gu;
const secondPersonPattern = /(?:あなた|貴方|お前)(?=(?:自身|たち|達|ら)?(?:は|が|の|も|を|に|なら|として|です|でした|だ|で|、|,|\s|$))/gu;
const trailingClosingDelimiterPattern = /[」』”）)】〉》〕］｝\]]+$/u;
const compactListLabelPattern = /^[^。．.!！?？\r\n]{1,40}[：:](?:\s*\S{1,30})?$/u;
const profileNames = Object.keys(PROFILE_DEFAULTS) as RonjaProfileName[];

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

const maskRange = (text: string, start: number, end: number): string =>
    `${text.slice(0, start)}${" ".repeat(end - start)}${text.slice(end)}`;

const maskPairedQuotes = (text: string): string => {
    const openToClose = new Map([
        ["「", "」"],
        ["『", "』"],
        ["“", "”"]
    ]);
    const stack: Array<{ close: string; start: number }> = [];
    const ranges: Array<{ end: number; start: number }> = [];

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const current = stack.at(-1);

        if (character === '"' && text[index - 1] !== "\\") {
            if (current?.close === '"') {
                ranges.push({ start: current.start, end: index + 1 });
                stack.pop();
            } else {
                stack.push({ close: '"', start: index });
            }
            continue;
        }

        const close = openToClose.get(character);
        if (close !== undefined) {
            stack.push({ close, start: index });
            continue;
        }

        if (current?.close === character) {
            ranges.push({ start: current.start, end: index + 1 });
            stack.pop();
        }
    }

    return [...ranges]
        .sort((left, right) => right.start - left.start)
        .reduce((masked, range) => maskRange(masked, range.start, range.end), text);
};

const maskPlainUrls = (text: string): string => {
    const ranges = [...text.matchAll(/https?:\/\/[^\s<>"'）】」』]+/gu)].map((match) => ({
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length
    }));

    return [...ranges]
        .sort((left, right) => right.start - left.start)
        .reduce((masked, range) => maskRange(masked, range.start, range.end), text);
};

const maskExcludedInlineText = (text: string, protectInlineQuotes: boolean): string =>
    maskPlainUrls(protectInlineQuotes ? maskPairedQuotes(text) : text);

const stripTrailingClosingDelimiters = (text: string): string => {
    let result = text.trimEnd();
    while (trailingClosingDelimiterPattern.test(result)) {
        result = result.replace(trailingClosingDelimiterPattern, "").trimEnd();
    }
    return result;
};

const punctuationMessage = (position: PunctuationPosition): string => {
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

        visibleText += paragraphSource.slice(cursor, localStart).replace(/[^\r\n]/gu, " ");
        visibleText += part.text;
        cursor = localEnd;
    }

    visibleText += paragraphSource.slice(cursor).replace(/[^\r\n]/gu, " ");
    return visibleText;
};

const splitExplicitUtterances = (visibleParagraph: string): string[] =>
    visibleParagraph
        .replace(/\r\n?/gu, "\n")
        .split(/(?: {2,}|\\)\n/gu)
        .map((utterance) => utterance.replace(/\n/gu, " "));

const report: TextlintRuleModule<Options> = (context, options = {}) => {
    const { Syntax, RuleError, report, getSource, locator } = context;
    const helper = new RuleHelper(context);
    const requestedProfile = options.profile ?? "ronja-chat";

    if (!profileNames.includes(requestedProfile as RonjaProfileName)) {
        throw new Error("profile must be one of: ronja-chat, canonical-current, custom.");
    }

    const profile = requestedProfile as RonjaProfileName;
    const defaults = PROFILE_DEFAULTS[profile];
    const minGrass = options.minGrass ?? defaults.minGrass;
    const requireLogicalEnding = options.requireLogicalEnding ?? defaults.requireLogicalEnding;
    const acceptedEndings = options.acceptedEndings;
    const checkPronouns = options.checkPronouns ?? defaults.checkPronouns;
    const punctuationPosition = options.punctuationPosition ?? defaults.punctuationPosition;
    const checkEmoji = options.checkEmoji ?? defaults.checkEmoji;
    const protectInlineQuotes = options.protectInlineQuotes ?? defaults.protectInlineQuotes;
    const allowBareGomiEnding = options.allowBareGomiEnding ?? defaults.allowBareGomiEnding;
    const paragraphParts = new Map<number, VisiblePart[]>();

    if (!Number.isInteger(minGrass) || minGrass < 1) {
        throw new Error("minGrass must be an integer greater than or equal to 1.");
    }
    if (minGrass < defaults.canonicalGrassFloor) {
        throw new Error(`minGrass must be at least ${defaults.canonicalGrassFloor} for the ${profile} profile.`);
    }
    if (typeof requireLogicalEnding !== "boolean") {
        throw new Error("requireLogicalEnding must be a boolean.");
    }
    if (typeof checkPronouns !== "boolean") {
        throw new Error("checkPronouns must be a boolean.");
    }
    if (typeof checkEmoji !== "boolean") {
        throw new Error("checkEmoji must be a boolean.");
    }
    if (typeof protectInlineQuotes !== "boolean") {
        throw new Error("protectInlineQuotes must be a boolean.");
    }
    if (typeof allowBareGomiEnding !== "boolean") {
        throw new Error("allowBareGomiEnding must be a boolean.");
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

            const sourceText = getSource(node);
            const paragraph = helper.getParents(node).find((parent) => parent.type === Syntax.Paragraph);
            let text = maskExcludedInlineText(sourceText, protectInlineQuotes);

            if (paragraph !== undefined) {
                const paragraphSource = getSource(paragraph);
                const maskedParagraph = maskExcludedInlineText(paragraphSource, protectInlineQuotes);
                const localStart = node.range[0] - paragraph.range[0];
                text = maskedParagraph.slice(localStart, localStart + sourceText.length);

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

            if (checkEmoji) {
                for (const match of text.matchAll(emojiRegex())) {
                    const index = match.index ?? 0;
                    report(
                        node,
                        new RuleError("Ronjaチャットでは絵文字を使用しません。", {
                            padding: locator.range([index, index + match[0].length])
                        })
                    );
                }
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
            if (!requireLogicalEnding || helper.isChildNode(node, [Syntax.BlockQuote])) {
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
            const isListItem = helper.isChildNode(node, [Syntax.ListItem]);

            for (const rawUtterance of splitExplicitUtterances(visibleParagraph)) {
                const visibleUtterance = stripTrailingClosingDelimiters(
                    rawUtterance.replace(emojiRegex(), "").trim()
                );
                if (visibleUtterance.length === 0) {
                    continue;
                }
                if (isListItem && compactListLabelPattern.test(visibleUtterance)) {
                    continue;
                }

                if (allowBareGomiEnding && /ゴミ$/u.test(visibleUtterance)) {
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
                    (punctuationPosition !== "after" && beforePattern.test(visibleUtterance)) ||
                    (punctuationPosition !== "before" && afterPattern.test(visibleUtterance));
                if (!hasValidEnding) {
                    if (!endingLikePattern.test(visibleUtterance)) {
                        report(
                            node,
                            new RuleError(
                                `通常の本文の各発話を全角小文字の「ｗ」${minGrass}個以上で終えてください。`
                            )
                        );
                    }
                    continue;
                }

                if (acceptedEndings === undefined) {
                    continue;
                }

                const endingStem = visibleUtterance
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
