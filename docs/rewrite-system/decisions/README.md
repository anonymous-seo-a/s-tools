# 意思決定ログ

設計判断・方針転換を日付付きで記録するディレクトリ。

## 命名規約

`YYYY-MM-DD-{slug}.md` 形式。例:
- `2026-04-28-phase-e-flat-structure.md`
- `2026-05-15-csv-import-rollback-policy.md`

## テンプレート

```markdown
# {決定タイトル}

決定日: YYYY-MM-DD
判断者: Daiki / Claude Code

## 背景
何が問題だったか

## 選択肢
A: ...
B: ...
C: ...

## 決定
B を採用。

## 理由
...

## 影響範囲
- 変更されるファイル
- 後続フェーズへの影響
```

## 既存 decisions

（このディレクトリに追加されていく）
