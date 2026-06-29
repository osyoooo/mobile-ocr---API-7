import { NextResponse, type NextRequest } from 'next/server';

function unauthorizedResponse() {
  return new NextResponse('認証が必要です。', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="OCR Barcode App", charset="UTF-8"',
    },
  });
}

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith('Basic ')) return null;

  try {
    const decoded = atob(header.slice('Basic '.length));
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) return null;

    return {
      user: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const expectedPassword = process.env.APP_ACCESS_PASSWORD;

  // APP_ACCESS_PASSWORD を設定していない場合は、アクセス制限なしで動かします。
  // 本番では必ず Vercel の環境変数に APP_ACCESS_PASSWORD を設定してください。
  if (!expectedPassword) {
    return NextResponse.next();
  }

  const expectedUser = process.env.APP_ACCESS_USER || 'scanner';
  const credentials = parseBasicAuth(request.headers.get('authorization'));

  if (credentials && credentials.user === expectedUser && credentials.password === expectedPassword) {
    return NextResponse.next();
  }

  return unauthorizedResponse();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
