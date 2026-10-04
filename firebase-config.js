/* =========================================================
   Firebase 設定ファイル
   =========================================================
   Firebaseコンソール（プロジェクトの設定 > 全般 > マイアプリ）に
   表示される設定値を、下の firebaseConfig にそのまま貼り付けてください。

   補足: ここに書く apiKey 等は「ブラウザで動くWebアプリ用の公開設定値」で、
   秘密情報ではありません（Firebase公式の想定通りの使い方です）。
   実際のデータ保護は firestore.rules（セキュリティルール）側で行います。
   ですのでこのファイルをそのままGitHubにアップロードして問題ありません。
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyA8wkSKdiAasQmmy2P8xNFJAVHBlITnxR8",
  authDomain: "heiseikai-fb835.firebaseapp.com",
  projectId: "heiseikai-fb835",
  storageBucket: "heiseikai-fb835.firebasestorage.app",
  messagingSenderId: "613554697138",
  appId: "1:613554697138:web:e7b43907139495bc7e6aab"
};

// Firebase 初期化（index.html / admin.html どちらからも読み込まれます）
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
