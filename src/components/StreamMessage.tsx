/**
 * StreamMessage - AI 机器人流式消息自定义渲染组件
 *
 * 工作原理：
 * 1. 后端通过腾讯云 IM 的 send_stream_msg 接口，以 TIMCustomElem 格式发送流式消息
 * 2. TIMCustomElem 的 Data 字段结构为：
 *    { chatbotPlugin: 1, chunks: ["片段1", "片段2", ...], isFinished: 0|1 }
 * 3. SDK 通过 MESSAGE_RECEIVED 通知第一个片段，后续通过 MESSAGE_MODIFIED 更新同一条消息
 * 4. 本组件拦截 TIMCustomElem 消息，解析 Data 中的 chunks 拼接为完整文本
 * 5. 未完成时（isFinished=0）显示光标闪烁效果（打字机效果）
 * 6. 非 AI 流式消息仍交给 TUIKit 内置 Message 组件渲染
 */

import React from 'react';
import { Message } from '@tencentcloud/chat-uikit-react';
import TUIChatEngine from '@tencentcloud/chat-uikit-engine-lite';

// 解析结果类型：区分本地 Agent 流式消息、腾讯内置 LLM 消息、普通消息
interface StreamParseResult {
  isStream: boolean;         // 是否为本地 Agent 的流式消息（chatbotPlugin=1）
  isBuiltinLLM: boolean;     // 是否为腾讯内置 LLM 的消息（chatbotPlugin=2），需要过滤掉
  text: string;
  isFinished: boolean;
}

// 判断消息类型的辅助函数
function parseStreamData(message: any): StreamParseResult {
  const fallback: StreamParseResult = { isStream: false, isBuiltinLLM: false, text: '', isFinished: true };

  // 消息类型必须是 TIMCustomElem
  if (message?.type !== TUIChatEngine.TYPES.MSG_CUSTOM) {
    return fallback;
  }

  const payload = message?.payload;
  if (!payload?.data) return fallback;

  try {
    const data = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;

    // 本地 Agent 的流式消息：chatbotPlugin=1
    if (data?.chatbotPlugin === 1 && Array.isArray(data?.chunks)) {
      const text = data.chunks.join('');
      const isFinished = data.isFinished === 1;
      return { isStream: true, isBuiltinLLM: false, text, isFinished };
    }

    // 腾讯内置 LLM 的消息：chatbotPlugin=2，需要隐藏
    // 当控制台机器人绑定了内置 LLM 时，会自动产生这类消息，和本地 Agent 的回复重复
    if (data?.chatbotPlugin === 2) {
      return { isStream: false, isBuiltinLLM: true, text: '', isFinished: true };
    }
  } catch {
    // JSON 解析失败说明不是流式消息
  }

  return fallback;
}

// 导出辅助函数供 MessageList 的 filter 使用
export function isStreamMessage(message: any): boolean {
  return parseStreamData(message).isStream;
}

/**
 * 流式消息过滤器
 *
 * 在 MessageList 的 filter prop 中使用，作用是：
 * - 非流式消息一律保留
 * - 流式消息只保留 isFinished=1 的最终版本（避免中间片段产生多条气泡）
 *
 * 但实际上腾讯云 SDK 的流式消息是通过 MESSAGE_MODIFIED 更新同一条消息，
 * 理论上不会产生多条气泡。这个 filter 作为保险措施，
 * 防止极端情况下（比如网络重连导致重复投递）出现冗余消息。
 */
export function streamMessageFilter(message: any): boolean {
  const { isStream, isBuiltinLLM } = parseStreamData(message);

  // 过滤掉腾讯内置 LLM 的消息（chatbotPlugin=2）
  // 当控制台机器人绑定了内置 LLM 时会产生这类消息，和本地 Agent 回复重复
  if (isBuiltinLLM) return false;

  // 其他消息（包括本地 Agent 流式消息和普通消息）正常展示
  return true;
}

// 自定义消息组件 props 类型（和 TUIKit 内置 Message 组件 props 一致）
interface StreamMessageProps {
  message: any;
  [key: string]: any;
}

const StreamMessage: React.FC<StreamMessageProps> = (props) => {
  const { message, ...restProps } = props;
  const { isStream, isBuiltinLLM, text, isFinished } = parseStreamData(message);

  // 腾讯内置 LLM 消息：不渲染（双重保险，filter 已经过滤了）
  if (isBuiltinLLM) {
    return null;
  }

  // 非 AI 流式消息，使用内置 Message 组件渲染
  if (!isStream) {
    return <Message {...props} />;
  }

  // AI 流式消息：渲染为纯文本 + 打字机光标
  return (
    <div className="stream-message-wrapper">
      <div className="stream-message-bubble">
        <span className="stream-message-text">{text}</span>
        {!isFinished && <span className="stream-message-cursor">|</span>}
      </div>
    </div>
  );
};

export default StreamMessage;
