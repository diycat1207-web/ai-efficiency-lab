/**
 * X (Twitter) 自動投稿Bot
 * Free Tier: 月1,500ツイートまで (v2 API)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { updateStats } = require('./generate-article');

const SNS_QUEUE_DIR = path.join(__dirname, 'sns-queue');

// OAuth 1.0a 署名生成
function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
    const sortedParams = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
    const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

// X API v2 でツイート投稿
async function postTweet(text) {
    const apiKey = process.env.X_API_KEY;
    const apiSecret = process.env.X_API_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
        console.log('⚠️  X API キーが設定されていません。投稿をスキップします。');
        console.log('📋 .env ファイルに X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET を設定してください。');
        return false;
    }

    const url = 'https://api.twitter.com/2/tweets';
    const method = 'POST';

    const oauthParams = {
        oauth_consumer_key: apiKey,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: accessToken,
        oauth_version: '1.0'
    };

    const signature = generateOAuthSignature(method, url, oauthParams, apiSecret, accessTokenSecret);
    oauthParams.oauth_signature = signature;

    const authHeader = 'OAuth ' + Object.keys(oauthParams)
        .sort()
        .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
        .join(', ');

    const body = JSON.stringify({ text });

    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 201) {
                    const result = JSON.parse(data);
                    console.log(`✅ ツイート投稿成功！ ID: ${result.data.id}`);
                    resolve(true);
                } else {
                    console.error(`❌ 投稿失敗 (${res.statusCode}):`, data);
                    resolve(false);
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// キューからX投稿を処理
async function processQueue() {
    if (!fs.existsSync(SNS_QUEUE_DIR)) {
        console.log('📭 投稿キューが空です。');
        return;
    }

    const files = fs.readdirSync(SNS_QUEUE_DIR)
        .filter(f => f.endsWith('.json'))
        .sort();

    let posted = 0;
    for (const file of files) {
        const filepath = path.join(SNS_QUEUE_DIR, file);
        const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

        if (data.posted && data.posted.x === true) continue; // 全て投稿済みスキップ

        try {
            let tweetText = '';

            if (data.content && data.content.x) {
                const xData = typeof data.content.x === 'string' ? JSON.parse(data.content.x) : data.content.x;

                // 配列形式 (1日複数回投稿ループ)
                if (Array.isArray(xData)) {
                    const postedCount = typeof data.posted.x === 'number' ? data.posted.x : 0;
                    if (postedCount >= xData.length) {
                        data.posted.x = true;
                        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
                        continue;
                    }

                    const currentPost = xData[postedCount];
                    tweetText = currentPost.text || '';
                    if (currentPost.hashtags) {
                        tweetText += '\n\n' + currentPost.hashtags.map(t => `#${t}`).join(' ');
                    }

                    // 次回のためにカウンターを進める
                    if (postedCount + 1 >= xData.length) {
                        data.posted.x = true;
                    } else {
                        data.posted.x = postedCount + 1;
                    }
                }
                // 従来の単一投稿形式
                else {
                    tweetText = xData.text || '';
                    if (xData.hashtags) {
                        tweetText += '\n\n' + xData.hashtags.map(t => `#${t}`).join(' ');
                    }
                    data.posted.x = true;
                }
            }

            if (!tweetText) {
                data.posted.x = true;
                fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
                continue;
            }

            const success = await postTweet(tweetText);
            if (success) {
                data.postedAt = { ...data.postedAt, x: new Date().toISOString() };
                fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
                updateStats('sns');
                posted++;

                // --single オプションで1件のみ処理して終了
                if (process.argv.includes('--single')) {
                    console.log(`\n📊 処理結果: ${posted}件投稿 (シングルモード)`);
                    return;
                }
            }
        } catch (err) {
            console.error(`❌ ${file} の投稿中にエラー:`, err.message);
        }
    }

    console.log(`\n📊 処理結果: ${posted}件投稿`);
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);

    const run = async () => {
        if (args.includes('--delay')) {
            const delayMin = Math.floor(Math.random() * 120);
            console.log(`⏱️ ランダム遅延: ${delayMin}分待機中...`);
            await new Promise(r => setTimeout(r, delayMin * 60 * 1000));
        }

        if (args.includes('--test')) {
            console.log('🧪 テストモード: APIを呼ばずにキューの内容を表示');
            if (fs.existsSync(SNS_QUEUE_DIR)) {
                // ... test logic ...
                const files = fs.readdirSync(SNS_QUEUE_DIR).filter(f => f.endsWith('.json'));
                files.forEach(f => {
                    const data = JSON.parse(fs.readFileSync(path.join(SNS_QUEUE_DIR, f), 'utf-8'));
                    console.log(`\n📄 ${f}`);
                    console.log(`  タイプ: ${data.type}`);
                    console.log(`  X投稿済み: ${data.posted?.x || false}`);
                    if (data.content?.x) console.log(`  内容: ${JSON.stringify(data.content.x).substring(0, 100)}...`);
                });
            }
        } else {
            await processQueue();
        }
    };

    run().catch(err => {
        console.error('❌ エラー:', err.message);
        process.exit(1);
    });
}

module.exports = { postTweet, processQueue };
