/**
 * X (Twitter) 用 1日3回ランダム投稿スケジューラー登録スクリプト
 * 朝・昼・夕の時間帯に、ランダムな遅延（最大2時間）を持たせてタスクを実行します。
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.join(__dirname, '..');
const NODE_PATH = process.execPath;
const SCRIPT_PATH = path.join(__dirname, 'post-to-x.js');

const TASKS = [
    { name: 'AI_Efficiency_Lab_X_Morning', time: '08:00', desc: '朝のX投稿' },
    { name: 'AI_Efficiency_Lab_X_Noon', time: '12:00', desc: '昼のX投稿' },
    { name: 'AI_Efficiency_Lab_X_Evening', time: '18:00', desc: '夜のX投稿' }
];

// バッチファイルを作成
function createBatchFile() {
    const batchPath = path.join(ROOT_DIR, 'run-x-post.bat');
    const logPath = path.join(ROOT_DIR, 'logs', 'x-scheduler.log');
    const content = `@echo off\r\nchcp 65001 > nul\r\ncd /d "${ROOT_DIR}"\r\n"${NODE_PATH}" "${SCRIPT_PATH}" --single --delay >> "${logPath}" 2>&1\r\n`;
    fs.writeFileSync(batchPath, content, 'utf-8');
    console.log(`📄 バッチファイル作成: ${batchPath}`);
    return batchPath;
}

// タスクスケジューラに登録 (標準 schtasks を使用)
function registerTasks(batchPath) {
    for (const task of TASKS) {
        // schtasks コマンドで単純に時間を指定して登録
        const command = `schtasks /create /tn "${task.name}" /tr "${batchPath}" /sc daily /st ${task.time} /f`;

        try {
            console.log(`⏳ ${task.name} を登録中... (${task.time})`);
            execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
            console.log(`✅ ${task.name} 登録成功！`);
        } catch (err) {
            console.error(`❌ ${task.name} の登録に失敗しました。`);
            console.error('   手動で登録するか、管理者権限で実行してください。');
        }
    }
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--remove')) {
    console.log('🗑️ Xタスクを削除中...');
    for (const task of TASKS) {
        try {
            execSync(`schtasks /delete /tn "${task.name}" /f`, { stdio: 'pipe' });
            console.log(`✅ ${task.name} 削除成功`);
        } catch {
            console.log(`ℹ️  ${task.name} はありませんでした`);
        }
    }
} else {
    console.log('🔧 X用 1日3回ランダム投稿スケジューラ設定を開始します...\n');
    const batchPath = createBatchFile();
    registerTasks(batchPath);
    console.log('\n💡 タスクの削除: node scripts/setup-x-scheduler.js --remove');
}
