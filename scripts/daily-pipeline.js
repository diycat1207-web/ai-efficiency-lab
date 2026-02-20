/**
 * デイリーパイプライン
 * 毎日自動実行される全自動ワークフロー
 * 
 * 実行順序:
 * 1. 記事生成 → ブログに追加（戦略エンジンのフィードバックを反映）
 * 2. SNS投稿文生成 → キューに追加
 * 3. X (Twitter) 投稿
 * 4. Instagram 投稿
 * 5. ブログをビルド・デプロイ
 * 6. 統計更新
 * 7. 🧠 自己反省・トレンド分析・翌日の戦略策定
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const LOG_DIR = path.join(__dirname, 'logs');

// ログ出力
function log(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}`;
    console.log(logMsg);

    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const logFile = path.join(LOG_DIR, `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logMsg + '\n', 'utf-8');
}

function runStep(name, command) {
    log(`▶️  ${name} を開始...`);
    try {
        const output = execSync(command, {
            cwd: ROOT_DIR,
            encoding: 'utf-8',
            timeout: 120000,
            env: process.env
        });
        log(`✅ ${name} 完了`);
        if (output.trim()) {
            output.trim().split('\n').forEach(line => log(`   ${line}`));
        }
        return true;
    } catch (err) {
        log(`❌ ${name} でエラー: ${err.message}`);
        return false;
    }
}

async function main() {
    log('═══════════════════════════════════════');
    log('🚀 デイリーパイプライン開始');
    log('═══════════════════════════════════════');

    const node = process.execPath;

    // Step 1: 記事生成
    const articleGenerated = runStep(
        '記事生成',
        `"${node}" scripts/generate-article.js`
    );

    // Step 2: SNS投稿文生成（記事ベース）
    if (articleGenerated) {
        runStep(
            'SNS投稿文生成（記事シェア）',
            `"${node}" scripts/generate-sns-post.js`
        );
    }

    // Step 2b: 独立SNS投稿も生成
    runStep(
        'SNS投稿文生成（独立投稿）',
        `"${node}" scripts/generate-sns-post.js --standalone`
    );

    // Step 3: X (Twitter) 投稿
    runStep(
        'X投稿',
        `"${node}" scripts/post-to-x.js`
    );

    // Step 4: Instagram投稿
    runStep(
        'Instagram投稿',
        `"${node}" scripts/post-to-instagram.js`
    );

    // Step 5: ブログをビルド
    runStep(
        'ブログビルド',
        `"${node}" node_modules/.bin/eleventy`
    );

    // Step 6: Git コミット & プッシュ（GitHub Pages デプロイ）
    try {
        execSync('where git', { encoding: 'utf-8' });
        runStep('Git追加', 'git add -A');

        try {
            // 変更があるか確認
            execSync('git diff --staged --quiet', { stdio: 'ignore' });
            log('ℹ️  変更がないため、コミットとプッシュをスキップします。');
        } catch (e) {
            // exit code 1 (変更あり) の場合
            const date = new Date().toISOString().split('T')[0];
            runStep('Gitコミット', `git commit -m "auto: daily content update ${date}"`);
            runStep('Gitプッシュ', 'git push origin main');
            log('🌐 GitHub Pagesにデプロイ完了！');
        }
    } catch {
        log('⚠️  Gitが設定されていないため、デプロイをスキップしました。');
        log('📋 README.md の手順に従ってGitをセットアップしてください。');
    }

    log('');
    log('═══════════════════════════════════════');
    log('🧠 Step 7: 自己反省・戦略改善');
    log('═══════════════════════════════════════');

    // Step 7: 自己反省・トレンド分析・戦略策定
    runStep(
        '自己反省・戦略改善エンジン',
        `"${node}" scripts/analyze-and-reflect.js`
    );

    log('');
    log('═══════════════════════════════════════');
    log('🎉 デイリーパイプライン完了！');
    log('═══════════════════════════════════════');
    log('📊 明日の生成は今日の反省を踏まえて改善されます');
}

main().catch(err => {
    log(`💀 致命的エラー: ${err.message}`);
    process.exit(1);
});
