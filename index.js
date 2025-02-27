// WebSocket 客戶端與二進制數據解析工具
// 主索引文件 - 導出所有公共 API

const { BinaryParser, ProtocolParser } = require('./core');
const { WebSocketClient } = require('./adapters');

module.exports = {
  // 核心組件
  BinaryParser,
  ProtocolParser,
  
  // 適配器
  WebSocketClient
}; 