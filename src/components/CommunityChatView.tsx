import React, { useState, useRef, useEffect } from 'react';

interface CommunityChatViewProps {
  groupID?: string;           // 社群 ID
  groupName?: string;         // 社群名称
  onBack?: () => void;        // 返回按钮回调
}

interface Message {
  id: string;
  content: string;
  sender: string;
  time: Date;
}

/**
 * 社群聊天页面组件
 * 支持留言板功能，用户可以在右下角点击"+"按钮发送留言
 */
export const CommunityChatView: React.FC<CommunityChatViewProps> = ({
  groupID,
  groupName = '社群',
  onBack,
}) => {
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 处理发送留言
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      content: inputValue.trim(),
      sender: '我',
      time: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');
    setShowMessageInput(false);
  };

  // 格式化时间
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="community-chat-view">
      {/* 头部 */}
      <div className="community-chat-header">
        <button className="back-button" onClick={onBack}>
          ←
        </button>
        <span className="group-name">{groupName}</span>
      </div>

      {/* 消息列表区域 */}
      <div className="community-message-list">
        {messages.length === 0 ? (
          <div className="empty-message-tip">
            暂无留言，快来发布第一条留言吧～
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="message-item">
              <div className="message-avatar">
                {msg.sender === '我' ? '👤' : '👥'}
              </div>
              <div className="message-content">
                <div className="message-sender">{msg.sender}</div>
                <div className="message-bubble">{msg.content}</div>
                <div className="message-time">{formatTime(msg.time)}</div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入弹窗 - 大浮窗样式 */}
      {showMessageInput && (
        <div className="community-input-overlay">
          <div className="community-input-modal">
            {/* 模态框头部 */}
            <div className="modal-header">
              <span className="modal-title">发布留言</span>
              <button
                className="modal-close"
                onClick={() => {
                  setShowMessageInput(false);
                  setInputValue('');
                }}
              >
                ✕
              </button>
            </div>

            {/* 模态框主体 - 文本输入区 */}
            <div className="modal-body">
              <textarea
                className="message-textarea"
                placeholder="输入留言内容..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
                rows={10}
              />
            </div>

            {/* 模态框底部 - 操作按钮 */}
            <div className="modal-footer">
              <div className="footer-left">
                <span className="char-count">{inputValue.length} 字</span>
              </div>
              <div className="footer-right">
                <button
                  className="cancel-button"
                  onClick={() => {
                    setShowMessageInput(false);
                    setInputValue('');
                  }}
                >
                  取消
                </button>
                <button
                  className="send-button"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 右下角悬浮按钮 */}
      <button
        className="floating-add-button"
        onClick={() => setShowMessageInput(true)}
        title="发布留言"
      >
        ＋
      </button>

      {/* 自定义样式 */}
      <style>{`
        .community-chat-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
          background: #f5f5f5;
          position: relative;
        }

        .community-chat-header {
          display: flex;
          align-items: center;
          padding: 16px 20px;
          background: #fff;
          border-bottom: 1px solid #e8e8e8;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
          flex-shrink: 0;
        }

        .back-button {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          padding: 4px 12px;
          margin-right: 8px;
          color: #333;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .back-button:hover {
          background: #f5f5f5;
          border-radius: 4px;
        }

        .group-name {
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .community-message-list {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .empty-message-tip {
          text-align: center;
          color: #999;
          padding: 60px 20px;
          font-size: 14px;
        }

        .message-item {
          display: flex;
          align-items: flex-start;
          margin-bottom: 20px;
        }

        .message-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          margin-right: 12px;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .message-content {
          flex: 1;
          max-width: calc(100% - 68px);
        }

        .message-sender {
          font-size: 13px;
          color: #666;
          margin-bottom: 6px;
          font-weight: 500;
        }

        .message-bubble {
          background: #fff;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 15px;
          line-height: 1.6;
          word-break: break-word;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        }

        .message-time {
          font-size: 12px;
          color: #999;
          margin-top: 6px;
        }

        /* 输入弹窗 overlay */
        .community-input-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        /* 模态框 */
        .community-input-modal {
          width: 600px;
          max-width: 90vw;
          max-height: 80vh;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        /* 模态框头部 */
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid #e8e8e8;
        }

        .modal-title {
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #999;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }

        .modal-close:hover {
          color: #333;
        }

        /* 模态框主体 */
        .modal-body {
          flex: 1;
          padding: 24px;
          overflow: hidden;
        }

        .message-textarea {
          width: 100%;
          height: 300px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          font-size: 15px;
          resize: none;
          font-family: inherit;
          line-height: 1.6;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }

        .message-textarea:focus {
          outline: none;
          border-color: #1890ff;
        }

        .message-textarea::placeholder {
          color: #bbb;
        }

        /* 模态框底部 */
        .modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          border-top: 1px solid #e8e8e8;
          background: #fafafa;
          border-radius: 0 0 16px 16px;
        }

        .footer-left {
          display: flex;
          align-items: center;
        }

        .char-count {
          font-size: 13px;
          color: #999;
        }

        .footer-right {
          display: flex;
          gap: 12px;
        }

        .cancel-button,
        .send-button {
          padding: 10px 24px;
          border-radius: 8px;
          font-size: 15px;
          cursor: pointer;
          border: none;
          font-weight: 500;
          transition: all 0.2s;
        }

        .cancel-button {
          background: #f5f5f5;
          color: #666;
        }

        .cancel-button:hover {
          background: #e8e8e8;
        }

        .send-button {
          background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
          color: #fff;
          box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3);
        }

        .send-button:hover:not(:disabled) {
          box-shadow: 0 4px 12px rgba(24, 144, 255, 0.4);
          transform: translateY(-1px);
        }

        .send-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .send-button:disabled {
          background: #d9d9d9;
          box-shadow: none;
          cursor: not-allowed;
        }

        /* 悬浮按钮 */
        .floating-add-button {
          position: absolute;
          bottom: 32px;
          right: 32px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
          color: #fff;
          border: none;
          font-size: 32px;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(24, 144, 255, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          z-index: 100;
        }

        .floating-add-button:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(24, 144, 255, 0.5);
        }

        .floating-add-button:active {
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
};

export default CommunityChatView;
