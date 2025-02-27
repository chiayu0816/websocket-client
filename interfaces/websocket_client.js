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
    
    // 初始化二進制解析器
    if (typeof BinaryParser !== 'undefined') {
      this.binaryParser = new BinaryParser();
    }
  }

  // 連接到 WebSocket 服務器
  connect() {
    return new Promise((resolve, reject) => {
      try {
        // 如果已經有連接，先關閉它
        if (this.socket) {
          this.cleanupSocket();
        }
        
        console.log(`正在連接到 WebSocket 服務器: ${this.url}`);
        this.socket = new WebSocketImpl(this.url);
        
        // 設置二進制數據類型
        this.socket.binaryType = this.binaryType;

        // 連接成功時的處理
        this.socket.onopen = () => {
          console.log('WebSocket 連接已建立');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        // 接收消息的處理
        this.socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        // 連接關閉時的處理
        this.socket.onclose = (event) => {
          console.log(`WebSocket 連接已關閉: ${event.code} ${event.reason}`);
          this.isConnected = false;
          
          // 嘗試重新連接
          if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`嘗試重新連接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), this.reconnectInterval);
          }
        };

        // 錯誤處理
        this.socket.onerror = (error) => {
          console.error('WebSocket 錯誤:', error);
          reject(error);
        };
      } catch (error) {
        console.error('建立 WebSocket 連接時出錯:', error);
        reject(error);
      }
    });
  }

  // 關閉 WebSocket 連接
  disconnect() {
    this.autoReconnect = false; // 禁用自動重連
    
    if (this.socket) {
      // 清理事件處理器，防止在關閉過程中觸發事件
      this.cleanupSocket();
      
      // 如果連接仍然是開啟的，則關閉它
      if (this.isConnected) {
        this.socket.close();
      }
      
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
  
  // 重置客戶端狀態
  reset() {
    this.disconnect();
    this.subscriptions.clear();
    this.messageHandlers = [];
    this.reconnectAttempts = 0;
    this.autoReconnect = true;
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