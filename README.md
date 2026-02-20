# AI Efficiency Lab 🚀

AI活用術・効率化ツールの情報ブログ自動運営システム

## 概要

このシステムは、AIが自動的にブログ記事とSNS投稿を生成・公開し、広告・アフィリエイトで収益化するための完全自動化システムです。

## セットアップ手順

### 1. Gemini APIキーの取得（必須・5分）

1. [Google AI Studio](https://aistudio.google.com/app/apikey) にアクセス
2. Googleアカウントでログイン
3. 「Create API Key」をクリック
4. 表示されたAPIキーをコピー

### 2. 環境設定

```bash
# .env ファイルを作成
copy .env.example .env
```

`.env` ファイルを開き、`GEMINI_API_KEY` にコピーしたAPIキーを貼り付けてください。

### 3. テスト実行

```bash
# Node.jsのパスを設定（毎回必要）
set PATH=c:\tools\node-v20.11.1-win-x64;%PATH%

# 記事を1つ生成してテスト
node scripts/generate-article.js --test

# ブログをローカルでプレビュー
npx eleventy --serve
```

ブラウザで http://localhost:8080 を開いて確認してください。

### 4. SNS連携（オプション）

#### X (Twitter)
1. [Twitter Developer Portal](https://developer.twitter.com/) にアクセス
2. Developer アカウントを申請（無料プラン）
3. プロジェクト・アプリを作成
4. API Key, API Secret, Access Token, Access Token Secret を取得
5. `.env` ファイルに記入

#### Instagram
1. [Meta for Developers](https://developers.facebook.com/) にアクセス
2. アプリを作成 → Instagram Graph API を追加
3. Instagram Business アカウントと連携
4. Access Token と Business Account ID を取得
5. `.env` ファイルに記入

### 5. 自動スケジュール設定

```bash
# 毎朝6時に自動実行するタスクを登録
node scripts/setup-scheduler.js
```

> ⚠️ 管理者権限のコマンドプロンプトで実行してください

### 6. GitHub Pagesでブログを公開

1. [GitHub](https://github.com/) でアカウント作成
2. 新しいリポジトリ `ai-efficiency-lab` を作成
3. このフォルダでGitを初期化:
```bash
git init
git add -A
git commit -m "initial commit"
git remote add origin https://github.com/あなたのユーザー名/ai-efficiency-lab.git
git push -u origin main
```
4. GitHub リポジトリの Settings → Pages → Source を `main` ブランチの `/_site` に設定

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `node scripts/generate-article.js` | 記事を1本生成 |
| `node scripts/generate-article.js --test` | テストモードで記事生成 |
| `node scripts/generate-sns-post.js` | 最新記事からSNS投稿を生成 |
| `node scripts/generate-sns-post.js --standalone` | 独立したSNS投稿を生成 |
| `node scripts/post-to-x.js` | キューのX投稿を実行 |
| `node scripts/post-to-instagram.js` | キューのInstagram投稿を実行 |
| `node scripts/daily-pipeline.js` | 全自動パイプライン実行 |
| `node scripts/setup-scheduler.js` | 自動スケジュール登録 |
| `npx eleventy --serve` | ブログをローカルプレビュー |
| `npx eleventy` | ブログをビルド |

## フォルダ構成

```
radiant-crab/
├── src/                    # ブログソースコード
│   ├── _includes/          # テンプレート
│   ├── css/                # スタイルシート
│   ├── posts/              # 生成された記事
│   └── index.njk           # トップページ
├── scripts/                # 自動化スクリプト
│   ├── generate-article.js # 記事生成
│   ├── generate-sns-post.js # SNS投稿生成
│   ├── post-to-x.js        # X投稿Bot
│   ├── post-to-instagram.js # Instagram投稿Bot
│   ├── daily-pipeline.js    # デイリーパイプライン
│   ├── setup-scheduler.js   # スケジューラ設定
│   └── keywords.json        # キーワードDB
├── dashboard/              # モニタリング画面
│   └── index.html
├── _site/                  # ビルド出力（自動生成）
├── .env                    # APIキー（要設定）
└── .env.example            # APIキーのテンプレート
```

## 収益化のステップ

1. **月1〜2**: 記事を蓄積（毎日1記事 = 月30記事）
2. **月3**: Google AdSense に申請（20記事以上あれば申請可能）
3. **月3〜4**: アフィリエイトプログラムに登録（A8.net, もしもアフィリエイト等）
4. **月4〜**: 検索トラフィックが増加し始め、収益が発生
