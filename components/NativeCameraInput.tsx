'use client';

import { useRef, useState } from 'react';
import { fileToCompressedDataUrl } from '@/lib/imageClient';

type NativeCameraInputProps = {
  onImageReady: (dataUrl: string) => void;
};

export function NativeCameraInput({ onImageReady }: NativeCameraInputProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const dataUrl = await fileToCompressedDataUrl(file, {
        maxLongEdge: 1800,
        jpegQuality: 0.82,
      });
      onImageReady(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像の読み込みに失敗しました。');
    } finally {
      setIsProcessing(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }

  return (
    <section className="card hero-card">
      <div className="hero-eyebrow">OpenAI画像読取</div>
      <h1>書籍申込 合計計算</h1>
      <p className="lead">
        「税務研究会」の表を広めに撮影すると、AIが右端の申込冊数列を探して No1〜No22 の冊数を読み取ります。
      </p>

      <div className="button-stack">
        <button className="primary-button" type="button" onClick={() => cameraInputRef.current?.click()} disabled={isProcessing}>
          {isProcessing ? '画像を準備中...' : 'カメラで撮影'}
        </button>
        <button className="secondary-button" type="button" onClick={() => uploadInputRef.current?.click()} disabled={isProcessing}>
          画像を選択
        </button>
      </div>

      <input
        ref={cameraInputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <input
        ref={uploadInputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      {error ? <p className="error-text">{error}</p> : null}

      <div className="tips-box">
        <h2>撮影のコツ</h2>
        <p>
          「税務研究会」のタイトル、No1〜No22、右端の申込冊数列が入るように撮影してください。隣の表が写ってもかまいませんが、対象表が切れないようにしてください。
        </p>
      </div>
    </section>
  );
}
