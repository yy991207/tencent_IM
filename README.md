# Chat Example - 腾讯云 IM 聊天应用

基于腾讯云 IM TUIKit React 的聊天应用，集成 AI 机器人对话能力。

## 页面样式参考

> 该截图展示了当前项目启动后打开页面的整体样式，可作为 UI 对照参考。

![home](./public/home.png)

## 核心功能

### AI 机器人对话

- 对话目标：`@RBT#ai_agent`（腾讯云 IM "AI 自集成"模式机器人）
- 后端通过 LangGraph Agent 处理用户消息，通过 `send_stream_msg` API 流式推送回复
- 前端支持流式打字机效果（逐段显示 AI 回复）和 Markdown 格式渲染

### 消息渲染

- **流式消息**（`chatbotPlugin:1` + `chunks`）：实时渲染 Markdown + 光标闪烁动画
- **机器人普通文本消息**（`@RBT#` 发送的 `TIMTextElem`）：用 react-markdown 渲染
- **内置 LLM 消息过滤**（`chatbotPlugin:2`）：自动隐藏，避免双重回复
- **普通用户消息**：交给 TUIKit 内置 Message 组件渲染

### 多用户切换

- 支持在 `config.yaml` 中配置多个用户（user01、user02 等）
- 页面顶部显示用户切换按钮，点击在新标签页以对应身份登录

## 技术架构

```
前端 (React + TUIKit)          后端 (FastAPI + LangGraph)
     |                              |
     | 用户发消息给 @RBT#ai_agent    |
     | ---> IM 后台 ---> Bot.OnC2CMessage 回调 --->
     |                              | 调用 LangGraph Agent (astream_events)
     |                              | 逐 chunk 调用 send_stream_msg
     | <--- IM SDK MESSAGE_MODIFIED  |
     | StreamMessage 渲染 Markdown   |
```

## Setup

### 1. 安装依赖

```bash
npm install
```

### 2. 配置文件

复制 `public/config-example.yaml` 为 `public/config.yaml`，填写：

```yaml
SDKAppID: 1600127148

users:
  - userID: "user01"
    userSig: "xxx"    # 通过后端 gen_im_user_sig 生成，有效期 7 天
  - userID: "user02"
    userSig: "xxx"
```

UserSig 生成方式（在后端项目目录执行）：
```bash
conda run -n deepagent python -c "
import json, hmac, hashlib, base64, time, zlib, yaml
with open('app/config/application_test.yaml') as f:
    cfg = yaml.safe_load(f)
sdk_appid = cfg['im']['sdk_app_id']
secret_key = cfg['im']['secret_key']
expire = 86400 * 7
def gen_sig(user_id):
    curr_time = int(time.time())
    sign_content = f'TLS.identifier:{user_id}\nTLS.sdkappid:{sdk_appid}\nTLS.time:{curr_time}\nTLS.expire:{expire}\n'
    hmac_obj = hmac.new(secret_key.encode(), sign_content.encode(), hashlib.sha256)
    sig = base64.b64encode(hmac_obj.digest()).decode()
    content = {'TLS.ver':'2.0','TLS.identifier':user_id,'TLS.sdkappid':sdk_appid,'TLS.time':curr_time,'TLS.expire':expire,'TLS.sig':sig}
    json_str = json.dumps(content, separators=(',',':'))
    compressed = zlib.compress(json_str.encode())
    base64_sig = base64.b64encode(compressed).decode()
    return base64_sig.replace('+','*').replace('/','-').replace('=','_')
print(f'user01: {gen_sig(\"user01\")}')
print(f'user02: {gen_sig(\"user02\")}')
"
```

### 3. 启动开发服务

```bash
npm run dev
```

应用默认运行在 [http://localhost:3000](http://localhost:3000)

## 关键文件

| 文件 | 说明 |
|------|------|
| `src/components/StreamMessage.tsx` | AI 消息自定义渲染组件（流式 Markdown + 内置 LLM 过滤 + 自动滚动） |
| `src/App.tsx` | 主应用组件（MessageList 使用 StreamMessage 渲染） |
| `src/App.css` | 样式（含 `.bot-markdown-content` Markdown 渲染样式） |
| `src/utils/runtimeConfig.ts` | 运行时配置解析（config.yaml 读取） |
| `public/config.yaml` | 运行时配置（SDKAppID + 用户列表，不入 git） |

## 自定义组件说明

### StreamMessage

`StreamMessage` 是消息列表的自定义渲染组件，通过 `<MessageList Message={StreamMessage} />` 接入。

**渲染策略**：

1. **流式消息**（`TIMCustomElem` + `chatbotPlugin:1` + `chunks:[]`）
   - 用 `react-markdown` 渲染 Markdown 格式
   - 未完成时显示光标闪烁（打字机效果）
   - 内容更新时自动滚动到底部

2. **机器人文本消息**（`TIMTextElem` + 发送者以 `@RBT#` 开头）
   - 用 `react-markdown` 渲染 Markdown 格式
   - 支持标题、加粗、列表、代码块、引用、链接等

3. **内置 LLM 消息**（`chatbotPlugin:2`）
   - 直接隐藏（`return null`）

4. **普通消息**
   - 交给 TUIKit 内置 `<Message />` 组件

## 构建

```bash
npm run build
npm run preview  # 本地预览
```

## 相关项目

- **后端**：`guoren_demo` - FastAPI + LangGraph Agent + 腾讯云 IM 回调处理
- **TUIKit React**：[@tencentcloud/chat-uikit-react](https://www.npmjs.com/package/@tencentcloud/chat-uikit-react)
