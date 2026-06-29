'use client';

import { useState } from 'react';
import { ImagePreview } from '@/components/ImagePreview';
import { NativeCameraInput } from '@/components/NativeCameraInput';
import { QuantityReview } from '@/components/QuantityReview';
import { normalizeRows } from '@/lib/calc';
import type { FullTableOcrApiResponse, FullTableOcrApiSuccess, QuantityRow } from '@/types';

type Stage = 'capture' | 'preview' | 'reading' | 'review';

export default function Home() {
  const [stage, setStage] = useState<Stage>('capture');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<QuantityRow[]>(() => normalizeRows([]));
  const [targetFound, setTargetFound] = useState(false);
  const [targetTitle, setTargetTitle] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [apiMeta, setApiMeta] = useState<FullTableOcrApiSuccess['meta'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleImageReady(dataUrl: string) {
    setImageDataUrl(dataUrl);
    setError(null);
    setStage('preview');
  }

  function reset() {
    setStage('capture');
    setImageDataUrl(null);
    setRows(normalizeRows([]));
    setTargetFound(false);
    setTargetTitle('');
    setWarnings([]);
    setApiMeta(null);
    setError(null);
  }

  async function runAiOcr() {
    if (!imageDataUrl) return;

    setStage('reading');
    setError(null);

    try {
      const response = await fetch('/api/ai-ocr-full-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ imageDataUrl }),
      });

      const data = (await response.json()) as FullTableOcrApiResponse;

      if (!data.ok) {
        throw new Error(data.error.message || 'AI読み取りに失敗しました。');
      }

      setRows(normalizeRows(data.result.quantities));
      setTargetFound(data.result.targetFound);
      setTargetTitle(data.result.targetTitle);
      setWarnings(data.result.warnings);
      setApiMeta(data.meta);
      setStage('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI読み取りに失敗しました。');
      setStage('preview');
    }
  }

  return (
    <main className="app-shell">
      {stage === 'capture' ? <NativeCameraInput onImageReady={handleImageReady} /> : null}

      {(stage === 'preview' || stage === 'reading') && imageDataUrl ? (
        <>
          <ImagePreview imageDataUrl={imageDataUrl} isReading={stage === 'reading'} onRead={runAiOcr} onReset={reset} />
          {error ? (
            <div className="card error-card" role="alert">
              <strong>読み取りエラー</strong>
              <p>{error}</p>
              <p className="muted-text">
                quotaエラーの場合は、OpenAI PlatformのBilling残高・Project上限・Vercelの環境変数を確認してください。
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {stage === 'review' && imageDataUrl ? (
        <QuantityReview
          rows={rows}
          imageDataUrl={imageDataUrl}
          apiMeta={apiMeta}
          targetFound={targetFound}
          targetTitle={targetTitle}
          warnings={warnings}
          onRowsChange={setRows}
          onReset={reset}
        />
      ) : null}
    </main>
  );
}
