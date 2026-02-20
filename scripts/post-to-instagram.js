/**
 * Instagram 自動投稿Bot
 * Instagram Graph API 経由 (Business/Creator アカウント必要)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { updateStats } = require('./generate-article');

const SNS_QUEUE_DIR = path.join(__dirname, 'sns-queue');

// Instagram Graph API でカルーセル投稿を作成
async function postToInstagram(caption, imageUrl) {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    if (!accessToken || !accountId) {
        console.log('⚠️  Instagram API キーが設定されていません。投稿をスキップします。');
        console.log('📋 .env ファイルに INSTAGRAM_ACCESS_TOKEN と INSTAGRAM_BUSINESS_ACCOUNT_ID を設定してください。');
        return false;
    }

    // Step 1: メディアコンテナを作成
    const createUrl = `https://graph.facebook.com/v18.0/${accountId}/media`;
    const createParams = new URLSearchParams({
        image_url: imageUrl || 'https://via.placeholder.com/1080x1080/6c5ce7/ffffff?text=AI+Efficiency+Lab',
        caption: caption,
        access_token: accessToken
    });

    return new Promise((resolve, reject) => {
        const req = https.request(`${createUrl}?${createParams}`, { method: 'POST' }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                try {
                    const result = JSON.parse(data);
                    if (result.id) {
                        // Step 2: メディアを公開
                        const publishUrl = `https://graph.facebook.com/v18.0/${accountId}/media_publish`;
                        const publishParams = new URLSearchParams({
                            creation_id: result.id,
                            access_token: accessToken
                        });

                        const pubReq = https.request(`${publishUrl}?${publishParams}`, { method: 'POST' }, (pubRes) => {
                            let pubData = '';
                            pubRes.on('data', chunk => pubData += chunk);
                            pubRes.on('end', () => {
                                const pubResult = JSON.parse(pubData);
                                if (pubResult.id) {
                                    console.log(`✅ Instagram投稿成功！ ID: ${pubResult.id}`);
                                    resolve(true);
                                } else {
                                    console.error('❌ 投稿公開失敗:', pubData);
                                    resolve(false);
                                }
                            });
                        });
                        pubReq.on('error', reject);
                        pubReq.end();
                    } else {
                        console.error('❌ メディアコンテナ作成失敗:', data);
                        resolve(false);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// キューからInstagram投稿を処理
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

        if (data.posted && data.posted.instagram) continue;

        try {
            let caption = '';
            if (data.content && data.content.instagram) {
                const igData = typeof data.content.instagram === 'string'
                    ? JSON.parse(data.content.instagram)
                    : data.content.instagram;
                caption = igData.caption || '';
                if (igData.hashtags) {
                    caption += '\n\n' + igData.hashtags.map(t => `#${t}`).join(' ');
                }
            }

            if (!caption) continue;

            const success = await postToInstagram(caption);
            if (success) {
                data.posted.instagram = true;
                data.postedAt = { ...data.postedAt, instagram: new Date().toISOString() };
                fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
                updateStats('sns');
                posted++;
            }
        } catch (err) {
            console.error(`❌ ${file} 投稿中にエラー:`, err.message);
        }
    }

    console.log(`\n📊 Instagram処理結果: ${posted}件投稿`);
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--test')) {
        console.log('🧪 テストモード: 設定状態を確認');
        console.log(`  INSTAGRAM_ACCESS_TOKEN: ${process.env.INSTAGRAM_ACCESS_TOKEN ? '✅ 設定済み' : '❌ 未設定'}`);
        console.log(`  INSTAGRAM_BUSINESS_ACCOUNT_ID: ${process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ? '✅ 設定済み' : '❌ 未設定'}`);
    } else {
        processQueue().catch(err => {
            console.error('❌ エラー:', err.message);
            process.exit(1);
        });
    }
}

module.exports = { postToInstagram, processQueue };
