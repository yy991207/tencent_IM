import { useEffect, useLayoutEffect, useState, useMemo } from "react";
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
import type { ConversationPreviewProps } from "@tencentcloud/chat-uikit-react";
import { IconChat, IconUsergroup, IconBulletpoint, IconSearch } from "@tencentcloud/uikit-base-component-react";
import TUIChatEngine from '@tencentcloud/chat-uikit-engine-lite';
import { generateGroupAvatarByType, type GroupType } from './utils/groupAvatar';
import CommunityChatView from './components/CommunityChatView';
import { loadRuntimeConfig, type RuntimeConfig, type UserEntry } from './utils/runtimeConfig';
import React from 'react';
import { emojiBaseUrl, emojiUrlMap } from './utils/tuiEmoji';
import { loadTopicBookmarkIdsFromConversation } from './utils/communityMessageService';
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
  const [activeTab, setActiveTab] = useState<'conversations' | 'contacts'>('conversations');
  const [isChatSettingShow, setIsChatSettingShow] = useState(false);
  const [isSearchInChatShow, setIsSearchInChatShow] = useState(false);
  const [showCommunityView, setShowCommunityView] = useState(false);
  const [currentCommunity, setCurrentCommunity] = useState<{ groupID: string; groupName: string; groupAvatarUrl?: string } | null>(null);
  const [openCommunityCommentDetailMessageId, setOpenCommunityCommentDetailMessageId] = useState<string | null>(null);
  const { loginUserInfo } = useLoginState();
  const [topicBookmarks, setTopicBookmarks] = useState<Array<{
    groupID?: string;
    groupName: string;
    groupAvatarUrl?: string;
    messageId: string;
    title: string;
    preview: string;
    time?: Date;
  }>>([]);

  const [communityConversationSummary, setCommunityConversationSummary] = useState<Record<string, {
    lastMessageAbstract: string;
    lastMessageTime: Date;
  }>>({});
  
  const { language, theme } = useUIKit();

  const isDark = theme === 'dark';

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

  const refreshTopicBookmarksFromSDK = async () => {
    // 说明：话题入口的“收藏关系”存储在对应社群会话的 customData 中（每个会话 256 bytes）。
    // 这里在登录成功后拉取会话列表，汇总出所有社群的收藏 messageId，从而重建左侧 # 入口。
    const engine: any = TUIChatEngine as any;
    try {
      const res = await engine?.TUIConversation?.getConversationList?.();
      const convList: any[] = res?.data?.conversationList || res?.data || [];
      if (!Array.isArray(convList) || convList.length === 0) {
        setTopicBookmarks([]);
        return;
      }

      const list: Array<{
        groupID?: string;
        groupName: string;
        groupAvatarUrl?: string;
        messageId: string;
        title: string;
        preview: string;
        time?: Date;
      }> = [];

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
          list.push({
            groupID,
            groupName: groupProfile?.name || '社群',
            groupAvatarUrl: groupProfile?.avatar || groupProfile?.faceUrl,
            messageId,
            title: '话题',
            preview: '',
            time: undefined,
          });
        }
      }

      setTopicBookmarks(list);
    } catch {
      // 会话列表拉取失败时，不阻塞主流程
      setTopicBookmarks([]);
    }
  };

  const { setActiveConversation, activeConversation } = useConversationListState();

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

    const handleGroupListUpdated = (event: any) => {
      const groupList: any[] = event?.data || [];
      const validGroupIds = new Set(
        (Array.isArray(groupList) ? groupList : [])
          .map((g) => g?.groupID)
          .filter(Boolean),
      );

      setTopicBookmarks((prev) => prev.filter((t) => !t.groupID || validGroupIds.has(t.groupID)));
      scheduleRefresh();
    };

    const handleConversationListUpdated = (event: any) => {
      const convList: any[] = event?.data || [];
      if (Array.isArray(convList) && convList.length > 0) {
        const validCommunityGroupIds = new Set(
          convList
            .map((c) => c?.groupProfile)
            .filter((gp) => gp?.type === 'Community')
            .map((gp) => gp?.groupID)
            .filter(Boolean),
        );
        setTopicBookmarks((prev) => prev.filter((t) => !t.groupID || validCommunityGroupIds.has(t.groupID)));
      }
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
    // 新建群聊但尚无人发言时，SDK 可能会返回类似“[Custom Messages]”的占位摘要。
    // 这类摘要没有业务价值，会干扰用户判断“群里是否有聊天记录”，因此统一视为空摘要。
    const sdkLastMessageAbstract = (() => {
      const t = String(sdkLastMessageAbstractRaw || '').trim();
      if (!t) return '';
      if (/^\[(Custom Message|Custom Messages|自定义消息)\]$/i.test(t)) return '';
      if (/^(Custom Message|Custom Messages|自定义消息)$/i.test(t)) return '';
      return t;
    })();
    const sdkLastMessageTimeRaw = conversation?.lastMessage?.lastTime;
    const sdkLastMessageTime = sdkLastMessageTimeRaw ? new Date(Number(sdkLastMessageTimeRaw) * 1000) : null;

    const isGroupConversation = (conversation as any)?.type === TUIChatEngine.TYPES.CONV_GROUP;
    const lastMessage = (conversation as any)?.lastMessage;

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
        ? `${getGroupSpeakerPrefix()}${sdkLastMessageAbstract || ''}`
        : sdkLastMessageAbstract);
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
              groupName: groupProfile.name || '社群',
              groupAvatarUrl,
            });
            setShowCommunityView(true);
            setOpenCommunityCommentDetailMessageId(null);
          } else {
            setShowCommunityView(false);
            setCurrentCommunity(null);
            setOpenCommunityCommentDetailMessageId(null);
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

    let content;
    if (error) {
      content = PlaceholderLoadError;
    } else if (loading) {
      content = PlaceholderLoading;
    } else if (empty) {
      content = PlaceholderEmptyList;
    } else {
      content = (
        <>
          {topicBookmarks.map((t) => (
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
              Preview={(props: ConversationPreviewProps) => (
                <CustomConversationPreview {...props} />
              )}
              onBeforeCreateConversation={(params) => {
              // 在创建群组前，根据群组类型自动生成头像
              // params 可能是 string 或 CreateGroupParams 类型，需要类型检查
              if (params && typeof params === 'object' && 'type' in params) {
                const createParams = params as any;
                if (createParams.type === 'GROUP' && createParams.name) {
                  const groupType = (createParams.groupType as GroupType) || 'Public';
                  // 根据群组类型和名称生成对应的头像 URL
                  const avatarUrl = generateGroupAvatarByType(createParams.name, groupType);
                  // 返回修改后的参数，添加 faceUrl 字段
                  return {
                    ...createParams,
                    faceUrl: avatarUrl,
                  };
                }
              }
              return params;
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
          <ChatHeader
            ChatHeaderRight={
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
            }
          />

          {showCommunityView && currentCommunity ? (
            <CommunityChatView
              embedded={true}
              groupID={currentCommunity.groupID}
              groupName={currentCommunity.groupName}
              groupAvatarUrl={currentCommunity.groupAvatarUrl}
              openCommentDetailMessageId={openCommunityCommentDetailMessageId}
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
              onTopicBookmarkChange={(topic, messageId) => {
                setOpenCommunityCommentDetailMessageId(null);
                setTopicBookmarks((prev) => {
                  if (!topic) {
                    if (!messageId) return prev;
                    const next = prev.filter((t) => `${t.groupID || ''}:${t.messageId}` !== `${currentCommunity.groupID}:${messageId}`);
                    return next;
                  }

                  const key = `${topic.groupID || ''}:${topic.messageId}`;
                  const exists = prev.some((t) => `${t.groupID || ''}:${t.messageId}` === key);
                  if (exists) {
                    const next = prev.map((t) => (`${t.groupID || ''}:${t.messageId}` === key ? topic : t));
                    return next;
                  }
                  const next = [topic, ...prev];
                  return next;
                });
              }}
            />
          ) : (
            <>
              <MessageList />
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
