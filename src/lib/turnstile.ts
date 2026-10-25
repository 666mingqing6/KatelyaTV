/**
 * Cloudflare Turnstile 服务端校验（遵循 existing-widget 流程规范）
 *
 * 放行条件必须同时满足：
 *   1. siteverify 返回 success === true
 *   2. 返回的 action 与预期一致
 *   3. 返回的 hostname 在 TURNSTILE_HOSTNAMES 白名单内
 *
 * 任何异常（网络失败、超时、上游非 2xx）一律拒绝，不放行。
 *
 * 环境变量：
 *   TURNSTILE_SECRET      服务端密钥（必需）
 *   TURNSTILE_HOSTNAMES   允许的前端主机名，逗号分隔（必需，生产环境不得含 localhost）
 *
 * 未配置 TURNSTILE_SECRET 时整体跳过，便于未接入的部署保持原行为。
 */

export const TURNSTILE_ACTION = 'auth';

export interface TurnstileResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
}

function getSecret(): string | undefined {
  return process.env.TURNSTILE_SECRET || process.env.TURNSTILE_SECRET_KEY;
}

function expectedHostnames(): Set<string> {
  return new Set(
    (process.env.TURNSTILE_HOSTNAMES || '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function turnstileEnabled(): boolean {
  return Boolean(getSecret());
}

export async function verifyTurnstile(
  token: unknown,
  remoteIp?: string,
  expectedAction: string = TURNSTILE_ACTION
): Promise<TurnstileResult> {
  const secret = getSecret();

  // 未配置密钥则跳过，避免影响尚未接入的部署
  if (!secret) return { ok: true, skipped: true };

  const allowed = expectedHostnames();

  // 令牌基础校验 + 白名单为空直接拒绝
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > 2048 ||
    allowed.size === 0
  ) {
    return { ok: false, reason: '人机验证参数无效' };
  }

  let result: {
    success?: boolean;
    action?: string;
    hostname?: string;
    'error-codes'?: string[];
  };

  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          secret,
          response: token,
          ...(remoteIp ? { remoteip: remoteIp } : {}),
        }),
      }
    );
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    result = await res.json();
  } catch (error) {
    // 上游异常不视为通过
    console.error('Turnstile siteverify 请求失败:', error);
    return { ok: false, reason: '人机验证服务暂不可用' };
  }

  const hostname = (result.hostname || '').toLowerCase();
  const actionOk = result.action === expectedAction;
  const hostOk = allowed.has(hostname);

  if (!result.success || !actionOk || !hostOk) {
    console.error('Turnstile 校验未通过:', {
      success: result.success,
      action: result.action,
      hostname: result.hostname,
      codes: result['error-codes'],
    });
    return { ok: false, reason: '人机验证未通过' };
  }

  return { ok: true };
}
