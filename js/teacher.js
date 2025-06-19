// Firebaseアプリ初期化関連
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js";

// Firebase Authentication関連
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  setPersistence,
  browserSessionPersistence,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";

// Firebase Realtime Database関連
import {
  getDatabase,
  ref,
  update,
  get,
  child,
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-database.js";

// Firebase構成ファイルを読み込み
import { firebaseConfig } from "./firebaseConfig.js";
// Gemini構成ファイルを読み込み
import { translationConfig } from "./translationConfig.js";

// Firebaseアプリを初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

//セッション持続性を設定（ブラウザを閉じると自動ログアウト）
setPersistence(auth, browserSessionPersistence)
  .then(() => {
    console.log("セッション持続性を設定しました");
  })
  .catch((error) => {
    console.error("持続性の設定に失敗しました:", error);
  });

// Gemini翻訳関数
async function translateWithGemini(text, sourceLang, targetLang = "ja") {
  if (!text || !sourceLang) return text;
  try {
    const prompt = `以下の文を ${sourceLang} から ${targetLang} に翻訳してください。語釈や解説なしで、翻訳文だけを一文で返してください。\n\n文：${text}`;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${translationConfig.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );
    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text ?? text;
  } catch (err) {
    console.error("Gemini翻訳失敗:", err);
    return text;
  }
}

// Firebase Authenticationでログイン状態を監視
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // 未ログインならログインページへリダイレクト
    window.location.href = "index.html";
    return;
  }

  // ユーザー（講師）のUIDを取得
  const teacherUid = user.uid;
  const dbRef = ref(db);

  // 講師名を取得
  const nameSnap = await get(child(dbRef, `users/${teacherUid}/name`));
  const teacherName = nameSnap.exists() ? nameSnap.val() : "講師";

  // 講師名を表示
  document.getElementById(
    "teacherGreeting"
  ).textContent = `こんにちは、${teacherName}先生`;

  // 生徒と講師の割り当て（pairs）を取得
  const pairsSnap = await get(child(dbRef, "pairs"));
  if (!pairsSnap.exists()) {
    console.log("pairs が存在しません");
    return;
  }

  const pairs = pairsSnap.val();

  // 担当している生徒のUIDを抽出
  const myStudents = Object.entries(pairs)
    .filter(
      ([studentUid, assignedTeacherUid]) => assignedTeacherUid === teacherUid
    )
    .map(([studentUid]) => studentUid);

  console.log("担当生徒一覧:", myStudents);

  // 担当生徒の投稿を取得・表示
  await getStudentPosts(teacherUid);
});

// 担当生徒の投稿を取得する関数
async function getStudentPosts(teacherUid) {
  const dbRef = ref(db);
  const pairsSnap = await get(child(dbRef, "pairs"));
  if (!pairsSnap.exists()) return;

  const pairs = pairsSnap.val();
  const myStudents = Object.entries(pairs)
    .filter(
      ([studentUid, assignedTeacherUid]) => assignedTeacherUid === teacherUid
    )
    .map(([studentUid]) => studentUid);

  const postsDiv = document.getElementById("studentPosts");
  postsDiv.innerHTML = ""; // 画面をクリア

  for (const studentUid of myStudents) {
    // 生徒の名前を取得
    const studentNameSnap = await get(child(dbRef, `users/${studentUid}/name`));
    const studentName = studentNameSnap.exists()
      ? studentNameSnap.val()
      : "生徒";

    // チャットルームIDとメッセージを取得
    const chatRoomId = `${studentUid}_${teacherUid}`;
    const chatRef = ref(db, `chats/${chatRoomId}/messages`);
    const snapshot = await get(chatRef);
    const data = snapshot.val();

    if (data) {
      const section = document.createElement("div");
      section.innerHTML = `<h4>${studentName}さんの記録</h4>`;

      const entries = Object.entries(data).reverse();

      for (const [msgId, msg] of entries) {
        const entry = document.createElement("div");
        entry.className = "entry";

        // 🟡 翻訳処理（msg.languageが"ja"以外なら翻訳）
        let translatedMemo = msg.memo;
        if (msg.language && msg.language !== "ja") {
          translatedMemo = await translateWithGemini(
            msg.memo,
            msg.language,
            "ja"
          );
        }

        // 🔵 表示部分
        let content = `
      📅 ${msg.date}<br>
      ことば：${msg.kotoba}<br>
      ぶん：${msg.bun}<br>
      かんじ：${msg.kanji}<br>
      言語：${msg.language ?? "不明"}<br>
      メモ（原文）：${msg.memo}<br>
      メモ（翻訳）：<span style="color:blue;">${translatedMemo}</span><br>
    `;

        // 🟢 アドバイス入力欄（生徒からの投稿のみ）
        if (msg.sender === "student") {
          content += `
    <span style="color: green;">🧑‍🏫 アドバイス（日本語）：${
      msg.adviceOriginal ?? "（まだありません）"
    }</span><br>
    <span style="color: green;">🧑‍🏫 アドバイス（翻訳）：${
      msg.advice ?? "（まだありません）"
    }</span><br>
    <label>アドバイス：
      <input type="text" data-chatid="${chatRoomId}" data-msgid="${msgId}" class="adviceInput">
    </label><br>
    <button class="sendAdvice" data-chatid="${chatRoomId}" data-msgid="${msgId}">
      送信
    </button>
  `;
        } else if (msg.sender === "teacher") {
          content += `
    <span style="color: green;">🧑‍🏫 アドバイス（日本語）：${
      msg.adviceOriginal ?? "（まだありません）"
    }</span><br>
    <span style="color: green;">🧑‍🏫 アドバイス（翻訳）：${
      msg.advice ?? "（まだありません）"
    }</span>
  `;
        }
        entry.innerHTML = content + "<hr>";
        section.appendChild(entry);
      }

      postsDiv.appendChild(section);
    }
  }
}

/// 生徒の投稿に対するアドバイス送信処理
const postsArea = document.getElementById("studentPosts");

postsArea.addEventListener("click", async (e) => {
  if (e.target.classList.contains("sendAdvice")) {
    const chatId = e.target.dataset.chatid;
    const msgId = e.target.dataset.msgid;
    const input = document.querySelector(
      `input[data-chatid='${chatId}'][data-msgid='${msgId}']`
    );
    const adviceText = input.value;
    if (!adviceText) return;

    try {
      const msgRef = ref(db, `chats/${chatId}/messages/${msgId}`);
      const snapshot = await get(msgRef);

      if (!snapshot.exists()) {
        console.error("指定されたメッセージが見つかりません");
        alert("対象の記録が存在しません");
        return;
      }

      const msg = snapshot.val(); // ここで msg を定義！
      const targetLang = msg.language || "ja";

      const translatedAdvice = await translateWithGemini(
        adviceText,
        "ja",
        targetLang
      );

      await update(msgRef, {
        advice: translatedAdvice,
        adviceOriginal: adviceText,
      });

      alert("アドバイスを送信しました。");
      input.value = "";
    } catch (err) {
      console.error("アドバイス送信エラー:", err);
      alert("アドバイスの送信に失敗しました");
    }
  }
});

// ログアウトボタン
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}
