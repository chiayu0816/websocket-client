// DOM 元素
let wsUrlInput;
let connectBtn;
let disconnectBtn;
let topicInput;
let subscribeBtn;
let unsubscribeBtn;
let subscriptionsList;
let messageTypeSelect;
let messageContentTextarea;
let sendBtn;
let logContainer;
let clearLogBtn;
let tabs;
let tabContents;
let themeToggle;
let autoSendEnabledCheckbox;
let autoSendIntervalInput;

// WebSocket 客戶端實例
let wsClient = null;
let activeSubscriptions = new Map(); // 存儲活動訂閱
let autoSendTasks = new Map(); // 存儲定時發送任務
// 保存通用消息處理器的引用，以便在斷開連接時移除
let generalMessageHandler = null;

// 初始化頁面
window.onload = function() {
    console.log('頁面已加載，開始初始化...');
    setTimeout(function() {
        try {
            console.log('開始初始化頁面...');
            
            // 初始化主題
            initTheme();
            
            // 綁定主題切換事件
            const themeToggle = document.getElementById('themeToggle');
            if (themeToggle) {
                themeToggle.onchange = toggleTheme;
            }
            
            // 標籤頁切換 - 使用更安全的方式
            const tabs = document.querySelectorAll('.tab');
            if (tabs && tabs.length > 0) {
                for (let i = 0; i < tabs.length; i++) {
                    const tab = tabs[i];
                    if (tab) {
                        tab.onclick = function() {
                            const tabId = this.getAttribute('data-tab');
                            
                            // 激活選中的標籤
                            for (let j = 0; j < tabs.length; j++) {
                                if (tabs[j]) tabs[j].classList.remove('active');
                            }
                            this.classList.add('active');
                            
                            // 顯示對應的內容
                            const tabContents = document.querySelectorAll('.tab-content');
                            for (let k = 0; k < tabContents.length; k++) {
                                const content = tabContents[k];
                                if (content) {
                                    content.classList.remove('active');
                                    if (content.id === `${tabId}-tab`) {
                                        content.classList.add('active');
                                    }
                                }
                            }
                        };
                    }
                }
            }

            // 按鈕事件 - 使用更安全的方式
            const connectBtn = document.getElementById('connectBtn');
            if (connectBtn) connectBtn.onclick = connectWebSocket;
            
            const disconnectBtn = document.getElementById('disconnectBtn');
            if (disconnectBtn) disconnectBtn.onclick = disconnectWebSocket;
            
            const subscribeBtn = document.getElementById('subscribeBtn');
            if (subscribeBtn) subscribeBtn.onclick = subscribeTopic;
            
            const unsubscribeBtn = document.getElementById('unsubscribeBtn');
            if (unsubscribeBtn) unsubscribeBtn.onclick = unsubscribeTopic;
            
            const sendBtn = document.getElementById('sendBtn');
            if (sendBtn) sendBtn.onclick = sendMessage;
            
            const clearLogBtn = document.getElementById('clearLogBtn');
            if (clearLogBtn) clearLogBtn.onclick = clearLog;
            
            // 定時發送相關
            const autoSendIntervalInput = document.getElementById('autoSendInterval');
            if (autoSendIntervalInput) autoSendIntervalInput.onchange = updateAutoSendInterval;
            
            const addAutoSendBtn = document.getElementById('addAutoSendBtn');
            if (addAutoSendBtn) addAutoSendBtn.onclick = addAutoSendTask;
            
            // 設置示例消息
            const messageContentTextarea = document.getElementById('messageContent');
            if (messageContentTextarea) {
                messageContentTextarea.value = JSON.stringify({
                    action: 'get_data',
                    params: {
                        symbol: 'BTC/USDT',
                        interval: '1m'
                    }
                }, null, 2);
            }
            
            console.log('頁面初始化完成');
        } catch (error) {
            console.error('初始化頁面時出錯:', error);
        }
    }, 500); // 增加延遲時間，確保所有元素都已加載
};

// 初始化主題
function initTheme() {
    // 檢查本地存儲中的主題設置
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.checked = true;
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.checked = false;
    }
}

// 切換主題
function toggleTheme() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    
    if (themeToggle.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
}

// 連接 WebSocket
function connectWebSocket() {
    // 獲取 WebSocket URL
    const wsUrlInput = document.getElementById('wsUrl');
    
    if (!wsUrlInput) {
        addLog('無法獲取必要的 DOM 元素', 'error');
        return;
    }
    
    const wsUrl = wsUrlInput.value.trim();
    
    if (!wsUrl) {
        addLog('請輸入 WebSocket URL', 'error');
        return;
    }
    
    try {
        // 創建 WebSocketClient 實例
        wsClient = new WebSocketClient(wsUrl);
        
        // 添加通用消息處理器
        generalMessageHandler = (data) => {
            // 將接收到的消息添加到日誌
            let logMessage;
            
            if (typeof data === 'string') {
                logMessage = data;
            } else if (typeof data === 'object') {
                try {
                    logMessage = JSON.stringify(data, null, 2);
                } catch (error) {
                    logMessage = '無法序列化接收到的對象';
                }
            } else {
                logMessage = '接收到未知類型的數據';
            }
            
            addLog(logMessage, 'received');
        };
        
        wsClient.addMessageHandler(generalMessageHandler);
        
        // 連接 WebSocket
        wsClient.connect()
            .then(() => {
                addLog(`已成功連接到 ${wsUrl}`, 'success');
                updateUIState(true);
                
                // 啟動所有已啟用的定時發送任務
                for (const [taskId, task] of autoSendTasks.entries()) {
                    if (task.enabled) {
                        wsClient.startAutoSendTask(taskId);
                    }
                }
            })
            .catch(error => {
                addLog(`連接失敗: ${error.message}`, 'error');
                cleanupWebSocketClient();
            });
    } catch (error) {
        addLog(`創建 WebSocket 客戶端時出錯: ${error.message}`, 'error');
    }
}

// 斷開 WebSocket 連接
function disconnectWebSocket() {
    if (wsClient) {
        addLog('正在斷開 WebSocket 連接...', 'info');
        
        // 先停止所有定時發送任務
        wsClient.stopAllAutoSendTasks();
        
        // 斷開連接
        wsClient.disconnect();
        
        // 清理資源
        cleanupWebSocketClient();
    }
}

// 清理 WebSocket 客戶端
function cleanupWebSocketClient() {
    if (wsClient) {
        wsClient.reset();
        wsClient = null;
        
        // 清空訂閱和定時發送任務
        activeSubscriptions.clear();
        autoSendTasks.clear();
        
        // 更新 UI
        updateSubscriptionsList();
        updateAutoSendTasksList();
        updateUIState(false);
        
        addLog('已清理 WebSocket 客戶端', 'info');
    }
}

// 訂閱主題
function subscribeTopic() {
    const topicInput = document.getElementById('topic');
    
    if (!topicInput) return;
    
    const topic = topicInput.value.trim();
    if (!topic) {
        addLog('請輸入有效的主題', 'error');
        return;
    }

    if (wsClient && wsClient.isConnected) {
        const callback = data => {
            addLog(`主題 "${topic}" 收到數據: ${JSON.stringify(data, null, 2)}`, 'received');
        };
        wsClient.subscribe(topic, callback);
        activeSubscriptions.set(topic, callback);
        updateSubscriptionsList();
        addLog(`已訂閱主題: ${topic}`, 'success');
    } else {
        addLog('WebSocket 未連接，無法訂閱主題', 'error');
    }
}

// 取消訂閱主題
function unsubscribeTopic() {
    const topicInput = document.getElementById('topic');
    
    if (!topicInput) return;
    
    const topic = topicInput.value.trim();
    if (!topic) {
        addLog('請輸入有效的主題', 'error');
        return;
    }

    if (wsClient && wsClient.isConnected) {
        const callback = activeSubscriptions.get(topic);
        wsClient.unsubscribe(topic, callback);
        activeSubscriptions.delete(topic);
        updateSubscriptionsList();
        addLog(`已取消訂閱主題: ${topic}`, 'info');
    } else {
        addLog('WebSocket 未連接，無法取消訂閱主題', 'error');
    }
}

// 發送消息
function sendMessage() {
    const messageTypeSelect = document.getElementById('messageType');
    const messageContentTextarea = document.getElementById('messageContent');
    
    if (!messageTypeSelect || !messageContentTextarea) return;
    
    if (!wsClient || !wsClient.isConnected) {
        addLog('WebSocket 未連接，無法發送消息', 'error');
        return;
    }

    const messageType = messageTypeSelect.value;
    const content = messageContentTextarea.value.trim();
    
    if (!content) {
        addLog('請輸入消息內容', 'error');
        return;
    }

    try {
        let message;
        
        switch (messageType) {
            case 'json':
                message = JSON.parse(content);
                break;
            case 'text':
                message = content;
                break;
            case 'binary':
                // 將文本轉換為二進制數據
                const encoder = new TextEncoder();
                message = encoder.encode(content).buffer;
                break;
        }
        
        const success = wsClient.send(message);
        if (success) {
            addLog(`已發送 ${messageType} 消息: ${content}`, 'success');
        } else {
            addLog('發送消息失敗', 'error');
        }
    } catch (error) {
        addLog(`準備消息時出錯: ${error}`, 'error');
    }
}

// 更新訂閱列表
function updateSubscriptionsList() {
    const subscriptionsList = document.getElementById('subscriptionsList');
    
    if (!subscriptionsList) return;
    
    subscriptionsList.innerHTML = '';
    
    if (activeSubscriptions.size === 0) {
        subscriptionsList.innerHTML = '<p>無訂閱</p>';
        return;
    }
    
    const list = document.createElement('ul');
    for (const [topic, callback] of activeSubscriptions.entries()) {
        const item = document.createElement('li');
        item.textContent = topic;
        list.appendChild(item);
    }
    
    subscriptionsList.appendChild(list);
}

// 更新 UI 狀態
function updateUIState(isConnected) {
    // 連接按鈕
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    if (connectBtn) connectBtn.disabled = isConnected;
    if (disconnectBtn) disconnectBtn.disabled = !isConnected;
    
    // 訂閱按鈕
    const subscribeBtn = document.getElementById('subscribeBtn');
    const unsubscribeBtn = document.getElementById('unsubscribeBtn');
    if (subscribeBtn) subscribeBtn.disabled = !isConnected;
    if (unsubscribeBtn) unsubscribeBtn.disabled = !isConnected;
    
    // 發送按鈕
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = !isConnected;
    
    // 定時發送按鈕
    const addAutoSendBtn = document.getElementById('addAutoSendBtn');
    if (addAutoSendBtn) addAutoSendBtn.disabled = !isConnected;
    
    // 更新訂閱列表
    updateSubscriptionsList();
    
    // 更新定時發送任務列表
    updateAutoSendTasksList();
    
    // 如果斷開連接，停止所有定時發送任務
    if (!isConnected && wsClient) {
        wsClient.stopAllAutoSendTasks();
    }
}

// 添加日誌
function addLog(message, type = 'info') {
    const logContainer = document.getElementById('logContainer');
    
    if (!logContainer) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 清除日誌
function clearLog() {
    const logContainer = document.getElementById('logContainer');
    
    if (!logContainer) return;
    
    logContainer.innerHTML = '';
}

// 更新定時發送間隔 - 僅更新輸入框值
function updateAutoSendInterval() {
    const autoSendIntervalInput = document.getElementById('autoSendInterval');
    
    if (!autoSendIntervalInput) return;
    
    const seconds = parseInt(autoSendIntervalInput.value, 10);
    if (isNaN(seconds) || seconds < 1) {
        addLog('定時發送間隔必須是大於等於 1 的整數（秒）', 'error');
        autoSendIntervalInput.value = '5';
    }
}

// 添加定時發送任務
function addAutoSendTask() {
    if (!wsClient || !wsClient.isConnected) {
        addLog('WebSocket 未連接，無法添加定時發送任務', 'error');
        return;
    }
    
    const messageTypeSelect = document.getElementById('messageType');
    const messageContentTextarea = document.getElementById('messageContent');
    const autoSendIntervalInput = document.getElementById('autoSendInterval');
    
    if (!messageTypeSelect || !messageContentTextarea || !autoSendIntervalInput) return;
    
    const content = messageContentTextarea.value.trim();
    
    if (!content) {
        addLog('請輸入要定時發送的消息內容', 'error');
        return;
    }
    
    const seconds = parseInt(autoSendIntervalInput.value, 10);
    if (isNaN(seconds) || seconds < 1) {
        addLog('定時發送間隔必須是大於等於 1 的整數（秒）', 'error');
        autoSendIntervalInput.value = '5';
        return;
    }
    
    try {
        let message;
        
        switch (messageTypeSelect.value) {
            case 'json':
                message = JSON.parse(content);
                break;
            case 'text':
                message = content;
                break;
            case 'binary':
                // 將文本轉換為二進制數據
                const encoder = new TextEncoder();
                message = encoder.encode(content).buffer;
                break;
        }
        
        const milliseconds = seconds * 1000;
        const taskId = wsClient.addAutoSendTask(message, milliseconds);
        
        if (taskId) {
            // 將任務添加到本地緩存
            autoSendTasks.set(taskId, {
                id: taskId,
                message: message,
                interval: milliseconds,
                messageType: messageTypeSelect.value,
                content: content,
                enabled: true
            });
            
            addLog(`已添加定時發送任務，間隔: ${seconds} 秒`, 'success');
            updateAutoSendTasksList();
        }
    } catch (error) {
        addLog(`添加定時發送任務時出錯: ${error}`, 'error');
    }
}

// 更新定時發送任務
function updateAutoSendTask(taskId) {
    if (!wsClient || !wsClient.isConnected) {
        addLog('WebSocket 未連接，無法更新定時發送任務', 'error');
        return;
    }
    
    const task = autoSendTasks.get(taskId);
    if (!task) {
        addLog(`找不到任務 ${taskId}`, 'error');
        return;
    }
    
    // 創建一個對話框來編輯任務
    const intervalSeconds = Math.floor(task.interval / 1000);
    const newInterval = prompt('請輸入新的間隔時間（秒）:', intervalSeconds);
    
    if (newInterval === null) return; // 用戶取消
    
    const seconds = parseInt(newInterval, 10);
    if (isNaN(seconds) || seconds < 1) {
        addLog('定時發送間隔必須是大於等於 1 的整數（秒）', 'error');
        return;
    }
    
    const milliseconds = seconds * 1000;
    
    // 更新任務
    if (wsClient.updateAutoSendTask(taskId, null, milliseconds)) {
        // 更新本地緩存
        task.interval = milliseconds;
        addLog(`已更新任務 ${taskId} 的間隔為 ${seconds} 秒`, 'success');
        updateAutoSendTasksList();
    }
}

// 切換定時發送任務的啟用狀態
function toggleAutoSendTask(taskId) {
    if (!wsClient || !wsClient.isConnected) {
        addLog('WebSocket 未連接，無法切換定時發送任務狀態', 'error');
        return;
    }
    
    const task = autoSendTasks.get(taskId);
    if (!task) {
        addLog(`找不到任務 ${taskId}`, 'error');
        return;
    }
    
    const newState = !task.enabled;
    
    // 更新任務狀態
    if (wsClient.enableAutoSendTask(taskId, newState)) {
        // 更新本地緩存
        task.enabled = newState;
        addLog(`已${newState ? '啟用' : '禁用'}任務 ${taskId}`, 'info');
        updateAutoSendTasksList();
    }
}

// 刪除定時發送任務
function removeAutoSendTask(taskId) {
    if (!wsClient || !wsClient.isConnected) {
        addLog('WebSocket 未連接，無法刪除定時發送任務', 'error');
        return;
    }
    
    // 確認刪除
    if (!confirm('確定要刪除此定時發送任務嗎？')) {
        return;
    }
    
    // 刪除任務
    if (wsClient.removeAutoSendTask(taskId)) {
        // 從本地緩存中移除
        autoSendTasks.delete(taskId);
        addLog(`已刪除任務 ${taskId}`, 'info');
        updateAutoSendTasksList();
    }
}

// 更新定時發送任務列表
function updateAutoSendTasksList() {
    const tasksList = document.getElementById('autoSendTasksList');
    if (!tasksList) return;
    
    // 清空列表
    tasksList.innerHTML = '';
    
    if (autoSendTasks.size === 0) {
        tasksList.innerHTML = '<div class="empty-list">沒有定時發送任務</div>';
        return;
    }
    
    // 添加任務項
    for (const [taskId, task] of autoSendTasks.entries()) {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        
        // 格式化消息內容顯示
        let messageDisplay = '';
        if (task.messageType === 'json') {
            try {
                messageDisplay = JSON.stringify(task.message).substring(0, 50);
                if (JSON.stringify(task.message).length > 50) {
                    messageDisplay += '...';
                }
            } catch (e) {
                messageDisplay = '無法顯示 JSON';
            }
        } else if (task.messageType === 'text') {
            messageDisplay = task.content.substring(0, 50);
            if (task.content.length > 50) {
                messageDisplay += '...';
            }
        } else {
            messageDisplay = '[二進制數據]';
        }
        
        // 創建任務信息
        taskItem.innerHTML = `
            <div class="task-info">
                <div>
                    <span class="task-status ${task.enabled ? 'active' : 'inactive'}"></span>
                    間隔: ${Math.floor(task.interval / 1000)} 秒
                </div>
                <div class="task-message">${messageDisplay}</div>
            </div>
            <div class="task-actions">
                <button class="small-btn toggle-btn" data-task-id="${taskId}">${task.enabled ? '禁用' : '啟用'}</button>
                <button class="small-btn edit-btn" data-task-id="${taskId}">編輯</button>
                <button class="small-btn delete-btn" data-task-id="${taskId}">刪除</button>
            </div>
        `;
        
        tasksList.appendChild(taskItem);
    }
    
    // 添加事件監聽器
    const toggleBtns = tasksList.querySelectorAll('.toggle-btn');
    const editBtns = tasksList.querySelectorAll('.edit-btn');
    const deleteBtns = tasksList.querySelectorAll('.delete-btn');
    
    toggleBtns.forEach(btn => {
        btn.onclick = function() {
            const taskId = this.getAttribute('data-task-id');
            toggleAutoSendTask(taskId);
        };
    });
    
    editBtns.forEach(btn => {
        btn.onclick = function() {
            const taskId = this.getAttribute('data-task-id');
            updateAutoSendTask(taskId);
        };
    });
    
    deleteBtns.forEach(btn => {
        btn.onclick = function() {
            const taskId = this.getAttribute('data-task-id');
            removeAutoSendTask(taskId);
        };
    });
} 