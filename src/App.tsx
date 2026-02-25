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
} from "@tencentcloud/chat-uikit-react";
import { IconChat, IconUsergroup, IconBulletpoint, IconSearch } from "@tencentcloud/uikit-base-component-react";
import { generateGroupAvatarByType, type GroupType } from './utils/groupAvatar';
import './App.css';

function App() {
  // 语言支持 en-US(default) / zh-CN / ja-JP / ko-KR / zh-TW
  // 主题支持 light(default) / dark
  return (
    <UIKitProvider theme={'light'} language={'zh-CN'}>
      <ChatApp />
    </UIKitProvider>
  );
}

function ChatApp() {
  const [activeTab, setActiveTab] = useState<'conversations' | 'contacts'>('conversations');
  const [isChatSettingShow, setIsChatSettingShow] = useState(false);
  const [isSearchInChatShow, setIsSearchInChatShow] = useState(false);
  
  const { language, theme } = useUIKit();

  const isDark = theme === 'dark';

  const texts = useMemo(() => 
    language === 'zh-CN'
      ? { emptyTitle: '暂无会话', emptySub: '选择一个会话开始聊天', error: '请检查 SDKAppID, userID, userSig, 通过开发人员工具 (F12) 查看具体的错误信息', loading: '登录中...' }
      : { emptyTitle: 'No conversation', emptySub: 'Select a conversation to start chatting', error: 'Please check the SDKAppID, userID, and userSig. View the specific error information through the developer tools (F12).', loading: 'Logging in...'},
    [language]
  );

  // 鉴权信息配置 - 从 MCP 工具获取的测试凭证
  const { status } = useLoginState({
    SDKAppID: 1600127148, // number 类型
    userID: 'test001',    // string 类型
    userSig: 'eJwtjEEKwjAQAP*yZ6mbENIY8CSeLBZaUXssZC2LWGMTTEX8u9D2ODMwXzgVdfamASzIDGE1MTvqI9940pFCRBRLCu7ees8OrNCIQuZCmblEfhBYkediI6VCNVsaPQ8EVqMyiMuDO7BwLl6HD7UVtbsUr7o3VdOE8bhObkgXXyQ2sg77Upf43MLvDyItMg8_', // string 类型
  });

  const { setActiveConversation, activeConversation } = useConversationListState();

  // 初始化默认会话
  useEffect(() => {
    if (status === LoginStatus.SUCCESS) {
      const userID = 'administrator';
      const conversationID = `C2C${userID}`;
      setActiveConversation(conversationID);
    }
  }, [status, setActiveConversation]);

  // 切换会话时自动关闭侧边栏
  useLayoutEffect(() => {
    setIsChatSettingShow(false);
    setIsSearchInChatShow(false);
  }, [activeConversation?.conversationID]);

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
          <ConversationList
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
          <MessageList />
          <MessageInput />
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
