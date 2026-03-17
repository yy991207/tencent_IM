import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ConversationList, ConversationPreview, useLoginState } from '@tencentcloud/chat-uikit-react';
import type { ConversationPreviewProps } from '@tencentcloud/chat-uikit-react';
import { FiThumbsUp, FiMessageSquare, FiShare2, FiBookmark } from 'react-icons/fi';
import { FiUser, FiUsers, FiX, FiPlus, FiArrowLeft, FiCpu, FiInfo } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import {
  type CommunityPost,
  type CommunityLikeUser,
  loadCommunityMessages,
  sendPost as sdkSendPost,
  sendComment as sdkSendComment,
  toggleLike as sdkToggleLike,
  forwardPost as sdkForwardPost,
  loadTopicBookmarkIdsFromConversation,
  saveTopicBookmarkIdsToConversation,
  subscribeMessages,
  getGroupProfile,
  getGroupRobotCount,
} from '../utils/communityMessageService';

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


/**
 * 将 Markdown 文本转为纯文本（用于会话列表预览等不需要渲染 Markdown 的场景）
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')           // 标题标记
    .replace(/\*\*(.+?)\*\*/g, '$1')     // 粗体
    .replace(/\*(.+?)\*/g, '$1')         // 斜体
    .replace(/~~(.+?)~~/g, '$1')         // 删除线
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, '')) // 行内/块代码
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接和图片
    .replace(/^>\s+/gm, '')              // 引用
    .replace(/^[-*+]\s+/gm, '')          // 无序列表
    .replace(/^\d+\.\s+/gm, '')          // 有序列表
    .replace(/---+/g, '')                // 水平线
    .replace(/\n{2,}/g, ' ')             // 多余换行合并为空格
    .trim();
}

/** 截断文本，用于左侧会话列表预览摘要（默认最多 5 个字符） */
function truncateText(text: string, maxLen = 5): string {
  const plain = stripMarkdown(text);
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
}

/**
 * 话题论坛聊天页面组件
 * 支持留言板功能，用户可以在右下角点击"+"按钮发送留言
 */
export const CommunityChatView: React.FC<CommunityChatViewProps> = ({
  groupID,
  groupName = '话题论坛',
  groupAvatarUrl,
  onBack,
  embedded = false,
  openCommentDetailMessageId,
  onCommunitySummaryChange,
  onTopicBookmarkChange,
}) => {
  const { loginUserInfo } = useLoginState();

  const [showMessageInput, setShowMessageInput] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [activeCommentMessageId, setActiveCommentMessageId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentDetailMessageId, setCommentDetailMessageId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareMessageId, setShareMessageId] = useState<string | null>(null);
  const [shareSearchValue, setShareSearchValue] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'subscribed'>('all');
  const [groupProfile, setGroupProfile] = useState<any>(null);
  const [robotCount, setRobotCount] = useState(0);

  const currentUserId = loginUserInfo?.userId || '';

  // 从帖子数据派生当前用户的点赞集合
  const likedMessageIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of posts) {
      if (p.likes.some((l) => l.userId === currentUserId)) {
        set.add(p.id);
      }
    }
    return set;
  }, [posts, currentUserId]);

  const onCommunitySummaryChangeRef = useRef(onCommunitySummaryChange);
  const lastReportedSummaryRef = useRef<{ abstract: string; time: number } | null>(null);
  const lastReportedTopicPreviewRef = useRef<Map<string, string>>(new Map());

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [posts]);

  useEffect(() => {
    onCommunitySummaryChangeRef.current = onCommunitySummaryChange;
  }, [onCommunitySummaryChange]);

  // 当帖子/评论变化时，同步更新已收藏帖子的“话题入口”预览文案与时间
  // 说明：收藏的 messageId 集合本身已通过 localStorage 持久化，但左侧入口展示的 preview/time 需要跟随最新评论变化
  useEffect(() => {
    if (!groupID) return;
    if (!onTopicBookmarkChange) return;

    const bookmarked = bookmarkedIds;
    if (!bookmarked || bookmarked.size === 0) return;

    for (const p of posts) {
      if (!bookmarked.has(p.id)) continue;

      const postTitle = `${p.sender}：${stripMarkdown(p.content)}`;
      const title = postTitle.length > 16 ? `${postTitle.slice(0, 16)}...` : postTitle;
      const comments = p.comments || [];
      const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
      const preview = lastComment ? `${lastComment.sender}：${truncateText(lastComment.content)}` : '暂无评论';
      const time = lastComment?.time || p.time;

      const reportKey = `${preview}__${time?.getTime?.() || 0}`;
      const prevKey = lastReportedTopicPreviewRef.current.get(p.id);
      if (prevKey === reportKey) continue;
      lastReportedTopicPreviewRef.current.set(p.id, reportKey);

      onTopicBookmarkChange({
        groupID,
        groupName,
        groupAvatarUrl,
        messageId: p.id,
        title,
        preview,
        time,
      });
    }
  }, [groupID, groupName, groupAvatarUrl, posts, bookmarkedIds, onTopicBookmarkChange]);

  useEffect(() => {
    if (!groupID) return;
    if (posts.length === 0) return;

    const lastPost = posts[posts.length - 1];
    const comments = lastPost.comments || [];
    const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
    const lastMessageAbstract = lastComment
      ? `${lastComment.sender}：${truncateText(lastComment.content)}`
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
  }, [groupID, posts]);

  // ─── 从 SDK 加载历史消息并订阅实时更新 ────────────────────
  useEffect(() => {
    if (!groupID) return;

    let cancelled = false;

    const doLoad = async () => {
      setIsLoading(true);
      try {
        const conversationID = `GROUP${groupID}`;
        const savedBookmarks = await loadTopicBookmarkIdsFromConversation(conversationID);
        if (!cancelled) setBookmarkedIds(savedBookmarks);

        const loadedPosts = await loadCommunityMessages(groupID, savedBookmarks);
        if (!cancelled) setPosts(loadedPosts);
      } catch (err) {
        console.error('[Community] Failed to load messages:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    doLoad();

    // 订阅其他用户发送的新帖子 / 新评论 / 点赞修改
    const unsubscribe = subscribeMessages(
      groupID,
      // 新帖子
      (newPost) => {
        setPosts((prev) => {
          if (prev.some((p) => p.id === newPost.id)) return prev;
          return [...prev, newPost];
        });
      },
      // 新评论
      (newComment) => {
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== newComment.postMessageID) return p;
            if (p.comments.some((c) => c.id === newComment.id)) return p;
            return { ...p, comments: [...p.comments, newComment] };
          }),
        );
      },
      // 帖子修改（点赞同步）
      (postId, likes, rawMessage) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, likes, _rawMessage: rawMessage } : p,
          ),
        );
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [groupID, currentUserId]);

  useEffect(() => {
    if (!openCommentDetailMessageId) return;
    setCommentDetailMessageId(openCommentDetailMessageId);
    setActiveCommentMessageId(openCommentDetailMessageId);
  }, [openCommentDetailMessageId]);

  useEffect(() => {
    if (!groupID) return;
    const fetchGroupInfo = async () => {
      const profile = await getGroupProfile(groupID);
      if (profile) {
        setGroupProfile(profile);
      }
      const bots = await getGroupRobotCount(groupID);
      setRobotCount(bots);
    };
    fetchGroupInfo();
  }, [groupID]);

  // 处理发送留言（通过 SDK 发送自定义消息）
  const handleSendMessage = async () => {
    if (!inputValue.trim() || !groupID) return;

    try {
      const res = await sdkSendPost(groupID, inputValue.trim());
      const sent = res?.data?.message;

      if (sent) {
        const newPost: CommunityPost = {
          id: sent.ID,
          content: inputValue.trim(),
          sender: loginUserInfo?.userName || loginUserInfo?.userId || '我',
          senderID: loginUserInfo?.userId || '',
          avatarUrl: loginUserInfo?.avatarUrl || '',
          time: new Date((sent.time || Date.now() / 1000) * 1000),
          likes: [],
          comments: [],
          bookmarked: false,
          _rawMessage: sent,
        };
        setPosts((prev) => [...prev, newPost]);
      }

      setInputValue('');
      setShowMessageInput(false);
    } catch (err) {
      console.error('[Community] Failed to send post:', err);
      alert('发送失败，请重试');
    }
  };

  // 处理点赞（通过 SDK modifyMessage 更新 cloudCustomData）
  const handleLike = async (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    try {
      const { likes } = await sdkToggleLike(
        post._rawMessage,
        currentUserId,
        loginUserInfo?.userName || loginUserInfo?.userId || '我',
        loginUserInfo?.avatarUrl,
      );
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, likes } : p)),
      );
    } catch (err) {
      console.error('[Community] Failed to toggle like:', err);
    }
  };

  const renderLikeInfo = (likeUsers: CommunityLikeUser[]) => {
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

  const handleSendComment = async (postId: string) => {
    const content = commentDraft.trim();
    if (!content || !groupID) return;

    try {
      const res = await sdkSendComment(groupID, postId, content);
      const sent = res?.data?.message;

      if (sent) {
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            if (p.comments.some((c) => c.id === sent.ID)) return p;
            return {
              ...p,
              comments: [
                ...p.comments,
                {
                  id: sent.ID,
                  content,
                  sender: loginUserInfo?.userName || loginUserInfo?.userId || '我',
                  senderID: loginUserInfo?.userId || '',
                  time: new Date((sent.time || Date.now() / 1000) * 1000),
                  postMessageID: postId,
                },
              ],
            };
          }),
        );
      }
      setCommentDraft('');
    } catch (err) {
      console.error('[Community] Failed to send comment:', err);
      alert('评论发送失败');
    }
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

  const handleSelectShareTarget = async (conversation: any) => {
    const convID = conversation?.conversationID;
    const name =
      conversation?.groupProfile?.name ||
      conversation?.userProfile?.nick ||
      conversation?.userProfile?.userID ||
      convID ||
      '未知会话';

    if (shareMessageId && convID) {
      const post = posts.find((p) => p.id === shareMessageId);
      if (post) {
        try {
          await sdkForwardPost(convID, groupName, post.content);
          alert(`消息已转发给 "${name}"`);
        } catch (err) {
          console.error('[Community] Forward failed:', err);
          alert('转发失败');
        }
      }
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

  // 处理收藏（localStorage 持久化）
  const handleBookmark = (postId: string) => {
    if (!groupID) return;
    setBookmarkedIds((prev) => {
      const conversationID = `GROUP${groupID}`;
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
        setPosts((prevPosts) =>
          prevPosts.map((p) =>
            p.id === postId ? { ...p, bookmarked: false } : p,
          ),
        );
        onTopicBookmarkChange?.(null, postId);
      } else {
        newSet.add(postId);
        setPosts((prevPosts) =>
          prevPosts.map((p) => {
            if (p.id !== postId) return p;

            const postTitle = `${p.sender}：${stripMarkdown(p.content)}`;
            const title = postTitle.length > 16 ? `${postTitle.slice(0, 16)}...` : postTitle;
            const comments = p.comments || [];
            const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
            const preview = lastComment
              ? `${lastComment.sender}：${truncateText(lastComment.content)}`
              : '暂无评论';
            const time = lastComment?.time || p.time;

            onTopicBookmarkChange?.({
              groupID,
              groupName,
              groupAvatarUrl,
              messageId: postId,
              title,
              preview,
              time,
            });

            return { ...p, bookmarked: true };
          }),
        );
      }

      // 使用 SDK 的会话 customData 持久化收藏（多端同步，且社群会话被删除后数据自然消失）
      // 说明：customData 最大 256 bytes，超限会自动裁剪最早的收藏，保证写入成功。
      saveTopicBookmarkIdsToConversation(conversationID, newSet);
      return newSet;
    });
  };

  // 格式化时间
  const formatTime = (date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const timeStr = date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${month}月${day}日 ${timeStr}`;
  };

  const displayPosts = useMemo(() => {
    if (activeTab === 'all') return posts;
    return posts.filter(post => bookmarkedIds.has(post.id) || post.bookmarked);
  }, [posts, activeTab, bookmarkedIds]);

  return (
    <div className="community-chat-view">
      {/* 头部 */}
      {/* 头部 */}
      <div className="community-chat-header">
        {!embedded && (
          <div className="header-top-row">
            <button className="back-button" onClick={onBack}>
              <FiArrowLeft />
            </button>
          </div>
        )}
        <div className="header-info-row">
          <div className="header-stats">
            <div className="stat-item" title="群成员">
              <FiUsers />
              <span>{groupProfile?.memberCount || 0}</span>
            </div>
            <div className="stat-item" title="机器人">
              <FiCpu />
              <span>{robotCount}</span>
            </div>
          </div>
          <div className="header-divider"></div>
          <div className="header-announcement" title="群公告">
            <FiInfo className="announcement-icon" />
            <span className="announcement-text">
              {groupProfile?.notification || groupProfile?.introduction || '暂无群描述'}
            </span>
            <span className="external-tag">外部</span>
          </div>
        </div>
      </div>

      {/* 标签页切换 */}
      <div className="community-tabs">
        <button
          className={`community-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          全部
        </button>
        <button
          className={`community-tab ${activeTab === 'subscribed' ? 'active' : ''}`}
          onClick={() => setActiveTab('subscribed')}
        >
          我订阅的
        </button>
      </div>

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
        {isLoading ? (
          <div className="empty-message-tip">加载中…</div>
        ) : displayPosts.length === 0 ? (
          <div className="empty-message-tip">
            {activeTab === 'all' ? '暂无留言，快来发布第一条留言吧～' : '暂无订阅的留言'}
          </div>
        ) : (
          displayPosts.map((msg) => {
            const isLiked = likedMessageIds.has(msg.id);
            const isBookmarked = bookmarkedIds.has(msg.id) || !!msg.bookmarked;
            const likeCount = msg.likes?.length || 0;
            const commentCount = msg.comments?.length || 0;
            const isCommentOpen = activeCommentMessageId === msg.id;
            const previewComments = (msg.comments || []).slice(-2);
            const earlierCount = Math.max(0, (msg.comments || []).length - 2);

            return (
              <div key={msg.id} className="message-item">
                <div className="message-avatar">
                  {msg.senderID === currentUserId ? <FiUser /> : <FiUsers />}
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-sender">{msg.sender}</span>
                    <span className="message-time">{formatTime(msg.time)}</span>
                  </div>

                  {/* 帖子正文：支持 Markdown 格式渲染（如标题、列表、代码块等） */}
                  <div className="message-bubble markdown-body">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>

                  {/* 默认显示的评论预览区 */}
                  {previewComments.length > 0 && (
                    <div className="comment-panel">
                      <div className="comment-preview">
                        {earlierCount > 0 && (
                          <button
                            className="comment-more"
                            onClick={() => handleOpenCommentDetail(msg.id)}
                            type="button"
                          >
                            查看更早 {earlierCount} 条回复
                          </button>
                        )}
                        {previewComments.map((c) => (
                          <div key={c.id} className="comment-item">
                            <span className="comment-sender">{c.sender}：</span>
                            {/* 评论预览：支持 Markdown 渲染 */}
                            <span className="comment-content markdown-body markdown-compact">
                              <ReactMarkdown>{c.content}</ReactMarkdown>
                            </span>
                          </div>
                        ))}
                      </div>
                      {/* 点赞信息显示在评论区内部底部 */}
                      {renderLikeInfo(msg.likes || [])}
                    </div>
                  )}

                  {/* 如果没有评论，但有点赞，则单独显示点赞信息 */}
                  {previewComments.length === 0 && renderLikeInfo(msg.likes || [])}

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

                  {/* 点击评论按钮后展开的输入框 */}
                  {isCommentOpen && (
                    <div className="comment-input-panel">
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
              <div className="comment-detail-title"></div>
              <button className="comment-detail-close" onClick={handleCloseCommentDetail} type="button">
                <FiX />
              </button>
            </div>

            {(() => {
              const msg = posts.find((m) => m.id === commentDetailMessageId);
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
                    {/* 评论详情中的帖子正文：同样支持 Markdown 渲染 */}
                    <div className="comment-detail-post-content markdown-body">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
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
                          {/* 评论详情：支持 Markdown 渲染 */}
                          <div className="comment-detail-item-content markdown-body">
                            <ReactMarkdown>{c.content}</ReactMarkdown>
                          </div>
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
          flex: 1;
          min-height: 0;
          width: 100%;
          background: #f5f5f5;
          position: relative;
        }

        .community-chat-header {
          display: flex;
          flex-direction: column;
          padding: 8px 20px;
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

        .header-top-row {
          display: flex;
          align-items: center;
          margin-bottom: 4px;
        }

        .header-info-row {
          display: flex;
          align-items: center;
          gap: 12px;
          overflow: hidden;
          padding-left: ${embedded ? '0' : '44px'}; /* 嵌入模式下不需要左边距对齐 */
        }

        .header-stats {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #8c8c8c;
          font-size: 13px;
        }

        .stat-item svg {
          width: 14px;
          height: 14px;
        }

        .header-divider {
          width: 1px;
          height: 14px;
          background: #e8e8e8;
          flex-shrink: 0;
        }

        .header-announcement {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #595959;
          font-size: 13px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          flex: 1;
        }

        .announcement-icon {
          flex-shrink: 0;
          color: #8c8c8c;
          width: 14px;
          height: 14px;
        }

        .announcement-text {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .external-tag {
          padding: 1px 4px;
          background: #e6f7ff;
          color: #1890ff;
          border-radius: 2px;
          font-size: 11px;
          margin-left: 4px;
          flex-shrink: 0;
        }

        .community-tabs {
          display: flex;
          padding: 0 20px;
          background: #fff;
          border-bottom: 1px solid #e8e8e8;
          flex-shrink: 0;
        }

        .community-tab {
          padding: 12px 16px;
          font-size: 15px;
          color: #666;
          background: none;
          border: none;
          cursor: pointer;
          position: relative;
          font-weight: 500;
        }

        .community-tab:hover {
          color: #1890ff;
        }

        .community-tab.active {
          color: #1890ff;
          font-weight: 600;
        }

        .community-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 16px;
          right: 16px;
          height: 3px;
          background: #1890ff;
          border-radius: 3px 3px 0 0;
        }

        .community-message-list {
          flex: 1;
          min-height: 0;
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
          margin-bottom: 16px;
          background: #fff;
          padding: 16px;
          border-radius: 8px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          border: 1px solid #f0f0f0;
        }

        .message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #f0f2f5;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
          flex-shrink: 0;
          color: #8c8c8c;
        }

        .message-avatar svg {
          width: 20px;
          height: 20px;
        }

        .message-content {
          flex: 1;
          min-width: 0;
        }

        .message-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .message-sender {
          font-size: 14px;
          color: #262626;
          font-weight: 600;
        }

        .message-time {
          font-size: 12px;
          color: #bfbfbf;
        }

        .message-bubble {
          font-size: 14px;
          line-height: 1.6;
          word-break: break-word;
          color: #262626;
          margin-bottom: 8px;
        }

        /* ─── Markdown 渲染样式（社群帖子正文 & 评论） ─── */
        .markdown-body {
          overflow: hidden; /* 限制所有 Markdown 渲染区域不溢出 */
        }
        .markdown-body h1,
        .markdown-body h2,
        .markdown-body h3,
        .markdown-body h4,
        .markdown-body h5,
        .markdown-body h6 {
          margin: 8px 0 4px;
          line-height: 1.4;
          font-weight: 600;
          color: #333;
        }
        .markdown-body h1 { font-size: 1.4em; }
        .markdown-body h2 { font-size: 1.25em; }
        .markdown-body h3 { font-size: 1.1em; }

        .markdown-body p {
          margin: 4px 0;
        }

        .markdown-body ul,
        .markdown-body ol {
          margin: 4px 0;
          padding-left: 1.5em;
        }

        .markdown-body li {
          margin: 2px 0;
        }

        .markdown-body blockquote {
          margin: 6px 0;
          padding: 4px 12px;
          border-left: 3px solid #1890ff;
          color: #666;
          background: #f9f9f9;
          border-radius: 0 4px 4px 0;
        }

        .markdown-body code {
          background: #f5f5f5;
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 0.9em;
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        }

        .markdown-body pre {
          background: #f5f5f5;
          padding: 10px 12px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 6px 0;
        }

        .markdown-body pre code {
          background: none;
          padding: 0;
        }

        .markdown-body a {
          color: #1890ff;
          text-decoration: none;
        }

        .markdown-body a:hover {
          text-decoration: underline;
        }

        .markdown-body hr {
          border: none;
          border-top: 1px solid #e8e8e8;
          margin: 8px 0;
        }

        .markdown-body img {
          max-width: 100%;
          border-radius: 4px;
        }

        .markdown-body table {
          border-collapse: collapse;
          width: 100%;
          margin: 6px 0;
        }

        .markdown-body th,
        .markdown-body td {
          border: 1px solid #e8e8e8;
          padding: 6px 10px;
          text-align: left;
          font-size: 0.9em;
        }

        .markdown-body th {
          background: #fafafa;
          font-weight: 600;
        }

        /* 首尾元素去掉多余外边距 */
        .markdown-body > :first-child { margin-top: 0; }
        .markdown-body > :last-child  { margin-bottom: 0; }

        /* 紧凑模式：评论预览区内的 Markdown 不添加额外间距 */
        .markdown-compact p {
          margin: 0;
          display: inline;
        }
        .markdown-compact > * {
          display: inline;
        }

        .like-info {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .like-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 16px;
          background: #fff;
          border: 1px solid #e8e8e8;
          color: #595959;
          font-size: 12px;
          line-height: 1.2;
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
          background: #f5f5f5;
          border-radius: 8px;
          padding: 12px 16px;
          overflow: hidden; /* 防止评论区 Markdown 内容溢出 */
        }

        .comment-preview {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .comment-input-panel {
          margin-top: 12px;
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
          display: inline-flex;
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
          min-height: 0;
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
          overflow: hidden; /* 防止 Markdown 渲染后内容溢出 */
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
          overflow: hidden; /* 防止 Markdown 渲染后内容溢出 */
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
