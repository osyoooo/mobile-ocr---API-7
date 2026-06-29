import { NextResponse } from 'next/server';
import { normalizeRows } from '@/lib/calc';
import type { FullTableOcrApiError, FullTableOcrApiSuccess, FullTableOcrResult, QuantityRow } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_DETAIL = 'high';

type RequestBody = {
  imageDataUrl?: string;
};

type UnknownRecord = Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const imageDataUrl = body.imageDataUrl;

    if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
      return jsonError('invalid_image', '画像データが見つかりません。もう一度撮影してください。', 400);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonError('missing_api_key', 'OPENAI_API_KEY がサーバーに設定されていません。Vercelの環境変数を確認してください。', 500);
    }

    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    const detail = normalizeImageDetail(process.env.OPENAI_IMAGE_DETAIL || DEFAULT_DETAIL);

    const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: SYSTEM_PROMPT,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: USER_PROMPT,
              },
              {
                type: 'input_image',
                image_url: imageDataUrl,
                detail,
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'tax_study_quantity_ocr',
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        max_output_tokens: 2200,
      }),
    });

    const payload = (await readResponsePayload(openAiResponse)) as UnknownRecord;

    if (!openAiResponse.ok) {
      const message = getOpenAiErrorMessage(payload) || `OpenAI API エラー: HTTP ${openAiResponse.status}`;
      console.error('[ai-ocr-full-table] openai_error', {
        status: openAiResponse.status,
        message,
      });
      return jsonError('openai_error', message, openAiResponse.status);
    }

    const outputText = extractOutputText(payload);
    if (!outputText) {
      console.error('[ai-ocr-full-table] empty_output', payload);
      return jsonError('empty_output', 'OpenAI APIの応答からJSONを取得できませんでした。', 502);
    }

    let parsed: FullTableOcrResult;
    try {
      parsed = JSON.parse(outputText) as FullTableOcrResult;
    } catch (error) {
      console.error('[ai-ocr-full-table] json_parse_error', { outputText, error });
      return jsonError('json_parse_error', 'OpenAI APIの応答JSONを解析できませんでした。', 502);
    }

    const normalizedResult: FullTableOcrResult = {
      targetFound: typeof parsed.targetFound === 'boolean' ? parsed.targetFound : false,
      targetTitle: typeof parsed.targetTitle === 'string' ? parsed.targetTitle : '',
      quantities: normalizeRows(Array.isArray(parsed.quantities) ? (parsed.quantities as QuantityRow[]) : []),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((item): item is string => typeof item === 'string') : [],
    };

    const usage = extractUsage(payload);

    const response: FullTableOcrApiSuccess = {
      ok: true,
      result: normalizedResult,
      meta: {
        model,
        usage,
      },
    };

    console.info('[ai-ocr-full-table] success', {
      model,
      targetFound: normalizedResult.targetFound,
      nonZeroRows: normalizedResult.quantities.filter((row) => row.quantity > 0).length,
      usage,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('[ai-ocr-full-table] unexpected_error', error);
    return jsonError('unexpected_error', '予期しないエラーが発生しました。VercelのLogsを確認してください。', 500);
  }
}

function jsonError(code: string, message: string, status: number) {
  const response: FullTableOcrApiError = {
    ok: false,
    error: {
      code,
      message,
      status,
    },
  };
  return NextResponse.json(response, { status });
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractOutputText(payload: UnknownRecord): string | null {
  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }

  const output = payload.output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!isRecord(part)) continue;
      if ((part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
        return part.text;
      }
    }
  }

  return null;
}

function extractUsage(payload: UnknownRecord) {
  const usage = payload.usage;
  if (!isRecord(usage)) return undefined;

  return {
    inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
    outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
    totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined,
  };
}

function getOpenAiErrorMessage(payload: UnknownRecord): string | null {
  const error = payload.error;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  if (typeof payload.raw === 'string') {
    return payload.raw;
  }
  return null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function normalizeImageDetail(value: string): 'low' | 'high' | 'auto' {
  if (value === 'low' || value === 'high' || value === 'auto') return value;
  return DEFAULT_DETAIL;
}

const SYSTEM_PROMPT = `
あなたは日本語の書籍申込表を読むOCRアシスタントです。
画像の中から、表上部または周辺に「税務研究会」と書かれている対象表だけを探してください。
左側や周囲に別の表が写っていても無視してください。

対象表には、列見出しとして「No」「書籍名」「斡旋価格」「申込冊数」があります。
読み取る対象は、No1〜No22の右端「申込冊数」列にある手書き数字だけです。
書籍名、斡旋価格、印字された「冊」、申込合計冊数欄、周囲の別表は読み取らないでください。

数量のルール:
- 空欄は0。
- 手書き数字が読めない場合は0にして needsReview を true。
- 迷う場合は最も可能性の高い整数を quantity に入れて needsReview を true。
- 読めた場合は needsReview を false。
- 0以上の整数だけを返す。
- 合計冊数や合計金額は計算しない。
- 必ず No1 から No22 まで22件を返す。
- JSON以外の文章を返さない。
`.trim();

const USER_PROMPT = `
画像全体を確認し、「税務研究会」の申込表だけを対象にしてください。
対象表のNo1〜No22について、右端の「申込冊数」列に書かれている手書き数字を読み取ってください。
印字された「冊」は無視してください。
もし対象表が見つからない場合でも、targetFound=false にし、quantities はNo1〜No22をすべて0で返してください。
`.trim();

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    targetFound: {
      type: 'boolean',
      description: '画像内に対象の「税務研究会」表を見つけられたか。',
    },
    targetTitle: {
      type: 'string',
      description: '対象表として認識したタイトル。通常は税務研究会。見つからない場合は空文字。',
    },
    quantities: {
      type: 'array',
      description: 'No1からNo22までの申込冊数。必ず22件。',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          no: { type: 'integer', description: '1から22までのNo。' },
          quantity: { type: 'integer', description: '申込冊数。空欄または読めない場合は0。' },
          raw: { type: 'string', description: '画像から読んだ元の文字。空欄の場合は空文字。' },
          needsReview: { type: 'boolean', description: '読み取りに迷いがある、または空欄・判読不能の場合はtrue。' },
          confidence: { type: 'number', description: '0から1の主観的な読み取り確信度。' },
        },
        required: ['no', 'quantity', 'raw', 'needsReview', 'confidence'],
      },
    },
    warnings: {
      type: 'array',
      description: '対象表が一部切れている、斜め、暗い、複数表が写っている等の注意事項。',
      items: { type: 'string' },
    },
  },
  required: ['targetFound', 'targetTitle', 'quantities', 'warnings'],
} as const;
