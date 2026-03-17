/**
 * StreamMessage - AI 机器人消息自定义渲染组件
 *
 * 核心功能：
 * 1. 对机器人(@RBT#开头)发送的文本消息，用 react-markdown 渲染 Markdown 格式
 * 2. 对流式消息(chatbotPlugin:1 + chunks)，实时渲染 Markdown + 打字机光标
 * 3. 过滤腾讯内置 LLM 消息(chatbotPlugin:2)
 * 4. 其他普通消息交给 TUIKit 内置 Message 组件
 *
 * 渲染链路：
 *   send_stream_msg -> TIMCustomElem(chatbotPlugin:1, chunks:[...]) -> 流式 Markdown 渲染
 *   sendmsg -> TIMTextElem(纯文本, 来自@RBT#) -> Markdown 渲染
 *   普通用户消息 -> TUIKit 内置 Message 组件
 */

import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '@tencentcloud/chat-uikit-react';
import TUIChatEngine from '@tencentcloud/chat-uikit-engine-lite';

// 解析结果类型
interface StreamParseResult {
  isStream: boolean;         // 是否为本地 Agent 的流式消息(chatbotPlugin=1)
  isBuiltinLLM: boolean;     // 是否为腾讯内置 LLM 消息(chatbotPlugin=2)
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

    // 本地 Agent 的流式消息: chatbotPlugin=1
    if (data?.chatbotPlugin === 1 && Array.isArray(data?.chunks)) {
      const text = data.chunks.join('');
      const isFinished = data.isFinished === 1;
      return { isStream: true, isBuiltinLLM: false, text, isFinished };
    }

    // 腾讯内置 LLM 消息: chatbotPlugin=2
    if (data?.chatbotPlugin === 2) {
      return { isStream: false, isBuiltinLLM: true, text: '', isFinished: true };
    }
  } catch {
    // JSON 解析失败说明不是流式消息
  }

  return fallback;
}

// 判断消息是否来自机器人账号(@RBT#开头)
function isBotMessage(message: any): boolean {
  const from = message?.from || message?.flow === 'in' && '';
  if (typeof from === 'string' && from.startsWith('@RBT#')) {
    return true;
  }
  return false;
}

// 提取普通文本消息的内容
function getTextContent(message: any): string {
  // TIMTextElem 类型
  if (message?.type === TUIChatEngine.TYPES.MSG_TEXT) {
    const payload = message?.payload;
    if (payload?.text) return payload.text;
  }
  return '';
}

// 导出辅助函数供 MessageList 的 filter 使用
export function isStreamMessage(message: any): boolean {
  return parseStreamData(message).isStream;
}

/**
 * 流式消息过滤器 - 在 MessageList 的 filter prop 中使用
 * 过滤掉腾讯内置 LLM 消息(chatbotPlugin=2)
 */
export function streamMessageFilter(message: any): boolean {
  const { isBuiltinLLM } = parseStreamData(message);
  if (isBuiltinLLM) return false;
  return true;
}

// 自定义消息组件 props
interface StreamMessageProps {
  message: any;
  [key: string]: any;
}

const StreamMessage: React.FC<StreamMessageProps> = (props) => {
  const { message } = props;
  const { isStream, isBuiltinLLM, text, isFinished } = parseStreamData(message);

  // Hooks 必须在所有条件分支之前调用（React Hooks 规则）
  const streamEndRef = useRef<HTMLDivElement>(null);

  // 流式消息更新时自动滚动到可见区域
  useEffect(() => {
    if (isStream && !isFinished && streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isStream, isFinished, text]);

  // 腾讯内置 LLM 消息: 不渲染
  if (isBuiltinLLM) {
    return null;
  }

  // AI 流式消息: 渲染 Markdown + 打字机光标
  if (isStream) {
    return (
      <div className="bot-message-wrapper" ref={streamEndRef}>
        <div className="bot-message-bubble">
          <div className="bot-markdown-content">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
          {!isFinished && <span className="stream-message-cursor">|</span>}
        </div>
      </div>
    );
  }

  // 机器人的普通文本消息: 用 Markdown 渲染
  if (isBotMessage(message)) {
    const textContent = getTextContent(message);
    if (textContent) {
      return (
        <div className="bot-message-wrapper">
          <div className="bot-message-bubble">
            <div className="bot-markdown-content">
              <ReactMarkdown>{textContent}</ReactMarkdown>
            </div>
          </div>
        </div>
      );
    }
  }

  // 其他消息: 使用内置 Message 组件渲染
  return <Message {...props} />;
};

export default StreamMessage;
