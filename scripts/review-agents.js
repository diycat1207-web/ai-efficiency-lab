/**
 * マルチエージェントレビューシステム
 *
 * 4名のレビュアーエージェントが記事を採点し、
 * 総括エージェントが最終スコア（100点満点）を判定する。
 *
 * レビュアー:
 * 1. 人間らしさレビュアー        (25点)
 * 2. 情報正確性・鮮度レビュアー   (25点) ← Google検索で事実確認と匿名チェックを実施
 * 3. 技術深度・エンジニア的価値   (25点) ← 実務で使えるコードか判定
 * 4. 視聴者代表レビュアー        (25点)
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PERSONA_FILE = path.join(__dirname, 'persona.json');

function getModel(useSearch = false) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY が .env に設定されていません');
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const config = { model: 'gemini-2.5-flash' };
    if (useSearch) config.tools = [{ googleSearch: {} }];
    return genAI.getGenerativeModel(config);
}

function loadPersona() {
    if (fs.existsSync(PERSONA_FILE)) {
        return JSON.parse(fs.readFileSync(PERSONA_FILE, 'utf-8'));
    }
    return { handle: 'サチ(sachi)', firstPerson: '私', occupation: 'フリーランスエンジニア' };
}

/**
 * JSON文字列をパースするヘルパー（コードブロックも除去）
 */
function parseJson(text) {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// レビュアー1: 人間らしさレビュアー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function humanLikenessReviewer(articleText, persona) {
    const model = getModel();
    const prompt = `あなたは「人間らしさ・ナチュラルさ」の専門レビュアーです。
以下のブログ記事を読み、AIが書いたかどうかを判定する観点から25点満点で採点してください。

## ブロガーのペルソナ
- ハンドルネーム: ${persona.handle}
- 職業: ${persona.occupation}
- 一人称: ${persona.firstPerson}
- 口調: ${persona.tone}

## 評価基準
- AI特有の「〜です。〜ます。〜です。〜ます。」という単調な繰り返しがないか（10点）
- 一人称「${persona.firstPerson}」が自然に使われているか（5点）
- リアルな体験談・失敗談・主観的感想が含まれているか（5点）
- ペルソナ（${persona.handle}：${persona.occupation}）の人物像に合ったキャラクターが出ているか（5点）

## 記事内容
${articleText.substring(0, 3000)}

## 出力フォーマット（JSONのみ。他は何も出力しない）
{"score": 点数（0〜25）, "feedback": "改善点を2〜3文で"}`;

    const result = await model.generateContent(prompt);
    return parseJson(result.response.text());
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// レビュアー2: 情報正確性・鮮度レビュアー（Google検索で事実確認とJSON構造化出力）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function freshnessReviewer(articleText, keyword) {
    const model = getModel(true);
    const today = new Date().toISOString().split('T')[0];
    const prompt = `あなたは「情報正確性・鮮度」の専門レビュアーです。
記事に含まれるすべての事例・固有名詞・数値について、Google検索で事実に合致するか、匿名でぼかされていないかを厳格に検証してください。
現在日付: ${today}

## 評価基準（25点満点）
- 記事の事例や数値が実名企業と出典を明記しているか（実世界の検証可能な表現か）
- 過去2週間以内の最新情報が盛り込まれているか

## 【重要】必須出力フォーマット
他の文章はいっさい出力せず、以下のJSONスキーマに完全に従って出力してください。

{
  "score": 0〜25の整数,
  "caseStudies": [
    {
      "companyName": "言及されている企業名（「ある企業」などの場合はその通り記載）",
      "claim": "その企業が行ったとされる事例や数値",
      "isAnonymous": true/false (「ある企業」「某メーカー」等匿名ならtrue, 実名ならfalse),
      "isVerified": true/false (検索で事実として確認できた場合はtrue, 嘘または確認不能ならfalse)
    }
  ],
  "factErrors": ["事実誤りがあればここに記載"],
  "feedback": "改善点を2〜4文で"
}

## 対象キーワード: ${keyword}

## 記事内容
${articleText.substring(0, 4000)}`;

    const result = await model.generateContent(prompt);
    return parseJson(result.response.text());
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// レビュアー3: 技術深度・エンジニア的価値レビュアー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function technicalDepthReviewer(articleText, keyword) {
    const model = getModel();
    const prompt = `あなたは「技術深度・エンジニア的価値」の専門レビュアーです。
この記事がフリーランスエンジニアによって書かれた技術的な価値のあるものか、25点満点で採点してください。

## 評価基準
- プロンプトではなく、コピペして使える「本物のプログラミングコード（Python, JavaScript, CLIコマンド等）」が掲載されているか（10点）
- コードやAPI、ツールの利用において、エンジニアならではの視点（前処理の自動化、エラーハンドリング、工数削減の仕組み等）が語られているか（10点）
- 使用技術名（Gemini API、pandas等）が明確に記載されているか（5点）

## 対象キーワード: ${keyword}

## 記事内容
${articleText.substring(0, 3000)}

## 出力フォーマット（JSONのみ。他は何も出力しない）
{"score": 点数（0〜25）, "feedback": "改善点を2〜3文で"}`;

    const result = await model.generateContent(prompt);
    return parseJson(result.response.text());
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// レビュアー4: 視聴者代表レビュアー（AI情報を求める読者）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function audienceReviewer(articleText, keyword) {
    const model = getModel();
    const prompt = `あなたは「AI活用に興味がある読者」の代表として記事をレビューします。
あなたはAIツールの情報を積極的に収集している一般ユーザーです。
以下のブログ記事を読んで、「読んで良かった！」と思えるかという観点から25点満点で採点してください。

## 評価基準
- 読み始めた瞬間に「これは自分のことだ」と共感できる導入があるか（8点）
- 記事を読んで「すぐ試してみたい」「保存しておきたい」と思えるか（8点）
- AI初心者でも理解できる平易な説明があるか（5点）
- 記事全体を読み終えた後に満足感があるか（4点）

## 対象キーワード: ${keyword}

## 記事内容
${articleText.substring(0, 3000)}

## 出力フォーマット（JSONのみ。他は何も出力しない）
{"score": 点数（0〜25）, "feedback": "読者視点での改善点を2〜3文で"}`;

    const result = await model.generateContent(prompt);
    return parseJson(result.response.text());
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 総括エージェント（ハードリジェクト機構搭載）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function coordinatorAgent(reviews, articleText, keyword, attemptNumber) {
    const { humanLikeness, freshness, technicalDepth, audience } = reviews;
    const totalRaw = humanLikeness.score + freshness.score + technicalDepth.score + audience.score;
    const factErrors = freshness.factErrors || [];
    const caseStudies = freshness.caseStudies || [];
    
    // プログラムによる致命的エラーの判定
    let hasFatalError = false;
    let fatalMessages = [];

    // 事例の中身をJSコードでチェック（LLMの情けを介在させない）
    for (const cs of caseStudies) {
        if (cs.isAnonymous) {
            hasFatalError = true;
            fatalMessages.push(`匿名事例が含まれています: ${cs.claim}`);
        }
        if (!cs.isVerified) {
            hasFatalError = true;
            fatalMessages.push(`裏付けのとれない事例が含まれています: ${cs.claim}`);
        }
    }
    if (factErrors.length > 0) {
        hasFatalError = true;
        fatalMessages.push(`事実誤りがあります: ${factErrors.join(' / ')}`);
    }

    const model = getModel();
    const prompt = `あなたはブログ記事品質の厳格な総括エージェントです。
判定結果を受け取り、最終スコアを決定します。

## 採点結果
- 人間らしさレビュアー: ${humanLikeness.score}/25点 → ${humanLikeness.feedback}
- 情報正確性・鮮度レビュアー: ${freshness.score}/25点 → ${freshness.feedback}
- 技術深度レビュアー: ${technicalDepth.score}/25点 → ${technicalDepth.feedback}
- 視聴者代表レビュアー: ${audience.score}/25点 → ${audience.feedback}
- レビュアー単純合計: ${totalRaw}/100点

## 【致命的エラー情報（JavaScriptによる判定）】
${hasFatalError ? `⚠️ 以下の致命的エラーが検出されました:\n- ${fatalMessages.join('\n- ')}` : '✅ 致命的な事実誤り・匿名事例は検出されませんでした'}

## 最終スコア判定ルール（厳守）
- 【絶対ルール】もし「致命的エラー情報」に1つでもエラーが記載されている場合、最終スコアは**強制的に0点（ゼロ）**にしてください。
- 致命的エラーがなければ、各レビュアーの合計点をベースに微調整して最終スコアを出してください。
- 現在の試行回数: ${attemptNumber}回目

## 出力フォーマット（JSONのみ）
{
  "finalScore": 最終スコア（致命的エラー時は必ず0）,
  "summary": "総評を2文で",
  "improvementGuide": "再生成向け具体的な改善指示（匿名事例があれば、具体例を出典付きで書くよう強く指示すること）"
}`;

    const result = await model.generateContent(prompt);
    const coordResult = parseJson(result.response.text());

    return {
        finalScore: coordResult.finalScore,
        summary: coordResult.summary,
        improvementGuide: coordResult.improvementGuide,
        details: { humanLikeness, freshness, technicalDepth, audience, rawTotal: totalRaw, caseStudies }
    };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン: 記事レビュー実行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * 記事をレビューして最終スコアと改善案を返す
 * @param {string} articleText - 記事全文（frontmatter込み）
 * @param {string} keyword - 対象キーワード
 * @param {number} attemptNumber - 現在の試行回数（1始まり）
 * @returns {{ finalScore, summary, improvementGuide, details }}
 */
async function reviewArticle(articleText, keyword, attemptNumber = 1) {
    const persona = loadPersona();

    console.log(`\n🔍 レビューエージェント起動（${attemptNumber}回目の試行）`);
    console.log('   ├── [1/4] 人間らしさレビュアー...');
    const humanLikeness = await humanLikenessReviewer(articleText, persona);

    console.log('   ├── [2/4] 情報正確性・鮮度レビュアー...');
    const freshness = await freshnessReviewer(articleText, keyword);

    console.log('   ├── [3/4] 技術深度・エンジニア的価値レビュアー...');
    const technicalDepth = await technicalDepthReviewer(articleText, keyword);

    console.log('   ├── [4/4] 視聴者代表レビュアー...');
    const audience = await audienceReviewer(articleText, keyword);

    console.log('   └── 総括エージェントが最終判定中...');
    const finalResult = await coordinatorAgent(
        { humanLikeness, freshness, technicalDepth, audience },
        articleText,
        keyword,
        attemptNumber
    );

    console.log(`\n📊 レビュー結果 (試行${attemptNumber}回目)`);
    console.log(`   └── 最終スコア: ${finalResult.finalScore}/100点`);
    console.log(`   └── 総評: ${finalResult.summary}`);

    if (finalResult.finalScore >= 80) {
        console.log('   ✅ 合格！記事を公開します。');
    } else {
        console.log('   ❌ 不合格。改善して再生成します。');
        console.log(`   └── 改善指示:\n      ${finalResult.improvementGuide}`);
    }

    return finalResult;
}

module.exports = { reviewArticle };
