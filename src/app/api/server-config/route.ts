/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  console.log('server-config called: ', request.url);

  const config = await getConfig();
  const result = {
    SiteName: config.SiteConfig.SiteName,
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    // Turnstile 站点密钥（公开值，可安全下发）；未配置时为空字符串
    TurnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
  };
  return NextResponse.json(result);
}
