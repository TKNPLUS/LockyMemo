// ロック解除時にmain画面のボタン類を表示、ロック画面では非表示
function unlockApp(memo) {
    isLocked = false;
    lockScreen.classList.add('d-none');
    mainContent.classList.remove('d-none');
    memoArea.value = memo;
    currentDecryptedMemo = memo;
    errorMessage.textContent = '';
    // メイン画面でリセット・トグルを表示
    if (resetPasswordButton) resetPasswordButton.style.display = '';
    if (bgLockToggle) bgLockToggle.closest('.form-check')?.classList.remove('d-none');
}
const lockScreen = document.getElementById('lock-screen');
const mainContent = document.getElementById('main-content');
const passwordInput = document.getElementById('password-input');
const unlockButton = document.getElementById('unlock-button');
const memoArea = document.getElementById('memo-area');
const saveButton = document.getElementById('save-button');
const lockButton = document.getElementById('lock-button');
const errorMessage = document.getElementById('error-message');
const initialPrompt = document.getElementById('initial-prompt');
const shareLinkContainer = document.getElementById('share-link-container');
const shareLinkInput = document.getElementById('share-link-input');
const copyLinkButton = document.getElementById('copy-link-button');
const setPasswordGroup = document.getElementById('set-password-group');
const setPasswordInput = document.getElementById('set-password-input');
const setPasswordConfirm = document.getElementById('set-password-confirm');
const setPasswordButton = document.getElementById('set-password-button');
const inputPasswordGroup = document.getElementById('input-password-group');
const resetPasswordButton = document.getElementById('reset-password-button');
const bgLockToggle = document.getElementById('bg-lock-toggle');

let currentDecryptedMemo = '';
let isLocked = true;
let bgLockEnabled = true;

// --- 暗号化/復号 ---

// パスワードからキーを生成
async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// 暗号化
async function encrypt(data, password) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const enc = new TextEncoder();
    const encryptedContent = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        enc.encode(data)
    );

    const encryptedData = {
        salt: Array.from(salt),
        iv: Array.from(iv),
        ciphertext: Array.from(new Uint8Array(encryptedContent)),
    };
    
    // Base64エンコードしてURLに含められるようにする
    return btoa(JSON.stringify(encryptedData));
}

// 復号
async function decrypt(encryptedDataB64, password) {
    try {
        const encryptedData = JSON.parse(atob(encryptedDataB64));
        const salt = new Uint8Array(encryptedData.salt);
        const iv = new Uint8Array(encryptedData.iv);
        const ciphertext = new Uint8Array(encryptedData.ciphertext);

        const key = await deriveKey(password, salt);
        const decryptedContent = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            ciphertext
        );

        const dec = new TextDecoder();
        return dec.decode(decryptedContent);
    } catch (e) {
        console.error("復号に失敗:", e);
        return null;
    }
}


// --- UI操作 ---

function showLockScreen(isFirst) {
    isLocked = true;
    mainContent.classList.add('d-none');
    lockScreen.classList.remove('d-none');
    errorMessage.textContent = '';
    // ロック画面ではリセット・トグルを非表示
    if (resetPasswordButton) resetPasswordButton.style.display = 'none';
    if (bgLockToggle) bgLockToggle.closest('.form-check')?.classList.add('d-none');
    if (isFirst) {
        setPasswordGroup.style.display = 'block';
        inputPasswordGroup.style.display = 'none';
        setPasswordInput.value = '';
        setPasswordConfirm.value = '';
        setPasswordInput.focus();
    } else {
        setPasswordGroup.style.display = 'none';
        inputPasswordGroup.style.display = 'flex';
        passwordInput.value = '';
        passwordInput.focus();
    }
}

// --- イベントリスナー ---

// パスワード設定ボタン
setPasswordButton.addEventListener('click', async () => {
    const pass = setPasswordInput.value;
    const confirm = setPasswordConfirm.value;
    if (!pass || !confirm) {
        errorMessage.textContent = 'パスワードを2回入力してください。';
        return;
    }
    if (pass !== confirm) {
        errorMessage.textContent = 'パスワードが一致しません。';
        return;
    }
    // 新規作成として保存
    const encryptedMemo = await encrypt('', pass);
    localStorage.setItem('lockyMemo', encryptedMemo);
    window.location.hash = encryptedMemo;
    showLockScreen(false);
    initialPrompt.innerHTML = '<p>メモを復元するにはパスワードを入力してください。</p>';
    alert('パスワードを設定しました。');
});

// パスワードリセットボタン
resetPasswordButton.addEventListener('click', () => {
    if (confirm('本当にパスワードとメモをリセットしますか？（全てのメモが消去されます）')) {
        localStorage.removeItem('lockyMemo');
        window.location.hash = '';
        initialPrompt.innerHTML = '<p>新しいメモを作成します。パスワードを設定してください。</p>';
        showLockScreen(true);
        alert('パスワードとメモをリセットしました。');
    }
});

// バックグラウンドロックトグル
bgLockToggle.addEventListener('change', () => {
    bgLockEnabled = bgLockToggle.checked;
});

// ロックボタン
lockButton.addEventListener('click', () => {
    memoArea.value = ''; // 画面からメモを消去
    currentDecryptedMemo = ''; // メモリから復号済みメモを消去
    initialPrompt.innerHTML = '<p>ロックしました。再度開くにはパスワードを入力してください。</p>';
    showLockScreen();
});

// 保存 & 共有リンク生成ボタン
saveButton.addEventListener('click', async () => {
    const password = passwordInput.value;
    const memo = memoArea.value;
    if (!password) {
        alert('リンクを作成するには、ロック解除時に使用したパスワードが必要です。');
        return;
    }
    if (!memo) {
        alert('保存するメモがありません。');
        return;
    }

    const encryptedMemo = await encrypt(memo, password);
    
    // ローカルストレージに保存
    localStorage.setItem('lockyMemo', encryptedMemo);

    // URLを更新
    const newUrl = window.location.origin + window.location.pathname + '#' + encryptedMemo;
    window.history.replaceState(null, '', newUrl);

    shareLinkInput.value = newUrl;
    shareLinkContainer.style.display = 'flex';
    alert('メモを保存し、共有リンクを生成しました。');
});

// リンクをコピー
copyLinkButton.addEventListener('click', () => {
    shareLinkInput.select();
    document.execCommand('copy');
    alert('リンクをコピーしました。');
});


// ロック解除ボタン
unlockButton.addEventListener('click', async () => {
    const password = passwordInput.value;
    if (!password) {
        errorMessage.textContent = 'パスワードを入力してください。';
        return;
    }

    let encryptedMemo = window.location.hash.substring(1);
    if (!encryptedMemo) {
        encryptedMemo = localStorage.getItem('lockyMemo');
    }

    if (!encryptedMemo) {
        // データがない場合は、新規作成モード
        unlockApp('');
        return;
    }

    const decrypted = await decrypt(encryptedMemo, password);

    if (decrypted !== null) {
        unlockApp(decrypted);
    } else {
        errorMessage.textContent = 'パスワードが違うか、データが破損しています。';
    }
});
passwordInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        unlockButton.click();
    }
});


// ページの表示/非表示を検知して自動ロック
document.addEventListener('visibilitychange', () => {
    if (bgLockEnabled && document.visibilityState === 'hidden' && !isLocked) {
        // バックグラウンドに移動した瞬間にロック
        memoArea.value = '';
        currentDecryptedMemo = '';
        initialPrompt.innerHTML = '<p>再度開くにはパスワードを入力してください。</p>';
        showLockScreen(false);
    }
});

// --- 初期化処理 ---
window.addEventListener('load', () => {
    bgLockEnabled = bgLockToggle.checked;
    const encryptedMemo = window.location.hash.substring(1) || localStorage.getItem('lockyMemo');
    if (encryptedMemo) {
        initialPrompt.innerHTML = '<p>メモを復元するにはパスワードを入力してください。</p>';
        showLockScreen(false);
    } else {
        initialPrompt.innerHTML = '<p>新しいメモを作成します。パスワードを設定してください。</p>';
        showLockScreen(true);
    }
});