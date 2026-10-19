# family-game — リポジトリ共通のルール

家族で遊ぶ Web ゲームを集めたリポジトリ。iPad の Safari で遊ぶ前提。

## 構成

```
index.html                   ゲーム選択ページ
.github/workflows/deploy.yml GitHub Pages への公開
mori/                        もりのまもりびと（単一 HTML）
jeanne/                      ジャンヌの騎士（Vite + TypeScript + Phaser 3）
```

## ルール

- ゲームは1フォルダに1本。フォルダをまたいだコードの共有はしない
- localStorage のキーにはゲーム名の接頭辞を付ける（もりは既存の `mori3_` を維持、ジャンヌは `jeanne_`）。全ゲームが同じ `github.io` のオリジンで保存領域を共有するため
- ゲームを追加したら、ルートの `index.html` にリンクを足す。リンクは `mori/` のような相対パスで書く
- 公開は GitHub Actions（`.github/workflows/deploy.yml`）だけで行い、`dist/` はコミットしない。ビルドが必要なゲームを足したら、deploy.yml にビルドと配置の手順を足す
- 各ゲームの詳細は、そのフォルダの `CLAUDE.md` に従う
