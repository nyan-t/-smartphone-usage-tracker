// --- グローバル変数とDOM要素の取得 ---
const currentUsageDisplay = document.getElementById('current-usage-display');
const goalHoursInput = document.getElementById('goal-hours');
const goalMinutesInput = document.getElementById('goal-minutes');
const setGoalBtn = document.getElementById('set-goal-btn');
const currentGoalDisplay = document.getElementById('current-goal-display');
const usageHistoryList = document.getElementById('usage-history-list');

let dailyUsageMillis = 0; // 今日の利用時間（ミリ秒）
let dailyGoalMillis = 2 * 60 * 60 * 1000; // 今日の目標時間（デフォルト2時間、ミリ秒）
let lastActiveTime = Date.now(); // 最後にアクティブだった時刻
let trackingInterval = null; // 計測用インターバルID
const INACTIVE_THRESHOLD_MS = 5 * 1000; // 5秒間操作がなければ非アクティブとみなす
const CHECK_INTERVAL_MS = 1 * 1000; // 1秒ごとに利用時間をチェック

// --- ヘルパー関数 ---

// ミリ秒をHH:MM:SS形式に変換
function formatMilliseconds(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
        .map(unit => String(unit).padStart(2, '0'))
        .join(':');
}

// 時分をミリ秒に変換
function hoursMinutesToMillis(hours, minutes) {
    return (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
}

// --- LocalStorageとの連携 ---

// データ保存
function saveState() {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const data = {
        dailyUsageMillis: dailyUsageMillis,
        dailyGoalMillis: dailyGoalMillis,
        lastUpdatedDate: today // この日付でリセット判定
    };
    localStorage.setItem('smartphoneUsageTracker', JSON.stringify(data));

    // 履歴は別で保存
    localStorage.setItem('usageHistory', JSON.stringify(getHistory()));
}

// データ読み込み
function loadState() {
    const savedData = localStorage.getItem('smartphoneUsageTracker');
    if (savedData) {
        const data = JSON.parse(savedData);
        const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });

        // 日付が変わっていたら利用時間をリセット
        if (data.lastUpdatedDate !== today) {
            dailyUsageMillis = 0; // 利用時間をリセット
            // 前日の利用時間を履歴に追加
            addHistoryRecord(data.lastUpdatedDate, data.dailyUsageMillis);
        } else {
            dailyUsageMillis = data.dailyUsageMillis || 0;
        }
        dailyGoalMillis = data.dailyGoalMillis || (2 * 60 * 60 * 1000); // デフォルト2時間
    } else {
        // 初回起動時、今日の利用時間を0にセット
        dailyUsageMillis = 0;
    }
}

// 履歴の取得
function getHistory() {
    const historyJson = localStorage.getItem('usageHistory');
    return historyJson ? JSON.parse(historyJson) : {};
}

// 履歴への追加/更新
function addHistoryRecord(dateStr, usageMs) {
    const history = getHistory();
    history[dateStr] = usageMs;
    localStorage.setItem('usageHistory', JSON.stringify(history));
}

// --- 機能実装 ---

// 利用時間の計測を開始/更新
function startTrackingUsage() {
    if (trackingInterval) {
        clearInterval(trackingInterval); // 既存のインターバルをクリア
    }

    // ユーザーのアクティビティを監視
    document.addEventListener('mousemove', resetLastActiveTime);
    document.addEventListener('keydown', resetLastActiveTime);
    document.addEventListener('touchstart', resetLastActiveTime); // タッチデバイス向け

    trackingInterval = setInterval(() => {
        const now = Date.now();
        // 最後にアクティブだった時間から一定時間経っていないか、または時間が進んでいないか
        if (now - lastActiveTime < INACTIVE_THRESHOLD_MS) {
            const timeElapsed = now - lastActiveTime; // アクティブだった時間分加算
            dailyUsageMillis += timeElapsed;
        }
        lastActiveTime = now; // 現在時刻を最終アクティブ時間として更新

        updateDisplay();
        checkGoalExceeded();
        saveState(); // 状態を定期的に保存
    }, CHECK_INTERVAL_MS);
}

// アクティブ時間をリセット
function resetLastActiveTime() {
    lastActiveTime = Date.now();
}

// ディスプレイ表示の更新
function updateDisplay() {
    currentUsageDisplay.textContent = formatMilliseconds(dailyUsageMillis);
    currentGoalDisplay.textContent = formatMilliseconds(dailyGoalMillis);
}

// 目標時間超過チェックと通知
function checkGoalExceeded() {
    const isExceeded = dailyUsageMillis >= dailyGoalMillis;
    const notificationId = 'usage-exceeded-notification';

    if (isExceeded) {
        // 通知がまだ表示されていない場合のみ表示
        if (!document.getElementById(notificationId)) {
            showNotification(`今日の利用時間が目標 ${formatMilliseconds(dailyGoalMillis)} を超過しました！`);
        }
    }
}

// 通知表示関数
function showNotification(message) {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = 'notification';
    notificationDiv.id = 'usage-exceeded-notification';
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);

    // フェードイン
    setTimeout(() => {
        notificationDiv.classList.add('show');
    }, 10);

    // 5秒後にフェードアウトして削除
    setTimeout(() => {
        notificationDiv.classList.remove('show');
        notificationDiv.addEventListener('transitionend', () => {
            notificationDiv.remove();
        }, { once: true });
    }, 5000);
}


// 履歴表示の更新
function displayHistory() {
    usageHistoryList.innerHTML = ''; // リストをクリア
    const history = getHistory();
    const sortedDates = Object.keys(history).sort().reverse(); // 日付でソート（新しい順）

    sortedDates.forEach(dateStr => {
        const usageMs = history[dateStr];
        const listItem = document.createElement('li');
        const isGoalExceededForDay = usageMs >= dailyGoalMillis; // 履歴表示時はその日の目標で判定すべきだが、今回は簡略化

        listItem.textContent = `${dateStr}: ${formatMilliseconds(usageMs)}`;
        if (isGoalExceededForDay) {
            listItem.classList.add('exceeded'); // 目標超過の場合にスタイルを適用
        }
        usageHistoryList.appendChild(listItem);
    });
}

// --- イベントリスナー ---

setGoalBtn.addEventListener('click', () => {
    const hours = parseInt(goalHoursInput.value, 10);
    const minutes = parseInt(goalMinutesInput.value, 10);

    // 入力値のバリデーション (簡易版)
    if (isNaN(hours) || hours < 0 || hours > 23 || isNaN(minutes) || minutes < 0 || minutes > 59) {
        alert('時間を正しく入力してください (0-23時間, 0-59分)。');
        return;
    }

    let newGoal = hoursMinutesToMillis(hours, minutes);

    // 仕様B-1: 90度（時間換算で1時間30分）より高い温度は90度となる
    // 例: 90分 (1時間30分) を超える設定は1時間30分に修正
    const MAX_GOAL_MILLIS = 90 * 60 * 1000; // 90分
    if (newGoal > MAX_GOAL_MILLIS) {
        alert(`目標時間は${formatMilliseconds(MAX_GOAL_MILLIS)}までです。${formatMilliseconds(MAX_GOAL_MILLIS)}に設定されました。`);
        newGoal = MAX_GOAL_MILLIS;
        goalHoursInput.value = Math.floor(MAX_GOAL_MILLIS / (60 * 60 * 1000));
        goalMinutesInput.value = Math.floor((MAX_GOAL_MILLIS % (60 * 60 * 1000)) / (60 * 1000));
    }

    // 仕様B-2: 50度（時間換算で50分）より低い設定は50度となる
    const MIN_GOAL_MILLIS = 50 * 60 * 1000; // 50分
    if (newGoal < MIN_GOAL_MILLIS) {
        alert(`目標時間は${formatMilliseconds(MIN_GOAL_MILLIS)}より低く設定できません。${formatMilliseconds(MIN_GOAL_MILLIS)}に設定されました。`);
        newGoal = MIN_GOAL_MILLIS;
        goalHoursInput.value = Math.floor(MIN_GOAL_MILLIS / (60 * 60 * 1000));
        goalMinutesInput.value = Math.floor((MIN_GOAL_MILLIS % (60 * 60 * 1000)) / (60 * 1000));
    }


    dailyGoalMillis = newGoal;
    saveState();
    updateDisplay();
});

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    loadState(); // 状態を読み込み
    updateDisplay(); // ディスプレイを更新
    displayHistory(); // 履歴を表示
    startTrackingUsage(); // 利用時間の計測を開始

    // ページを離れる・閉じる直前に現在の利用時間を履歴に保存
    window.addEventListener('beforeunload', () => {
        const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
        addHistoryRecord(today, dailyUsageMillis);
        saveState();
    });
});

// 毎日のリセットと履歴保存を確実に
// 日付が変わるたびにdailyUsageMillisをリセットし、前日の分を履歴に保存するロジック
setInterval(() => {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const savedData = JSON.parse(localStorage.getItem('smartphoneUsageTracker')) || {};
    if (savedData.lastUpdatedDate !== today && savedData.lastUpdatedDate) {
        addHistoryRecord(savedData.lastUpdatedDate, savedData.dailyUsageMillis || 0);
        dailyUsageMillis = 0; // 今日の利用時間をリセット
        saveState(); // 新しい日付とリセットされた利用時間で保存
        displayHistory(); // 履歴を更新
        updateDisplay(); // 表示を更新
    }
}, 60 * 60 * 1000); // 1時間ごとに日付が変わったかチェック
