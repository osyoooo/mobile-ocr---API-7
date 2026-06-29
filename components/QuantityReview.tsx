'use client';

import { useMemo, useState } from 'react';
import { BOOKS } from '@/lib/books';
import { calculateTotals, formatNumber, formatYen, normalizeQuantity, type PaymentSummary } from '@/lib/calc';
import type { FullTableOcrApiSuccess, QuantityRow } from '@/types';
import { ResultSummary } from '@/components/ResultSummary';
import { OcrBarcodeScanner } from '@/components/OcrBarcodeScanner';

type QuantityReviewProps = {
  rows: QuantityRow[];
  imageDataUrl: string;
  apiMeta: FullTableOcrApiSuccess['meta'] | null;
  targetFound: boolean;
  targetTitle: string;
  warnings: string[];
  onRowsChange: (rows: QuantityRow[]) => void;
  onReset: () => void;
};

export function QuantityReview({
  rows,
  imageDataUrl,
  apiMeta,
  targetFound,
  targetTitle,
  warnings,
  onRowsChange,
  onReset,
}: QuantityReviewProps) {
  const { totalQuantity, totalAmount } = useMemo(() => calculateTotals(rows), [rows]);
  const quantityByNo = useMemo(() => new Map(rows.map((row) => [row.no, row])), [rows]);
  const [barcodePaymentSummary, setBarcodePaymentSummary] = useState<PaymentSummary | null>(null);

  function updateQuantity(no: number, value: string) {
    const nextQuantity = normalizeQuantity(value);
    onRowsChange(
      rows.map((row) =>
        row.no === no
          ? {
              ...row,
              quantity: nextQuantity,
              raw: value,
              needsReview: false,
            }
          : row,
      ),
    );
  }

  if (barcodePaymentSummary) {
    return (
      <OcrBarcodeScanner
        totalAmount={totalAmount}
        totalQuantity={totalQuantity}
        paymentSummary={barcodePaymentSummary}
        onBack={() => setBarcodePaymentSummary(null)}
        onStartOver={onReset}
      />
    );
  }

  return (
    <section className="card review-card">
      <div className="screen-header">
        <div>
          <div className="hero-eyebrow">確認・修正</div>
          <h1>AI読取結果</h1>
        </div>
        <button className="small-button" type="button" onClick={onReset}>
          撮り直す
        </button>
      </div>

      <StatusBox targetFound={targetFound} targetTitle={targetTitle} warnings={warnings} apiMeta={apiMeta} />

      <details className="image-details">
        <summary>送信した画像を確認</summary>
        <div className="preview-frame compact-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageDataUrl} alt="OpenAI APIへ送信した撮影画像" />
        </div>
      </details>

      <div className="review-list">
        {BOOKS.map((book) => {
          const row = quantityByNo.get(book.no);
          const quantity = row?.quantity ?? 0;
          const rowAmount = quantity * book.price;
          const needsReview = row?.needsReview ?? true;
          const confidence = row?.confidence ?? 0;

          return (
            <label className={needsReview ? 'review-row needs-review' : 'review-row'} key={book.no}>
              <div className="row-main">
                <span className="book-no">No{book.no}</span>
                <span className="book-title">{book.title}</span>
                <span className="book-price">{formatYen(book.price)}</span>
              </div>
              <div className="quantity-input-wrap">
                <input
                  className="quantity-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={quantity === 0 ? '' : String(quantity)}
                  placeholder="0"
                  onChange={(event) => updateQuantity(book.no, event.target.value)}
                  aria-label={`No${book.no} 申込冊数`}
                />
                <span className="unit">冊</span>
              </div>
              <div className="row-sub">
                <span>小計 {formatYen(rowAmount)}</span>
                <span>
                  AI: {row?.raw || '空欄'} / 確信度 {Math.round(confidence * 100)}%
                  {needsReview ? ' / 要確認' : ''}
                </span>
              </div>
            </label>
          );
        })}
      </div>

      <ResultSummary totalQuantity={totalQuantity} totalAmount={totalAmount} onStartBarcode={setBarcodePaymentSummary} />
    </section>
  );
}

type StatusBoxProps = {
  targetFound: boolean;
  targetTitle: string;
  warnings: string[];
  apiMeta: FullTableOcrApiSuccess['meta'] | null;
};

function StatusBox({ targetFound, targetTitle, warnings, apiMeta }: StatusBoxProps) {
  const usageText = apiMeta?.usage?.totalTokens ? `${formatNumber(apiMeta.usage.totalTokens)} tokens` : 'token情報なし';

  return (
    <div className={targetFound ? 'status-box success' : 'status-box warning'}>
      <strong>{targetFound ? '対象表を検出しました。' : '対象表の検出に不安があります。'}</strong>
      <p>
        対象: {targetTitle || '未特定'} / モデル: {apiMeta?.model || '不明'} / 使用量: {usageText}
      </p>
      {warnings.length > 0 ? (
        <ul>
          {warnings.map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
