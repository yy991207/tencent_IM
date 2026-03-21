import { useEffect, useLayoutEffect, useState, useMemo, useRef } from "react";
import {
  UIKitProvider,
  useLoginState,
  LoginStatus,
  ConversationList,
  Chat,
  ChatHeader,
  MessageList,
  MessageInput,
  ContactList,
  ContactInfo,
  ChatSetting,
  Search,
  VariantType,
  Avatar,
  useUIKit,
  useConversationListState,
  ConversationPreview,
} from "@tencentcloud/chat-uikit-react";
import StreamMessage from './components/StreamMessage';
import type { ConversationPreviewProps } from "@tencentcloud/chat-uikit-react";
import { IconChat, IconUsergroup, IconBulletpoint, IconSearch } from "@tencentcloud/uikit-base-component-react";
import TUIChatEngine from '@tencentcloud/chat-uikit-engine-lite';
import { generateGroupAvatarByType, type GroupType } from './utils/groupAvatar';
import CommunityChatView from './components/CommunityChatView';
import CustomConversationCreate from './components/CustomConversationCreate';
import { loadRuntimeConfig, type RuntimeConfig, type UserEntry } from './utils/runtimeConfig';
import React from 'react';
import { FiShare2, FiBookmark, FiX } from 'react-icons/fi';
import { emojiBaseUrl, emojiUrlMap } from './utils/tuiEmoji';
import { loadTopicBookmarkIdsFromConversation } from './utils/communityMessageService';
import {
  filterConversationListByKeyword,
  filterTopicBookmarksByKeyword,
} from './utils/conversationSearch';
import './App.css';

function renderTextWithTUIEmoji(text: string): React.ReactNode {
  if (!text) return '';
  const reg = /(\[.+?\])/g;
  if (!reg.test(text)) return text;

  const parts = text.split(reg);
  return parts.map((part, idx) => {
    const emojiPath = part ? (emojiUrlMap as Record<string, string>)[part] : '';
    if (emojiPath) {
      const src = `${emojiBaseUrl}${emojiPath}`;
      return (
        <img
          key={`emoji:${idx}`}
          className="conversation-abstract-emoji"
          src={src}
          alt={part}
          draggable={false}
        />
      );
    }
    return <React.Fragment key={`txt:${idx}`}>{part}</React.Fragment>;
  });
}

function App() {
  // 语言支持 en-US(default) / zh-CN / ja-JP / ko-KR / zh-TW
  // 主题支持 light(default) / dark
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [configError, setConfigError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await loadRuntimeConfig();
        if (cancelled) return;
        setConfig(cfg);
        setConfigError('');
      } catch (e) {
        if (cancelled) return;
        setConfig(null);
        setConfigError(e instanceof Error ? e.message : '加载配置失败');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (configError) {
    return (
      <div style={{ padding: 16, color: '#333' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>配置加载失败</div>
        <div style={{ whiteSpace: 'pre-wrap', color: '#666' }}>{configError}</div>
        <div style={{ marginTop: 12, color: '#666' }}>
          请按以下步骤处理：
          <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
            1. 复制 public/config-example.yaml 为 public/config.yaml
            2. 填写 SDKAppID / userID / userSig
            3. 重新启动本地服务
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return <div style={{ padding: 16, color: '#666' }}>加载配置中...</div>;
  }

  return (
    <div className="app-root">
      {/* 多用户切换栏：多人对话模拟时，点击可在新标签页以不同身份登录 */}
      {config.users.length > 1 && (
        <UserSwitchBar users={config.users} currentUserID={config.userID} />
      )}
      <UIKitProvider theme={'light'} language={'zh-CN'}>
        <ChatApp config={config} />
      </UIKitProvider>
    </div>
  );
}

function ChatApp({ config }: { config: RuntimeConfig }) {
  type TopicBookmarkItem = {
    groupID?: string;
    groupName: string;
    groupAvatarUrl?: string;
    messageId: string;
    title: string;
    preview: string;
    time?: Date;
  };

  const [activeTab, setActiveTab] = useState<'conversations' | 'contacts'>('conversations');
  const [isChatSettingShow, setIsChatSettingShow] = useState(false);
  const [isSearchInChatShow, setIsSearchInChatShow] = useState(false);
  const [showCommunityView, setShowCommunityView] = useState(false);
  const [currentCommunity, setCurrentCommunity] = useState<{ groupID: string; groupName: string; groupAvatarUrl?: string } | null>(null);
  const [openCommunityCommentDetailMessageId, setOpenCommunityCommentDetailMessageId] = useState<string | null>(null);
  const { loginUserInfo } = useLoginState();
  const [topicBookmarks, setTopicBookmarks] = useState<TopicBookmarkItem[]>([]);
  const [conversationSearchKeyword, setConversationSearchKeyword] = useState('');
  const conversationSearchKeywordRef = useRef('');
  const [currentTopicBookmark, setCurrentTopicBookmark] = useState<TopicBookmarkItem | null>(null);
  const [topicHeaderAction, setTopicHeaderAction] = useState<{
    type: 'share' | 'bookmark' | 'unbookmark';
    messageId: string;
    nonce: number;
  } | null>(null);
  const [commentDetailHeaderAction, setCommentDetailHeaderAction] = useState<{
    type: 'share' | 'bookmark' | 'close';
    messageId: string;
    nonce: number;
  } | null>(null);
  const [communityDetailState, setCommunityDetailState] = useState<{ messageId: string | null; bookmarked: boolean }>({
    messageId: null,
    bookmarked: false,
  });
  const handledTopicHeaderActionNonceRef = useRef<number | null>(null);
  const handledCommentDetailHeaderActionNonceRef = useRef<number | null>(null);
  const [forcedUnbookmarkKeys, setForcedUnbookmarkKeys] = useState<Record<string, number>>({});
  const FORCED_UNBOOKMARK_TTL_MS = 30000;

  const [communityConversationSummary, setCommunityConversationSummary] = useState<Record<string, {
    lastMessageAbstract: string;
    lastMessageTime: Date;
  }>>({});
  
  const { language, theme } = useUIKit();

  const isDark = theme === 'dark';
  conversationSearchKeywordRef.current = conversationSearchKeyword;

  const texts = useMemo(() => 
    language === 'zh-CN'
      ? { emptyTitle: '暂无会话', emptySub: '选择一个会话开始聊天', error: '请检查 SDKAppID, userID, userSig, 通过开发人员工具 (F12) 查看具体的错误信息', loading: '登录中...' }
      : { emptyTitle: 'No conversation', emptySub: 'Select a conversation to start chatting', error: 'Please check the SDKAppID, userID, and userSig. View the specific error information through the developer tools (F12).', loading: 'Logging in...'},
    [language]
  );

  // 鉴权信息配置 - 运行时从 public/config.yaml 加载
  const { status } = useLoginState({
    SDKAppID: config.SDKAppID,
    userID: config.userID,
    userSig: config.userSig,
  });

  const currentUserId = loginUserInfo?.userId || '';
  const pendingUnbookmarkKeysRef = useRef<Map<string, number>>(new Map());
  const UNBOOKMARK_SYNC_GRACE_MS = 8000;

  const buildTopicBookmarkKey = (groupID?: string, messageId?: string) => `${groupID || ''}:${messageId || ''}`;
  const logTopicBookmarkState = (tag: string, extra?: Record<string, unknown>) => {
    console.log('[TopicBookmarks]', tag, {
      topicBookmarks: topicBookmarks.map((item) => ({
        key: buildTopicBookmarkKey(item.groupID, item.messageId),
        title: item.title,
      })),
      pendingUnbookmarkKeys: Array.from(pendingUnbookmarkKeysRef.current.keys()),
      currentCommunity: currentCommunity?.groupID || null,
      currentTopicBookmark: currentTopicBookmark ? buildTopicBookmarkKey(currentTopicBookmark.groupID, currentTopicBookmark.messageId) : null,
      ...extra,
    });
  };

  const forcedUnbookmarkMessageIds = useMemo(() => {
    if (!currentCommunity?.groupID) return [] as string[];
    const nowTs = Date.now();
    const prefix = `${currentCommunity.groupID}:`;
    const ids: string[] = [];

    for (const [key, ts] of Object.entries(forcedUnbookmarkKeys)) {
      if (!key.startsWith(prefix)) continue;
      if (nowTs - ts > FORCED_UNBOOKMARK_TTL_MS) continue;
      ids.push(key.slice(prefix.length));
    }

    return ids;
  }, [currentCommunity?.groupID, forcedUnbookmarkKeys]);

  const refreshTopicBookmarksFromSDK = async () => {
    // 说明：话题入口的“收藏关系”存储在对应社群会话的 customData 中（每个会话 256 bytes）。
    // 这里在登录成功后拉取会话列表，汇总出所有社群的收藏 messageId，从而重建左侧 # 入口。
    const engine: any = TUIChatEngine as any;
    try {
      const res = await engine?.TUIConversation?.getConversationList?.();
      const convList: any[] = res?.data?.conversationList || res?.data || [];
      if (!Array.isArray(convList) || convList.length === 0) {
        // 会话列表偶发空返回时，保留本地已渲染收藏，避免列表被清空后再重建导致重排。
        logTopicBookmarkState('refresh skipped: empty conversation list');
        return;
      }

      const list: TopicBookmarkItem[] = [];
      const sdkRawKeys = new Set<string>();
      const nowTs = Date.now();

      for (const [key, ts] of Array.from(pendingUnbookmarkKeysRef.current.entries())) {
        if (nowTs - ts > UNBOOKMARK_SYNC_GRACE_MS) {
          pendingUnbookmarkKeysRef.current.delete(key);
        }
      }

      for (const conv of convList) {
        const groupProfile = conv?.groupProfile;
        const isCommunity = groupProfile?.type === 'Community';
        if (!isCommunity) continue;

        const groupID = groupProfile?.groupID;
        if (!groupID) continue;

        const conversationID = conv?.conversationID || `GROUP${groupID}`;
        const ids = await loadTopicBookmarkIdsFromConversation(conversationID);
        if (!ids || ids.size === 0) continue;

        for (const messageId of ids) {
          const key = buildTopicBookmarkKey(groupID, messageId);
          sdkRawKeys.add(key);

          const removedAt = pendingUnbookmarkKeysRef.current.get(key);
          if (typeof removedAt === 'number' && nowTs - removedAt <= UNBOOKMARK_SYNC_GRACE_MS) {
            continue;
          }

          list.push({
            groupID,
            groupName: groupProfile?.name || '话题论坛',
            groupAvatarUrl: groupProfile?.avatar || groupProfile?.faceUrl,
            messageId,
            title: '话题',
            preview: '',
            time: undefined,
          });
        }
      }

      // 注意：不要在这里因为 SDK 读取不到就立刻清除 pending，
      // 否则会放行后续“同步回调”把刚取消的收藏重新加回列表。

      // 收集 SDK 中仍然存在的社群 groupID（用于判断社群是否已解散）
      const existingGroupIds = new Set<string>();
      for (const conv of convList) {
        const gp = conv?.groupProfile;
        if (gp?.type === 'Community' && gp?.groupID) {
          existingGroupIds.add(gp.groupID);
        }
      }

      setTopicBookmarks((prev) => {
        const prevMap = new Map<string, TopicBookmarkItem>();
        prev.forEach((item) => {
          prevMap.set(buildTopicBookmarkKey(item.groupID, item.messageId), item);
        });

        const sdkKeys = new Set<string>();
        const sdkMergedMap = new Map<string, TopicBookmarkItem>();
        list.forEach((item) => {
          const key = buildTopicBookmarkKey(item.groupID, item.messageId);
          sdkKeys.add(key);
          const existed = prevMap.get(key);
          const mergedItem = !existed ? item : {
            ...item,
            title: existed.title || item.title,
            preview: existed.preview || item.preview,
            time: existed.time || item.time,
          };
          sdkMergedMap.set(key, mergedItem);
        });

        // 保持已存在收藏项的相对顺序，避免“先在顶部出现，再跳位”
        // （SDK 回刷时 list 顺序可能与本地即时插入顺序不同）。
        const merged: TopicBookmarkItem[] = [];
        for (const item of prev) {
          const key = buildTopicBookmarkKey(item.groupID, item.messageId);
          const sdkItem = sdkMergedMap.get(key);
          if (sdkItem) {
            merged.push(sdkItem);
            sdkMergedMap.delete(key);
          }
        }

        const newcomers: TopicBookmarkItem[] = [];
        for (const item of list) {
          const key = buildTopicBookmarkKey(item.groupID, item.messageId);
          const sdkItem = sdkMergedMap.get(key);
          if (!sdkItem) continue;
          newcomers.push(sdkItem);
          sdkMergedMap.delete(key);
        }

        // 默认规则：新出现的收藏入口置顶。
        if (newcomers.length > 0) {
          merged.unshift(...newcomers);
        }

        // 保留本地已有但 SDK 尚未同步的收藏条目（异步写入可能还未完成），
        // 但如果对应社群已不存在（被解散/退出），则不保留。
        for (const item of prev) {
          const key = buildTopicBookmarkKey(item.groupID, item.messageId);
          const isPendingUnbookmark = pendingUnbookmarkKeysRef.current.has(key);
          if (!isPendingUnbookmark && !sdkKeys.has(key) && item.groupID && existingGroupIds.has(item.groupID)) {
            merged.push(item);
          }
        }

        console.log('[TopicBookmarks] refresh merge result', {
          prevKeys: prev.map((item) => buildTopicBookmarkKey(item.groupID, item.messageId)),
          sdkKeys: Array.from(sdkKeys),
          sdkRawKeys: Array.from(sdkRawKeys),
          mergedKeys: merged.map((item) => buildTopicBookmarkKey(item.groupID, item.messageId)),
          pendingUnbookmarkKeys: Array.from(pendingUnbookmarkKeysRef.current.keys()),
        });

        return merged;
      });
    } catch {
      // 会话列表拉取失败时，不阻塞主流程，也不清空本地收藏（避免抖动/重排）
      logTopicBookmarkState('refresh failed');
      return;
    }
  };

  const { setActiveConversation, activeConversation } = useConversationListState();

  const topicHeaderPreviewText = useMemo(() => {
    if (!currentTopicBookmark) return '';
    const title = (currentTopicBookmark.title || '').trim();
    if (!title) return '话题';
    const maybeStripSender = title.replace(/^[^：:]{1,24}[：:]\s*/, '');
    return maybeStripSender || title;
  }, [currentTopicBookmark]);

  const shouldUseTopicHeader = Boolean(showCommunityView && currentTopicBookmark && currentCommunity);
  const showCommunityFeatureRail = Boolean(showCommunityView && currentCommunity && !currentTopicBookmark);

  const handleBackToCommunityConversation = () => {
    if (!currentCommunity?.groupID) return;
    setCurrentTopicBookmark(null);
    setOpenCommunityCommentDetailMessageId(null);
    setCommunityDetailState({ messageId: null, bookmarked: false });
    setShowCommunityView(true);
    setActiveConversation(`GROUP${currentCommunity.groupID}`);
  };

  const handleTopicHeaderShare = () => {
    const messageId = currentTopicBookmark?.messageId;
    if (!messageId) return;
    setTopicHeaderAction({
      type: 'share',
      messageId,
      nonce: Date.now(),
    });
  };

  const handleTopicHeaderUnbookmark = () => {
    const messageId = currentTopicBookmark?.messageId;
    if (!messageId) return;
    setTopicHeaderAction({
      type: 'unbookmark',
      messageId,
      nonce: Date.now(),
    });
  };

  const handleTopicHeaderActionHandled = (nonce: number) => {
    if (handledTopicHeaderActionNonceRef.current === nonce) return;
    handledTopicHeaderActionNonceRef.current = nonce;
    setTopicHeaderAction((prev) => (prev?.nonce === nonce ? null : prev));
  };

  const handleCommentDetailHeaderAction = (type: 'share' | 'bookmark' | 'close') => {
    const messageId = communityDetailState.messageId;
    if (!messageId) return;
    setCommentDetailHeaderAction({
      type,
      messageId,
      nonce: Date.now(),
    });
    if (type === 'close') {
      // 关闭详情后返回社群帖子流，因此先清理外层“外部打开详情”的标记。
      setOpenCommunityCommentDetailMessageId(null);
    }
  };

  const handleCommentDetailHeaderActionHandled = (nonce: number) => {
    if (handledCommentDetailHeaderActionNonceRef.current === nonce) return;
    handledCommentDetailHeaderActionNonceRef.current = nonce;
    setCommentDetailHeaderAction((prev) => (prev?.nonce === nonce ? null : prev));
  };

  // 初始化默认会话
  useEffect(() => {
    if (status === LoginStatus.SUCCESS) {
      const userID = 'administrator';
      const conversationID = `C2C${userID}`;
      setActiveConversation(conversationID);
    }
  }, [status, setActiveConversation]);

  // 登录成功后恢复“话题收藏入口”（避免刷新后左侧入口丢失）
  useEffect(() => {
    if (status !== LoginStatus.SUCCESS) return;
    if (!currentUserId) return;

    refreshTopicBookmarksFromSDK();

    // 监听群/会话列表变化：当社群被解散/退出后，及时清理左侧残留的话题入口
    const chat: any = (TUIChatEngine as any).chat;
    const ENGINE: any = TUIChatEngine as any;

    let refreshTimer: any = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refreshTopicBookmarksFromSDK();
      }, 300);
    };

    // 注意：SDK 的 GROUP_LIST_UPDATED / CONVERSATION_LIST_UPDATED 事件携带的是增量数据，
    // 不能当作全量列表来过滤 topicBookmarks，否则会误删仍然有效的收藏条目。
    // 只通过 scheduleRefresh 做全量刷新来清理已解散/退出的社群收藏。
    const handleGroupListUpdated = () => {
      scheduleRefresh();
    };

    const handleConversationListUpdated = () => {
      scheduleRefresh();
    };

    if (chat?.on && ENGINE?.EVENT?.GROUP_LIST_UPDATED) {
      chat.on(ENGINE.EVENT.GROUP_LIST_UPDATED, handleGroupListUpdated);
    }
    if (chat?.on && ENGINE?.EVENT?.CONVERSATION_LIST_UPDATED) {
      chat.on(ENGINE.EVENT.CONVERSATION_LIST_UPDATED, handleConversationListUpdated);
    }

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (chat?.off && ENGINE?.EVENT?.GROUP_LIST_UPDATED) {
        chat.off(ENGINE.EVENT.GROUP_LIST_UPDATED, handleGroupListUpdated);
      }
      if (chat?.off && ENGINE?.EVENT?.CONVERSATION_LIST_UPDATED) {
        chat.off(ENGINE.EVENT.CONVERSATION_LIST_UPDATED, handleConversationListUpdated);
      }
    };
  }, [status, currentUserId]);

  // 切换会话时自动关闭侧边栏
  useLayoutEffect(() => {
    setIsChatSettingShow(false);
    setIsSearchInChatShow(false);
  }, [activeConversation?.conversationID]);

  // 自定义会话预览组件，用于检测社群类型
  const CustomConversationPreview: React.FC<ConversationPreviewProps> = (props) => {
    const { conversation } = props;

    // 检查是否是社群类型的群组
    const groupProfile = (conversation as any)?.groupProfile;
    const isCommunity = groupProfile?.type === 'Community';
    const groupAvatarUrl = groupProfile?.avatar || groupProfile?.faceUrl;

    const sdkLastMessageAbstractRaw = conversation?.lastMessage?.messageForShow || '';
    // 新建群聊但尚无人发言时，SDK 可能会返回类似"[Custom Messages]"的占位摘要。
    // 流式消息(TIMCustomElem)的 messageForShow 可能返回 "null" 字面量。
    // 这类摘要没有业务价值，统一视为空摘要，再尝试从 payload 中提取真实文本。
    const sdkLastMessageAbstract = (() => {
      const t = String(sdkLastMessageAbstractRaw || '').trim();
      if (!t || t === 'null') return '';
      if (/^\[(Custom Message|Custom Messages|自定义消息)\]$/i.test(t)) return '';
      if (/^(Custom Message|Custom Messages|自定义消息)$/i.test(t)) return '';
      return t;
    })();
    const sdkLastMessageTimeRaw = conversation?.lastMessage?.lastTime;
    const sdkLastMessageTime = sdkLastMessageTimeRaw ? new Date(Number(sdkLastMessageTimeRaw) * 1000) : null;

    const isGroupConversation = (conversation as any)?.type === TUIChatEngine.TYPES.CONV_GROUP;
    const lastMessage = (conversation as any)?.lastMessage;

    // 当 messageForShow 为空时（流式消息 TIMCustomElem），尝试从 payload 提取文本作为预览
    const streamFallbackAbstract = (() => {
      if (sdkLastMessageAbstract) return sdkLastMessageAbstract;
      if (!lastMessage) return '';
      try {
        const payload = lastMessage?.payload;
        if (!payload?.data) return '';
        const data = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;
        // 流式消息 chatbotPlugin=1，文本在 chunks 数组中
        if (data?.chatbotPlugin === 1 && Array.isArray(data?.chunks)) {
          const fullText = data.chunks.join('');
          // 截取前 30 个字符作为预览
          return fullText.length > 30 ? fullText.slice(0, 30) + '...' : fullText;
        }
        // 内置 LLM 消息不显示
        if (data?.chatbotPlugin === 2) return '';
      } catch {
        // 解析失败就跳过
      }
      return '';
    })();

    const getGroupSpeakerPrefix = () => {
      // 群聊摘要统一展示“发言人：内容”，社群/话题入口的摘要由其他逻辑生成，这里只处理标准群聊
      if (!isGroupConversation) return '';
      if (!lastMessage) return '';
      const fromAccount = lastMessage?.fromAccount || '';
      if (!fromAccount) return '';
      if (fromAccount === currentUserId) return '我：';
      const speaker = lastMessage?.nameCard || lastMessage?.nick || fromAccount;
      return speaker ? `${speaker}：` : '';
    };

    const communityKey = groupProfile?.groupID;
    const communitySummary = communityKey ? communityConversationSummary[communityKey] : undefined;
    const displayAbstract = isCommunity
      ? (communitySummary?.lastMessageAbstract || '')
      : (isGroupConversation
        ? `${getGroupSpeakerPrefix()}${streamFallbackAbstract || ''}`
        : streamFallbackAbstract);
    const displayTime = isCommunity
      ? (communitySummary?.lastMessageTime || null)
      : sdkLastMessageTime;

    const shouldHide = !displayAbstract;
    const displayTimeText = !shouldHide && displayTime
      ? new Date(displayTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <div
        onClick={() => {
          if (isCommunity) {
            setCurrentCommunity({
              groupID: groupProfile.groupID,
              groupName: groupProfile.name || '话题论坛',
              groupAvatarUrl,
            });
            setShowCommunityView(true);
            setOpenCommunityCommentDetailMessageId(null);
            setCurrentTopicBookmark(null);
            setCommunityDetailState({ messageId: null, bookmarked: false });
          } else {
            setShowCommunityView(false);
            setCurrentCommunity(null);
            setOpenCommunityCommentDetailMessageId(null);
            setCurrentTopicBookmark(null);
            setCommunityDetailState({ messageId: null, bookmarked: false });
          }
          setActiveConversation(conversation?.conversationID);
        }}
        style={{ cursor: 'pointer' }}
      >
        <ConversationPreview
          {...props}
          LastMessageAbstract={shouldHide ? '' : (
            <div className="uikit-conversationPreview__abstract">
              {renderTextWithTUIEmoji(displayAbstract || '')}
            </div>
          )}
          LastMessageTimestamp={displayTimeText ? (
            <div className="uikit-conversationPreview__time">{displayTimeText}</div>
          ) : ''}
        />
      </div>
    );
  };

  const CustomConversationSearch = useMemo<React.FC>(() => {
    const StableConversationSearch: React.FC = () => {
      return (
        <div className="conversation-list-search">
          <label className="conversation-list-search-box" aria-label="搜索会话">
            <IconSearch className="conversation-list-search-icon" size="16px" />
            <input
              className="conversation-list-search-input"
              type="text"
              value={conversationSearchKeywordRef.current}
              onChange={(event) => {
                // 这里需要保持组件类型稳定，否则每次 setState 后搜索框会被重新挂载，焦点会立刻中断。
                setConversationSearchKeyword(event.target.value);
              }}
              placeholder="搜索"
            />
          </label>
        </div>
      );
    };

    return StableConversationSearch;
  }, []);

  const filterConversationList = (conversationList: any[]) => {
    return filterConversationListByKeyword(conversationList, conversationSearchKeyword);
  };

  const filteredTopicBookmarks = filterTopicBookmarksByKeyword(topicBookmarks, conversationSearchKeyword);

  const CustomConversationListContent: React.FC<any> = (props) => {
    const {
      children,
      empty = false,
      loading = false,
      error = false,
      PlaceholderEmptyList,
      PlaceholderLoading,
      PlaceholderLoadError,
      className,
      style,
    } = props;

    const hasVisibleTopicBookmarks = filteredTopicBookmarks.length > 0;
    let content;
    if (error) {
      content = PlaceholderLoadError;
    } else if (loading) {
      content = PlaceholderLoading;
    } else if (empty && !hasVisibleTopicBookmarks) {
      content = PlaceholderEmptyList;
    } else {
      content = (
        <>
          {filteredTopicBookmarks.map((t) => (
            <div
              key={`${t.groupID || ''}:${t.messageId}`}
              className="topic-bookmark-wrapper"
              onClick={() => {
                if (!t.groupID) return;
                setCurrentCommunity({
                  groupID: t.groupID,
                  groupName: t.groupName,
                  groupAvatarUrl: t.groupAvatarUrl,
                });
                setShowCommunityView(true);
                setOpenCommunityCommentDetailMessageId(t.messageId);
                setCurrentTopicBookmark(t);
                setCommunityDetailState({ messageId: t.messageId, bookmarked: true });
                setActiveConversation(`GROUP${t.groupID}`);
              }}
              style={{ cursor: 'pointer' }}
            >
              <ConversationPreview
                conversation={{
                  conversationID: `TOPIC:${t.messageId}`,
                  type: 'TOPIC',
                  groupProfile: {
                    avatar: t.groupAvatarUrl,
                    name: t.title,
                  },
                  getShowName: () => t.title,
                  // 话题入口属于“模拟会话”，但 ConversationPreview 内部会读取以下字段
                  // 这里补齐最小字段，避免运行时出现 undefined.includes / 读取 draftText 等异常
                  markList: [],
                  unreadCount: 0,
                  isMuted: false,
                  draftText: '',
                  operationType: 0,
                  lastMessage: null,
                } as any}
                LastMessageAbstract={
                  <div className="uikit-conversationPreview__abstract">{t.preview}</div>
                }
                LastMessageTimestamp={
                  <div className="uikit-conversationPreview__time">
                    {t.time ? new Date(t.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                }
                Avatar={() => (
                  <div className="topic-bookmark-avatar">
                    {t.groupAvatarUrl ? (
                      <img className="topic-bookmark-avatar-img" src={t.groupAvatarUrl} alt="" />
                    ) : (
                      <div className="topic-bookmark-avatar-fallback"></div>
                    )}
                    <div className="topic-bookmark-avatar-hash">#</div>
                  </div>
                )}
              />
            </div>
          ))}
          {children}
        </>
      );
    }

    return (
      <div className={className} style={style}>
        {content}
      </div>
    );
  };

  const shouldShowCommentDetailHeaderActions = Boolean(
    showCommunityView &&
    currentCommunity &&
    !currentTopicBookmark &&
    communityDetailState.messageId,
  );

  const commentDetailHeaderActions = (
    <div className="topic-header-actions">
      <button
        className="icon-button"
        onClick={() => handleCommentDetailHeaderAction('share')}
        title="转发"
        type="button"
      >
        <FiShare2 size={18} />
      </button>
      <button
        className={`icon-button ${communityDetailState.bookmarked ? 'topic-header-bookmark-active' : ''}`}
        onClick={() => handleCommentDetailHeaderAction('bookmark')}
        title={communityDetailState.bookmarked ? '取消收藏' : '收藏'}
        type="button"
      >
        {communityDetailState.bookmarked ? (
          <FiBookmark className="topic-header-bookmark-icon" size={18} />
        ) : (
          <FiBookmark size={18} />
        )}
      </button>
      <button
        className="icon-button"
        onClick={() => handleCommentDetailHeaderAction('close')}
        title="关闭"
        type="button"
      >
        <FiX size={18} />
      </button>
    </div>
  );

  if (status === LoginStatus.ERROR) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div className="loading-text">{texts.error}</div>
      </div>
    );
  }

  if (status !== LoginStatus.SUCCESS) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div className="loading-text">{texts.loading}</div>
      </div>
    );
  }

  return (
    <div className={`chat-layout ${isDark ? 'dark' : ''}`}>
      {/* 左侧导航 */}
      <SideTab activeTab={activeTab} onTabChange={setActiveTab} />

      {/* 中间列表 会话列表 - 联系人列表 */}
      <div className="conversation-list-panel">
        {activeTab === 'conversations' ? (
          <>
            <ConversationList
              List={CustomConversationListContent}
              ConversationSearch={CustomConversationSearch}
              Preview={(props: ConversationPreviewProps) => (
                <CustomConversationPreview {...props} />
              )}
              ConversationCreate={CustomConversationCreate as any}
              filter={filterConversationList}
              onBeforeCreateConversation={(params) => {
              // 在创建群组前，根据群组类型自动生成头像
              // 说明：TUIKit 内置创建群与自定义创建群，参数结构可能不同，这里做兼容兜底。
              // - 内置创建群：可能会传入 { type: 'GROUP', name, groupType, ... }
              // - SDK CreateGroupParams：{ name, type: 'Private'/'Community'/..., avatar?, memberList? }
              if (!params || typeof params !== 'object') return params;
              const createParams = params as any;

              const groupName = String(createParams.name || '').trim();
              if (!groupName) return params;

              // 兼容两种入参：优先读 groupType，其次从 type 推断
              const ENGINE: any = TUIChatEngine as any;
              let groupType: GroupType | undefined = createParams.groupType as GroupType | undefined;
              if (!groupType) {
                if (createParams.type === ENGINE?.TYPES?.GRP_WORK) groupType = 'Work';
                if (createParams.type === ENGINE?.TYPES?.GRP_COMMUNITY) groupType = 'Community';
                if (createParams.type === ENGINE?.TYPES?.GRP_PUBLIC) groupType = 'Public';
                if (createParams.type === ENGINE?.TYPES?.GRP_MEETING) groupType = 'Meeting';
                if (createParams.type === ENGINE?.TYPES?.GRP_AVCHATROOM) groupType = 'AVChatRoom';
              }
              const finalGroupType: GroupType = groupType || 'Public';

              const avatarUrl = generateGroupAvatarByType(groupName, finalGroupType);
              return {
                ...createParams,
                // SDK CreateGroupParams 使用 avatar 字段
                avatar: createParams.avatar || avatarUrl,
                // 部分场景（或旧代码）使用 faceUrl，保留兼容
                faceUrl: createParams.faceUrl || avatarUrl,
              };
              }}
            />
          </>
        ) : (
          <ContactList className="contact-list" />
        )}
      </div>

      {/* 右侧聊天 */}
      {activeTab === 'conversations' && (
        <Chat
          className="chat-content-panel"
          PlaceholderEmpty={
            <div className="empty-placeholder">
              <div className="empty-icon">💬</div>
              <div className="empty-title">{texts.emptyTitle}</div>
              <div className="empty-subtitle">{texts.emptySub}</div>
            </div>
          }
        >
          {!showCommunityFeatureRail && (
            <ChatHeader
              className={shouldUseTopicHeader ? 'chat-header--topic-bookmark' : undefined}
              title={shouldUseTopicHeader ? '' : undefined}
              Avatar={shouldUseTopicHeader ? (() => null) : undefined}
              ChatHeaderLeft={shouldUseTopicHeader ? (
                <div className="topic-chat-header-left">
                  <div className="topic-chat-header-avatar" aria-hidden="true">
                    {currentTopicBookmark?.groupAvatarUrl ? (
                      <img src={currentTopicBookmark.groupAvatarUrl} alt="" />
                    ) : (
                      <div className="topic-chat-header-avatar-fallback"></div>
                    )}
                  </div>
                  <div className="topic-chat-header-text">
                    <div className="topic-chat-header-preview">{topicHeaderPreviewText}</div>
                    <button className="topic-chat-header-from" onClick={handleBackToCommunityConversation} type="button">
                      来自：{currentCommunity?.groupName || ''}
                    </button>
                  </div>
                </div>
              ) : undefined}
              ChatHeaderRight={shouldUseTopicHeader ? (
                <div className="topic-header-actions">
                  <button className="icon-button" onClick={handleTopicHeaderShare} title="转发" type="button">
                    <FiShare2 size={18} />
                  </button>
                  <button
                    className="icon-button topic-header-bookmark-active"
                    onClick={handleTopicHeaderUnbookmark}
                    title="取消收藏"
                    type="button"
                  >
                    <FiBookmark className="topic-header-bookmark-icon" size={18} />
                  </button>
                </div>
              ) : shouldShowCommentDetailHeaderActions ? (
                commentDetailHeaderActions
              ) : (
                <div className="header-actions">
                  <button
                    className="icon-button"
                    onClick={() => setIsSearchInChatShow(!isSearchInChatShow)}
                  >
                    <IconSearch size="20px" />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setIsChatSettingShow(!isChatSettingShow)}
                  >
                    <IconBulletpoint size="20px" />
                  </button>
                </div>
              )}
            />
          )}

          {showCommunityView && currentCommunity ? (
            showCommunityFeatureRail ? (
              <div className="community-view-layout">
                <div className="community-view-main">
                  <ChatHeader
                    className={shouldUseTopicHeader ? 'chat-header--topic-bookmark' : undefined}
                    title={shouldUseTopicHeader ? '' : undefined}
                    Avatar={shouldUseTopicHeader ? (() => null) : undefined}
                    ChatHeaderLeft={shouldUseTopicHeader ? (
                      <div className="topic-chat-header-left">
                        <div className="topic-chat-header-avatar" aria-hidden="true">
                          {currentTopicBookmark?.groupAvatarUrl ? (
                            <img src={currentTopicBookmark.groupAvatarUrl} alt="" />
                          ) : (
                            <div className="topic-chat-header-avatar-fallback"></div>
                          )}
                        </div>
                        <div className="topic-chat-header-text">
                          <div className="topic-chat-header-preview">{topicHeaderPreviewText}</div>
                          <button className="topic-chat-header-from" onClick={handleBackToCommunityConversation} type="button">
                            来自：{currentCommunity?.groupName || ''}
                          </button>
                        </div>
                      </div>
                    ) : undefined}
                    ChatHeaderRight={shouldShowCommentDetailHeaderActions ? commentDetailHeaderActions : undefined}
                  />
                  <CommunityChatView
                    embedded={true}
                    groupID={currentCommunity.groupID}
                    groupName={currentCommunity.groupName}
                    groupAvatarUrl={currentCommunity.groupAvatarUrl}
                    hideCommunityHeader={Boolean(currentTopicBookmark)}
                    hideCommunityTabs={Boolean(currentTopicBookmark)}
                    openCommentDetailMessageId={openCommunityCommentDetailMessageId}
                    topicHeaderAction={topicHeaderAction}
                    onTopicHeaderActionHandled={handleTopicHeaderActionHandled}
                    commentDetailHeaderAction={commentDetailHeaderAction}
                    onCommentDetailHeaderActionHandled={handleCommentDetailHeaderActionHandled}
                    onCommentDetailStateChange={setCommunityDetailState}
                    forcedUnbookmarkMessageIds={forcedUnbookmarkMessageIds}
                    onCommunitySummaryChange={(summary) => {
                      if (!summary.groupID) return;
                      setCommunityConversationSummary((prev) => ({
                        ...prev,
                        [summary.groupID as string]: {
                          lastMessageAbstract: summary.lastMessageAbstract,
                          lastMessageTime: summary.lastMessageTime,
                        },
                      }));
                    }}
                    onTopicBookmarkChange={(topic, messageId, source) => {
                      console.log('[TopicBookmarks] onTopicBookmarkChange(layout-with-rail)', {
                        topicKey: topic ? buildTopicBookmarkKey(topic.groupID, topic.messageId) : null,
                        messageId,
                        source,
                        currentCommunity: currentCommunity?.groupID || null,
                        pendingUnbookmarkKeys: Array.from(pendingUnbookmarkKeysRef.current.keys()),
                      });
                      setOpenCommunityCommentDetailMessageId(null);
                      setTopicBookmarks((prev) => {
                        if (!topic) {
                          if (!messageId) return prev;
                          const removedKey = buildTopicBookmarkKey(currentCommunity.groupID, messageId);
                          pendingUnbookmarkKeysRef.current.set(removedKey, Date.now());
                          setForcedUnbookmarkKeys((prevForced) => ({
                            ...prevForced,
                            [removedKey]: Date.now(),
                          }));
                          const next = prev.filter((t) => buildTopicBookmarkKey(t.groupID, t.messageId) !== buildTopicBookmarkKey(currentCommunity.groupID, messageId));
                          return next;
                        }

                        const key = buildTopicBookmarkKey(topic.groupID, topic.messageId);
                        const forcedTs = forcedUnbookmarkKeys[key];
                        if (source === 'sync' && typeof forcedTs === 'number' && Date.now() - forcedTs <= FORCED_UNBOOKMARK_TTL_MS) {
                          return prev;
                        }
                        if (pendingUnbookmarkKeysRef.current.has(key) && source === 'sync') {
                          // 刚取消收藏后，忽略同步回调的回刷更新，避免条目“复活”。
                          return prev;
                        }
                        pendingUnbookmarkKeysRef.current.delete(key);
                        if (source === 'toggle') {
                          setForcedUnbookmarkKeys((prevForced) => {
                            if (!(key in prevForced)) return prevForced;
                            const nextForced = { ...prevForced };
                            delete nextForced[key];
                            return nextForced;
                          });
                        }
                        const exists = prev.some((t) => buildTopicBookmarkKey(t.groupID, t.messageId) === key);
                        if (exists) {
                          const next = prev.map((t) => (buildTopicBookmarkKey(t.groupID, t.messageId) === key ? topic : t));
                          return next;
                        }
                        const next = [topic, ...prev];
                        return next;
                      });

                      if (topic && currentTopicBookmark?.messageId === topic.messageId) {
                        setCurrentTopicBookmark(topic);
                      }

                      if (!topic && messageId && currentTopicBookmark?.messageId === messageId) {
                        setCurrentTopicBookmark(null);
                        setOpenCommunityCommentDetailMessageId(null);
                      }
                    }}
                  />
                </div>

                <div className="community-feature-rail">
                  <div className="community-feature-rail-inner">
                    <button
                      className="icon-button community-feature-btn"
                      onClick={() => setIsSearchInChatShow(!isSearchInChatShow)}
                      title="搜索"
                      type="button"
                    >
                      <IconSearch size="20px" />
                    </button>
                    <button
                      className="icon-button community-feature-btn"
                      onClick={() => setIsChatSettingShow(!isChatSettingShow)}
                      title="设置"
                      type="button"
                    >
                      <IconBulletpoint size="20px" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <CommunityChatView
                embedded={true}
                groupID={currentCommunity.groupID}
                groupName={currentCommunity.groupName}
                groupAvatarUrl={currentCommunity.groupAvatarUrl}
                hideCommunityHeader={Boolean(currentTopicBookmark)}
                hideCommunityTabs={Boolean(currentTopicBookmark)}
                openCommentDetailMessageId={openCommunityCommentDetailMessageId}
                topicHeaderAction={topicHeaderAction}
                onTopicHeaderActionHandled={handleTopicHeaderActionHandled}
                commentDetailHeaderAction={commentDetailHeaderAction}
                onCommentDetailHeaderActionHandled={handleCommentDetailHeaderActionHandled}
                onCommentDetailStateChange={setCommunityDetailState}
                forcedUnbookmarkMessageIds={forcedUnbookmarkMessageIds}
                onCommunitySummaryChange={(summary) => {
                  if (!summary.groupID) return;
                  setCommunityConversationSummary((prev) => ({
                    ...prev,
                    [summary.groupID as string]: {
                      lastMessageAbstract: summary.lastMessageAbstract,
                      lastMessageTime: summary.lastMessageTime,
                    },
                  }));
                }}
                onTopicBookmarkChange={(topic, messageId, source) => {
                  console.log('[TopicBookmarks] onTopicBookmarkChange(layout-plain)', {
                    topicKey: topic ? buildTopicBookmarkKey(topic.groupID, topic.messageId) : null,
                    messageId,
                    source,
                    currentCommunity: currentCommunity?.groupID || null,
                    pendingUnbookmarkKeys: Array.from(pendingUnbookmarkKeysRef.current.keys()),
                  });
                  setTopicBookmarks((prev) => {
                    if (!topic) {
                      if (!messageId) return prev;
                      const removedKey = buildTopicBookmarkKey(currentCommunity.groupID, messageId);
                      pendingUnbookmarkKeysRef.current.set(removedKey, Date.now());
                      setForcedUnbookmarkKeys((prevForced) => ({
                        ...prevForced,
                        [removedKey]: Date.now(),
                      }));
                      const next = prev.filter((t) => buildTopicBookmarkKey(t.groupID, t.messageId) !== buildTopicBookmarkKey(currentCommunity.groupID, messageId));
                      return next;
                    }

                    const key = buildTopicBookmarkKey(topic.groupID, topic.messageId);
                    const forcedTs = forcedUnbookmarkKeys[key];
                    if (source === 'sync' && typeof forcedTs === 'number' && Date.now() - forcedTs <= FORCED_UNBOOKMARK_TTL_MS) {
                      return prev;
                    }
                    if (pendingUnbookmarkKeysRef.current.has(key) && source === 'sync') {
                      // 刚取消收藏后，忽略同步回调的回刷更新，避免条目“复活”。
                      return prev;
                    }
                    pendingUnbookmarkKeysRef.current.delete(key);
                    if (source === 'toggle') {
                      setForcedUnbookmarkKeys((prevForced) => {
                        if (!(key in prevForced)) return prevForced;
                        const nextForced = { ...prevForced };
                        delete nextForced[key];
                        return nextForced;
                      });
                    }
                    const exists = prev.some((t) => buildTopicBookmarkKey(t.groupID, t.messageId) === key);
                    if (exists) {
                      const next = prev.map((t) => (buildTopicBookmarkKey(t.groupID, t.messageId) === key ? topic : t));
                      return next;
                    }
                    const next = [topic, ...prev];
                    return next;
                  });

                  if (topic && currentTopicBookmark?.messageId === topic.messageId) {
                    setCurrentTopicBookmark(topic);
                  }

                  if (!topic && messageId && currentTopicBookmark?.messageId === messageId) {
                    setCurrentTopicBookmark(null);
                    setOpenCommunityCommentDetailMessageId(null);
                  }
                }}
              />
            )
          ) : (
            <>
              <MessageList Message={StreamMessage} />
              <MessageInput />
            </>
          )}

          {/* 聊天设置侧边栏 */}
          {isChatSettingShow && (
            <div className="chat-sidebar">
              <div className="chat-sidebar-header">
                <span className="chat-sidebar-title">设置</span>
                <button
                  className="icon-button"
                  onClick={() => setIsChatSettingShow(false)}
                >
                  ✕
                </button>
              </div>
              <ChatSetting />
            </div>
          )}

          {/* 会话内搜索侧边栏 */}
          {isSearchInChatShow && (
            <div className="chat-sidebar">
              <div className="chat-sidebar-header">
                <span className="chat-sidebar-title">群搜索</span>
                <button
                  className="icon-button"
                  onClick={() => setIsSearchInChatShow(false)}
                >
                  ✕
                </button>
              </div>
              <Search variant={VariantType.EMBEDDED} />
            </div>
          )}
        </Chat>
      )}

      {/* 联系人详情 */}
      {activeTab === 'contacts' && (
        <div className="contact-container">
          <ContactInfo
            className="contact-detail-panel"
            onSendMessage={() => setActiveTab('conversations')}
            onEnterGroup={() => setActiveTab('conversations')}
          />
        </div>
      )}

    </div>
  );
}

// 多用户切换栏组件
interface UserSwitchBarProps {
  users: UserEntry[];
  currentUserID: string;
}

function UserSwitchBar({ users, currentUserID }: UserSwitchBarProps) {
  // 点击切换用户：在新标签页打开（保留当前页面不变）
  const handleSwitch = (userID: string) => {
    if (userID === currentUserID) return;
    const url = new URL(window.location.href);
    url.searchParams.set('userID', userID);
    window.open(url.toString(), `_chat_${userID}`);
  };

  return (
    <div className="user-switch-bar">
      <span className="user-switch-label">多人模拟</span>
      <div className="user-switch-list">
        {users.map((u) => (
          <button
            key={u.userID}
            className={`user-switch-btn ${u.userID === currentUserID ? 'active' : ''}`}
            onClick={() => handleSwitch(u.userID)}
            title={u.userID === currentUserID ? '当前登录用户' : `点击在新标签页以 ${u.userID} 身份登录`}
          >
            {u.userID}
          </button>
        ))}
      </div>
      <span className="user-switch-hint">当前: {currentUserID}</span>
    </div>
  );
}

// SideTab 组件：左侧导航栏
interface SideTabProps {
  activeTab: 'conversations' | 'contacts';
  onTabChange: (tab: 'conversations' | 'contacts') => void;
}

function SideTab({ activeTab, onTabChange }: SideTabProps) {
  const { theme } = useUIKit();
  const { loginUserInfo } = useLoginState();
  const isDark = theme === 'dark';

  return (
    <div className={`side-tab ${isDark ? 'dark' : ''}`}>
      {/* 用户头像 */}
      <div className="avatar-wrapper">
        <Avatar src={loginUserInfo?.avatarUrl} />
        <div className="tooltip">
          <div className="tooltip-name">{loginUserInfo?.userName || loginUserInfo?.userId || '未命名'}</div>
          <div className="tooltip-id">ID: {loginUserInfo?.userId}</div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="tabs">
        <div
          className={`tab-item ${activeTab === 'conversations' ? 'active' : ''}`}
          onClick={() => onTabChange('conversations')}
          title="会话"
        >
          <IconChat size="24px" />
        </div>

        <div
          className={`tab-item ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => onTabChange('contacts')}
          title="联系人"
        >
          <IconUsergroup size="24px" />
        </div>
      </div>
    </div>
  );
}

export default App;
