import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  child,
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-database.js";
import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Googleログイン
const googleLogin = document.getElementById("googleLogin");
googleLogin.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    await ensureUserInDatabase(user, "student", user.displayName || "生徒");
    redirectByRole(user.uid);
  } catch (error) {
    alert("Googleログイン失敗: " + error.message);
  }
});

// メールログイン + 新規登録 fallback
const emailForm = document.getElementById("emailLoginForm");
emailForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const name = document.getElementById("name").value;
  const role = document.getElementById("roleSelect").value;

  if (!role || !name) {
    alert("名前とロールを入力してください。");
    return;
  }

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;
    await ensureUserInDatabase(user, role, name);
    redirectByRole(user.uid);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      try {
        const newUser = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        await ensureUserInDatabase(newUser.user, role, name);
        redirectByRole(newUser.user.uid);
      } catch (signupError) {
        alert("新規登録失敗: " + signupError.message);
      }
    } else {
      alert("メールログイン失敗: " + error.message);
    }
  }
});

async function ensureUserInDatabase(user, role, name) {
  const userRef = ref(db, "users/" + user.uid);
  const snapshot = await get(userRef);
  if (!snapshot.exists()) {
    await set(userRef, {
      email: user.email,
      name: name,
      role: role,
    });
  }
}

async function redirectByRole(uid) {
  const roleSnap = await get(ref(db, "users/" + uid + "/role"));
  if (roleSnap.exists()) {
    const role = roleSnap.val();
    if (role === "student") {
      window.location.href = "student.html";
    } else if (role === "teacher") {
      window.location.href = "teacher.html";
    } else {
      alert("未定義のロールです");
    }
  } else {
    alert("ロール情報が見つかりません");
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    redirectByRole(user.uid);
  }
});
