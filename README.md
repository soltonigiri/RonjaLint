# RonjaLint

RonjaLintは、いわゆる「役割論理」のロジカル語法をAIの日本語チャットに取り入れるツールです。textlintルールのほか、AIエージェント向けのSkill・Hooksも入っています。

## Before / After

| Before | After |
| --- | --- |
| `この方針で進めてもよいですか？` | `この方針で進めてもよいですかな？ｗｗｗ` |
| `未検証のまま変更を取り込んではいけません。` | `未検証のまま変更を取り込むのはありえないｗｗｗ` |
| `比較した結果、互換性を保つ案を採用します。` | `総合的にロジックして、互換性を保つ案以外ありえないｗｗｗ` |

## インストール

```bash
npm install --save-dev textlint github:soltonigiri/RonjaLint
```

`.textlintrc.json`:

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

## 検査内容

既定の`ronja-chat`では、芝は全角小文字の`ｗ`を3個以上続けます。本文は芝で終え、句点と絵文字は使いません。疑問符や感嘆符は芝の前に置き、自分は`我`、相手は`貴殿`と表します。

段落と明示的な改行ごとに検査し、箇条書きでも文章になっている項目は対象にします。見出しなどMarkdownの構造には触れません。コードや引用は検査せず、`状態: 完了`のようなラベルも文章として扱いません。

<details>
<summary>プロファイルと設定項目</summary>

### プロファイル

| プロファイル | 用途 |
| --- | --- |
| `ronja-chat` | AIチャット用の既定設定 |
| `canonical-current` | 現在の本家に近い表記 |
| `custom` | 個別設定用 |

```json
{
  "rules": {
    "ronjalint": {
      "profile": "canonical-current"
    }
  }
}
```

### 設定項目

| オプション | 既定値 | 用途 |
| --- | --- | --- |
| `profile` | `ronja-chat` | 検査プロファイル |
| `minGrass` | `3` | 芝の最小文字数 |
| `requireLogicalEnding` | `true` | 本文の各発話を芝で終える |
| `checkPronouns` | `true` | 人称を検査する |
| `punctuationPosition` | プロファイル依存 | 疑問符・感嘆符の位置を`before`、`after`、`either`から選ぶ |
| `checkEmoji` | プロファイル依存 | 絵文字を検査する |
| `protectInlineQuotes` | `true` | インライン引用を検査対象から外す |
| `allowBareGomiEnding` | `false` | 芝を付けない`ゴミ`を許可する |
| `acceptedEndings` | なし | 芝の直前に置く語句を限定する |

`canonical-current`と`ronja-chat`では、`minGrass`を3未満にできません。

</details>

## AIエージェント

必要なときだけ呼び出すならSkill、すべての回答に適用するならHooksを使います。HooksにはSkillも含まれます。

```bash
# 任意のときに使う
npx ronjalint-agent --skill

# 常に適用する
npx ronjalint-agent --hooks
```

`--target`でインストール先を指定できます。既存のRonjaLintを更新するときは`--force`を付けます。

```bash
npx ronjalint-agent --hooks --target /path/to/project
npx ronjalint-agent --hooks --force
```

既存の`.codex/hooks.json`は残したまま、RonjaLintの設定を追加します。回答の検査には、インストール先の`textlint`とRonjaLintを使います。

## 開発

```bash
npm ci
npm test
```

[MIT License](LICENSE)
