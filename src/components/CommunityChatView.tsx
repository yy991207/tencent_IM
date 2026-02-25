import React, { useState, useRef, useEffect } from 'react';
import { FiThumbsUp, FiMessageSquare, FiShare2, FiBookmark } from 'react-icons/fi';
import { FiUser, FiUsers, FiX, FiPlus, FiArrowLeft } from 'react-icons/fi';

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
  likes?: string[];      // 点赞的用户列表
  comments?: number;     // 评论数量
  bookmarked?: boolean;  // 是否已收藏
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
  const [likedMessages, setLikedMessages] = useState<Set<string>>(new Set());
  const [bookmarkedMessages, setBookmarkedMessages] = useState<Set<string>>(new Set());

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
      likes: [],
      comments: 0,
      bookmarked: false,
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');
    setShowMessageInput(false);
  };

  // 处理点赞
  const handleLike = (messageId: string) => {
    setLikedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
        // 取消点赞
        setMessages((msgs) =>
          msgs.map((msg) =>
            msg.id === messageId
              ? { ...msg, likes: msg.likes?.filter((id) => id !== 'current-user') }
              : msg
          )
        );
      } else {
        newSet.add(messageId);
        // 添加点赞
        setMessages((msgs) =>
          msgs.map((msg) =>
            msg.id === messageId
              ? { ...msg, likes: [...(msg.likes || []), 'current-user'] }
              : msg
          )
        );
      }
      return newSet;
    });
  };

  // 处理评论
  const handleComment = (msg: Message) => {
    // 简单实现：弹出输入框让用户输入评论
    const comment = window.prompt('输入评论内容：');
    if (comment && comment.trim()) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, comments: (m.comments || 0) + 1 }
            : m
        )
      );
    }
  };

  // 处理转发
  const handleShare = (msg: Message) => {
    // 简单实现：弹出选择框让用户选择转发给谁
    const target = window.prompt('输入要转发给的联系人或群组名称：');
    if (target && target.trim()) {
      alert(`消息已转发给 "${target.trim()}"`);
      // TODO: 实际项目中这里应该调用 SDK 的转发 API
    }
  };

  // 处理收藏
  const handleBookmark = (messageId: string) => {
    setBookmarkedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
        // 取消收藏
        setMessages((msgs) =>
          msgs.map((msg) =>
            msg.id === messageId ? { ...msg, bookmarked: false } : msg
          )
        );
      } else {
        newSet.add(messageId);
        // 添加收藏
        setMessages((msgs) =>
          msgs.map((msg) =>
            msg.id === messageId ? { ...msg, bookmarked: true } : msg
          )
        );
      }
      return newSet;
    });
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
          <FiArrowLeft />
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
          messages.map((msg) => {
            const isLiked = likedMessages.has(msg.id);
            const isBookmarked = bookmarkedMessages.has(msg.id);
            const likeCount = msg.likes?.length || 0;
            const commentCount = msg.comments || 0;

            return (
              <div key={msg.id} className="message-item">
                <div className="message-avatar">
                  {msg.sender === '我' ? <FiUser /> : <FiUsers />}
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-sender">{msg.sender}</span>
                    <span className="message-time">{formatTime(msg.time)}</span>
                  </div>
                  <div className="message-bubble">{msg.content}</div>
                  <div className="message-interactions">
                    <button
                      className={`interaction-btn ${isLiked ? 'liked' : ''}`}
                      onClick={() => handleLike(msg.id)}
                      title="点赞"
                    >
                      <FiThumbsUp className="interaction-icon" />
                      {likeCount > 0 && <span className="interaction-count">{likeCount}</span>}
                    </button>
                    <button
                      className={`interaction-btn ${commentCount > 0 ? 'has-comments' : ''}`}
                      onClick={() => handleComment(msg)}
                      title="评论"
                    >
                      <FiMessageSquare className="interaction-icon" />
                      {commentCount > 0 && <span className="interaction-count">{commentCount}</span>}
                    </button>
                    <button
                      className="interaction-btn"
                      onClick={() => handleShare(msg)}
                      title="转发"
                    >
                      <FiShare2 className="interaction-icon" />
                    </button>
                    <button
                      className={`interaction-btn ${isBookmarked ? 'bookmarked' : ''}`}
                      onClick={() => handleBookmark(msg.id)}
                      title="收藏"
                    >
                      {isBookmarked ? (
                        <FiBookmark className="interaction-icon filled" />
                      ) : (
                        <FiBookmark className="interaction-icon" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
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
                <FiX />
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
        <FiPlus />
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
          cursor: pointer;
          padding: 4px 12px;
          margin-right: 8px;
          color: #333;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .back-button svg {
          width: 20px;
          height: 20px;
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
          background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3);
          color: #fff;
        }

        .message-avatar svg {
          width: 24px;
          height: 24px;
        }

        .message-content {
          flex: 1;
          max-width: calc(100% - 68px);
        }

        .message-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }

        .message-sender {
          font-size: 14px;
          color: #333;
          font-weight: 500;
        }

        .message-time {
          font-size: 12px;
          color: #999;
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

        /* 消息互动区域 */
        .message-interactions {
          display: flex;
          gap: 16px;
          margin-top: 8px;
          align-items: center;
        }

        .interaction-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.2s;
          color: #999;
          font-size: 14px;
        }

        .interaction-btn:hover {
          background: #f0f0f0;
          color: #666;
        }

        .interaction-btn.liked,
        .interaction-btn.has-comments,
        .interaction-btn.bookmarked {
          color: #1890ff;
        }

        .interaction-btn.liked:hover {
          color: #40a9ff;
        }

        .interaction-btn.bookmarked:hover {
          color: #40a9ff;
        }

        .interaction-icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .interaction-icon.filled {
          fill: currentColor;
        }

        .interaction-count {
          font-size: 12px;
          color: #999;
          font-weight: 500;
        }

        .interaction-btn.liked .interaction-count,
        .interaction-btn.has-comments .interaction-count {
          color: #1890ff;
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
          cursor: pointer;
          color: #999;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }

        .modal-close svg {
          width: 20px;
          height: 20px;
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
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(24, 144, 255, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          z-index: 100;
        }

        .floating-add-button svg {
          width: 28px;
          height: 28px;
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
