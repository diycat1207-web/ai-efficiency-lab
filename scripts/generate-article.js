/**
 * AI記事自動生成スクリプト
 * Gemini APIを使ってSEO最適化された記事を自動生成し、ブログに投稿する
 * マルチエージェントレビューシステムで品質を保証（80点以上で公開、最大5回ループ）
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const POSTS_DIR = path.join(__dirname, '..', 'src', 'posts');
const KEYWORDS_FILE = path.join(__dirname, 'keywords.json');
const STATS_FILE = path.join(__dirname, 'stats.json');
const STRATEGY_FILE = path.join(__dirname, 'strategy.json');
const PERSONA_FILE = path.join(__dirname, 'persona.json');

// レビューエージェントシステム
const { reviewArticle } = require('./review-agents');

// Gemini API初期化
function getGenAI() {
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ GEMINI_API_KEY が .env に設定されていません');
        console.log('📋 .env.example を .env にコピーして、APIキーを設定してください');
        process.exit(1);
    }
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// ペルソナ設定を読み込む
function loadPersona() {
    if (fs.existsSync(PERSONA_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PERSONA_FILE, 'utf-8'));
        } catch { return null; }
    }
    return null;
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

    const strategy = loadStrategy();
    if (strategy && strategy.strategy && strategy.strategy.priority_keyword) {
        const priorityKw = strategy.strategy.priority_keyword;
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

// 記事生成プロンプト（ペルソナ・戦略フィードバック・前回改善指示を反映）
function buildPrompt(keyword, previousFeedback = null) {
    const strategy = loadStrategy();
    const persona = loadPersona();

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

    // レビューエージェントからの改善指示（再生成時のみ）
    let feedbackContext = '';
    if (previousFeedback) {
        feedbackContext = `\n\n## 【最重要】前回の記事への改善指示（必ず反映すること）:\n${previousFeedback}`;
    }

    // ペルソナ記述
    const personaDesc = persona
        ? `あなたは「${persona.handle}」というハンドルネームの${persona.occupation}のブロガーです。\n性格: ${persona.personality}\n口調・スタイル: ${persona.tone}`
        : 'あなたはAIやガジェットが好きな、等身大の個人ブロガーです。';

    const firstPerson = persona ? persona.firstPerson : '私';
    const todayStr = new Date().toISOString().split('T')[0];

    return `${personaDesc}
以下のキーワードについて、SEOに最適化された高品質なブログ記事を書いてください。

キーワード: 「${keyword}」
現在の日付: ${todayStr}

## Google検索機能の活用（必須）:
- 過去2週間以内の「${keyword}」に関する最新ニュースやトレンドを検索し、その一次情報や最新動向を必ず記事に組み込んでください。
- 今回のトピックについてGoogleで検索し、上位にある実際の人気ブログの構成やトーン（語り口）を参考にして書いてください。

## 必須要件:
1. タイトルは30〜50文字で、キーワードを含めること。
2. 【文字数厳守】記事の長さは「絶対に1000〜1500文字程度」に収めること。長すぎる記事は読まれません。
3. 一人称は必ず「${firstPerson}」を使い、読者に語りかけるような親しみやすい文体で書くこと。
4. 【事実確認・最重要】記事に含める事例の企業名・固有名詞・数値はGoogle検索で事実を確認し、必ず「実在する企業名」と「具体的な事例・数値」を明記すること。「あるメーカーでは」「ある小売企業では」のような匿名・一般論は絶対に書いてはならない。出典が確認できない情報は省略すること。
5. 【最重要】AIが書いたとバレないように、「最近${firstPerson}が個人的に試してみたこと」「リアルな失敗談」などを必ず挿入すること。その際、「Gemini」「ChatGPT」「pandas」など具体的な採用ツール名を必ず明記し、具体的な数字（例:「週5時間の作業が30分に」など）を入れること。
6. フリーランスエンジニアとしての実務視点を示すため、**実際のプログラミングコード（Pythonでデータ前処理を行うコードなど等）やCLIコマンド例をコードブロックで必ず1つ以上示すこと**。単なる「AIへのプロンプト」だけを載せるのはNG。技術記事としての体裁を保つこと。
7. 以下のマークダウン構造で書くこと（各見出しの文章量も少なめに）:
   - 導入文（読者への共感＋自分の短い体験談＋具体的な数字）
   - ## 最新トレンドと基本（ごく短く・事実確認済みの情報のみ）
   - ## 実践！具体的な方法と${firstPerson}のリアルな体験談（コード例を含む）
   - ## まとめ
8. 箇条書きや強調（太字）を多用して、スマホでサクッと読めるようにする。${strategyContext}${trendContext}${feedbackContext}

## 出力フォーマット:
【絶対に厳守】挨拶などは一切出力せず、必ず1行目を「---」から始めて、以下のフォーマット通りに出力してください。

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

// 1回分の記事テキストを生成（ループ内部用）
async function generateOnce(keyword, previousFeedback = null) {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        tools: [{ googleSearch: {} }]
    });

    const result = await model.generateContent(buildPrompt(keyword, previousFeedback));
    let text = result.response.text();

    // Markdownのコードブロックを削除
    text = text.replace(/^```(markdown)?\r?\n/i, '').replace(/\r?\n```$/i, '').trim();

    // フロントマターを解析
    const frontMatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!frontMatterMatch) {
        return null;
    }

    const frontMatter = frontMatterMatch[1];
    const content = frontMatterMatch[2];

    // ----------------------------------------------------------------------
    // プログラムによるハードゲート（物理的チェック）
    // ----------------------------------------------------------------------
    let hardGatePassed = true;
    let gateFailures = [];

    // 1. コードブロックの存在チェック（```言語名 があるか）
    if (!/```[a-z]+/i.test(content)) {
        hardGatePassed = false;
        gateFailures.push('本物のプログラミングコード例（```python等のブロック）が含まれていません。');
    }

    // 2. 実在ツールの明記チェック
    const toolRegex = /(Gemini|ChatGPT|Claude|Copilot|Cursor|Python|JavaScript|pandas|API|スプレッドシート|Excel)/i;
    if (!toolRegex.test(content)) {
        hardGatePassed = false;
        gateFailures.push('「Gemini」や「Python」など、使用した具体的な技術・ツール名が明記されていません。');
    }

    if (!hardGatePassed) {
        console.log('\n❌ [ハードゲート不通過] 記事生成の基本要件を満たしていません（レビュー前に弾きました）:');
        gateFailures.forEach(fail => console.log(`   - ${fail}`));
        return null; // レビューのAPIコストを節約し、即座に再生成へ
    }
    // ----------------------------------------------------------------------

    const titleMatch = frontMatter.match(/title:\s*"(.+?)"/);
    const title = titleMatch ? titleMatch[1] : `AI活用術 - ${keyword}`;
    const dateStr = new Date().toISOString();
    const cleanedFrontMatter = frontMatter.replace(/title:.*\n?/, '').trim();

    const finalContent = `---
layout: post.njk
title: "${title}"
${cleanedFrontMatter}
date: ${dateStr}
keyword: "${keyword}"
---

${content}`;

    return { title, content, finalContent };
}

// 記事をファイルに保存
function saveArticle(generated, keyword, testMode) {
    if (!generated) {
        console.error('❌ 保存できる記事がありませんでした。');
        return null;
    }

    if (!fs.existsSync(POSTS_DIR)) {
        fs.mkdirSync(POSTS_DIR, { recursive: true });
    }

    const slug = generateSlug(keyword);
    const filename = `${slug}.md`;
    const filepath = path.join(POSTS_DIR, filename);
    fs.writeFileSync(filepath, generated.finalContent, 'utf-8');

    console.log(`\n✅ 記事を保存しました！`);
    console.log(`📄 ファイル: src/posts/${filename}`);
    console.log(`📌 タイトル: ${generated.title}`);
    console.log(`🔑 キーワード: ${keyword}`);
    console.log(`📏 文字数: ${generated.content.length}`);

    updateStats('article');

    if (testMode) {
        console.log('\n--- プレビュー（最初の500文字） ---');
        console.log(generated.content.substring(0, 500));
    }

    return { title: generated.title, keyword, filename, content: generated.content };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン: マルチエージェントレビューループ付き記事生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function generateArticle(testMode = false) {
    const MAX_ATTEMPTS = 5;
    const PASS_SCORE = 80;

    const keyword = selectKeyword();
    console.log('\n🚀 マルチエージェント記事生成システム起動');
    console.log(`📌 選択キーワード: 「${keyword}」`);
    console.log(`🔄 最大${MAX_ATTEMPTS}回ループ、${PASS_SCORE}点以上で公開\n`);

    let bestArticle = null;
    let bestScore = 0;
    let previousFeedback = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`\n📝 === 第${attempt}回目の記事生成 ===`);
        console.log('✍️  Gemini APIで記事を生成中（最新情報を検索中）...');

        const generated = await generateOnce(keyword, previousFeedback);
        if (!generated) {
            console.log(`⚠️ 第${attempt}回の生成でフォーマットエラー。再試行します。`);
            continue;
        }

        console.log(`📌 タイトル: ${generated.title}`);
        console.log(`📏 文字数: ${generated.content.length}文字`);

        // マルチエージェントレビュー
        const reviewResult = await reviewArticle(generated.finalContent, keyword, attempt);
        const { finalScore, improvementGuide } = reviewResult;

        // 最高スコアを追跡
        if (finalScore > bestScore) {
            bestScore = finalScore;
            bestArticle = generated;
        }

        if (finalScore >= PASS_SCORE) {
            console.log(`\n✨ 合格！（${finalScore}点） 第${attempt}回目の記事を公開します。`);
            return saveArticle(generated, keyword, testMode);
        }

        if (attempt < MAX_ATTEMPTS) {
            console.log(`\n🔄 ${PASS_SCORE}点未満（${finalScore}点）。改善指示を反映して再生成します。`);
            previousFeedback = improvementGuide;
        }
    }

    // 5回ループを超えた場合: 最高スコアの記事を採用
    console.log(`\n⏱️ 5回のループ完了。最高スコア（${bestScore}点）の記事を採用して公開します。`);
    return saveArticle(bestArticle, keyword, testMode);
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
