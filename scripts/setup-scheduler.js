/**
 * Windows タスクスケジューラ 自動登録スクリプト
 * デイリーパイプラインを毎朝6時に自動実行するタスクを作成
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.join(__dirname, '..');
const NODE_PATH = 'c:\\tools\\node-v20.11.1-win-x64\\node.exe';
const SCRIPT_PATH = path.join(__dirname, 'daily-pipeline.js');
const TASK_NAME = 'AI_Efficiency_Lab_Daily';

// バッチファイルを作成（タスクスケジューラから実行される）
function createBatchFile() {
    const batchPath = path.join(ROOT_DIR, 'run-daily.bat');
    const content = `@echo off
cd /d "${ROOT_DIR}"
set PATH=c:\\tools\\node-v20.11.1-win-x64;%PATH%
"${NODE_PATH}" "${SCRIPT_PATH}"
`;
    fs.writeFileSync(batchPath, content, 'utf-8');
    console.log(`📄 バッチファイル作成: ${batchPath}`);
    return batchPath;
}

// タスクスケジューラに登録
function registerTask(batchPath) {
    const command = `schtasks /create /tn "${TASK_NAME}" /tr "${batchPath}" /sc daily /st 06:00 /f /rl highest`;

    try {
        execSync(command, { encoding: 'utf-8' });
        console.log(`✅ タスクスケジューラに登録しました！`);
        console.log(`   タスク名: ${TASK_NAME}`);
        console.log(`   実行時刻: 毎日 06:00`);
        console.log(`   実行内容: デイリーパイプライン`);
        return true;
    } catch (err) {
        console.error('❌ タスクの登録に失敗しました。');
        console.error('   管理者権限で実行してください。');
        console.log('\n📋 手動で登録する場合:');
        console.log(`   1. タスクスケジューラを開く`);
        console.log(`   2. 「基本タスクの作成」を選択`);
        console.log(`   3. 名前: ${TASK_NAME}`);
        console.log(`   4. トリガー: 毎日 06:00`);
        console.log(`   5. 操作: プログラムの開始 → ${batchPath}`);
        return false;
    }
}

// タスクの状態を確認
function checkTask() {
    try {
        const output = execSync(`schtasks /query /tn "${TASK_NAME}" /fo list`, { encoding: 'utf-8' });
        console.log('\n📋 現在のタスク状態:');
        console.log(output);
        return true;
    } catch {
        console.log('ℹ️  タスクはまだ登録されていません。');
        return false;
    }
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--check')) {
    checkTask();
} else if (args.includes('--remove')) {
    try {
        execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { encoding: 'utf-8' });
        console.log('🗑️  タスクを削除しました。');
    } catch {
        console.log('ℹ️  タスクが見つかりませんでした。');
    }
} else {
    console.log('🔧 タスクスケジューラ設定を開始します...\n');
    const batchPath = createBatchFile();
    registerTask(batchPath);
    console.log('\n💡 タスクの確認: node scripts/setup-scheduler.js --check');
    console.log('💡 タスクの削除: node scripts/setup-scheduler.js --remove');
}
