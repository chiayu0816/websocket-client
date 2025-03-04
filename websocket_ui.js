// WebSocket 客戶端實例和相關狀態
let wsClient = null;
let autoSendTasks = new Map(); // 存儲定時發送任務
let generalMessageHandler = null; // 保存通用消息處理器的引用

// 初始化頁面
document.addEventListener('DOMContentLoaded', function() {
    console.log('頁面已加載，開始初始化...');
    try {
        console.log('開始初始化頁面...');
        
        // 初始化主題
        initTheme();
        
        // 綁定主題切換事件
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.onchange = toggleTheme;
        }
        
        // 按鈕事件 - 使用更安全的方式
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) connectBtn.onclick = connectWebSocket;
        
        const disconnectBtn = document.getElementById('disconnectBtn');
        if (disconnectBtn) disconnectBtn.onclick = disconnectWebSocket;
        
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.onclick = sendMessage;
        
        const clearLogBtn = document.getElementById('clearLogBtn');
        if (clearLogBtn) clearLogBtn.onclick = clearLog;
        
        // 定時發送相關
        const autoSendIntervalInput = document.getElementById('autoSendInterval');
        if (autoSendIntervalInput) autoSendIntervalInput.onchange = updateAutoSendInterval;
        
        const addAutoSendBtn = document.getElementById('addAutoSendBtn');
        if (addAutoSendBtn) addAutoSendBtn.onclick = addAutoSendTask;
        
        console.log('頁面初始化完成');
    } catch (error) {
        console.error('初始化頁面時出錯:', error);
    }
});

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
    const isChecked = document.getElementById('themeToggle').checked;
    document.documentElement.setAttribute('data-theme', isChecked ? 'dark' : 'light');
    localStorage.setItem('theme', isChecked ? 'dark' : 'light');
}

// WebSocket 連接
async function connectWebSocket() {
    try {
        const wsUrl = document.getElementById('wsUrl').value.trim();
        if (!wsUrl) {
            addLog('請輸入有效的 WebSocket URL', 'error');
            return;
        }
        
        if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
            addLog('WebSocket URL 必須以 ws:// 或 wss:// 開頭', 'error');
            return;
        }
        
        // 禁用連接按鈕，避免重複連接
        document.getElementById('connectBtn').disabled = true;
        addLog(`正在連接到 ${wsUrl}...`, 'info');
        
        // 如果已有連接，先斷開
        if (wsClient) {
            cleanupWebSocketClient();
        }
        
        try {
            // 創建新的客戶端
            wsClient = new WebSocketClient(wsUrl);
            
            // 添加訊息處理器
            generalMessageHandler = (data) => {
                addLog(`收到消息: ${JSON.stringify(data, null, 2)}`, 'received');
                return true; // 允許消息繼續傳遞
            };
            wsClient.addMessageHandler(generalMessageHandler);
            
            // 連接到服務器
            await wsClient.connect();
            
            // 更新 UI
            updateUIState(true);
            addLog('WebSocket 連接成功', 'success');
        } catch (error) {
            addLog(`連接失敗: ${error.message}`, 'error');
            document.getElementById('connectBtn').disabled = false;
        }
    } catch (error) {
        console.error('連接 WebSocket 時出錯:', error);
        addLog(`出現錯誤: ${error.message}`, 'error');
        document.getElementById('connectBtn').disabled = false;
    }
}

// 斷開連接
function disconnectWebSocket() {
    try {
        if (wsClient) {
            addLog('正在斷開連接...', 'info');
            wsClient.disconnect();
            cleanupWebSocketClient();
            addLog('已斷開連接', 'info');
        }
        updateUIState(false);
    } catch (error) {
        console.error('斷開連接時出錯:', error);
        addLog(`斷開連接時出錯: ${error.message}`, 'error');
    }
}

// 清理 WebSocket 客戶端
function cleanupWebSocketClient() {
    try {
        if (wsClient) {
            wsClient.disconnect();
            autoSendTasks = new Map(); // 重置自動發送任務
            updateAutoSendTasksList();
            
            // 移除消息處理器
            if (generalMessageHandler) {
                // 如果有移除處理器的方法可以調用
                // wsClient.removeMessageHandler(generalMessageHandler);
                generalMessageHandler = null;
            }
            
            wsClient = null;
        }
    } catch (error) {
        console.error('清理 WebSocket 客戶端時出錯:', error);
    }
}

// 發送消息
function sendMessage() {
    try {
        if (!wsClient || !wsClient.isConnected) {
            addLog('未連接到 WebSocket 服務器', 'error');
            return;
        }
        
        const messageType = document.getElementById('messageType').value;
        const messageContent = document.getElementById('messageContent').value.trim();
        
        if (!messageContent) {
            addLog('請輸入要發送的消息', 'error');
            return;
        }
        
        let data;
        try {
            switch (messageType) {
                case 'json':
                    data = JSON.parse(messageContent);
                    wsClient.send(data);
                    break;
                case 'text':
                    wsClient.send(messageContent);
                    break;
                case 'binary':
                    // 將十六進制字符串轉換為 Uint8Array
                    const hexString = messageContent.replace(/\s+/g, '');
                    if (!/^[0-9A-Fa-f]+$/.test(hexString)) {
                        throw new Error('二進制數據必須是十六進制格式');
                    }
                    const bytes = new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                    wsClient.send(bytes);
                    break;
                default:
                    throw new Error(`不支持的消息類型: ${messageType}`);
            }
            
            addLog(`已發送 ${messageType} 消息`, 'success');
        } catch (error) {
            addLog(`發送失敗: ${error.message}`, 'error');
        }
    } catch (error) {
        console.error('發送消息時出錯:', error);
        addLog(`發送消息時出錯: ${error.message}`, 'error');
    }
}

// 更新 UI 狀態
function updateUIState(isConnected) {
    try {
        document.getElementById('connectBtn').disabled = isConnected;
        document.getElementById('disconnectBtn').disabled = !isConnected;
        document.getElementById('sendBtn').disabled = !isConnected;
        document.getElementById('addAutoSendBtn').disabled = !isConnected;
        
        const wsUrlInput = document.getElementById('wsUrl');
        if (wsUrlInput) {
            wsUrlInput.disabled = isConnected;
        }
        
        // 更新自動發送任務按鈕狀態
        const taskButtons = document.querySelectorAll('.auto-task button');
        for (let i = 0; i < taskButtons.length; i++) {
            const button = taskButtons[i];
            if (button.id.startsWith('start-task-') || button.id.startsWith('stop-task-')) {
                button.disabled = !isConnected;
            }
        }
    } catch (error) {
        console.error('更新 UI 狀態時出錯:', error);
    }
}

// 添加日誌
function addLog(message, type = 'info') {
    try {
        const logContainer = document.getElementById('logContainer');
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
    } catch (error) {
        console.error('添加日誌時出錯:', error);
    }
}

// 清除日誌
function clearLog() {
    try {
        const logContainer = document.getElementById('logContainer');
        if (logContainer) {
            logContainer.innerHTML = '';
        }
    } catch (error) {
        console.error('清除日誌時出錯:', error);
    }
}

// 更新自動發送間隔
function updateAutoSendInterval() {
    try {
        const intervalInput = document.getElementById('autoSendInterval');
        let interval = parseInt(intervalInput.value);
        
        if (isNaN(interval) || interval < 1) {
            interval = 5;
            intervalInput.value = interval;
        }
    } catch (error) {
        console.error('更新自動發送間隔時出錯:', error);
    }
}

// 添加自動發送任務
function addAutoSendTask() {
    try {
        if (!wsClient || !wsClient.isConnected) {
            addLog('未連接到 WebSocket 服務器', 'error');
            return;
        }
        
        const messageType = document.getElementById('messageType').value;
        const messageContent = document.getElementById('messageContent').value.trim();
        const intervalInput = document.getElementById('autoSendInterval');
        const intervalSeconds = parseInt(intervalInput.value);
        
        if (!messageContent) {
            addLog('請輸入要發送的消息', 'error');
            return;
        }
        
        if (isNaN(intervalSeconds) || intervalSeconds < 1) {
            addLog('請輸入有效的時間間隔', 'error');
            return;
        }
        
        let data;
        try {
            switch (messageType) {
                case 'json':
                    data = JSON.parse(messageContent);
                    break;
                case 'text':
                    data = messageContent;
                    break;
                case 'binary':
                    // 將十六進制字符串轉換為 Uint8Array
                    const hexString = messageContent.replace(/\s+/g, '');
                    if (!/^[0-9A-Fa-f]+$/.test(hexString)) {
                        throw new Error('二進制數據必須是十六進制格式');
                    }
                    data = hexString;
                    break;
                default:
                    throw new Error(`不支持的消息類型: ${messageType}`);
            }
            
            // 添加定時任務
            const taskId = wsClient.addAutoSendTask({
                type: messageType,
                content: data
            }, intervalSeconds * 1000);
            
            // 更新任務列表
            autoSendTasks.set(taskId, {
                id: taskId,
                type: messageType,
                content: messageContent,
                interval: intervalSeconds,
                enabled: true
            });
            
            updateAutoSendTasksList();
            addLog(`已添加定時發送任務 (ID: ${taskId})`, 'success');
        } catch (error) {
            addLog(`添加定時任務失敗: ${error.message}`, 'error');
        }
    } catch (error) {
        console.error('添加自動發送任務時出錯:', error);
        addLog(`添加自動發送任務時出錯: ${error.message}`, 'error');
    }
}

// 更新任務列表
function updateAutoSendTasksList() {
    try {
        const container = document.getElementById('autoSendTasksList');
        if (!container) return;
        
        container.innerHTML = '';
        if (autoSendTasks.size === 0) {
            container.innerHTML = '<div class="no-tasks">無定時任務</div>';
            return;
        }
        
        for (const [taskId, task] of autoSendTasks.entries()) {
            const taskEl = document.createElement('div');
            taskEl.className = 'auto-task';
            taskEl.innerHTML = `
                <div class="task-info">
                    <div><strong>ID:</strong> ${taskId}</div>
                    <div><strong>類型:</strong> ${task.type}</div>
                    <div><strong>間隔:</strong> ${task.interval} 秒</div>
                    <div><strong>內容:</strong> <span class="task-content">${
                        task.content.length > 30 ? task.content.substring(0, 30) + '...' : task.content
                    }</span></div>
                </div>
                <div class="task-actions">
                    <button id="toggle-task-${taskId}" class="small-btn ${task.enabled ? 'stop-btn' : 'start-btn'}" 
                            ${!wsClient || !wsClient.isConnected ? 'disabled' : ''}
                            onclick="toggleAutoSendTask('${taskId}')">
                        ${task.enabled ? '停止' : '啟動'}
                    </button>
                    <button id="remove-task-${taskId}" class="small-btn remove-btn" 
                            onclick="removeAutoSendTask('${taskId}')">
                        刪除
                    </button>
                </div>
            `;
            container.appendChild(taskEl);
        }
        
        // 添加全局函數以在點擊按鈕時調用
        window.toggleAutoSendTask = toggleAutoSendTask;
        window.removeAutoSendTask = removeAutoSendTask;
    } catch (error) {
        console.error('更新任務列表時出錯:', error);
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