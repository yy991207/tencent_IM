import React, { useState, useRef, useEffect } from 'react';
import { ConversationList, ConversationPreview, useLoginState } from '@tencentcloud/chat-uikit-react';
import type { ConversationPreviewProps } from '@tencentcloud/chat-uikit-react';
import { FiThumbsUp, FiMessageSquare, FiShare2, FiBookmark } from 'react-icons/fi';
import { FiUser, FiUsers, FiX, FiPlus, FiArrowLeft } from 'react-icons/fi';

interface CommunityChatViewProps {
  groupID?: string;           // 社群 ID
  groupName?: string;         // 社群名称
  groupAvatarUrl?: string;    // 社群头像 URL（用于话题收藏入口展示）
  onBack?: () => void;        // 返回按钮回调
  embedded?: boolean;         // 嵌入模式：不展示顶部返回头，避免影响外层会话布局
  openCommentDetailMessageId?: string | null; // 外部触发打开评论详情
  onCommunitySummaryChange?: (summary: {
    groupID?: string;
    lastMessageAbstract: string;
    lastMessageTime: Date;
  }) => void;
  onTopicBookmarkChange?: (topic: {
    groupID?: string;
    groupName: string;
    groupAvatarUrl?: string;
    messageId: string;
    title: string;
    preview: string;
    time: Date;
  } | null, messageId?: string) => void;
}

interface CommentItem {
  id: string;
  content: string;
  sender: string;
  time: Date;
}

interface Message {
  id: string;
  content: string;
  sender: string;
  time: Date;
  likes?: LikeUser[];      // 点赞的用户列表
  comments?: CommentItem[];
  bookmarked?: boolean;  // 是否已收藏
}

interface LikeUser {
  userId: string;
  userName: string;
  avatarUrl?: string;
}

/**
 * 社群聊天页面组件
 * 支持留言板功能，用户可以在右下角点击"+"按钮发送留言
 */
export const CommunityChatView: React.FC<CommunityChatViewProps> = ({
  groupID,
  groupName = '社群',
  groupAvatarUrl,
  onBack,
  embedded = false,
  openCommentDetailMessageId,
  onCommunitySummaryChange,
  onTopicBookmarkChange,
}) => {
  const { loginUserInfo } = useLoginState();

  const [showMessageInput, setShowMessageInput] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [likedMessages, setLikedMessages] = useState<Set<string>>(new Set());
  const [bookmarkedMessages, setBookmarkedMessages] = useState<Set<string>>(new Set());
  const [activeCommentMessageId, setActiveCommentMessageId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentDetailMessageId, setCommentDetailMessageId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareMessageId, setShareMessageId] = useState<string | null>(null);
  const [shareSearchValue, setShareSearchValue] = useState('');

  const onCommunitySummaryChangeRef = useRef(onCommunitySummaryChange);
  const lastReportedSummaryRef = useRef<{ abstract: string; time: number } | null>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    onCommunitySummaryChangeRef.current = onCommunitySummaryChange;
  }, [onCommunitySummaryChange]);

  useEffect(() => {
    if (!groupID) return;
    if (messages.length === 0) return;

    const lastPost = messages[messages.length - 1];
    const comments = lastPost.comments || [];
    const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
    const lastMessageAbstract = lastComment
      ? `${lastComment.sender}：${lastComment.content}`
      : '暂无评论';
    const lastMessageTime = lastComment?.time || lastPost.time;

    const reportKey = {
      abstract: lastMessageAbstract,
      time: lastMessageTime.getTime(),
    };
    const prevKey = lastReportedSummaryRef.current;
    if (prevKey && prevKey.abstract === reportKey.abstract && prevKey.time === reportKey.time) {
      return;
    }
    lastReportedSummaryRef.current = reportKey;

    onCommunitySummaryChangeRef.current?.({
      groupID,
      lastMessageAbstract,
      lastMessageTime,
    });
  }, [groupID, messages]);

  useEffect(() => {
    if (!openCommentDetailMessageId) return;
    setCommentDetailMessageId(openCommentDetailMessageId);
    setActiveCommentMessageId(openCommentDetailMessageId);
  }, [openCommentDetailMessageId]);

  // 处理发送留言
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      content: inputValue.trim(),
      sender: '我',
      time: new Date(),
      likes: [],
      comments: [],
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
      const currentUserId = loginUserInfo?.userId || 'current-user';
      const currentUserName = loginUserInfo?.userName || loginUserInfo?.userId || '我';
      const currentUserAvatarUrl = loginUserInfo?.avatarUrl;

      if (newSet.has(messageId)) {
        newSet.delete(messageId);
        // 取消点赞
        setMessages((msgs) =>
          msgs.map((msg) =>
            msg.id === messageId
              ? { ...msg, likes: (msg.likes || []).filter((u) => u.userId !== currentUserId) }
              : msg
          )
        );
      } else {
        newSet.add(messageId);
        // 添加点赞
        setMessages((msgs) =>
          msgs.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  likes: [
                    ...(msg.likes || []),
                    {
                      userId: currentUserId,
                      userName: currentUserName,
                      avatarUrl: currentUserAvatarUrl,
                    },
                  ],
                }
              : msg
          )
        );
      }
      return newSet;
    });
  };

  const renderLikeInfo = (likeUsers: LikeUser[]) => {
    if (!likeUsers || likeUsers.length === 0) return null;

    return (
      <div className="like-info" role="group" aria-label="点赞用户列表">
        {likeUsers.map((u) => (
          <span key={u.userId} className="like-pill">
            <FiThumbsUp className="like-pill-icon" />
            <span className="like-pill-name">{u.userName}</span>
          </span>
        ))}
      </div>
    );
  };

  const handleToggleComment = (messageId: string) => {
    setCommentDetailMessageId(null);
    setActiveCommentMessageId((prev) => (prev === messageId ? null : messageId));
    setCommentDraft('');
  };

  const handleSendComment = (messageId: string) => {
    const content = commentDraft.trim();
    if (!content) return;

    const newComment: CommentItem = {
      id: `cmt-${Date.now()}`,
      content,
      sender: '我',
      time: new Date(),
    };

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, comments: [...(m.comments || []), newComment] }
          : m
      )
    );
    setCommentDraft('');
  };

  const handleOpenCommentDetail = (messageId: string) => {
    setCommentDetailMessageId(messageId);
    setActiveCommentMessageId(messageId);
    setCommentDraft('');
  };

  const handleCloseCommentDetail = () => {
    setCommentDetailMessageId(null);
  };

  // 处理转发
  const handleShare = (messageId: string) => {
    setShareMessageId(messageId);
    setShareSearchValue('');
    setIsShareModalOpen(true);
  };

  const handleCloseShareModal = () => {
    setIsShareModalOpen(false);
    setShareMessageId(null);
    setShareSearchValue('');
  };

  const handleSelectShareTarget = (conversation: any) => {
    const name =
      conversation?.groupProfile?.name ||
      conversation?.userProfile?.nick ||
      conversation?.userProfile?.userID ||
      conversation?.conversationID ||
      '未知会话';
    if (shareMessageId) {
      alert(`消息已转发给 "${name}"`);
    }
    handleCloseShareModal();
  };

  const ShareConversationPreview: React.FC<ConversationPreviewProps> = (props) => {
    const { conversation } = props;
    return (
      <div
        className="share-conversation-item"
        onClick={() => handleSelectShareTarget(conversation)}
        style={{ cursor: 'pointer' }}
      >
        <ConversationPreview {...props} />
      </div>
    );
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

        onTopicBookmarkChange?.(null, messageId);
      } else {
        newSet.add(messageId);
        // 添加收藏
        setMessages((msgs) =>
          msgs.map((msg) => {
            if (msg.id !== messageId) return msg;

            const postTitle = `${msg.sender}：${msg.content}`;
            const title = postTitle.length > 16 ? `${postTitle.slice(0, 16)}...` : postTitle;
            const comments = msg.comments || [];
            const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
            const preview = lastComment
              ? `${lastComment.sender}：${lastComment.content}`
              : '暂无评论';
            const time = lastComment?.time || msg.time;

            onTopicBookmarkChange?.({
              groupID,
              groupName,
              groupAvatarUrl,
              messageId,
              title,
              preview,
              time,
            });

            return { ...msg, bookmarked: true };
          })
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
      {!embedded && (
        <div className="community-chat-header">
          <button className="back-button" onClick={onBack}>
            <FiArrowLeft />
          </button>
          <span className="group-name">{groupName}</span>
        </div>
      )}

      {isShareModalOpen && (
        <div className="share-modal-overlay">
          <div className="share-modal">
            <div className="share-modal-header">
              <div className="share-modal-title">转发</div>
              <button className="share-modal-close" onClick={handleCloseShareModal} type="button">
                <FiX />
              </button>
            </div>

            <div className="share-modal-search">
              <input
                className="share-modal-search-input"
                value={shareSearchValue}
                onChange={(e) => setShareSearchValue(e.target.value)}
                placeholder="搜索"
              />
            </div>

            <div className="share-modal-body">
              <ConversationList Preview={(props: ConversationPreviewProps) => <ShareConversationPreview {...props} />} />
            </div>
          </div>
        </div>
      )}

      {/* 消息列表区域 */}
      <div className="community-message-list">
        {messages.length === 0 ? (
          <div className="empty-message-tip">
            暂无留言，快来发布第一条留言吧～
          </div>
        ) : (
          messages.map((msg) => {
            const isLiked = likedMessages.has(msg.id);
            const isBookmarked = bookmarkedMessages.has(msg.id) || !!msg.bookmarked;
            const likeCount = msg.likes?.length || 0;
            const commentCount = msg.comments?.length || 0;
            const isCommentOpen = activeCommentMessageId === msg.id;
            const previewComments = (msg.comments || []).slice(-2);
            const earlierCount = Math.max(0, (msg.comments || []).length - 2);

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
                  {renderLikeInfo(msg.likes || [])}
                  <div className="message-interactions">
                    {isLiked ? (
                      <button
                        className="interaction-btn interaction-btn--liked"
                        onClick={() => handleLike(msg.id)}
                        title="取消点赞"
                        type="button"
                      >
                        <FiThumbsUp className="interaction-icon" />
                        {likeCount > 0 && <span className="interaction-count">{likeCount}</span>}
                      </button>
                    ) : (
                      <button
                        className="interaction-btn"
                        onClick={() => handleLike(msg.id)}
                        title="点赞"
                        type="button"
                      >
                        <FiThumbsUp className="interaction-icon" />
                        {likeCount > 0 && <span className="interaction-count">{likeCount}</span>}
                      </button>
                    )}
                    <button
                      className={`interaction-btn ${commentCount > 0 ? 'has-comments' : ''} ${isCommentOpen ? 'active' : ''}`}
                      onClick={() => handleToggleComment(msg.id)}
                      title="评论"
                    >
                      <FiMessageSquare className="interaction-icon" />
                      {commentCount > 0 && <span className="interaction-count">{commentCount}</span>}
                    </button>
                    <button
                      className="interaction-btn"
                      onClick={() => handleShare(msg.id)}
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

                  {isCommentOpen && (
                    <div className="comment-panel">
                      {previewComments.length > 0 && (
                        <div className="comment-preview">
                          {earlierCount > 0 && (
                            <button
                              className="comment-more"
                              onClick={() => handleOpenCommentDetail(msg.id)}
                              type="button"
                            >
                              查看更早{earlierCount}条回复
                            </button>
                          )}
                          {previewComments.map((c) => (
                            <div key={c.id} className="comment-item">
                              <span className="comment-sender">{c.sender}：</span>
                              <span className="comment-content">{c.content}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="comment-input-row">
                        <input
                          className="comment-input"
                          value={commentDraft}
                          onChange={(e) => setCommentDraft(e.target.value)}
                          placeholder="分享你的想法..."
                        />
                        <button
                          className="comment-send"
                          onClick={() => handleSendComment(msg.id)}
                          disabled={!commentDraft.trim()}
                          type="button"
                        >
                          发送
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {commentDetailMessageId && (
        <div className="comment-detail-overlay">
          <div className="comment-detail-panel">
            <div className="comment-detail-header">
              <div className="comment-detail-title">评论</div>
              <button className="comment-detail-close" onClick={handleCloseCommentDetail} type="button">
                <FiX />
              </button>
            </div>

            {(() => {
              const msg = messages.find((m) => m.id === commentDetailMessageId);
              if (!msg) return null;

              const likeUsers = msg.likes || [];
              const hasLikeInfo = likeUsers.length > 0;
              const allComments = msg.comments || [];

              return (
                <div className="comment-detail-body">
                  <div className="comment-detail-post">
                    <div className="comment-detail-post-header">
                      <div className="comment-detail-post-sender">{msg.sender}</div>
                      <div className="comment-detail-post-time">{formatTime(msg.time)}</div>
                    </div>
                    <div className="comment-detail-post-content">{msg.content}</div>
                    {hasLikeInfo && (
                      <div className="comment-detail-like-info">{renderLikeInfo(likeUsers)}</div>
                    )}
                  </div>

                  <div className="comment-detail-list">
                    {allComments.length === 0 ? (
                      <div className="comment-detail-empty">暂无评论</div>
                    ) : (
                      allComments.map((c) => (
                        <div key={c.id} className="comment-detail-item">
                          <div className="comment-detail-item-header">
                            <span className="comment-detail-item-sender">{c.sender}</span>
                            <span className="comment-detail-item-time">{formatTime(c.time)}</span>
                          </div>
                          <div className="comment-detail-item-content">{c.content}</div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="comment-detail-input">
                    <input
                      className="comment-input"
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      placeholder="写下你的评论..."
                    />
                    <button
                      className="comment-send"
                      onClick={() => handleSendComment(msg.id)}
                      disabled={!commentDraft.trim()}
                      type="button"
                    >
                      发送
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

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

        .like-info {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }

        .like-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 999px;
          background: #f5f5f5;
          border: 1px solid rgba(0, 0, 0, 0.06);
          color: #333;
          font-size: 13px;
          line-height: 1;
          max-width: 100%;
        }

        .like-pill-icon {
          width: 16px;
          height: 16px;
          color: #fa8c16;
          flex-shrink: 0;
        }

        .like-pill-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }

        .comment-panel {
          margin-top: 12px;
          background: #f1f6ff;
          border: 1px solid rgba(24, 144, 255, 0.18);
          border-radius: 12px;
          padding: 12px;
        }

        .comment-preview {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 10px;
        }

        .comment-more {
          background: none;
          border: none;
          padding: 0;
          text-align: left;
          cursor: pointer;
          color: #1890ff;
          font-size: 13px;
          font-weight: 500;
        }

        .comment-item {
          font-size: 13px;
          color: #333;
          line-height: 1.4;
        }

        .comment-sender {
          color: #555;
          font-weight: 600;
        }

        .comment-content {
          color: #333;
        }

        .comment-input-row {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .comment-input {
          flex: 1;
          height: 34px;
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          padding: 0 12px;
          background: #fff;
          font-size: 13px;
          box-sizing: border-box;
        }

        .comment-input:focus {
          outline: none;
          border-color: #1890ff;
        }

        .comment-send {
          height: 34px;
          padding: 0 14px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          background: #1890ff;
          color: #fff;
          font-size: 13px;
          font-weight: 500;
        }

        .comment-send:disabled {
          background: #d9d9d9;
          cursor: not-allowed;
        }

        .comment-detail-overlay {
          position: absolute;
          left: 0;
          top: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.12);
          display: flex;
          align-items: stretch;
          justify-content: center;
          z-index: 500;
        }

        .comment-detail-panel {
          width: 100%;
          height: 100%;
          background: #fff;
          display: flex;
          flex-direction: column;
        }

        .comment-detail-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          flex-shrink: 0;
        }

        .comment-detail-title {
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .comment-detail-close {
          background: none;
          border: none;
          cursor: pointer;
          color: #666;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .comment-detail-body {
          flex: 1;
          overflow: auto;
          padding: 16px;
          background: #f5f5f5;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .comment-detail-post {
          background: #fff;
          border-radius: 12px;
          padding: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        }

        .comment-detail-post-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .comment-detail-post-sender {
          font-size: 14px;
          font-weight: 600;
          color: #333;
        }

        .comment-detail-post-time {
          font-size: 12px;
          color: #999;
        }

        .comment-detail-post-content {
          font-size: 14px;
          color: #333;
          line-height: 1.6;
          word-break: break-word;
        }

        .comment-detail-like-info {
          margin-top: 10px;
          background: #fff7e6;
          border: 1px solid #ffe7ba;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          gap: 8px;
          align-items: center;
          color: #8c5a00;
        }

        .comment-detail-like-icon {
          width: 16px;
          height: 16px;
        }

        .comment-detail-like-text {
          font-size: 13px;
          font-weight: 500;
        }

        .comment-detail-list {
          background: #fff;
          border-radius: 12px;
          padding: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .comment-detail-empty {
          font-size: 13px;
          color: #999;
          padding: 8px 0;
          text-align: center;
        }

        .comment-detail-item-header {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 4px;
        }

        .comment-detail-item-sender {
          font-size: 13px;
          font-weight: 600;
          color: #333;
        }

        .comment-detail-item-time {
          font-size: 12px;
          color: #999;
        }

        .comment-detail-item-content {
          font-size: 13px;
          color: #333;
          line-height: 1.5;
          word-break: break-word;
        }

        .comment-detail-input {
          margin-top: auto;
          background: #fff;
          border-radius: 12px;
          padding: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .share-modal-overlay {
          position: absolute;
          left: 0;
          top: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.16);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 600;
        }

        .share-modal {
          width: 520px;
          max-width: calc(100% - 32px);
          height: 620px;
          max-height: calc(100% - 32px);
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .share-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid #f0f0f0;
          flex-shrink: 0;
        }

        .share-modal-title {
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .share-modal-close {
          background: none;
          border: none;
          cursor: pointer;
          color: #666;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .share-modal-search {
          padding: 12px 16px;
          border-bottom: 1px solid #f5f5f5;
          flex-shrink: 0;
        }

        .share-modal-search-input {
          width: 100%;
          height: 36px;
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          padding: 0 12px;
          box-sizing: border-box;
          font-size: 13px;
          outline: none;
        }

        .share-modal-search-input:focus {
          border-color: #1890ff;
        }

        .share-modal-body {
          flex: 1;
          overflow: auto;
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

        .interaction-btn--liked {
          background: #e6f4ff;
          color: #1677ff;
        }

        .interaction-btn--liked:hover {
          background: #bae0ff;
          color: #1677ff;
        }

        .interaction-btn.liked,
        .interaction-btn.has-comments,
        .interaction-btn.active,
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
        .interaction-btn.has-comments .interaction-count,
        .interaction-btn.active .interaction-count {
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
