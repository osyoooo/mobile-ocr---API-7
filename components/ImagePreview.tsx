'use client';

type ImagePreviewProps = {
  imageDataUrl: string;
  isReading: boolean;
  onRead: () => void;
  onReset: () => void;
};

export function ImagePreview({ imageDataUrl, isReading, onRead, onReset }: ImagePreviewProps) {
  return (
    <section className="card">
      <div className="screen-header">
        <div>
          <div className="hero-eyebrow">撮影画像</div>
          <h1>画像全体から自動読取</h1>
        </div>
      </div>

      <p className="lead compact">
        この画像全体をOpenAI APIへ送り、「税務研究会」の表だけを探して申込冊数を読み取ります。
      </p>

      <div className="preview-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageDataUrl} alt="撮影した申込表" />
      </div>

      <div className="button-stack sticky-actions">
        <button className="primary-button" type="button" onClick={onRead} disabled={isReading}>
          {isReading ? 'AIで読み取り中...' : 'AIで自動読取'}
        </button>
        <button className="secondary-button" type="button" onClick={onReset} disabled={isReading}>
          撮り直す
        </button>
      </div>

      {isReading ? (
        <div className="loading-box" role="status" aria-live="polite">
          <div className="spinner" />
          <div>
            <strong>OpenAI APIで解析しています</strong>
            <p>画像全体から対象表と申込冊数列を探しています。数十秒かかることがあります。</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
