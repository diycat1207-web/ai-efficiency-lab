/**
 * 自己反省・戦略改善エンジン
 * 
 * 毎日のパイプライン実行後に:
 * 1. 過去の記事・SNS投稿のパフォーマンスを分析
 * 2. 何が良かった/悪かったかをAIが自己反省
 * 3. 最新のトレンドを考慮
 * 4. 翌日の戦略を策定し strategy.json に保存
 * 5. 翌日の記事・SNS生成がこの戦略を参照
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const POSTS_DIR = path.join(__dirname, '..', 'src', 'posts');
const STRATEGY_FILE = path.join(__dirname, 'strategy.json');
const REFLECTION_DIR = path.join(__dirname, 'reflections');
const STATS_FILE = path.join(__dirname, 'stats.json');
const KEYWORDS_FILE = path.join(__dirname, 'keywords.json');
const SNS_QUEUE_DIR = path.join(__dirname, 'sns-queue');
const LOG_DIR = path.join(__dirname, 'logs');

function getGenAI() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY が設定されていません');
    process.exit(1);
  }
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// ========================================
// データ収集: 現状を把握する
// ========================================

function collectCurrentState() {
  const state = {
    totalArticles: 0,
    recentArticles: [],
    totalSnsPosts: 0,
    recentSnsPosts: [],
    stats: null,
    usedKeywords: [],
    remainingKeywords: [],
    previousStrategy: null,
    previousReflections: [],
    daysSinceStart: 0
  };

  // 記事データの収集
  if (fs.existsSync(POSTS_DIR)) {
    const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).sort().reverse();
    state.totalArticles = files.length;

    // 最新10記事の内容を取得
    state.recentArticles = files.slice(0, 10).map(f => {
      const content = fs.readFileSync(path.join(POSTS_DIR, f), 'utf-8');
      const titleMatch = content.match(/title:\s*"(.+?)"/);
      const keywordMatch = content.match(/keyword:\s*"(.+?)"/);
      const tagsMatch = content.match(/tags:\s*\[(.+?)\]/);
      const dateMatch = content.match(/date:\s*(.+)/);
      const bodyStart = content.indexOf('---', content.indexOf('---') + 3) + 3;
      const body = content.substring(bodyStart).trim();
      return {
        filename: f,
        title: titleMatch ? titleMatch[1] : f,
        keyword: keywordMatch ? keywordMatch[1] : '',
        tags: tagsMatch ? tagsMatch[1] : '',
        date: dateMatch ? dateMatch[1].trim() : '',
        wordCount: body.length,
        preview: body.substring(0, 300)
      };
    });
  }

  // SNS投稿データの収集
  if (fs.existsSync(SNS_QUEUE_DIR)) {
    const snsFiles = fs.readdirSync(SNS_QUEUE_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    state.totalSnsPosts = snsFiles.length;
    state.recentSnsPosts = snsFiles.slice(0, 10).map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SNS_QUEUE_DIR, f), 'utf-8'));
        return {
          filename: f,
          type: data.type,
          posted: data.posted,
          createdAt: data.createdAt
        };
      } catch { return { filename: f }; }
    });
  }

  // 統計データ
  if (fs.existsSync(STATS_FILE)) {
    state.stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    if (state.stats.history && state.stats.history.length > 0) {
      state.daysSinceStart = state.stats.history.length;
    }
  }

  // キーワード使用状況
  if (fs.existsSync(KEYWORDS_FILE)) {
    const kwData = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf-8'));
    const all = kwData.categories.flatMap(c => c.keywords);
    state.usedKeywords = kwData.usedKeywords || [];
    state.remainingKeywords = all.filter(k => !state.usedKeywords.includes(k));
  }

  // 前回の戦略
  if (fs.existsSync(STRATEGY_FILE)) {
    state.previousStrategy = JSON.parse(fs.readFileSync(STRATEGY_FILE, 'utf-8'));
  }

  // 過去の反省レポート（直近5件）
  if (fs.existsSync(REFLECTION_DIR)) {
    const reflFiles = fs.readdirSync(REFLECTION_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    state.previousReflections = reflFiles.slice(0, 5).map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(REFLECTION_DIR, f), 'utf-8'));
      } catch { return null; }
    }).filter(Boolean);
  }

  return state;
}

// ========================================
// AIによる自己反省・戦略策定
// ========================================

async function performReflection(state) {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `あなたはブログ・SNSコンテンツ戦略の専門コンサルタントです。
以下のデータを分析し、自己反省と翌日の戦略を策定してください。

## 現在のブログ: 「AI Efficiency Lab」（AI活用術・効率化ツール情報メディア）

## 運用データ:
- 運用日数: ${state.daysSinceStart}日
- 公開記事数: ${state.totalArticles}本
- SNS投稿数: ${state.totalSnsPosts}件
- 使用済みキーワード: ${state.usedKeywords.length}個
- 残りキーワード: ${state.remainingKeywords.length}個

## 最近の記事（直近10本）:
${state.recentArticles.map((a, i) => `${i + 1}. 「${a.title}」(キーワード: ${a.keyword}, ${a.wordCount}文字, ${a.date})`).join('\n')}

## 前回の戦略:
${state.previousStrategy ? JSON.stringify(state.previousStrategy.strategy, null, 2) : 'なし（初回）'}

## 過去の反省の要点:
${state.previousReflections.length > 0
      ? state.previousReflections.map(r => `- ${r.date}: ${r.summary || '反省なし'}`).join('\n')
      : 'なし（初回）'
    }

## 残りキーワード候補:
${state.remainingKeywords.slice(0, 20).join(', ')}

## タスク:
以下の3つをJSON形式で出力してください。

1. **reflection（反省）**: 過去のコンテンツを分析し、何が良かったか・何を改善すべきかを具体的に指摘
2. **trend_analysis（トレンド分析）**: 2026年2月時点のAI・テック業界のトレンドを考慮し、今伸びそうなトピックを提案
3. **strategy（翌日の戦略）**: 反省とトレンドを踏まえた具体的な行動計画

以下のJSON形式で出力してください:
\`\`\`json
{
  "reflection": {
    "good_points": ["良かった点1", "良かった点2"],
    "bad_points": ["改善すべき点1", "改善すべき点2"],
    "content_quality_score": 7,
    "keyword_strategy_score": 6,
    "overall_assessment": "全体評価を2〜3文で"
  },
  "trend_analysis": {
    "hot_topics": ["トレンドトピック1", "トレンドトピック2", "トレンドトピック3"],
    "recommended_angles": ["切り口1", "切り口2"],
    "avoid_topics": ["避けるべきトピック（飽和している等）"]
  },
  "strategy": {
    "priority_keyword": "明日最優先で書くべきキーワード",
    "writing_style_adjustment": "文体・構成で変えること",
    "seo_improvements": ["SEO改善ポイント1", "SEO改善ポイント2"],
    "sns_strategy": "SNS投稿で変えること",
    "new_keywords_to_add": ["追加すべき新キーワード1", "追加すべき新キーワード2", "追加すべき新キーワード3"],
    "content_direction": "今後のコンテンツの方向性（2〜3文）",
    "experiment": "明日試す新しい取り組み（1つ）"
  },
  "summary": "今回の反省・戦略の要約（1文）"
}
\`\`\``;

  console.log('🧠 AIが自己反省と戦略策定を実行中...\n');
  const result = await model.generateContent(prompt);
  let text = result.response.text();

  // JSONを抽出
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    text = jsonMatch[1];
  }
  text = text.trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('⚠️ JSON解析エラー。生テキストを保存します。');
    return {
      reflection: { overall_assessment: text.substring(0, 500) },
      trend_analysis: { hot_topics: [] },
      strategy: { content_direction: 'デフォルト戦略を維持' },
      summary: '解析エラーのため詳細な反省は次回に持ち越し',
      raw: text
    };
  }
}

// ========================================
// 戦略の保存と適用
// ========================================

function saveReflection(reflectionData) {
  // 反省レポートを保存
  if (!fs.existsSync(REFLECTION_DIR)) {
    fs.mkdirSync(REFLECTION_DIR, { recursive: true });
  }

  const today = new Date().toISOString().split('T')[0];
  const reflectionFile = path.join(REFLECTION_DIR, `${today}.json`);
  fs.writeFileSync(reflectionFile, JSON.stringify({
    date: today,
    ...reflectionData,
    generatedAt: new Date().toISOString()
  }, null, 2), 'utf-8');
  console.log(`📝 反省レポート保存: reflections/${today}.json`);

  // 戦略ファイルを更新
  const strategyData = {
    lastUpdated: new Date().toISOString(),
    strategy: reflectionData.strategy || {},
    trendAnalysis: reflectionData.trend_analysis || {},
    reflectionSummary: reflectionData.summary || ''
  };
  fs.writeFileSync(STRATEGY_FILE, JSON.stringify(strategyData, null, 2), 'utf-8');
  console.log('📋 戦略ファイル更新: strategy.json');

  // 新しいキーワードがあればキーワードDBに追加
  if (reflectionData.strategy && reflectionData.strategy.new_keywords_to_add) {
    const newKws = reflectionData.strategy.new_keywords_to_add;
    if (newKws.length > 0) {
      const kwData = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf-8'));

      // 「AIが提案」カテゴリが無ければ作成
      let aiCategory = kwData.categories.find(c => c.name === 'AI提案キーワード');
      if (!aiCategory) {
        aiCategory = { name: 'AI提案キーワード', keywords: [] };
        kwData.categories.push(aiCategory);
      }

      // 重複を除いて追加
      const allExisting = kwData.categories.flatMap(c => c.keywords);
      const toAdd = newKws.filter(k => !allExisting.includes(k));
      aiCategory.keywords.push(...toAdd);

      fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(kwData, null, 2), 'utf-8');
      if (toAdd.length > 0) {
        console.log(`🆕 キーワード追加: ${toAdd.join(', ')}`);
      }
    }
  }
}

// ========================================
// メイン実行
// ========================================

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('🧠 自己反省・戦略改善エンジン');
  console.log('═══════════════════════════════════════\n');

  // Step 1: 現状データ収集
  console.log('📊 現状データを収集中...');
  const state = collectCurrentState();
  console.log(`   記事: ${state.totalArticles}本 | SNS: ${state.totalSnsPosts}件 | 運用: ${state.daysSinceStart}日\n`);

  // Step 2: AIによる反省・分析・戦略策定
  const reflectionData = await performReflection(state);

  // Step 3: 結果を表示
  console.log('\n📋 === 反省結果 ===');
  if (reflectionData.reflection) {
    const r = reflectionData.reflection;
    if (r.good_points) console.log(`\n✅ 良かった点:\n${r.good_points.map(p => `   ・${p}`).join('\n')}`);
    if (r.bad_points) console.log(`\n⚠️ 改善点:\n${r.bad_points.map(p => `   ・${p}`).join('\n')}`);
    if (r.overall_assessment) console.log(`\n📝 総評: ${r.overall_assessment}`);
  }

  if (reflectionData.trend_analysis) {
    const t = reflectionData.trend_analysis;
    if (t.hot_topics) console.log(`\n🔥 トレンドトピック:\n${t.hot_topics.map(p => `   ・${p}`).join('\n')}`);
  }

  if (reflectionData.strategy) {
    const s = reflectionData.strategy;
    console.log('\n🎯 === 明日の戦略 ===');
    if (s.priority_keyword) console.log(`   最優先キーワード: 「${s.priority_keyword}」`);
    if (s.content_direction) console.log(`   方向性: ${s.content_direction}`);
    if (s.experiment) console.log(`   実験: ${s.experiment}`);
    if (s.sns_strategy) console.log(`   SNS戦略: ${s.sns_strategy}`);
  }

  if (reflectionData.summary) {
    console.log(`\n💡 まとめ: ${reflectionData.summary}`);
  }

  // Step 4: 保存
  saveReflection(reflectionData);

  console.log('\n═══════════════════════════════════════');
  console.log('✅ 自己反省・戦略改善 完了！');
  console.log('   → 翌日の記事生成はこの戦略を自動参照します');
  console.log('═══════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

module.exports = { collectCurrentState, performReflection, saveReflection };
