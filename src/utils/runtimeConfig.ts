// 单个用户的鉴权信息
export type UserEntry = {
  userID: string;
  userSig: string;
};

// 运行时配置：包含 SDKAppID 和当前选中的用户信息，以及完整用户列表（用于切换）
export type RuntimeConfig = {
  SDKAppID: number;
  userID: string;
  userSig: string;
  apiKey?: string;
  // 多用户列表（多人对话模拟时使用）
  users: UserEntry[];
};

const parseScalar = (raw: string): string | number => {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // 去掉首尾引号
  const unquoted = trimmed.replace(/^['"]|['"]$/g, '');

  // number
  if (/^-?\d+(\.\d+)?$/.test(unquoted)) {
    return Number(unquoted);
  }

  return unquoted;
};

// 解析 YAML 中的 users 数组（简易实现，支持 "- userID: xxx" + "  userSig: xxx" 格式）
const parseUsersFromYaml = (yamlText: string): UserEntry[] => {
  const users: UserEntry[] = [];
  const lines = yamlText.split(/\r?\n/);

  let inUsersBlock = false;
  let current: Partial<UserEntry> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    // 检测 users: 块开始
    if (/^users\s*:/.test(trimmed)) {
      inUsersBlock = true;
      continue;
    }

    if (!inUsersBlock) continue;

    // 遇到下一个顶层 key 时退出 users 块
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-') && !line.startsWith(' ') && !line.startsWith('\t')) {
      inUsersBlock = false;
      // 收尾当前条目
      if (current.userID && current.userSig) {
        users.push(current as UserEntry);
      }
      current = {};
      continue;
    }

    if (!trimmed || trimmed.startsWith('#')) continue;

    // 新的列表项
    if (trimmed.startsWith('-')) {
      // 保存上一条
      if (current.userID && current.userSig) {
        users.push(current as UserEntry);
      }
      current = {};
      // "- userID: xxx" 这种写法，把 "-" 去掉继续解析
      const afterDash = trimmed.slice(1).trim();
      if (afterDash) {
        const idx = afterDash.indexOf(':');
        if (idx !== -1) {
          const key = afterDash.slice(0, idx).trim();
          const val = afterDash.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (key === 'userID') current.userID = val;
          if (key === 'userSig') current.userSig = val;
        }
      }
      continue;
    }

    // 列表项的续行属性
    const idx = trimmed.indexOf(':');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key === 'userID') current.userID = val;
      if (key === 'userSig') current.userSig = val;
    }
  }

  // 收尾最后一条
  if (current.userID && current.userSig) {
    users.push(current as UserEntry);
  }

  return users;
};

const parseSimpleYaml = (yamlText: string): Record<string, any> => {
  // 仅支持最简单的 key: value（满足本项目配置需求，避免引入第三方依赖）
  const result: Record<string, any> = {};
  const lines = yamlText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // 跳过缩进行（属于 users 子块）
    if (line.startsWith(' ') || line.startsWith('\t')) continue;
    // 跳过列表项
    if (trimmed.startsWith('-')) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    const valueRaw = line.slice(idx + 1).trim();
    // 跳过 users 这种块级 key（值为空）
    if (key === 'users') continue;
    result[key] = parseScalar(valueRaw);
  }

  return result;
};

// 从 URL 参数获取指定的 userID
const getUserIDFromURL = (): string => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('userID') || '';
  } catch {
    return '';
  }
};

export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
  const res = await fetch('/config.yaml', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('未找到 public/config.yaml，请从 public/config-example.yaml 复制一份并填写配置');
  }
  const text = await res.text();
  const parsed = parseSimpleYaml(text);
  const users = parseUsersFromYaml(text);

  const SDKAppID = Number(parsed.SDKAppID);
  const apiKey = parsed.apiKey ? String(parsed.apiKey).trim() : undefined;

  if (!SDKAppID || Number.isNaN(SDKAppID)) {
    throw new Error('config.yaml 缺少有效的 SDKAppID');
  }

  // 优先从 URL 参数选择用户
  const urlUserID = getUserIDFromURL();

  // 多用户模式：users 列表存在时，按 URL 参数匹配或默认第一个
  if (users.length > 0) {
    const matched = urlUserID
      ? users.find((u) => u.userID === urlUserID)
      : users[0];

    if (!matched) {
      const available = users.map((u) => u.userID).join(', ');
      throw new Error(`URL 参数 userID="${urlUserID}" 未在 config.yaml 的 users 列表中找到。可用用户：${available}`);
    }

    return {
      SDKAppID,
      userID: matched.userID,
      userSig: matched.userSig,
      apiKey,
      users,
    };
  }

  // 兼容旧的单用户模式
  const userID = String(parsed.userID || '').trim();
  const userSig = String(parsed.userSig || '').trim();

  if (!userID) {
    throw new Error('config.yaml 缺少 userID（请配置 users 列表或单独的 userID/userSig）');
  }
  if (!userSig) {
    throw new Error('config.yaml 缺少 userSig');
  }

  return {
    SDKAppID,
    userID,
    userSig,
    apiKey,
    users: [{ userID, userSig }],
  };
};
