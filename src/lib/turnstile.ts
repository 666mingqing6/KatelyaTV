/**
 * Cloudflare Turnstile 服务端校验
 *
 * 不依赖域名是否托管在 Cloudflare，任何站点均可使用。
 * 未配置 TURNSTILE_SECRET_KEY 时整体跳过，保持与接入前行为一致。
 */

export interface TurnstileResult {
  ok: boolean;
  /** 未配置密钥而跳过校验 */
  skipped?: boolean;
  reason?: string;
}

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(
  token: unknown,
  remoteIp?: string
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // 未配置则跳过，避免影响尚未接入的部署
  if (!secret) return { ok: true, skipped: true };

  if (!token || typeof token !== 'string') {
    return { ok: false, reason: '请先完成人机验证' };
  }

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);

  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form }
    );
    const data: {
      success?: boolean;
      'error-codes'?: string[];
    } = await res.json();

    if (data.success) return { ok: true };

    return {
      ok: false,
      reason: (data['error-codes'] || []).join(',') || '人机验证未通过',
    };
  } catch (error) {
    // 校验服务异常时放行并记录，避免因外部依赖故障导致全站无法登录
    console.error('Turnstile 校验请求失败:', error);
    return { ok: true, skipped: true };
  }
}
