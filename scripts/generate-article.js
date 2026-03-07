/**
 * AI記事自動生成スクリプト
 * Gemini APIを使ってSEO最適化された記事を自動生成し、ブログに投稿する
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const POSTS_DIR = path.join(__dirname, '..', 'src', 'posts');
const KEYWORDS_FILE = path.join(__dirname, 'keywords.json');
const STATS_FILE = path.join(__dirname, 'stats.json');
const STRATEGY_FILE = path.join(__dirname, 'strategy.json');

// Gemini API初期化
function getGenAI() {
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ GEMINI_API_KEY が .env に設定されていません');
        console.log('📋 .env.example を .env にコピーして、APIキーを設定してください');
        process.exit(1);
    }
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// 現在の戦略を読み込む
function loadStrategy() {
    if (fs.existsSync(STRATEGY_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STRATEGY_FILE, 'utf-8'));
        } catch { return null; }
    }
    return null;
}

// キーワードを選択（戦略の優先キーワードを優先）
function selectKeyword() {
    const data = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf-8'));
    const allKeywords = data.categories.flatMap(c => c.keywords);
    const unused = allKeywords.filter(k => !data.usedKeywords.includes(k));

    // 戦略で優先キーワードが指定されていればそれを使う
    const strategy = loadStrategy();
    if (strategy && strategy.strategy && strategy.strategy.priority_keyword) {
        const priorityKw = strategy.strategy.priority_keyword;
        // 未使用キーワードに含まれているか、または新規キーワードとして使用
        if (!data.usedKeywords.includes(priorityKw)) {
            console.log(`🎯 戦略エンジン推薦キーワード: 「${priorityKw}」`);
            data.usedKeywords.push(priorityKw);
            fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(data, null, 2), 'utf-8');
            return priorityKw;
        }
    }

    if (unused.length === 0) {
        console.log('🔄 全キーワード使用済み。リセットします。');
        data.usedKeywords = [];
        fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(data, null, 2), 'utf-8');
        return allKeywords[Math.floor(Math.random() * allKeywords.length)];
    }

    const keyword = unused[Math.floor(Math.random() * unused.length)];
    data.usedKeywords.push(keyword);
    fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return keyword;
}

// 記事生成プロンプト（戦略フィードバックを反映）
function buildPrompt(keyword) {
    const strategy = loadStrategy();
    let strategyContext = '';

    if (strategy && strategy.strategy) {
        const s = strategy.strategy;
        const parts = [];
        if (s.writing_style_adjustment) parts.push(`- 文体の調整: ${s.writing_style_adjustment}`);
        if (s.seo_improvements && s.seo_improvements.length > 0) parts.push(`- SEO改善: ${s.seo_improvements.join('、')}`);
        if (s.content_direction) parts.push(`- コンテンツの方向性: ${s.content_direction}`);
        if (s.experiment) parts.push(`- 今日の実験: ${s.experiment}`);
        if (parts.length > 0) {
            strategyContext = `\n\n## 戦略エンジンからのフィードバック（必ず反映してください）:\n${parts.join('\n')}`;
        }
    }

    let trendContext = '';
    if (strategy && strategy.trendAnalysis && strategy.trendAnalysis.hot_topics) {
        trendContext = `\n\n## 現在のトレンド（可能なら記事に言及してください）:\n${strategy.trendAnalysis.hot_topics.map(t => `- ${t}`).join('\n')}`;
    }

    return `あなたは「AI活用術・効率化ツール」専門のプロブロガーです。
以下のキーワードについて、SEOに最適化された高品質なブログ記事を書いてください。

キーワード: 「${keyword}」

## 必須要件:
1. タイトルは30〜50文字で、キーワードを含める
2. 記事の長さは2000〜3000文字
3. 以下のマークダウン構造で書く:
   - 導入文（読者の悩みに共感）
   - ## 見出し1（基本的な説明）
   - ## 見出し2（具体的な使い方・方法）
   - ## 見出し3（メリット・活用のコツ）
   - ## まとめ
4. 読みやすく、実用的で、具体的な情報を含める
5. 自然な日本語で書く（AI臭さを出さない）
6. 箇条書きや番号リストを適度に使う${strategyContext}${trendContext}

## 出力フォーマット:
以下の形式で正確に出力してください。---の外に何も書かないでください。

---
title: "ここにタイトル"
description: "ここに120文字以内のメタディスクリプション"
tags: ["タグ1", "タグ2"]
---

ここに記事本文（マークダウン形式）`;
}

// ファイル名をスラッグ化
function generateSlug(title) {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const slug = title
        .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
    return `${dateStr}-${slug}`;
}

// 記事を生成して保存
async function generateArticle(testMode = false) {
    console.log('🚀 記事生成を開始します...\n');

    const keyword = selectKeyword();
    console.log(`📌 選択キーワード: 「${keyword}」`);

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    console.log('✍️  Gemini APIで記事を生成中...');
    const result = await model.generateContent(buildPrompt(keyword));
    const response = result.response;
    let text = response.text();

    // Markdownのコードブロックを削除 (Geminiがマークダウンで囲む場合に対応)
    text = text.replace(/^```(markdown)?\r?\n/i, '').replace(/\r?\n```$/i, '').trim();

    // フロントマターを解析 (\r?\nで両方の改行コードに対応)
    const frontMatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!frontMatterMatch) {
        console.error('❌ 記事のフォーマットが不正です。再試行してください。');
        console.log('受信テキスト:', text.substring(0, 200));
        return null;
    }

    const frontMatter = frontMatterMatch[1];
    const content = frontMatterMatch[2];

    // タイトルを取得
    const titleMatch = frontMatter.match(/title:\s*"(.+?)"/);
    const title = titleMatch ? titleMatch[1] : `AI活用術 - ${keyword}`;

    // 日付を追加
    const now = new Date();
    const dateStr = now.toISOString();

    // 最終的なファイル内容を構築
    const cleanedFrontMatter = frontMatter.replace(/title:.*\n?/, '').trim();
    const finalContent = `---
layout: post.njk
title: "${title}"
${cleanedFrontMatter}
date: ${dateStr}
keyword: "${keyword}"
---

${content}`;

    // ファイルに保存
    if (!fs.existsSync(POSTS_DIR)) {
        fs.mkdirSync(POSTS_DIR, { recursive: true });
    }

    const slug = generateSlug(keyword);
    const filename = `${slug}.md`;
    const filepath = path.join(POSTS_DIR, filename);

    fs.writeFileSync(filepath, finalContent, 'utf-8');

    console.log(`\n✅ 記事を生成しました！`);
    console.log(`📄 ファイル: src/posts/${filename}`);
    console.log(`📌 タイトル: ${title}`);
    console.log(`🔑 キーワード: ${keyword}`);
    console.log(`📏 文字数: ${content.length}`);

    // 統計更新
    updateStats('article');

    if (testMode) {
        console.log('\n--- プレビュー（最初の500文字） ---');
        console.log(content.substring(0, 500));
    }

    return { title, keyword, filename, content };
}

// 統計データの更新
function updateStats(type) {
    let stats = { articles: 0, snsPosts: 0, history: [] };
    if (fs.existsSync(STATS_FILE)) {
        stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    }

    const today = new Date().toISOString().split('T')[0];
    if (type === 'article') stats.articles++;
    if (type === 'sns') stats.snsPosts++;

    // 履歴に追加
    const todayEntry = stats.history.find(h => h.date === today);
    if (todayEntry) {
        if (type === 'article') todayEntry.articles = (todayEntry.articles || 0) + 1;
        if (type === 'sns') todayEntry.snsPosts = (todayEntry.snsPosts || 0) + 1;
    } else {
        stats.history.push({
            date: today,
            articles: type === 'article' ? 1 : 0,
            snsPosts: type === 'sns' ? 1 : 0
        });
    }

    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
}

// CLI実行
if (require.main === module) {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');

    if (testMode) {
        console.log('🧪 テストモードで実行中...\n');
    }

    generateArticle(testMode).then(result => {
        if (result) {
            console.log('\n🎉 完了！ `npx eleventy --serve` でプレビューできます。');
        }
    }).catch(err => {
        console.error('❌ エラーが発生しました:', err.message);
        process.exit(1);
    });
}

module.exports = { generateArticle, selectKeyword, updateStats };
