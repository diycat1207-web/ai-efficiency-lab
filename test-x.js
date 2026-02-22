require('dotenv').config();
const { postTweet } = require('./scripts/post-to-x');

async function testPost() {
    console.log('Testing X API connection...');
    const result = await postTweet("これはAI経由の自動投稿テストです🤖 (設定確認中...)");
    if (result) {
        console.log('Success! API keys and permissions are correct.');
    } else {
        console.log('Failed! Please check your keys or permissions.');
    }
}

testPost();
