'use client';

import { useMemo, useState } from 'react';
import { calculatePaymentSummary, DEFAULT_VOUCHER_AMOUNT, formatNumber, formatYen, VOUCHER_OPTIONS, type PaymentSummary } from '@/lib/calc';

function formatSignedNumber(value: number): string {
  if (value === 0) return '0';
  const prefix = value < 0 ? '-' : '';
  return `${prefix}${formatNumber(Math.abs(value))}`;
}

type ResultSummaryProps = {
  totalQuantity: number;
  totalAmount: number;
  onStartBarcode: (paymentSummary: PaymentSummary) => void;
};

export function ResultSummary({ totalQuantity, totalAmount, onStartBarcode }: ResultSummaryProps) {
  const [voucherAmount, setVoucherAmount] = useState<number>(DEFAULT_VOUCHER_AMOUNT);
  const paymentSummary = useMemo(() => calculatePaymentSummary(totalAmount, voucherAmount), [totalAmount, voucherAmount]);

  return (
    <aside className="total-card" aria-label="合計と差引支払金額">
      <div>
        <span className="total-label">合計冊数</span>
        <strong>{formatNumber(totalQuantity)}冊</strong>
      </div>
      <div>
        <span className="total-label">合計金額</span>
        <strong>{formatYen(totalAmount)}</strong>
      </div>

      <section className="payment-card" aria-label="助成金・優待券・差引支払金額">
        <p className="payment-row">
          <span>助成金</span>
          <strong className="negative-value">{formatSignedNumber(paymentSummary.subsidyAmount)}</strong>
        </p>

        <label className="payment-row voucher-row">
          <span>優待券</span>
          <span className="voucher-select-wrap">
            <select
              className="voucher-select"
              value={voucherAmount}
              onChange={(event) => setVoucherAmount(Number(event.currentTarget.value))}
              aria-label="優待券金額"
            >
              {VOUCHER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatSignedNumber(option)}
                </option>
              ))}
            </select>
          </span>
        </label>

        <p className="payment-row payable-row">
          <span>差引支払金額</span>
          <strong>{formatYen(paymentSummary.payableAmount)}</strong>
        </p>

        <p className="payment-row">
          <span>優待券消化額</span>
          <strong>{formatYen(paymentSummary.voucherUsed)}</strong>
        </p>

        <button className="primary-button barcode-start-button" type="button" onClick={() => onStartBarcode(paymentSummary)}>
          問題なければバーコード読み取りへ
        </button>

        <p className="payment-note">差引支払金額がマイナスになる場合は0円として表示します。</p>
      </section>
    </aside>
  );
}
