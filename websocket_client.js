// WebSocket 客戶端 - 用於連接、訂閱、解析二進制數據並轉換為 JSON

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
    this.autoReconnect = true; // 是否自動重連
    this.autoSendTasks = new Map(); // 存儲多個定時發送任務，鍵為任務ID，值為任務對象
  }

  // 連接到 WebSocket 服務器
  connect() {
    return new Promise((resolve, reject) => {
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        console.log('WebSocket 已經連接或正在連接中');
        resolve();
        return;
      }
      
      try {
        console.log(`正在連接到 ${this.url}...`);
        this.socket = new WebSocket(this.url);
        
        // 設置二進制數據類型為 arraybuffer
        this.socket.binaryType = 'arraybuffer';
        
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
          this.handleMessage(event);
        };
      } catch (error) {
        console.error('創建 WebSocket 時出錯:', error);
        reject(error);
      }
    });
  }

  // 關閉 WebSocket 連接
  disconnect() {
    // 停止所有定時發送任務
    this.stopAllAutoSendTasks();
    
    // 禁用自動重連
    this.autoReconnect = false;
    
    if (this.socket) {
      // 如果連接仍然是開啟的，則關閉它
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        try {
          console.log('正在關閉 WebSocket 連接...');
          this.socket.close(1000, "正常關閉");
        } catch (e) {
          console.error('關閉 WebSocket 時出錯:', e);
        }
      }
      
      // 立即更新連接狀態
      this.isConnected = false;
      
      // 清理事件處理器
      this.cleanupSocket();
      
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
      
      // 關閉連接（如果尚未關閉）
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        try {
          this.socket.close();
        } catch (e) {
          console.error('關閉 WebSocket 時出錯:', e);
        }
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
      const message = typeof data === 'object' ? JSON.stringify(data) : data;
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
  handleMessage(event) {
    // 再次檢查連接狀態
    if (!this.isConnected) {
      console.warn('WebSocket 已斷開，忽略接收到的消息');
      return;
    }
    
    try {
      console.log('收到的數據類型:', typeof event.data);
      console.log('是否為 Blob:', event.data instanceof Blob);
      console.log('是否為 ArrayBuffer:', event.data instanceof ArrayBuffer);
      
      if (event.data instanceof Blob) {
        console.log('Blob size:', event.data.size);
        console.log('Blob type:', event.data.type);
        // 如果是 Blob 數據，使用 FileReader 讀取
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result;
          console.log('Blob 轉換後的文本:', text.substring(0, 200)); // 只顯示前200個字符
          try {
            const parsedData = JSON.parse(text);
            this.processMessage(parsedData);
          } catch (error) {
            console.error('解析 Blob JSON 時出錯:', error);
            console.error('嘗試解析的文本:', text.substring(0, 200));
          }
        };
        reader.readAsText(event.data);
        return;
      } else if (event.data instanceof ArrayBuffer) {
        console.log('ArrayBuffer length:', event.data.byteLength);
        try {
          // 檢查數據是否為空
          if (event.data.byteLength === 0) {
            console.warn('收到空的 ArrayBuffer');
            return;
          }

          // 打印原始數據的十六進制表示
          const bytes = new Uint8Array(event.data);
          const hexString = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log('原始數據(hex):', hexString.substring(0, 100) + (hexString.length > 100 ? '...' : ''));

          // 嘗試使用 TextDecoder 解碼
          const decoder = new TextDecoder('utf-8', { fatal: true });
          const text = decoder.decode(event.data);
          
          // 檢查解碼後的文本
          if (text.length === 0) {
            console.warn('解碼後得到空文本');
            return;
          }
          
          console.log('解碼後的文本:', text.substring(0, 200));
          
          // 檢查文本是否以有效的 JSON 字符開始
          if (!['{', '['].includes(text.trim()[0])) {
            console.warn('解碼後的文本不是有效的 JSON 格式');
            return;
          }

          // 嘗試解析 JSON
          const parsedData = JSON.parse(text);
          this.processMessage(parsedData);
        } catch (error) {
          if (error instanceof TypeError && error.message.includes('TextDecoder')) {
            console.error('TextDecoder 解碼失敗:', error);
          } else {
            console.error('解析 ArrayBuffer JSON 時出錯:', error);
            // 如果有解碼後的文本，顯示它
            if (typeof text !== 'undefined') {
              console.error('嘗試解析的文本:', text.substring(0, 200));
            }
          }
        }
      } else if (typeof event.data === 'string') {
        try {
          const parsedData = JSON.parse(event.data);
          this.processMessage(parsedData);
        } catch (error) {
          console.error('解析字符串 JSON 時出錯:', error);
          // 如果不是 JSON，則作為純文本處理
          this.processMessage(event.data);
        }
      } else {
        console.warn('收到未知類型的數據:', typeof event.data);
      }
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
  
  // 重置客戶端狀態
  reset() {
    // 停止所有定時發送任務
    this.stopAllAutoSendTasks();
    
    // 清空定時發送任務列表
    this.autoSendTasks.clear();
    
    // 斷開連接
    this.disconnect();
    
    // 清空訂閱和消息處理器
    this.subscriptions.clear();
    this.messageHandlers = [];
    
    // 重置連接狀態
    this.isConnected = false;
    this.reconnectAttempts = 0;
    
    console.log('WebSocket 客戶端已重置');
  }

  // 嘗試重新連接
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('已達到最大重連次數，停止重連');
      return;
    }

    this.reconnectAttempts++;
    console.log(`嘗試重新連接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
          .catch(error => {
            console.error('重連失敗:', error);
            // 如果還沒達到最大重試次數，繼續嘗試
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              this.attemptReconnect();
            }
          });
      }
    }, this.reconnectInterval);
  }
}

// 導出模塊
window.WebSocketClient = WebSocketClient; 