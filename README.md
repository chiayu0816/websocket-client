# WebSocket 客戶端與二進制數據解析工具

這是一個功能強大的 WebSocket 客戶端測試工具，專為測試和調試 WebSocket API 而設計。它支持文本、JSON 和二進制數據的發送與接收，並提供了強大的二進制數據解析功能。

## 功能特點

- **多環境支持**：同時支持瀏覽器和 Node.js 環境
- **連接管理**：建立、維護和關閉 WebSocket 連接，自動重連機制
- **多種數據格式**：支持發送和接收文本、JSON 和二進制數據
- **主題訂閱**：支持基於主題的消息訂閱模式
- **二進制數據解析**：
  - 自動檢測和解析多種二進制格式
  - 支持 Protobuf 數據解析
  - 提供十六進制數據查看功能
  - 可擴展的解碼器系統
- **用戶友好界面**：瀏覽器環境下提供直觀的 UI 界面

## 快速開始

### 瀏覽器環境

1. 直接在瀏覽器中打開 `websocket_client.html` 文件
2. 輸入 WebSocket 服務器 URL
3. 點擊「連接」按鈕建立連接
4. 使用界面發送消息或訂閱主題

### Node.js 環境

1. 安裝依賴：

```bash
npm install
```

2. 運行示例：

```bash
npm start
```

或者在您的代碼中引入：

```javascript
const { WebSocketClient } = require('./socket_client.js');
const { BinaryParser, ProtocolParser } = require('./binary_parser.js');

// 創建 WebSocket 客戶端
const wsClient = new WebSocketClient('wss://your-websocket-server.com');

// 連接到服務器
await wsClient.connect();

// 發送消息
wsClient.send({ action: 'getData', params: { id: 123 } });

// 訂閱主題
wsClient.subscribe('updates', data => {
  console.log('收到更新:', data);
});
```

## 核心組件

### WebSocketClient

WebSocket 客戶端類，提供連接管理和消息處理功能。

```javascript
// 創建客戶端
const client = new WebSocketClient('wss://example.com/ws');

// 連接到服務器
await client.connect();

// 發送消息
client.send({ type: 'request', data: { ... } });

// 訂閱主題
client.subscribe('market_data', data => {
  console.log('收到市場數據:', data);
});

// 取消訂閱
client.unsubscribe('market_data');

// 斷開連接
client.disconnect();
```

### BinaryParser

二進制數據解析器，用於處理和解析各種二進制數據格式。

```javascript
// 創建解析器
const parser = new BinaryParser();

// 解析二進制數據
const result = parser.decode(binaryData);

// 檢查二進制數據
const inspection = parser.inspectBinary(binaryData);
console.log(inspection.hexDump);
console.log(inspection.possibleFormats);

// 註冊自定義解碼器
parser.registerDecoder('myFormat', buffer => {
  // 自定義解析邏輯
  return parsedData;
});
```

### ProtocolParser

擴展自 BinaryParser，專門用於處理基於協議的二進制數據（如 Protobuf）。

```javascript
// 創建協議解析器
const protocolParser = new ProtocolParser();

// 設置協議定義
protocolParser.setProtocolDefinition({
  messageTypes: {
    1: 'UserLogin',
    2: 'MarketData'
  },
  // 其他協議定義...
});

// 解析特定類型的消息
const parsed = protocolParser.parseMessage(buffer, 'MarketData');
```

## 使用場景

- 測試和調試 WebSocket API
- 開發基於 WebSocket 的應用程序
- 分析和解析二進制協議數據
- 監控 WebSocket 連接和消息流
- 學習 WebSocket 和二進制數據處理

## 擴展功能

### 自定義解碼器

您可以通過註冊自定義解碼器來擴展二進制解析器的功能：

```javascript
binaryParser.registerDecoder('customFormat', buffer => {
  const view = new DataView(buffer);
  return {
    // 自定義解析邏輯
    value1: view.getUint32(0, true),
    value2: view.getFloat64(4, true),
    // ...
  };
});
```

### 消息處理器

添加全局消息處理器來處理所有接收到的消息：

```javascript
wsClient.addMessageHandler(data => {
  console.log('收到消息:', data);
  // 處理所有消息的邏輯
});
```

## 許可證

MIT
