# Simple Backtest Protocol (SBT)

> 一个平平无奇的回测引擎，没有任何魔法或者特点，就简单平等地给客户端分发市场数据，接受订单，回报成交，简单统计回报回测统计。

## 简介

Simple Backtest Protocol（SBT）是一个基于WebSocket的回测协议，专为并发回测和模拟而设计。它提供统一的接口，支持数据流传输和交易执行，通过基于客户端的会话识别和连接多路复用实现并发回测场景。

## 核心特点

- **统一接口**：单一WebSocket连接同时处理数据流和交易操作
- **无状态操作**：通过客户端ID（`cid`）标识会话，无需认证
- **请求-响应模式**：类似JSON-RPC的方法调用，使用`id`进行关联
- **事件流**：服务器异步推送市场数据、订单更新和统计报告
- **类型安全**：JSON消息直接映射到TypeScript类型
- **连接多路复用**：单个连接可多路复用多个客户端，实现并发回测

## 关键优势

### 1. 高效并行回测

SBT的一个核心优势是单个连接可以同时进行多个回测实验。这种设计特别适合并行策略开发、alpha挖掘和参数优化等"天然并行"的工作负载。研究人员可以在同一市场条件下同时测试数百个策略变体，大幅提高研发效率。

### 2. 实盘一致性保证

回测逻辑与实盘交易保持高度一致。客户端接收市场数据的方式与实盘环境完全相同：先收到数据，做出判断，然后提交订单。这种设计确保了回测结果与实盘表现之间的可比性，同时基本消除了信息泄露的可能性。你不会在回测中"看到未来"，因为数据分发机制严格按时间顺序进行。

### 3. 简单易用的客户端开发

协议采用类似JSON-RPC的请求-响应模式，使得客户端开发变得非常简单。开发者只需要处理基本的WebSocket连接和JSON消息序列化，无需复杂的通信逻辑。这种设计降低了策略开发的技术门槛，让研究人员可以专注于交易逻辑本身。

## 工作原理

SBT的工作方式非常直接，采用主控-策略的协作模式：

1. **发送主控init消息**：主控程序首先向服务器发送初始化消息，建立连接并获取服务器配置
2. **策略登录与订阅**：各个策略通过主控发送login消息进行登录，然后各自发送subscribe消息订阅所需的市场数据符号
3. **开始回测**：所有策略准备完毕后，主控发送replay消息，指定回测时间范围和参数，开始回测
4. **策略交易**：回测期间，各策略通过主控自由发送订单、查询头寸、获取订单状态等，进行独立的交易决策
5. **实验总结**：回测结束后，主控收集各策略的统计结果，进行对比分析和实验总结

这种设计使得多个策略可以在完全相同的市场条件下运行，确保了实验的公平性和可比性。

## 协议概览

### 消息格式

#### 请求消息（客户端 → 服务器）

```json
{
  "method": "string",        // 方法名称（如"submitOrders", "subscribe"）
  "id": "number",            // 用于关联响应的唯一ID
  "cid": "string",           // 客户端ID（除init和replay外都需要）
  "params": "unknown"        // 方法特定参数
}
```

#### 响应消息（服务器 → 客户端）

```json
{
  "type": "result" | "error",
  "id": "number",            // 匹配请求的id
  "cid": "string",           // 客户端ID
  "result": "unknown",       // 成功结果（type为result时）
  "error": {                 // 错误详情（type为error时）
    "code": "string",        // 错误代码（如"INVALID_SYMBOL"）
    "message": "string"      // 人类可读的错误消息
  }
}
```

#### 事件消息（服务器 → 客户端）

服务器会主动推送四种类型的事件：

**市场数据事件**：推送订阅的市场行情数据

```json
{
  "type": "market",
  "timestamp": "number",     // 服务器发送时间（Unix时间戳，毫秒）
  "data": [...]        // 市场行情数组
}
```

**订单事件**：推送订单状态更新和成交信息

```json
{
  "type": "order",
  "timestamp": "number",
  "updated": [...],          // 更新的订单状态
  "fill": [...]              // 成交记录
}
```

**统计报告事件**：推送回测统计指标（根据replay配置）

```json
{
  "type": "metrics",
  "timestamp": "number",
  "report": {...}            // 统计报告数据
}
```

**外部事件**：推送自定义的外部数据

```json
{
  "type": "external",
  "timestamp": "number",
  "source": "string",        // 数据源标识
  "data": "unknown"          // 自定义数据
}
```

### 主要方法

- **连接管理**：`init`, `login`, `logout`
- **数据订阅**：`subscribe`, `unsubscribe`
- **交易操作**：`getPosition`, `getOpenOrders`, `submitOrders`, `amendOrders`, `cancelOrders`, `cancelAllOrders`
- **回测控制**：`replay`

## 其他优势

虽然我们说SBT"平平无奇"，但以下特点也值得注意：

1. **灵活的数据源支持**：支持SQLite、PostgreSQL、MySQL等多种数据源
2. **实时统计指标**：提供Sharpe、Sortino、最大回撤等多种实时统计指标
3. **可配置的滑点和佣金**：支持基于交易量和市场影响的滑点模型，以及灵活的佣金结构
4. **多种报告类型**：支持定期报告、交易报告和交易日报告
5. **轻量级部署**：无复杂依赖，可以快速部署在本地或云环境中
6. **资源高效**：共享数据流和连接资源，大幅降低内存和CPU使用率

## 潜在限制

当然，SBT也有一些限制和权衡：

1. **简化市场模型**：不支持复杂的市场微观结构，如订单簿深度或Level2数据
2. **无社交交易功能**：专注于单一策略回测，不包含策略分享或复制交易功能
3. **有限的风险管理**：基础的风险控制，主要依赖客户端实现复杂的风控逻辑
4. **无实时数据接口**：专为历史数据回测设计，不直接支持实时市场数据接入
5. **简单撮合机制**：使用基础的价格撮合，不支持复杂的订单类型或撮合算法

## 快速开始

### 安装

```bash
pnpm install
```

### 运行示例

1. 启动服务器：

```bash
pnpm example:server
```

2. 运行客户端：

```bash
pnpm example:client
```

### 基本使用

```typescript
import { WebSocket } from "ws";

// 连接到服务器
const ws = new WebSocket("ws://localhost:8080");

// 初始化连接（获取服务器配置）
ws.send(JSON.stringify({
  method: "init",
  id: 0,
  params: {}
}));

// 登录客户端
ws.send(JSON.stringify({
  method: "login",
  id: 1,
  cid: "my-client",
  params: {
    config: {
      initialCash: 100000,
      commission: {
        rate: 0.0003,
        minimum: 5
      }
    }
  }
}));

// 订阅市场数据
ws.send(JSON.stringify({
  method: "subscribe",
  id: 2,
  cid: "my-client",
  params: {
    symbols: ["AAPL", "MSFT"]
  }
}));

// 开始回测（由主控发起）
ws.send(JSON.stringify({
  method: "replay",
  id: 3,
  params: {
    table: "ohlcv5min",
    startTime: 1733390740000,
    endTime: 1753890740000,
    replayId: "backtest-001",
    replayInterval: 50,
    periodicReport: 1000
  }
}));

// 提交订单
ws.send(JSON.stringify({
  method: "submitOrders",
  id: 4,
  cid: "my-client",
  params: [{
    id: "order-1",
    symbol: "AAPL",
    side: "BUY",
    effect: "OPEN_LONG",
    type: "MARKET",
    quantity: 100
  }]
}));
```

## 架构设计

SBT采用简单直接的架构：

- **服务器端**：WebSocket服务器处理连接、消息路由和事件分发
- **会话管理**：每个连接可以有多个客户端会话，每个会话维护独立的状态
- **数据源抽象**：支持多种数据源，提供统一的数据访问接口
- **回测引擎**：处理订单匹配、滑点计算、佣金计算等核心逻辑
- **统计模块**：实时计算各种性能指标

## 限制与注意事项

- 本协议专为回测环境设计，不包含认证机制
- 生产环境使用时需要额外的安全措施
- 订单相关错误只会导致拒绝订单事件，不会中断整个回测过程

## 许可证

MIT

## 贡献

欢迎提交问题和拉取请求。

---

> 有时候，最简单的解决方案就是最好的解决方案。SBT不追求复杂的功能，而是专注于做好一件事：提供简单、可靠的回测环境。

---

*本文档由Kilo Code编写，基于对Simple Backtest Protocol项目的分析和理解。*
