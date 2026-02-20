/**
 * SNS投稿文自動生成スクリプト
 * ブログ記事や独立したコンテンツからSNS投稿を生成
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const POSTS_DIR = path.join(__dirname, '..', 'src', 'posts');
const SNS_QUEUE_DIR = path.join(__dirname, 'sns-queue');

function getGenAI() {
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ GEMINI_API_KEY が .env に設定されていません');
        process.exit(1);
    }
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// ブログ記事からSNS投稿を生成
async function generateFromArticle(articlePath) {
    const content = fs.readFileSync(articlePath, 'utf-8');
    const titleMatch = content.match(/title:\s*"(.+?)"/);
    const title = titleMatch ? titleMatch[1] : '新しい記事';

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // X (Twitter) 用投稿生成
    const xPrompt = `以下のブログ記事を元に、X (Twitter) 用の投稿文を生成してください。

記事タイトル: ${title}
記事内容: ${content.substring(0, 2000)}

要件:
- 140文字以内（日本語）
- 読者の興味を引くフック
- 記事のリンクを貼る想定（文字数に含めない）
- ハッシュタグを2〜3個つける
- 絵文字を効果的に使う
- 宣伝臭くなく、価値ある情報を端的に伝える

以下のJSON形式で出力:
{"text": "投稿文", "hashtags": ["tag1", "tag2"]}`;

    console.log('🐦 X投稿文を生成中...');
    const xResult = await model.generateContent(xPrompt);
    let xText = xResult.response.text();
    xText = xText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Instagram 用投稿生成
    const igPrompt = `以下のブログ記事を元に、Instagram投稿用のキャプションを生成してください。

記事タイトル: ${title}
記事内容: ${content.substring(0, 2000)}

要件:
- 500文字程度
- 最初の1行で強いフック
- 記事の要点を3〜5個のポイントにまとめる
- 「詳しくはプロフィールのリンクから」的な誘導
- ハッシュタグを10〜15個（日本語＋英語混在）
- 絵文字で読みやすくする
- 改行を多めに使って読みやすく

以下のJSON形式で出力:
{"caption": "キャプション全文", "hashtags": ["tag1", "tag2"]}`;

    console.log('📸 Instagramキャプションを生成中...');
    const igResult = await model.generateContent(igPrompt);
    let igText = igResult.response.text();
    igText = igText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    return { x: xText, instagram: igText, title };
}

// 独立したSNS投稿を生成（記事なし）
async function generateStandalonePost() {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const topics = [
        'AIツールの小技・Tips',
        '効率化のライフハック',
        'おすすめの無料AIツール紹介',
        '生産性向上の考え方',
        'AIニュースの解説',
        '便利なショートカットキー',
        'リモートワークのコツ',
        'AIで自動化できること'
    ];

    const topic = topics[Math.floor(Math.random() * topics.length)];

    const xPrompt = `あなたはAI活用・効率化の専門家としてXで発信しています。
「${topic}」について、フォロワーに役立つ投稿を1つ作ってください。

要件:
- 140文字以内（日本語）
- 具体的で実用的な内容
- 読者が「保存したい」「シェアしたい」と思う有益さ
- ハッシュタグ2〜3個
- 絵文字を効果的に使う

以下のJSON形式で出力:
{"text": "投稿文", "hashtags": ["tag1", "tag2"]}`;

    console.log(`🐦 独立X投稿を生成中... (テーマ: ${topic})`);
    const xResult = await model.generateContent(xPrompt);
    let xText = xResult.response.text();
    xText = xText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    return { x: xText, topic };
}

// SNS投稿をキューに保存
function saveToQueue(snsContent, type = 'article-share') {
    if (!fs.existsSync(SNS_QUEUE_DIR)) {
        fs.mkdirSync(SNS_QUEUE_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-${type}.json`;
    const filepath = path.join(SNS_QUEUE_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify({
        type,
        createdAt: new Date().toISOString(),
        posted: { x: false, instagram: false },
        content: snsContent
    }, null, 2), 'utf-8');

    console.log(`📦 キューに保存: ${filename}`);
    return filepath;
}

// CLI
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--standalone')) {
        // 独立した投稿を生成
        const result = await generateStandalonePost();
        console.log('\n--- X投稿 ---');
        console.log(result.x);
        saveToQueue(result, 'standalone');
    } else {
        // 最新の記事からSNS投稿を生成
        if (!fs.existsSync(POSTS_DIR)) {
            console.log('📝 まだ記事がありません。先に generate-article.js を実行してください。');
            return;
        }

        const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).sort().reverse();
        if (files.length === 0) {
            console.log('📝 まだ記事がありません。先に generate-article.js を実行してください。');
            return;
        }

        const latestArticle = path.join(POSTS_DIR, files[0]);
        console.log(`📄 最新記事: ${files[0]}\n`);

        const result = await generateFromArticle(latestArticle);
        console.log('\n--- X投稿 ---');
        console.log(result.x);
        console.log('\n--- Instagram ---');
        console.log(result.instagram);

        saveToQueue(result, 'article-share');
    }

    console.log('\n✅ SNS投稿の生成が完了しました！');
}

main().catch(err => {
    console.error('❌ エラー:', err.message);
    process.exit(1);
});

module.exports = { generateFromArticle, generateStandalonePost, saveToQueue };
