// Node.js 示例 - 使用 WebSocket 客戶端和二進制解析器

// 引入 WebSocket 客戶端和二進制解析器
const { WebSocketClient } = require('./socket_client.js');
const { BinaryParser, ProtocolParser } = require('./binary_parser.js');

// 創建二進制解析器
const binaryParser = new BinaryParser();

// 創建 WebSocket 客戶端
const wsClient = new WebSocketClient('wss://echo.websocket.org');

// 添加通用消息處理器，用於解析所有接收到的消息
wsClient.addMessageHandler(data => {
  console.log('收到原始消息:', data);
  
  // 如果是二進制數據，則進行詳細解析
  if (data && data.type === 'binary' && data.buffer) {
    const inspection = binaryParser.inspectBinary(data.buffer);
    console.log('二進制數據詳情:');
    console.log(`- 長度: ${inspection.byteLength} 字節`);
    console.log(`- 可能的格式: ${inspection.possibleFormats.join(', ')}`);
    console.log('- 十六進制轉儲 (前 100 字節):');
    console.log(inspection.hexDump.split('\n').slice(0, 5).join('\n'));
  }
});

// 連接到 WebSocket 服務器
async function connectAndTest() {
  try {
    console.log(`正在連接到 WebSocket 服務器...`);
    await wsClient.connect();
    console.log('連接成功！');
    
    // 訂閱示例主題
    wsClient.subscribe('test_topic', data => {
      console.log('主題 "test_topic" 收到數據:', data);
    });
    
    // 發送 JSON 消息
    console.log('發送 JSON 消息...');
    wsClient.send({
      action: 'echo',
      data: {
        message: '這是一個測試消息',
        timestamp: Date.now()
      }
    });
    
    // 發送文本消息
    console.log('發送文本消息...');
    wsClient.send('這是一個純文本測試消息');
    
    // 發送二進制消息
    console.log('發送二進制消息...');
    const binaryData = Buffer.from('這是一個二進制測試消息').buffer;
    wsClient.send(binaryData);
    
    // 創建和發送更複雜的二進制數據
    console.log('發送複雜的二進制數據...');
    const complexData = createComplexBinaryData();
    wsClient.send(complexData);
    
    // 10 秒後斷開連接
    console.log('將在 10 秒後斷開連接...');
    setTimeout(() => {
      wsClient.disconnect();
      console.log('已斷開連接');
      process.exit(0);
    }, 10000);
    
  } catch (error) {
    console.error('連接或操作失敗:', error);
    process.exit(1);
  }
}

// 創建複雜的二進制數據示例
function createComplexBinaryData() {
  // 創建一個 ArrayBuffer，包含不同類型的數據
  const buffer = new ArrayBuffer(24);
  const view = new DataView(buffer);
  
  // 寫入一個 32 位整數 (位置 0-3)
  view.setUint32(0, 123456789, true);
  
  // 寫入一個 64 位浮點數 (位置 4-11)
  view.setFloat64(4, 3.14159265359, true);
  
  // 寫入一個 16 位整數 (位置 12-13)
  view.setUint16(12, 42, true);
  
  // 寫入一些字節 (位置 14-23)
  const bytes = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74]; // ASCII: ABCDEFGHIJ
  for (let i = 0; i < bytes.length; i++) {
    view.setUint8(14 + i, bytes[i]);
  }
  
  return buffer;
}

// 演示如何使用自定義解碼器
function demoCustomDecoder() {
  // 註冊自定義解碼器
  binaryParser.registerDecoder('customFormat', buffer => {
    const view = new DataView(buffer);
    
    // 解析我們在 createComplexBinaryData 中創建的格式
    return {
      intValue: view.getUint32(0, true),
      doubleValue: view.getFloat64(4, true),
      shortValue: view.getUint16(12, true),
      text: String.fromCharCode(...new Uint8Array(buffer.slice(14)))
    };
  });
  
  // 創建測試數據
  const testData = createComplexBinaryData();
  
  // 使用自定義解碼器解析
  const decoded = binaryParser.decode(testData, 'customFormat');
  console.log('自定義解碼器結果:', decoded);
}

// 運行示例
console.log('===== WebSocket 客戶端和二進制解析器示例 =====');
demoCustomDecoder();
connectAndTest(); 