type IncomingBody = {
  barcode?: unknown;
  readAt?: unknown;
  format?: unknown;
  operator?: unknown;
  totalAmount?: unknown;
  subsidyAmount?: unknown;
  voucherAmount?: unknown;
  payableAmount?: unknown;
  voucherUsed?: unknown;
};

type GasResponse = {
  ok: boolean;
  row?: number;
  requestId?: string;
  error?: string;
};

const MAX_BARCODE_LENGTH = 256;

function requiredEnv(name: 'GAS_WEB_APP_URL' | 'GAS_SHARED_SECRET') {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が未設定です。`);
  return value;
}

function normalizeSecret(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function validIsoDateOrNow(value: unknown) {
  const text = cleanText(value, 80);
  if (!text) return new Date().toISOString();

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function toInteger(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string') {
    const normalized = value
      .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/[¥,円\s]/g, '');
    const parsed = Number.parseInt(normalized, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function parseJson(request: Request): Promise<IncomingBody | null> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== 'object') return null;
    return body as IncomingBody;
  } catch {
    return null;
  }
}

export async function GET() {
  return Response.json({ ok: true, message: 'OCR barcode submit API is running.' });
}

export async function POST(request: Request) {
  try {
    const body = await parseJson(request);
    if (!body) {
      return Response.json({ ok: false, error: 'JSON body が必要です。' }, { status: 400 });
    }

    const barcode = cleanText(body.barcode, MAX_BARCODE_LENGTH);
    if (!barcode) {
      return Response.json({ ok: false, error: 'barcode が空です。' }, { status: 400 });
    }

    const gasWebAppUrl = requiredEnv('GAS_WEB_APP_URL');
    const sharedSecret = normalizeSecret(requiredEnv('GAS_SHARED_SECRET'));

    const payload = {
      mode: 'ocrBarcode',
      secret: sharedSecret,
      barcode,
      totalAmount: toInteger(body.totalAmount),
      subsidyAmount: toInteger(body.subsidyAmount),
      voucherAmount: toInteger(body.voucherAmount),
      payableAmount: toInteger(body.payableAmount),
      voucherUsed: toInteger(body.voucherUsed),
      readAt: validIsoDateOrNow(body.readAt),
      format: cleanText(body.format, 64),
      operator: cleanText(body.operator, 100),
      userAgent: request.headers.get('user-agent') ?? '',
      appReceivedAt: new Date().toISOString(),
    };

    const gasResponse = await fetch(gasWebAppUrl, {
      method: 'POST',
      headers: {
        // Apps Script 側で e.postData.contents としてそのまま受け取るため text/plain にしています。
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'follow',
    });

    const responseText = await gasResponse.text();
    let data: GasResponse | null = null;
    try {
      data = JSON.parse(responseText) as GasResponse;
    } catch {
      data = null;
    }

    if (!gasResponse.ok) {
      return Response.json(
        {
          ok: false,
          error: `Google Apps Script が HTTP ${gasResponse.status} を返しました。`,
          detail: responseText.slice(0, 500),
        },
        { status: 502 },
      );
    }

    if (!data?.ok) {
      const gasError = data?.error ?? 'Google Apps Script 側で保存に失敗しました。';
      const errorMessage =
        gasError === 'unauthorized'
          ? 'GAS認証エラーです。VercelのGAS_SHARED_SECRETとApps ScriptのsetupOnce()で保存したsecretが一致していません。'
          : gasError;

      return Response.json(
        {
          ok: false,
          error: errorMessage,
        },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, row: data.row, requestId: data.requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラーです。';
    console.error('/api/submit-ocr-barcode error', error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
