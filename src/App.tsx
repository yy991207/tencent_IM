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
import { generateGroupAvatarByType, type GroupType } from './utils/groupAvatar';
import CommunityChatView from './components/CommunityChatView';
import { loadRuntimeConfig, type RuntimeConfig } from './utils/runtimeConfig';
import './App.css';

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
    <UIKitProvider theme={'light'} language={'zh-CN'}>
      <ChatApp config={config} />
    </UIKitProvider>
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
    time: Date;
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

  const TOPIC_BOOKMARK_KEY_PREFIX = 'community_topic_bookmarks_';

  const loadTopicBookmarks = (userID: string) => {
    if (!userID) return [];
    try {
      const raw = localStorage.getItem(`${TOPIC_BOOKMARK_KEY_PREFIX}${userID}`);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((t: any) => ({
          ...t,
          time: t?.time ? new Date(t.time) : new Date(),
        }))
        .filter((t: any) => t && t.messageId);
    } catch {
      return [];
    }
  };

  const saveTopicBookmarks = (userID: string, topics: any[]) => {
    if (!userID) return;
    try {
      const serializable = (topics || []).map((t: any) => ({
        ...t,
        time: t?.time ? new Date(t.time).toISOString() : undefined,
      }));
      localStorage.setItem(`${TOPIC_BOOKMARK_KEY_PREFIX}${userID}`, JSON.stringify(serializable));
    } catch {
      // localStorage 不可用时静默忽略
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
    setTopicBookmarks(loadTopicBookmarks(currentUserId));
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

    const sdkLastMessageAbstract = conversation?.lastMessage?.messageForShow || '';
    const sdkLastMessageTimeRaw = conversation?.lastMessage?.lastTime;
    const sdkLastMessageTime = sdkLastMessageTimeRaw ? new Date(Number(sdkLastMessageTimeRaw) * 1000) : null;

    const communityKey = groupProfile?.groupID;
    const communitySummary = communityKey ? communityConversationSummary[communityKey] : undefined;
    const displayAbstract = isCommunity
      ? (communitySummary?.lastMessageAbstract || '')
      : sdkLastMessageAbstract;
    const displayTime = isCommunity
      ? (communitySummary?.lastMessageTime || null)
      : sdkLastMessageTime;

    const shouldHide = !displayAbstract;

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
          LastMessageAbstract={shouldHide ? '' : (displayAbstract || '')}
          LastMessageTimestamp={!shouldHide && displayTime
            ? new Date(displayTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            : ''}
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
            <button
              key={`${t.groupID || ''}:${t.messageId}`}
              type="button"
              className="topic-bookmark-item topic-bookmark-item--inline"
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
            >
              <div className="topic-bookmark-avatar">
                {t.groupAvatarUrl ? (
                  <img className="topic-bookmark-avatar-img" src={t.groupAvatarUrl} alt="" />
                ) : (
                  <div className="topic-bookmark-avatar-fallback"></div>
                )}
                <div className="topic-bookmark-avatar-hash">#</div>
              </div>
              <div className="topic-bookmark-text">
                <div className="topic-bookmark-name">{t.title}</div>
                <div className="topic-bookmark-preview">{t.preview}</div>
              </div>
              <div className="topic-bookmark-time">
                {t.time
                  ? new Date(t.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                  : ''}
              </div>
            </button>
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
                    saveTopicBookmarks(currentUserId, next);
                    return next;
                  }

                  const key = `${topic.groupID || ''}:${topic.messageId}`;
                  const exists = prev.some((t) => `${t.groupID || ''}:${t.messageId}` === key);
                  if (exists) {
                    const next = prev.map((t) => (`${t.groupID || ''}:${t.messageId}` === key ? topic : t));
                    saveTopicBookmarks(currentUserId, next);
                    return next;
                  }
                  const next = [topic, ...prev];
                  saveTopicBookmarks(currentUserId, next);
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
