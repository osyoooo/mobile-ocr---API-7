import { BOOKS } from '@/lib/books';
import type { QuantityRow } from '@/types';

export const SUBSIDY_AMOUNT = -5000;
export const VOUCHER_OPTIONS = [-4000, -2000, -6000, 0] as const;
export const DEFAULT_VOUCHER_AMOUNT = -4000;

export type VoucherAmount = (typeof VOUCHER_OPTIONS)[number];

export type PaymentSummary = {
  subsidyAmount: number;
  voucherAmount: number;
  amountAfterSubsidy: number;
  voucherFaceValue: number;
  voucherUsed: number;
  payableAmount: number;
};

export function normalizeQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === 'string') {
    const digits = value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).match(/\d+/g)?.join('') ?? '';
    if (!digits) return 0;
    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  return 0;
}

export function normalizeRows(rows: Partial<QuantityRow>[]): QuantityRow[] {
  const map = new Map<number, Partial<QuantityRow>>();

  for (const row of rows) {
    const no = normalizeQuantity(row.no);
    if (no >= 1 && no <= 22) {
      map.set(no, row);
    }
  }

  return BOOKS.map((book) => {
    const row = map.get(book.no);
    const quantity = normalizeQuantity(row?.quantity ?? row?.raw ?? 0);
    return {
      no: book.no,
      quantity,
      raw: typeof row?.raw === 'string' ? row.raw : String(quantity || ''),
      needsReview: typeof row?.needsReview === 'boolean' ? row.needsReview : quantity === 0,
      confidence: typeof row?.confidence === 'number' && Number.isFinite(row.confidence) ? Math.max(0, Math.min(1, row.confidence)) : 0,
    };
  });
}

export function calculateTotals(rows: QuantityRow[]) {
  const quantityByNo = new Map(rows.map((row) => [row.no, normalizeQuantity(row.quantity)]));

  const totalQuantity = BOOKS.reduce((sum, book) => sum + (quantityByNo.get(book.no) ?? 0), 0);
  const totalAmount = BOOKS.reduce((sum, book) => sum + book.price * (quantityByNo.get(book.no) ?? 0), 0);

  return { totalQuantity, totalAmount };
}

export function calculatePaymentSummary(
  totalAmount: number,
  voucherAmount: number = DEFAULT_VOUCHER_AMOUNT,
  subsidyAmount: number = SUBSIDY_AMOUNT,
): PaymentSummary {
  const safeTotalAmount = Math.max(0, Math.floor(Number.isFinite(totalAmount) ? totalAmount : 0));
  const safeSubsidyAmount = Number.isFinite(subsidyAmount) ? Math.floor(subsidyAmount) : 0;
  const safeVoucherAmount = Number.isFinite(voucherAmount) ? Math.floor(voucherAmount) : 0;

  const amountAfterSubsidy = Math.max(0, safeTotalAmount + safeSubsidyAmount);
  const voucherFaceValue = Math.abs(safeVoucherAmount);
  const voucherUsed = Math.min(amountAfterSubsidy, voucherFaceValue);
  const payableAmount = Math.max(0, amountAfterSubsidy - voucherUsed);

  return {
    subsidyAmount: safeSubsidyAmount,
    voucherAmount: safeVoucherAmount,
    amountAfterSubsidy,
    voucherFaceValue,
    voucherUsed,
    payableAmount,
  };
}

export function formatYen(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}
