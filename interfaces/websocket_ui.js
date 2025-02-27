// DOM 元素
const wsUrlInput = document.getElementById('wsUrl');
const binaryTypeSelect = document.getElementById('binaryType');
const parserTypeSelect = document.getElementById('parserType');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const topicInput = document.getElementById('topic');
const subscribeBtn = document.getElementById('subscribeBtn');
const unsubscribeBtn = document.getElementById('unsubscribeBtn');
const subscriptionsList = document.getElementById('subscriptionsList');
const messageTypeSelect = document.getElementById('messageType');
const messageContentTextarea = document.getElementById('messageContent');
const sendBtn = document.getElementById('sendBtn');
const logContainer = document.getElementById('logContainer');
const clearLogBtn = document.getElementById('clearLogBtn');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const themeToggle = document.getElementById('themeToggle');
const pingEnabledCheckbox = document.getElementById('pingEnabled');
const pingIntervalInput = document.getElementById('pingInterval');

// WebSocket 客戶端實例
let wsClient = null;
let activeSubscriptions = new Set();
// 保存通用消息處理器的引用，以便在斷開連接時移除
let generalMessageHandler = null;

// 初始化頁面
function init() {
    // 初始化主題
    initTheme();
    
    // 標籤頁切換
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            // 激活選中的標籤
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // 顯示對應的內容
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabId}-tab`) {
                    content.classList.add('active');
                }
            });
        });
    });

    // 按鈕事件
    connectBtn.addEventListener('click', connectWebSocket);
    disconnectBtn.addEventListener('click', disconnectWebSocket);
    subscribeBtn.addEventListener('click', subscribeTopic);
    unsubscribeBtn.addEventListener('click', unsubscribeTopic);
    sendBtn.addEventListener('click', sendMessage);
    clearLogBtn.addEventListener('click', clearLog);
    themeToggle.addEventListener('change', toggleTheme);

    // Ping 設置事件
    pingEnabledCheckbox.addEventListener('change', togglePingSettings);
    pingIntervalInput.addEventListener('change', updatePingInterval);

    // 二進制類型變更
    binaryTypeSelect.addEventListener('change', () => {
        if (wsClient && wsClient.isConnected) {
            wsClient.setBinaryType(binaryTypeSelect.value);
            addLog(`已設置二進制數據類型: ${binaryTypeSelect.value}`, 'info');
        }
    });
    
    // 解析器類型變更
    parserTypeSelect.addEventListener('change', () => {
        if (wsClient && wsClient.isConnected) {
            wsClient.setParserType(parserTypeSelect.value);
            addLog(`已設置解析器類型: ${parserTypeSelect.value}`, 'info');
        }
    });

    // 設置示例消息
    messageContentTextarea.value = JSON.stringify({
        action: 'get_data',
        params: {
            symbol: 'BTC/USDT',
            interval: '1m'
        }
    }, null, 2);
}

// 初始化主題
function initTheme() {
    // 檢查本地存儲中的主題設置
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.checked = true;
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        themeToggle.checked = false;
    }
}

// 切換主題
function toggleTheme() {
    if (themeToggle.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
}

// 切換 Ping 設置
function togglePingSettings() {
    pingIntervalInput.disabled = !pingEnabledCheckbox.checked;
    
    if (wsClient && wsClient.isConnected) {
        wsClient.enablePing(pingEnabledCheckbox.checked);
        if (pingEnabledCheckbox.checked) {
            updatePingInterval();
            addLog(`已啟用自動 Ping，間隔: ${pingIntervalInput.value} 秒`, 'info');
        } else {
            addLog('已禁用自動 Ping', 'info');
        }
    }
}

// 更新 Ping 間隔
function updatePingInterval() {
    if (wsClient && wsClient.isConnected && pingEnabledCheckbox.checked) {
        const seconds = parseInt(pingIntervalInput.value, 10);
        if (isNaN(seconds) || seconds < 1) {
            addLog('Ping 間隔必須是大於等於 1 的整數（秒）', 'error');
            return;
        }
        
        const milliseconds = seconds * 1000;
        wsClient.setPingInterval(milliseconds);
        addLog(`已設置 Ping 間隔: ${seconds} 秒`, 'info');
    }
}

// 連接 WebSocket
function connectWebSocket() {
    const url = wsUrlInput.value.trim();
    if (!url) {
        addLog('請輸入有效的 WebSocket URL', 'error');
        return;
    }

    // 如果已經有連接，先斷開它
    if (wsClient) {
        disconnectWebSocket();
    }

    try {
        // 創建 WebSocket 客戶端
        wsClient = new WebSocketClient(url);
        wsClient.setBinaryType(binaryTypeSelect.value);
        wsClient.setParserType(parserTypeSelect.value);
        
        // 設置 Ping
        if (pingEnabledCheckbox.checked) {
            const seconds = parseInt(pingIntervalInput.value, 10);
            if (!isNaN(seconds) && seconds >= 1) {
                wsClient.enablePing(true);
                wsClient.setPingInterval(seconds * 1000);
                addLog(`已啟用自動 Ping，間隔: ${seconds} 秒`, 'info');
            }
        }
        
        // 添加通用消息處理器
        generalMessageHandler = data => {
            addLog(`收到消息: ${JSON.stringify(data, null, 2)}`, 'received');
        };
        wsClient.addMessageHandler(generalMessageHandler);
        
        // 連接到服務器
        addLog(`正在連接到 ${url}...`, 'info');
        wsClient.connect()
            .then(() => {
                addLog('WebSocket 連接成功', 'success');
                updateUIState(true);
            })
            .catch(error => {
                addLog(`連接失敗: ${error}`, 'error');
                cleanupWebSocketClient();
            });
    } catch (error) {
        addLog(`創建 WebSocket 客戶端時出錯: ${error}`, 'error');
        cleanupWebSocketClient();
    }
}

// 斷開 WebSocket 連接
function disconnectWebSocket() {
    if (wsClient) {
        // 使用 WebSocketClient 的 reset 方法完全清理資源
        wsClient.reset();
        addLog('WebSocket 連接已斷開並重置', 'info');
        
        // 清理 UI 狀態
        cleanupWebSocketClient();
    }
}

// 清理 WebSocket 客戶端資源
function cleanupWebSocketClient() {
    // 清理引用和 UI 狀態
    wsClient = null;
    generalMessageHandler = null;
    activeSubscriptions.clear();
    updateSubscriptionsList();
    updateUIState(false);
}

// 訂閱主題
function subscribeTopic() {
    const topic = topicInput.value.trim();
    if (!topic) {
        addLog('請輸入有效的主題', 'error');
        return;
    }

    if (wsClient && wsClient.isConnected) {
        wsClient.subscribe(topic, data => {
            addLog(`主題 "${topic}" 收到數據: ${JSON.stringify(data, null, 2)}`, 'received');
        });
        activeSubscriptions.add(topic);
        updateSubscriptionsList();
        addLog(`已訂閱主題: ${topic}`, 'success');
    } else {
        addLog('WebSocket 未連接，無法訂閱主題', 'error');
    }
}

// 取消訂閱主題
function unsubscribeTopic() {
    const topic = topicInput.value.trim();
    if (!topic) {
        addLog('請輸入有效的主題', 'error');
        return;
    }

    if (wsClient && wsClient.isConnected) {
        wsClient.unsubscribe(topic);
        activeSubscriptions.delete(topic);
        updateSubscriptionsList();
        addLog(`已取消訂閱主題: ${topic}`, 'info');
    } else {
        addLog('WebSocket 未連接，無法取消訂閱主題', 'error');
    }
}

// 發送消息
function sendMessage() {
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
    subscriptionsList.innerHTML = '';
    
    if (activeSubscriptions.size === 0) {
        subscriptionsList.innerHTML = '<p>無訂閱</p>';
        return;
    }
    
    const list = document.createElement('ul');
    activeSubscriptions.forEach(topic => {
        const item = document.createElement('li');
        item.textContent = topic;
        list.appendChild(item);
    });
    
    subscriptionsList.appendChild(list);
}

// 更新 UI 狀態
function updateUIState(isConnected) {
    connectBtn.disabled = isConnected;
    disconnectBtn.disabled = !isConnected;
    subscribeBtn.disabled = !isConnected;
    unsubscribeBtn.disabled = !isConnected;
    sendBtn.disabled = !isConnected;
    binaryTypeSelect.disabled = isConnected;
}

// 添加日誌
function addLog(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 清除日誌
function clearLog() {
    logContainer.innerHTML = '';
}

// 初始化頁面
document.addEventListener('DOMContentLoaded', init); 