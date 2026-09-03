// Generated from grammar/ronjalint.json. Do not edit directly.

export const PROFILE_DEFAULTS = {
    "ronja-chat": {
        "description": "RonjaLintのAIチャット向け既定方針",
        "minGrass": 3,
        "requireLogicalEnding": true,
        "checkPronouns": true,
        "punctuationPosition": "before",
        "checkEmoji": true,
        "protectInlineQuotes": true,
        "allowBareGomiEnding": false,
        "canonicalGrassFloor": 3
    },
    "canonical-current": {
        "description": "現在の本家規範で確認できる表記上の許容範囲",
        "minGrass": 3,
        "requireLogicalEnding": true,
        "checkPronouns": true,
        "punctuationPosition": "either",
        "checkEmoji": false,
        "protectInlineQuotes": true,
        "allowBareGomiEnding": false,
        "canonicalGrassFloor": 3
    },
    "custom": {
        "description": "本家準拠を保証しない実験用設定",
        "minGrass": 3,
        "requireLogicalEnding": true,
        "checkPronouns": true,
        "punctuationPosition": "either",
        "checkEmoji": false,
        "protectInlineQuotes": true,
        "allowBareGomiEnding": false,
        "canonicalGrassFloor": 1
    }
} as const;

export type RonjaProfileName = keyof typeof PROFILE_DEFAULTS;
