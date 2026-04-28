# マスター画面のルーティング: state ベース sub-route 採用

決定日: 2026-04-28
判断者: Daiki / Claude Code

## 背景

Phase A 仕様書（04-phase-a-design.md §6.2）はフロントエンドに
`react-router-dom` を導入し `/masters/*` のパスベースルーティングを指定していた。
一方、既存 s-tools の React アプリ（App.jsx）は `useState('page')` による
タブ切替方式で構築されており、URL は常にルート (`/`) のまま動作している。

## 選択肢

A. `react-router-dom` を導入し、masters 配下だけ URL ルーティングに統合
B. 既存タブと同じ state ベース sub-route を採用（`{ page, params }` を内部で保持）
C. 全タブを react-router-dom に書き換え（既存実装の大規模リファクタ）

## 決定

**B を採用**。

## 理由

- **必然性テスト**: URL ルーティングが Phase E スコープでもたらす価値は、
  マスター画面内でのディープリンク程度。ゆかちゃん運用は管理画面トップから
  入ってサブタブを辿るため、ディープリンク不要。
- **閉合性テスト**: A は依存関係（`react-router-dom`）が増え、既存タブと
  ルーティング方式が混在することで状態同期の複雑度が上がる。
- **最小性テスト**: B は既存 PartnerManager / ArticlesView と同じ実装パターンで
  済み、コード量が最小。

C は Phase E スコープ外の影響範囲が大きいため却下。

## 影響範囲

- 変更ファイル:
  - `node/client/src/masters/MastersView.jsx`（state ベース sub-route の root）
  - `node/client/src/App.jsx`（`page === 'masters'` で MastersView を mount）
- 後続フェーズへの影響:
  - 後で全画面を URL ルーティング化する判断が出た場合、masters 配下も
    `react-router-dom` に統一する。その際は MastersView を Routes に
    置き換えるだけで、サブコンポーネント（AnnotationList / RuleList 等）の
    インターフェース（`navigate` / `params`）はそのまま流用できる。
