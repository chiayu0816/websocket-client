// 二進制數據解析器 - 用於處理 Protobuf 和其他二進制格式

// 檢測運行環境
const isNode = typeof window === 'undefined';

// 在 Node.js 環境中引入必要的模塊
let TextEncoder, TextDecoder;
if (isNode) {
  const util = require('util');
  TextEncoder = util.TextEncoder;
  TextDecoder = util.TextDecoder;
}

/**
 * 二進制數據解析器類
 * 提供各種方法來解析不同格式的二進制數據
 */
class BinaryParser {
  constructor() {
    this.decoders = new Map();
    this.registerDefaultDecoders();
  }

  /**
   * 註冊默認的解碼器
   */
  registerDefaultDecoders() {
    // 註冊 UTF-8 文本解碼器
    this.registerDecoder('utf8', buffer => {
      try {
        if (isNode && buffer instanceof Buffer) {
          return buffer.toString('utf-8');
        } else {
          const decoder = new TextDecoder('utf-8');
          return decoder.decode(buffer);
        }
      } catch (error) {
        console.error('UTF-8 解碼失敗:', error);
        return null;
      }
    });

    // 註冊 JSON 解碼器 (先解碼為 UTF-8，然後解析 JSON)
    this.registerDecoder('json', buffer => {
      try {
        const text = this.decode(buffer, 'utf8');
        if (text) {
          return JSON.parse(text);
        }
        return null;
      } catch (error) {
        console.error('JSON 解碼失敗:', error);
        return null;
      }
    });

    // 註冊十六進制解碼器
    this.registerDecoder('hex', buffer => {
      try {
        if (isNode && buffer instanceof Buffer) {
          return buffer.toString('hex');
        } else {
          return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        }
      } catch (error) {
        console.error('十六進制解碼失敗:', error);
        return null;
      }
    });

    // 註冊基本二進制解碼器 (返回 Uint8Array 或 Buffer)
    this.registerDecoder('binary', buffer => {
      try {
        if (isNode && buffer instanceof Buffer) {
          return buffer;
        } else {
          return new Uint8Array(buffer);
        }
      } catch (error) {
        console.error('二進制解碼失敗:', error);
        return null;
      }
    });
  }

  /**
   * 註冊自定義解碼器
   * @param {string} name - 解碼器名稱
   * @param {Function} decoderFn - 解碼器函數，接收 ArrayBuffer 並返回解碼後的數據
   */
  registerDecoder(name, decoderFn) {
    if (typeof decoderFn !== 'function') {
      throw new Error('解碼器必須是一個函數');
    }
    this.decoders.set(name, decoderFn);
  }

  /**
   * 使用指定的解碼器解碼二進制數據
   * @param {ArrayBuffer|Buffer} buffer - 要解碼的二進制數據
   * @param {string} decoderName - 解碼器名稱
   * @returns {*} 解碼後的數據，如果解碼失敗則返回 null
   */
  decode(buffer, decoderName = 'auto') {
    // 確保輸入是有效的二進制數據
    if (!(buffer instanceof ArrayBuffer) && !(isNode && buffer instanceof Buffer)) {
      if (!isNode && buffer instanceof Blob) {
        // 如果是 Blob，則轉換為 ArrayBuffer 後處理
        return this.blobToArrayBuffer(buffer).then(arrayBuffer => 
          this.decode(arrayBuffer, decoderName)
        );
      } else {
        console.error('輸入必須是 ArrayBuffer、Buffer 或 Blob');
        return null;
      }
    }

    // 如果是自動模式，嘗試多種解碼方式
    if (decoderName === 'auto') {
      // 首先嘗試 JSON
      const jsonResult = this.decode(buffer, 'json');
      if (jsonResult !== null) {
        return {
          type: 'json',
          data: jsonResult
        };
      }

      // 然後嘗試 UTF-8 文本
      const textResult = this.decode(buffer, 'utf8');
      if (textResult !== null && textResult.length > 0) {
        return {
          type: 'text',
          data: textResult
        };
      }

      // 最後返回二進制表示
      return {
        type: 'binary',
        hex: this.decode(buffer, 'hex'),
        raw: isNode && buffer instanceof Buffer ? buffer : new Uint8Array(buffer)
      };
    }

    // 使用指定的解碼器
    const decoder = this.decoders.get(decoderName);
    if (!decoder) {
      console.error(`未找到名為 "${decoderName}" 的解碼器`);
      return null;
    }

    return decoder(buffer);
  }

  /**
   * 將 Blob 轉換為 ArrayBuffer
   * @param {Blob} blob - 要轉換的 Blob
   * @returns {Promise<ArrayBuffer>} 包含 ArrayBuffer 的 Promise
   */
  blobToArrayBuffer(blob) {
    if (isNode) {
      console.error('Node.js 環境不支持 Blob');
      return Promise.reject(new Error('Node.js 環境不支持 Blob'));
    }
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * 解析 Protobuf 數據
   * 注意：這需要引入 protobufjs 庫才能正常工作
   * @param {ArrayBuffer|Buffer} buffer - 包含 Protobuf 數據的二進制數據
   * @param {Object} messageType - protobuf.js 消息類型
   * @returns {Object} 解析後的 Protobuf 消息
   */
  decodeProtobuf(buffer, messageType) {
    try {
      // 檢查是否有 protobufjs
      if (typeof protobuf === 'undefined' && (!isNode || !require('protobufjs'))) {
        console.error('未找到 protobufjs 庫。請確保已引入 protobufjs。');
        return null;
      }

      // 將輸入轉換為 Uint8Array
      let uint8Array;
      if (isNode && buffer instanceof Buffer) {
        uint8Array = new Uint8Array(buffer);
      } else {
        uint8Array = new Uint8Array(buffer);
      }
      
      // 使用提供的消息類型解碼
      return messageType.decode(uint8Array);
    } catch (error) {
      console.error('Protobuf 解碼失敗:', error);
      return null;
    }
  }

  /**
   * 自動檢測並解析二進制數據
   * 嘗試多種格式，返回最可能的解析結果
   * @param {ArrayBuffer|Buffer} buffer - 要解析的二進制數據
   * @returns {Object} 解析結果，包含類型和數據
   */
  autoDetectAndParse(buffer) {
    return this.decode(buffer, 'auto');
  }

  /**
   * 解析二進制數據並提供詳細的結構信息
   * @param {ArrayBuffer|Buffer} buffer - 要解析的二進制數據
   * @returns {Object} 詳細的解析結果
   */
  inspectBinary(buffer) {
    let uint8Array;
    if (isNode && buffer instanceof Buffer) {
      uint8Array = new Uint8Array(buffer);
    } else {
      uint8Array = new Uint8Array(buffer);
    }
    
    const byteLength = uint8Array.length;
    
    // 基本信息
    const result = {
      byteLength,
      hexDump: this.createHexDump(uint8Array),
      textRepresentation: this.tryTextDecoding(buffer),
      possibleFormats: this.detectPossibleFormats(buffer)
    };
    
    return result;
  }

  /**
   * 創建十六進制轉儲
   * @param {Uint8Array} uint8Array - 要轉儲的數據
   * @returns {string} 格式化的十六進制轉儲
   */
  createHexDump(uint8Array) {
    const bytesPerLine = 16;
    const lines = [];
    
    for (let i = 0; i < uint8Array.length; i += bytesPerLine) {
      const bytes = Array.from(uint8Array.slice(i, i + bytesPerLine));
      const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
      
      const offset = i.toString(16).padStart(8, '0');
      const paddedHex = hex.padEnd(bytesPerLine * 3 - 1, ' ');
      
      lines.push(`${offset}: ${paddedHex} | ${ascii}`);
    }
    
    return lines.join('\n');
  }

  /**
   * 嘗試將二進制數據解碼為文本
   * @param {ArrayBuffer|Buffer} buffer - 要解碼的數據
   * @returns {Object} 不同編碼的解碼結果
   */
  tryTextDecoding(buffer) {
    const encodings = ['utf-8', 'utf-16le', 'utf-16be', 'iso-8859-1'];
    const results = {};
    
    for (const encoding of encodings) {
      try {
        let text;
        if (isNode && buffer instanceof Buffer) {
          // 在 Node.js 中使用 Buffer 的 toString 方法
          try {
            // 將 Node.js 編碼名稱轉換為 Buffer 支持的格式
            const bufferEncoding = encoding === 'utf-16le' ? 'utf16le' : 
                                  encoding === 'utf-16be' ? 'utf16be' : 
                                  encoding === 'iso-8859-1' ? 'latin1' : encoding;
            text = buffer.toString(bufferEncoding);
          } catch (e) {
            text = `解碼失敗: ${e.message}`;
          }
        } else {
          // 在瀏覽器中使用 TextDecoder
          const decoder = new TextDecoder(encoding);
          text = decoder.decode(buffer);
        }
        results[encoding] = text;
      } catch (error) {
        results[encoding] = `解碼失敗: ${error.message}`;
      }
    }
    
    return results;
  }

  /**
   * 檢測可能的數據格式
   * @param {ArrayBuffer|Buffer} buffer - 要檢測的數據
   * @returns {Array} 可能的格式列表
   */
  detectPossibleFormats(buffer) {
    const formats = [];
    
    let uint8Array;
    if (isNode && buffer instanceof Buffer) {
      uint8Array = new Uint8Array(buffer);
    } else {
      uint8Array = new Uint8Array(buffer);
    }
    
    // 檢查是否可能是 JSON
    try {
      let text;
      if (isNode && buffer instanceof Buffer) {
        text = buffer.toString('utf-8');
      } else {
        const decoder = new TextDecoder();
        text = decoder.decode(buffer);
      }
      JSON.parse(text);
      formats.push('JSON');
    } catch (e) {
      // 不是 JSON
    }
    
    // 檢查是否可能是 UTF-8 文本
    try {
      let text;
      if (isNode && buffer instanceof Buffer) {
        text = buffer.toString('utf-8');
      } else {
        const decoder = new TextDecoder();
        text = decoder.decode(buffer);
      }
      if (text.length > 0 && /^[\x20-\x7E\n\r\t]+$/.test(text)) {
        formats.push('UTF-8 Text');
      }
    } catch (e) {
      // 不是 UTF-8 文本
    }
    
    // 檢查常見的二進制格式標記
    
    // 檢查 Protobuf (沒有明確的標記，但可以檢查一些特徵)
    if (formats.length === 0) {
      formats.push('可能是 Protobuf 或其他二進制格式');
    }
    
    // 檢查 PNG
    if (uint8Array.length >= 8 && 
        uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && 
        uint8Array[2] === 0x4E && uint8Array[3] === 0x47) {
      formats.push('PNG 圖像');
    }
    
    // 檢查 JPEG
    if (uint8Array.length >= 2 && 
        uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
      formats.push('JPEG 圖像');
    }
    
    // 檢查 GZIP
    if (uint8Array.length >= 2 && 
        uint8Array[0] === 0x1F && uint8Array[1] === 0x8B) {
      formats.push('GZIP 壓縮數據');
    }
    
    return formats;
  }
}

/**
 * 用於處理特定協議的二進制數據解析器
 * 可以擴展此類來處理特定的二進制協議
 */
class ProtocolParser extends BinaryParser {
  constructor(protocolDefinition = null) {
    super();
    this.protocolDefinition = protocolDefinition;
    this.messageTypes = new Map();
  }

  /**
   * 設置協議定義
   * @param {Object} definition - 協議定義
   */
  setProtocolDefinition(definition) {
    this.protocolDefinition = definition;
  }

  /**
   * 註冊消息類型
   * @param {string} typeName - 消息類型名稱
   * @param {Object} typeDefinition - 消息類型定義
   */
  registerMessageType(typeName, typeDefinition) {
    this.messageTypes.set(typeName, typeDefinition);
  }

  /**
   * 根據消息類型解析二進制數據
   * @param {ArrayBuffer|Buffer} buffer - 要解析的二進制數據
   * @param {string} typeName - 消息類型名稱
   * @returns {Object} 解析後的消息
   */
  parseMessage(buffer, typeName) {
    const messageType = this.messageTypes.get(typeName);
    if (!messageType) {
      console.error(`未找到名為 "${typeName}" 的消息類型`);
      return null;
    }

    return this.decodeProtobuf(buffer, messageType);
  }

  /**
   * 嘗試自動檢測消息類型並解析
   * 這需要協議中包含類型標識符
   * @param {ArrayBuffer|Buffer} buffer - 要解析的二進制數據
   * @returns {Object} 解析後的消息
   */
  autoDetectAndParseMessage(buffer) {
    // 這個方法需要根據特定協議實現
    // 例如，某些協議可能在消息頭部包含類型標識符
    
    // 示例實現 (假設前 4 個字節是消息類型 ID)
    if ((isNode && buffer instanceof Buffer && buffer.length < 4) || 
        (!isNode && buffer.byteLength < 4)) {
      console.error('消息太短，無法檢測類型');
      return null;
    }

    let typeId;
    if (isNode && buffer instanceof Buffer) {
      typeId = buffer.readUInt32LE(0);
    } else {
      const view = new DataView(buffer);
      typeId = view.getUint32(0, true); // 假設是小端序
    }
    
    // 根據類型 ID 查找對應的消息類型
    // 這裡需要一個從 typeId 到 typeName 的映射
    const typeName = this.getTypeNameById(typeId);
    if (!typeName) {
      console.error(`未知的消息類型 ID: ${typeId}`);
      return null;
    }
    
    // 解析消息體 (跳過類型 ID)
    const messageBuffer = isNode && buffer instanceof Buffer 
      ? buffer.slice(4) 
      : buffer.slice(4);
      
    return this.parseMessage(messageBuffer, typeName);
  }

  /**
   * 根據類型 ID 獲取類型名稱
   * 這個方法需要根據特定協議實現
   * @param {number} typeId - 類型 ID
   * @returns {string} 類型名稱
   */
  getTypeNameById(typeId) {
    // 示例實現
    const typeMap = {
      1: 'HeartbeatMessage',
      2: 'MarketDataMessage',
      3: 'OrderMessage',
      // 更多類型...
    };
    
    return typeMap[typeId] || null;
  }
}

// 使用示例
function demoParser() {
  const parser = new BinaryParser();
  
  // 創建一個示例二進制數據 (JSON 格式的 UTF-8 編碼)
  const jsonObj = { id: 12345, name: 'test', values: [1, 2, 3] };
  const jsonStr = JSON.stringify(jsonObj);
  
  let buffer;
  if (isNode) {
    buffer = Buffer.from(jsonStr);
  } else {
    const encoder = new TextEncoder();
    buffer = encoder.encode(jsonStr).buffer;
  }
  
  console.log('原始 JSON 對象:', jsonObj);
  console.log('編碼後的二進制數據長度:', isNode ? buffer.length : buffer.byteLength, '字節');
  
  // 自動檢測並解析
  const parsed = parser.autoDetectAndParse(buffer);
  console.log('自動解析結果:', parsed);
  
  // 詳細檢查二進制數據
  const inspection = parser.inspectBinary(buffer);
  console.log('二進制數據檢查結果:', inspection);
}

// 導出模塊
if (isNode) {
  module.exports = {
    BinaryParser,
    ProtocolParser
  };
}

// 如果直接運行此文件，則執行演示
if (isNode && require.main === module) {
  demoParser();
} 