import { useEffect, useMemo, useState } from 'react';
import { IconAdd, IconClose, IconSearch } from '@tencentcloud/uikit-base-component-react';
import { useContactListState, useConversationListState, useLoginState } from '@tencentcloud/chat-uikit-react';
import type { ConversationCreateProps } from '@tencentcloud/chat-uikit-react';
import TUIChatEngine from '@tencentcloud/chat-uikit-engine-lite';

type GroupTypeKey = 'Work' | 'Community';

function buildDefaultGroupName(currentUserId: string, selected: Array<{ userID: string; nick?: string }>) {
  const names = [
    currentUserId,
    ...selected.map((u) => u.nick || u.userID).filter(Boolean),
  ].filter(Boolean);
  const joined = names.join(',');
  return joined.length >= 15 ? `${joined.slice(0, 12)}...` : joined;
}

export default function CustomConversationCreate(props: ConversationCreateProps) {
  const {
    visible = true,
    className,
    style,
    onChangeCreateModelVisible,
    onBeforeCreateConversation,
    onConversationCreated,
  } = props;

  const { loginUserInfo } = useLoginState();
  const currentUserId = loginUserInfo?.userId || '';

  const { friendList } = useContactListState() as any;
  const { createGroupConversation } = useConversationListState() as any;

  const [open, setOpen] = useState(false);
  const [groupTypeKey, setGroupTypeKey] = useState<GroupTypeKey>('Work');
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    onChangeCreateModelVisible?.(open);
  }, [open, onChangeCreateModelVisible]);

  const reset = () => {
    setGroupTypeKey('Work');
    setGroupName('');
    setSearch('');
    setSelected([]);
    setSubmitting(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const engine: any = TUIChatEngine as any;
  const groupTypeValue = groupTypeKey === 'Work'
    ? engine?.TYPES?.GRP_WORK
    : engine?.TYPES?.GRP_COMMUNITY;

  const allFriends: any[] = useMemo(() => {
    // friendList 结构：[{ userID, profile: { userID, nick, avatar } }, ...] 或 profileList
    const list = Array.isArray(friendList) ? friendList : [];
    return list
      .map((f) => (f?.profile ? f.profile : f))
      .filter(Boolean);
  }, [friendList]);

  const filteredFriends = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return allFriends;
    return allFriends.filter((p) => {
      const userID = String(p?.userID || '').toLowerCase();
      const nick = String(p?.nick || '').toLowerCase();
      return userID.includes(q) || nick.includes(q);
    });
  }, [allFriends, search]);

  const selectedIds = useMemo(() => new Set(selected.map((u) => u.userID)), [selected]);

  const toggleSelect = (profile: any) => {
    const userID = profile?.userID;
    if (!userID) return;

    setSelected((prev) => {
      const exists = prev.some((p) => p.userID === userID);
      if (exists) return prev.filter((p) => p.userID !== userID);
      return [...prev, profile];
    });
  };

  const handleCreate = async () => {
    if (submitting) return;
    if (!createGroupConversation) return;

    if (!selected || selected.length === 0) {
      // 这里不引入 Toast，避免额外依赖；让按钮禁用即可
      return;
    }

    const name = String(groupName || '').trim() || buildDefaultGroupName(currentUserId, selected);

    const memberList = selected.map((p) => ({ userID: p.userID }));
    const options: any = {
      name,
      type: groupTypeValue,
      memberList,
      // groupID 不传：交给 SDK 自动生成
    };

    const finalOptions = onBeforeCreateConversation?.(options) || options;

    try {
      setSubmitting(true);
      const conversation = await createGroupConversation(finalOptions);
      onConversationCreated?.(conversation);
      close();
    } catch (e: any) {
      // 失败时保持弹窗不关闭，方便用户重试
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <div className={className} style={style}>
      <button
        type="button"
        className="custom-create-plus"
        onClick={() => setOpen(true)}
        aria-label="创建群聊"
      >
        <IconAdd size="16px" />
      </button>

      {open && (
        <div className="custom-create-overlay" role="dialog" aria-modal="true">
          <div className="custom-create-modal">
            <div className="custom-create-header">
              <div className="custom-create-title">创建群组</div>
              <button type="button" className="custom-create-close" onClick={close} aria-label="关闭">
                <IconClose size="16px" />
              </button>
            </div>

            <div className="custom-create-body">
              <div className="custom-create-row">
                <div className="custom-create-label">群模式</div>
                <div className="custom-create-controls">
                  <label className="custom-create-radio">
                    <input
                      type="radio"
                      checked={groupTypeKey === 'Work'}
                      onChange={() => setGroupTypeKey('Work')}
                    />
                    <span>好友工作群(Work)</span>
                  </label>
                  <label className="custom-create-radio">
                    <input
                      type="radio"
                      checked={groupTypeKey === 'Community'}
                      onChange={() => setGroupTypeKey('Community')}
                    />
                    <span>社群(Community)</span>
                  </label>
                </div>
              </div>

              <div className="custom-create-row">
                <div className="custom-create-label">群名称</div>
                <div className="custom-create-controls">
                  <input
                    className="custom-create-input"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="输入群名称（选填）"
                  />
                </div>
              </div>

              <div className="custom-create-row custom-create-members">
                <div className="custom-create-label">群成员</div>
                <div className="custom-create-member-panel">
                  <div className="custom-create-member-left">
                    <div className="custom-create-search">
                      <div className="custom-create-search-input-wrapper">
                        <span className="custom-create-search-icon"><IconSearch /></span>
                        <input
                          className="custom-create-input custom-create-search-input"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="搜索联系人"
                        />
                      </div>
                    </div>

                    <div className="custom-create-friend-list">
                      {filteredFriends.map((p) => {
                        const userID = p?.userID;
                        if (!userID) return null;
                        const nick = p?.nick || userID;
                        const checked = selectedIds.has(userID);
                        return (
                          <button
                            type="button"
                            key={userID}
                            className={`custom-create-friend-item ${checked ? 'is-checked' : ''}`}
                            onClick={() => toggleSelect(p)}
                          >
                            <span className="custom-create-friend-name">{nick}</span>
                            <span className="custom-create-friend-check">{checked ? '已选' : ''}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="custom-create-member-right">
                    <div className="custom-create-selected-header">
                      已选：{selected.length} 人
                    </div>
                    <div className="custom-create-selected-list">
                      {selected.map((p) => (
                        <div key={p.userID} className="custom-create-selected-item">
                          <span className="custom-create-selected-name">{p.nick || p.userID}</span>
                          <button
                            type="button"
                            className="custom-create-selected-remove"
                            onClick={() => toggleSelect(p)}
                          >
                            移除
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="custom-create-footer">
              <button type="button" className="custom-create-cancel" onClick={close}>取消</button>
              <button
                type="button"
                className="custom-create-submit"
                onClick={handleCreate}
                disabled={submitting || selected.length === 0}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
