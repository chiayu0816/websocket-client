// WebSocket 客戶端 - 用於連接、訂閱、解析二進制數據並轉換為 JSON

// 檢測運行環境 - 檢查 isNode 是否已經存在，如果不存在才宣告
if (typeof isNode === 'undefined') {
  var isNode = typeof window === 'undefined';
}

// 在 Node.js 環境中引入 WebSocket 庫
let WebSocketImpl;
if (isNode) {
  WebSocketImpl = require('ws');
} else {
  WebSocketImpl = WebSocket;
}

class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000; // 3秒
    this.subscriptions = new Map();
    this.messageHandlers = [];
    this.binaryType = 'arraybuffer'; // 'arraybuffer' 或 'blob'
    this.autoReconnect = true; // 是否自動重連
    this.parserType = 'auto'; // 默認使用自動檢測解析器
    this.binaryParser = null; // BinaryParser 實例
    
    // 定時發送相關設置 - 改為支持多個定時發送任務
    this.autoSendTasks = new Map(); // 存儲多個定時發送任務，鍵為任務ID，值為任務對象
    
    // 初始化二進制解析器
    if (typeof BinaryParser !== 'undefined') {
      this.binaryParser = new BinaryParser();
    }
  }

  // 連接到 WebSocket 服務器
  connect() {
    return new Promise((resolve, reject) => {
      if (this.socket && (this.socket.readyState === WebSocketImpl.OPEN || this.socket.readyState === WebSocketImpl.CONNECTING)) {
        console.log('WebSocket 已經連接或正在連接中');
        resolve();
        return;
      }
      
      try {
        console.log(`正在連接到 ${this.url}...`);
        this.socket = new WebSocketImpl(this.url);
        
        // 設置二進制數據類型
        this.socket.binaryType = this.binaryType;
        
        this.socket.onopen = () => {
          console.log('WebSocket 連接已打開');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // 啟動所有已啟用的定時發送任務
          for (const [taskId, task] of this.autoSendTasks.entries()) {
            if (task.enabled) {
              this.startAutoSendTask(taskId);
            }
          }
          
          resolve();
        };
        
        this.socket.onclose = (event) => {
          console.log(`WebSocket 連接已關閉: ${event.code} ${event.reason}`);
          this.isConnected = false;
          
          // 停止所有定時發送任務
          this.stopAllAutoSendTasks();
          
          // 如果啟用了自動重連且不是主動關閉
          if (this.autoReconnect && event.code !== 1000) {
            this.attemptReconnect();
          }
        };
        
        this.socket.onerror = (error) => {
          console.error('WebSocket 錯誤:', error);
          // 在某些環境中，error 事件不提供詳細信息
          if (!this.isConnected) {
            reject(new Error('WebSocket 連接失敗'));
          }
        };
        
        this.socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        console.error('創建 WebSocket 時出錯:', error);
        reject(error);
      }
    });
  }

  // 關閉 WebSocket 連接
  disconnect() {
    this.autoReconnect = false; // 禁用自動重連
    
    if (this.socket) {
      // 如果連接仍然是開啟的，則關閉它
      if (this.isConnected) {
        try {
          this.socket.close();
        } catch (e) {
          console.error('關閉 WebSocket 時出錯:', e);
        }
      }
      
      // 清理事件處理器
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      
      this.socket = null;
      this.isConnected = false;
      console.log('WebSocket 連接已手動關閉');
    }
  }
  
  // 清理 WebSocket 資源
  cleanupSocket() {
    if (this.socket) {
      // 移除所有事件處理器
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      
      // 關閉連接
      try {
        this.socket.close();
      } catch (e) {
        console.error('關閉 WebSocket 時出錯:', e);
      }
      
      this.socket = null;
    }
  }

  // 發送消息到服務器
  send(data) {
    if (!this.isConnected || !this.socket) {
      console.error('WebSocket 未連接，無法發送消息');
      return false;
    }

    try {
      // 如果數據是對象，則轉換為 JSON 字符串
      const message = typeof data === 'object' && !(data instanceof ArrayBuffer) && !(isNode && data instanceof Buffer) 
        ? JSON.stringify(data) 
        : data;
      
      this.socket.send(message);
      return true;
    } catch (error) {
      console.error('發送消息時出錯:', error);
      return false;
    }
  }

  // 訂閱特定主題
  subscribe(topic, callback) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
      
      // 向服務器發送訂閱請求
      const subscriptionMessage = {
        action: 'subscribe',
        topic: topic
      };
      
      this.send(subscriptionMessage);
    }
    
    // 添加回調函數到訂閱列表
    this.subscriptions.get(topic).push(callback);
    console.log(`已訂閱主題: ${topic}`);
  }

  // 取消訂閱特定主題
  unsubscribe(topic, callback = null) {
    if (!this.subscriptions.has(topic)) {
      console.warn(`未找到主題的訂閱: ${topic}`);
      return;
    }

    if (callback) {
      // 移除特定回調
      const callbacks = this.subscriptions.get(topic);
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
      
      // 如果沒有更多回調，則完全取消訂閱
      if (callbacks.length === 0) {
        this.subscriptions.delete(topic);
        
        // 向服務器發送取消訂閱請求
        const unsubscriptionMessage = {
          action: 'unsubscribe',
          topic: topic
        };
        
        this.send(unsubscriptionMessage);
      }
    } else {
      // 移除所有回調
      this.subscriptions.delete(topic);
      
      // 向服務器發送取消訂閱請求
      const unsubscriptionMessage = {
        action: 'unsubscribe',
        topic: topic
      };
      
      this.send(unsubscriptionMessage);
    }
    
    console.log(`已取消訂閱主題: ${topic}`);
  }

  // 添加通用消息處理器
  addMessageHandler(handler) {
    if (typeof handler === 'function') {
      this.messageHandlers.push(handler);
      return true;
    }
    return false;
  }

  // 移除通用消息處理器
  removeMessageHandler(handler) {
    const index = this.messageHandlers.indexOf(handler);
    if (index !== -1) {
      this.messageHandlers.splice(index, 1);
      return true;
    }
    return false;
  }

  // 清除所有消息處理器
  clearMessageHandlers() {
    this.messageHandlers = [];
    console.log('已清除所有消息處理器');
  }

  // 處理接收到的消息
  handleMessage(data) {
    // 如果連接已關閉，不處理消息
    if (!this.isConnected) {
      console.warn('WebSocket 已斷開，忽略接收到的消息');
      return;
    }
    
    try {
      let parsedData;
      
      // 處理二進制數據
      if (data instanceof ArrayBuffer || (isNode && data instanceof Buffer)) {
        parsedData = this.parseBinaryData(data);
      } else if (!isNode && data instanceof Blob) {
        // 如果是 Blob，則轉換為 ArrayBuffer 後處理
        this.blobToArrayBuffer(data).then(buffer => {
          const parsedFromBlob = this.parseBinaryData(buffer);
          this.processMessage(parsedFromBlob);
        });
        return;
      } else if (typeof data === 'string') {
        // 嘗試解析 JSON 字符串
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          parsedData = data;
        }
      } else {
        parsedData = data;
      }
      
      this.processMessage(parsedData);
    } catch (error) {
      console.error('處理消息時出錯:', error);
    }
  }

  // 處理解析後的消息
  processMessage(parsedData) {
    // 再次檢查連接狀態
    if (!this.isConnected) {
      console.warn('WebSocket 已斷開，忽略處理消息');
      return;
    }
    
    console.log('收到消息:', parsedData);
    
    // 檢查消息是否包含主題信息
    const topic = parsedData.topic || parsedData.channel || '';
    
    // 調用特定主題的回調
    if (topic && this.subscriptions.has(topic)) {
      const callbacks = this.subscriptions.get(topic);
      callbacks.forEach(callback => {
        try {
          callback(parsedData);
        } catch (error) {
          console.error(`執行主題 "${topic}" 的回調時出錯:`, error);
        }
      });
    }
    
    // 調用通用消息處理器
    this.messageHandlers.forEach(handler => {
      try {
        handler(parsedData);
      } catch (error) {
        console.error('執行通用消息處理器時出錯:', error);
      }
    });
  }

  // 將 Blob 轉換為 ArrayBuffer
  blobToArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  }

  // 解析二進制數據
  parseBinaryData(buffer) {
    try {
      // 如果有 BinaryParser 實例，則使用它進行解析
      if (this.binaryParser) {
        // 根據選擇的解析器類型進行解析
        switch (this.parserType) {
          case 'auto':
            return this.binaryParser.autoDetectAndParse(buffer);
          case 'utf8':
            return this.binaryParser.decode(buffer, 'utf8');
          case 'json':
            return this.binaryParser.decode(buffer, 'json');
          case 'hex':
            return this.binaryParser.decode(buffer, 'hex');
          case 'binary':
            return this.binaryParser.decode(buffer, 'binary');
          case 'inspect':
            return this.binaryParser.inspectBinary(buffer);
          default:
            return this.binaryParser.autoDetectAndParse(buffer);
        }
      }
      
      // 如果沒有 BinaryParser 實例，則使用簡單的解析方法
      // 確保我們有一個 ArrayBuffer
      const arrayBuffer = isNode && buffer instanceof Buffer 
        ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        : buffer;
      
      // 嘗試將二進制數據轉換為 UTF-8 字符串
      let text;
      if (isNode) {
        text = Buffer.from(arrayBuffer).toString('utf-8');
      } else {
        const textDecoder = new TextDecoder('utf-8');
        text = textDecoder.decode(arrayBuffer);
      }
      
      // 嘗試將字符串解析為 JSON
      try {
        return JSON.parse(text);
      } catch (e) {
        // 如果不是有效的 JSON，則返回原始字符串
        return text;
      }
    } catch (error) {
      console.error('解析二進制數據時出錯:', error);
      
      // 如果無法解析，則返回原始 ArrayBuffer 的十六進制表示
      return {
        type: 'binary',
        hex: this.arrayBufferToHex(buffer),
        buffer: buffer
      };
    }
  }

  // 將 ArrayBuffer 轉換為十六進制字符串
  arrayBufferToHex(buffer) {
    let uint8Array;
    
    if (isNode && buffer instanceof Buffer) {
      uint8Array = new Uint8Array(buffer);
    } else {
      uint8Array = new Uint8Array(buffer);
    }
    
    return Array.from(uint8Array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // 設置二進制數據類型 ('arraybuffer' 或 'blob')
  setBinaryType(type) {
    if (type === 'arraybuffer' || type === 'blob') {
      this.binaryType = type;
      if (this.socket) {
        this.socket.binaryType = type;
      }
    } else {
      console.error('無效的二進制類型。必須是 "arraybuffer" 或 "blob"');
    }
  }
  
  // 設置解析器類型
  setParserType(type) {
    this.parserType = type;
    console.log(`已設置解析器類型: ${type}`);
  }
  
  // 設置定時發送間隔（毫秒）- 已不再使用，保留向後兼容
  setAutoSendInterval(interval) {
    if (typeof interval !== 'number' || interval < 1000) {
      console.error('定時發送間隔必須是大於等於 1000 的數字（毫秒）');
      return;
    }
    
    console.log(`已設置定時發送間隔: ${interval}ms`);
    
    // 如果有舊的定時發送任務，更新其間隔
    if (this.autoSendTasks.size === 1) {
      const taskId = Array.from(this.autoSendTasks.keys())[0];
      const task = this.autoSendTasks.get(taskId);
      if (task) {
        this.updateAutoSendTask(taskId, task.message, interval);
      }
    }
  }
  
  // 添加定時發送任務
  addAutoSendTask(message, intervalMs) {
    if (!message || typeof intervalMs !== 'number' || intervalMs < 1000) {
      console.error('添加定時發送任務失敗：消息不能為空，間隔必須是大於等於 1000 的數字（毫秒）');
      return null;
    }
    
    // 生成唯一任務ID
    const taskId = 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    
    // 創建任務對象
    const task = {
      id: taskId,
      message: message,
      interval: intervalMs,
      timer: null,
      enabled: true
    };
    
    // 存儲任務
    this.autoSendTasks.set(taskId, task);
    
    // 如果已連接，立即啟動任務
    if (this.isConnected) {
      this.startAutoSendTask(taskId);
    }
    
    console.log(`已添加定時發送任務 ${taskId}，間隔: ${intervalMs}ms`);
    return taskId;
  }
  
  // 更新定時發送任務
  updateAutoSendTask(taskId, message = null, intervalMs = null) {
    const task = this.autoSendTasks.get(taskId);
    if (!task) {
      console.error(`更新定時發送任務失敗：找不到任務 ${taskId}`);
      return false;
    }
    
    // 更新消息（如果提供）
    if (message !== null) {
      task.message = message;
    }
    
    // 更新間隔（如果提供）
    if (intervalMs !== null && typeof intervalMs === 'number' && intervalMs >= 1000) {
      task.interval = intervalMs;
    }
    
    // 如果任務已啟用且已連接，重新啟動任務以應用新設置
    if (task.enabled && this.isConnected) {
      this.stopAutoSendTask(taskId);
      this.startAutoSendTask(taskId);
    }
    
    console.log(`已更新定時發送任務 ${taskId}`);
    return true;
  }
  
  // 啟用或禁用定時發送任務
  enableAutoSendTask(taskId, enabled = true) {
    const task = this.autoSendTasks.get(taskId);
    if (!task) {
      console.error(`啟用/禁用定時發送任務失敗：找不到任務 ${taskId}`);
      return false;
    }
    
    task.enabled = enabled;
    
    if (enabled) {
      console.log(`已啟用定時發送任務 ${taskId}`);
      if (this.isConnected) {
        this.startAutoSendTask(taskId);
      }
    } else {
      console.log(`已禁用定時發送任務 ${taskId}`);
      this.stopAutoSendTask(taskId);
    }
    
    return true;
  }
  
  // 刪除定時發送任務
  removeAutoSendTask(taskId) {
    const task = this.autoSendTasks.get(taskId);
    if (!task) {
      console.error(`刪除定時發送任務失敗：找不到任務 ${taskId}`);
      return false;
    }
    
    // 停止任務
    this.stopAutoSendTask(taskId);
    
    // 從任務列表中移除
    this.autoSendTasks.delete(taskId);
    
    console.log(`已刪除定時發送任務 ${taskId}`);
    return true;
  }
  
  // 啟動定時發送任務
  startAutoSendTask(taskId) {
    const task = this.autoSendTasks.get(taskId);
    if (!task) {
      console.error(`啟動定時發送任務失敗：找不到任務 ${taskId}`);
      return false;
    }
    
    // 確保先停止現有的定時器
    this.stopAutoSendTask(taskId);
    
    if (!task.enabled || !this.isConnected) {
      return false;
    }
    
    console.log(`開始定時發送任務 ${taskId}，間隔: ${task.interval}ms`);
    
    // 設置定時器定期發送消息
    task.timer = setInterval(() => {
      if (this.isConnected) {
        console.log(`定時發送任務 ${taskId} 發送消息...`);
        this.send(task.message);
      } else {
        // 如果連接已斷開，則停止定時發送
        this.stopAutoSendTask(taskId);
      }
    }, task.interval);
    
    return true;
  }
  
  // 停止定時發送任務
  stopAutoSendTask(taskId) {
    const task = this.autoSendTasks.get(taskId);
    if (!task) {
      return false;
    }
    
    if (task.timer) {
      clearInterval(task.timer);
      task.timer = null;
      console.log(`已停止定時發送任務 ${taskId}`);
    }
    
    return true;
  }
  
  // 停止所有定時發送任務
  stopAllAutoSendTasks() {
    for (const taskId of this.autoSendTasks.keys()) {
      this.stopAutoSendTask(taskId);
    }
    console.log('已停止所有定時發送任務');
  }
  
  // 啟用或禁用定時發送 (向後兼容舊版本)
  enableAutoSend(enabled = true, message = null) {
    // 清除所有現有任務
    this.stopAllAutoSendTasks();
    this.autoSendTasks.clear();
    
    if (enabled && message) {
      // 創建一個新任務
      this.addAutoSendTask(message, this.autoSendInterval || 5000);
      console.log(`已啟用定時發送（間隔: ${this.autoSendInterval || 5000}ms）`);
    } else {
      console.log('已禁用定時發送');
    }
  }
  
  // 開始定時發送消息 (向後兼容舊版本)
  startAutoSend(message) {
    // 清除所有現有任務
    this.stopAllAutoSendTasks();
    this.autoSendTasks.clear();
    
    if (!this.isConnected || !message) {
      return;
    }
    
    // 創建一個新任務
    this.addAutoSendTask(message, this.autoSendInterval || 5000);
  }
  
  // 停止定時發送消息 (向後兼容舊版本)
  stopAutoSend() {
    this.stopAllAutoSendTasks();
  }
  
  // 重置客戶端狀態
  reset() {
    this.stopAutoSend();
    this.disconnect(); // disconnect 方法已經包含了清理 socket 的邏輯
    this.subscriptions.clear();
    this.messageHandlers = [];
    console.log('WebSocket 客戶端已重置');
  }
}

// 導出模塊
if (isNode) {
  module.exports = {
    WebSocketClient
  };
} else {
  // 在瀏覽器環境中，將 WebSocketClient 類添加到全局作用域
  window.WebSocketClient = WebSocketClient;
}

// 更新定時發送間隔
function updateAutoSendInterval() {
    if (wsClient && wsClient.isConnected && autoSendEnabledCheckbox.checked) {
        const seconds = parseInt(autoSendIntervalInput.value, 10);
        if (isNaN(seconds) || seconds < 1) {
            addLog('定時發送間隔必須是大於等於 1 的整數（秒）', 'error');
            return;
        }
        
        const milliseconds = seconds * 1000;
        wsClient.setAutoSendInterval(milliseconds);
        addLog(`已設置定時發送間隔: ${seconds} 秒`, 'info');
    }
} 