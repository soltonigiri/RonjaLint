# RonjaLint

AIの日本語チャットを、いわゆる「役割論理」のロジカル語法にそろえる非公式のtextlintルールです。

## Before / After

| Before | After |
| --- | --- |
| `私はこの設定が妥当だと思います。🙂` | `我はこの設定が妥当だと考えますなｗｗｗ` |
| `これでいいですか？` | `これでよいですかな？ｗｗｗ` |
| `未検証のまま採用してはいけません。` | `未検証のまま採用するのはありえないｗｗｗ` |
| `確認しましたなww` | `確認しましたなｗｗｗ` |

## Usage

```bash
npm install --save-dev textlint github:soltonigiri/RonjaLint
```

```json
{
  "rules": {
    "ronjalint": true
  }
}
```

```bash
npx textlint reply.md
```

## Rules

| 項目 | ルール |
| --- | --- |
| 芝 | 全角小文字の`ｗ`を3個以上続ける |
| 文末 | 通常の本文の各行を有効な芝で終える。`ゴミ`で終わる形は例外 |
| 記号 | 句点を使わず、疑問符・感嘆符は芝の前に使う |
| 人称 | 一人称には`我`、二人称には`貴殿`を使う |
| 絵文字 | 使用しない |

見出し、コード、リンク、画像、引用ブロックは検査対象外です。箇条書きは文末検査から除外します。

## Options

| オプション | 既定値 | 用途 |
| --- | --- | --- |
| `minGrass` | `3` | 芝の最小文字数 |
| `requireLogicalEnding` | `true` | 通常の本文の各行に文末の芝を必須にする |
| `checkPronouns` | `true` | 人称を検査する |
| `punctuationPosition` | `before` | 疑問符・感嘆符を置く側を`before`、`after`、`either`から選ぶ |
| `acceptedEndings` | なし | 芝の直前に置く語句を限定する |

## AI agents

このリポジトリには、文意に合うロジカル語法をAIエージェントへ指定するSkillとHooksも同梱しています。必要なときだけ使うならSkill、常に適用するならHooksを使います。

| 使い方 | ファイル | 動作 |
| --- | --- | --- |
| Skill | [`.agents/skills/ronjalint/`](.agents/skills/ronjalint/) | `$ronjalint`で呼び出す |
| Hooks | [`.agents/hooks/ronjalint.mjs`](.agents/hooks/ronjalint.mjs) | セッション開始時に語法を指定し、回答時に検査する |

Hooksの起動設定は[`.codex/hooks.json`](.codex/hooks.json)です。初回は`/hooks`で内容を確認し、信頼すると有効になります。

Hooksによる検査は`npm ci`の実行後に動作します。

## Development

```bash
npm ci
npm test
```

[MIT License](LICENSE)
