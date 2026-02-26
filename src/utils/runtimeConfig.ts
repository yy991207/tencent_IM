export type RuntimeConfig = {
  SDKAppID: number;
  userID: string;
  userSig: string;
  apiKey?: string;
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

const parseSimpleYaml = (yamlText: string): Record<string, any> => {
  // 仅支持最简单的 key: value（满足本项目配置需求，避免引入第三方依赖）
  const result: Record<string, any> = {};
  const lines = yamlText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    const valueRaw = line.slice(idx + 1).trim();
    result[key] = parseScalar(valueRaw);
  }

  return result;
};

export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
  const res = await fetch('/config.yaml', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('未找到 public/config.yaml，请从 public/config-example.yaml 复制一份并填写配置');
  }
  const text = await res.text();
  const parsed = parseSimpleYaml(text);

  const SDKAppID = Number(parsed.SDKAppID);
  const userID = String(parsed.userID || '').trim();
  const userSig = String(parsed.userSig || '').trim();
  const apiKey = parsed.apiKey ? String(parsed.apiKey).trim() : undefined;

  if (!SDKAppID || Number.isNaN(SDKAppID)) {
    throw new Error('config.yaml 缺少有效的 SDKAppID');
  }
  if (!userID) {
    throw new Error('config.yaml 缺少 userID');
  }
  if (!userSig) {
    throw new Error('config.yaml 缺少 userSig');
  }

  return {
    SDKAppID,
    userID,
    userSig,
    apiKey,
  };
};
