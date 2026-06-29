'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatOneDReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { formatYen, type PaymentSummary } from '@/lib/calc';

type SaveState = 'idle' | 'scanning' | 'detected' | 'saving' | 'saved' | 'error';

type ApiResponse = {
  ok: boolean;
  row?: number;
  requestId?: string;
  sheet?: string;
  error?: string;
};

type OcrBarcodeScannerProps = {
  totalAmount: number;
  totalQuantity: number;
  paymentSummary: PaymentSummary;
  onBack: () => void;
  onStartOver: () => void;
};

const STORAGE_OPERATOR_KEY = 'barcode_scanner_operator';
const REQUIRED_STABLE_DETECTIONS = 2;
const TARGET_ZONE = {
  minX: 0.18,
  maxX: 0.82,
  minY: 0.34,
  maxY: 0.66,
};

const ONE_D_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.CODABAR,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.CODE_128,
  BarcodeFormat.EAN_8,
  BarcodeFormat.EAN_13,
  BarcodeFormat.ITF,
  BarcodeFormat.RSS_14,
  BarcodeFormat.RSS_EXPANDED,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.UPC_EAN_EXTENSION,
];

function getBarcodeFormatName(format: BarcodeFormat | undefined) {
  if (typeof format !== 'number') return '';
  return BarcodeFormat[format] ?? String(format);
}

function getCameraErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'カメラを起動できませんでした。ブラウザの権限設定を確認してください。';
  }

  if (error.name === 'NotAllowedError') {
    return 'カメラ権限が拒否されています。ブラウザ設定でこのサイトのカメラ使用を許可してください。';
  }

  if (error.name === 'NotFoundError') {
    return '利用できるカメラが見つかりませんでした。';
  }

  if (error.name === 'NotReadableError') {
    return 'カメラを他のアプリが使用中の可能性があります。他のカメラアプリを閉じてから再試行してください。';
  }

  return `${error.name}: ${error.message}`;
}

function vibrateSuccess() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate?.([60, 40, 60]);
  }
}

function formatDateTimeForDisplay(isoString: string) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function getStateLabel(saveState: SaveState) {
  if (saveState === 'idle') return '待機中';
  if (saveState === 'scanning') return '読取中';
  if (saveState === 'detected') return '読取完了';
  if (saveState === 'saving') return '送信中';
  if (saveState === 'saved') return '保存完了';
  return 'エラー';
}

function getPointCoordinate(point: unknown, axis: 'x' | 'y') {
  const maybePoint = point as {
    getX?: () => number;
    getY?: () => number;
    x?: number;
    y?: number;
  };

  const value =
    axis === 'x'
      ? typeof maybePoint.getX === 'function'
        ? maybePoint.getX()
        : maybePoint.x
      : typeof maybePoint.getY === 'function'
        ? maybePoint.getY()
        : maybePoint.y;

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isResultInsideTargetZone(result: { getResultPoints?: () => unknown[] }, video: HTMLVideoElement | null) {
  if (!video) return true;

  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) return true;

  const points = typeof result.getResultPoints === 'function' ? result.getResultPoints() : [];
  if (!points || points.length === 0) return true;

  const coordinates = points
    .map((point) => ({ x: getPointCoordinate(point, 'x'), y: getPointCoordinate(point, 'y') }))
    .filter((point): point is { x: number; y: number } => point.x !== null && point.y !== null);

  if (coordinates.length === 0) return true;

  const minX = Math.min(...coordinates.map((point) => point.x));
  const maxX = Math.max(...coordinates.map((point) => point.x));
  const minY = Math.min(...coordinates.map((point) => point.y));
  const maxY = Math.max(...coordinates.map((point) => point.y));
  const centerX = (minX + maxX) / 2 / videoWidth;
  const centerY = (minY + maxY) / 2 / videoHeight;

  return centerX >= TARGET_ZONE.minX && centerX <= TARGET_ZONE.maxX && centerY >= TARGET_ZONE.minY && centerY <= TARGET_ZONE.maxY;
}

export function OcrBarcodeScanner({ totalAmount, totalQuantity, paymentSummary, onBack, onStartOver }: OcrBarcodeScannerProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatOneDReader | null>(null);
  const detectedRef = useRef(false);
  const candidateRef = useRef({ value: '', count: 0, lastAt: 0 });

  const [isScanning, setIsScanning] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [statusMessage, setStatusMessage] = useState('カメラ開始を押してバーコードを読み取ってください。');
  const [cameraErrorMessage, setCameraErrorMessage] = useState('');
  const [sendErrorMessage, setSendErrorMessage] = useState('');
  const [operator, setOperator] = useState('');
  const [barcode, setBarcode] = useState('');
  const [barcodeFormat, setBarcodeFormat] = useState('');
  const [readAt, setReadAt] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [savedRow, setSavedRow] = useState<number | null>(null);
  const [savedSheet, setSavedSheet] = useState('');
  const [requestId, setRequestId] = useState('');

  const stopCamera = useCallback((message?: string) => {
    try {
      controlsRef.current?.stop();
    } catch (error) {
      console.warn('Failed to stop barcode scanner', error);
    } finally {
      controlsRef.current = null;
      readerRef.current = null;
      candidateRef.current = { value: '', count: 0, lastAt: 0 };
      setIsScanning(false);
      if (message) setStatusMessage(message);
    }
  }, []);

  useEffect(() => {
    const savedOperator = window.localStorage.getItem(STORAGE_OPERATOR_KEY);
    if (savedOperator) setOperator(savedOperator);

    window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ block: 'start' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_OPERATOR_KEY, operator);
  }, [operator]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const setDetectedBarcode = useCallback(
    (value: string, format: string, detectedAt: string) => {
      const normalizedBarcode = value.trim();
      if (!normalizedBarcode) return;

      detectedRef.current = true;
      candidateRef.current = { value: '', count: 0, lastAt: 0 };
      stopCamera();
      setBarcode(normalizedBarcode);
      setBarcodeFormat(format);
      setReadAt(detectedAt);
      setSaveState('detected');
      setCameraErrorMessage('');
      setSendErrorMessage('');
      setSavedRow(null);
      setSavedSheet('');
      setRequestId('');
      setStatusMessage('バーコードを読み取りました。内容を確認して「データを送る」を押してください。');
      vibrateSuccess();
    },
    [stopCamera],
  );

  const startScanning = useCallback(async () => {
    if (isScanning || saveState === 'saving') return;

    setCameraErrorMessage('');
    setSendErrorMessage('');
    setBarcode('');
    setBarcodeFormat('');
    setReadAt('');
    setSavedRow(null);
    setSavedSheet('');
    setRequestId('');
    detectedRef.current = false;
    candidateRef.current = { value: '', count: 0, lastAt: 0 };

    if (!window.isSecureContext) {
      setCameraErrorMessage('カメラ利用にはHTTPSが必要です。Vercel本番URL、またはlocalhostで開いてください。');
      setSaveState('error');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraErrorMessage('このブラウザはカメラAPIに対応していません。Safari/Chromeの最新版で試してください。');
      setSaveState('error');
      return;
    }

    if (!videoRef.current) {
      setCameraErrorMessage('video要素を初期化できませんでした。ページを再読み込みしてください。');
      setSaveState('error');
      return;
    }

    try {
      setIsScanning(true);
      setSaveState('scanning');
      setStatusMessage('カメラを起動しています。権限ダイアログが出たら許可してください。');

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, ONE_D_FORMATS);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatOneDReader(hints, {
        delayBetweenScanAttempts: 90,
        delayBetweenScanSuccess: 450,
        tryPlayVideoTimeout: 10000,
      });
      readerRef.current = reader;

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
        },
        audio: false,
      };

      const controls = await reader.decodeFromConstraints(constraints, videoRef.current, (result) => {
        if (!result || detectedRef.current) return;

        const nextBarcode = result.getText().trim();
        if (!nextBarcode) return;

        if (!isResultInsideTargetZone(result, videoRef.current)) {
          candidateRef.current = { value: '', count: 0, lastAt: 0 };
          setStatusMessage('枠の外のバーコードを検知しました。対象の1本だけを中央の読取ラインに合わせてください。');
          return;
        }

        const now = Date.now();
        const previous = candidateRef.current;
        const count = previous.value === nextBarcode && now - previous.lastAt < 1600 ? previous.count + 1 : 1;
        candidateRef.current = { value: nextBarcode, count, lastAt: now };

        if (count < REQUIRED_STABLE_DETECTIONS) {
          setStatusMessage(`候補 ${count}/${REQUIRED_STABLE_DETECTIONS}: ${nextBarcode}。そのまま中央で少し止めてください。`);
          return;
        }

        const nextFormat = getBarcodeFormatName(result.getBarcodeFormat());
        setDetectedBarcode(nextBarcode, nextFormat, new Date().toISOString());
      });

      controlsRef.current = controls;
      if (detectedRef.current) {
        stopCamera();
        return;
      }
      setStatusMessage('読み取り中です。対象のバーコード1本だけを中央の細い枠と赤い線に合わせてください。');
    } catch (error) {
      stopCamera();
      setSaveState('error');
      setCameraErrorMessage(getCameraErrorMessage(error));
      setStatusMessage('カメラを起動できませんでした。');
    }
  }, [isScanning, saveState, setDetectedBarcode, stopCamera]);

  const submitData = useCallback(async () => {
    if (!barcode || saveState === 'saving') return;

    setSaveState('saving');
    setSendErrorMessage('');
    setStatusMessage('スプレッドシートへ送信中です。');

    try {
      const response = await fetch('/api/submit-ocr-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          barcode,
          readAt,
          format: barcodeFormat,
          operator: operator.trim(),
          totalAmount,
          subsidyAmount: paymentSummary.subsidyAmount,
          voucherAmount: paymentSummary.voucherAmount,
          payableAmount: paymentSummary.payableAmount,
          voucherUsed: paymentSummary.voucherUsed,
        }),
      });

      const data = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? `保存APIでエラーが発生しました。HTTP ${response.status}`);
      }

      setSaveState('saved');
      setSavedRow(data.row ?? null);
      setSavedSheet(data.sheet ?? 'OCR_Barcode');
      setRequestId(data.requestId ?? '');
      setStatusMessage('保存が完了しました。次の申込表に進めます。');
      vibrateSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存に失敗しました。';
      setSaveState('error');
      setSendErrorMessage(message);
      setStatusMessage('保存に失敗しました。内容を確認して再送信してください。');
    }
  }, [barcode, barcodeFormat, operator, paymentSummary, readAt, saveState, totalAmount]);

  function applyManualCode() {
    const normalized = manualCode.trim();
    if (!normalized || saveState === 'saving') return;
    setDetectedBarcode(normalized, 'MANUAL', new Date().toISOString());
  }

  return (
    <section ref={rootRef} className="card barcode-card">
      <div className="screen-header barcode-header">
        <div>
          <div className="hero-eyebrow">BARCODE</div>
          <h1>バーコード読み取り</h1>
          <p className="lead compact">金額を確認後、バーコードを読んでから「データを送る」を押してください。</p>
        </div>
        <button className="small-button" type="button" onClick={onBack} disabled={saveState === 'saving'}>
          金額確認へ戻る
        </button>
      </div>

      <label className="operator-row sticky-operator-row">
        <span>担当者/端末名</span>
        <input
          className="operator-input"
          value={operator}
          onChange={(event) => setOperator(event.target.value)}
          placeholder="例: 受付A / iPhone1"
          maxLength={100}
        />
      </label>

      <div className="barcode-summary-grid" aria-label="送信予定の金額">
        <div>
          <span>合計冊数</span>
          <strong>{totalQuantity.toLocaleString('ja-JP')}冊</strong>
        </div>
        <div>
          <span>合計金額</span>
          <strong>{formatYen(totalAmount)}</strong>
        </div>
        <div>
          <span>助成金</span>
          <strong className="negative-value">{paymentSummary.subsidyAmount.toLocaleString('ja-JP')}</strong>
        </div>
        <div>
          <span>優待券</span>
          <strong className="negative-value">{paymentSummary.voucherAmount.toLocaleString('ja-JP')}</strong>
        </div>
        <div>
          <span>差引支払金額</span>
          <strong>{formatYen(paymentSummary.payableAmount)}</strong>
        </div>
        <div>
          <span>優待券消化額</span>
          <strong>{formatYen(paymentSummary.voucherUsed)}</strong>
        </div>
      </div>

      <div className="barcode-camera-area">
        <video ref={videoRef} muted playsInline aria-label="バーコード読み取りカメラ" />
        {isScanning ? (
          <div className="barcode-scan-frame" aria-hidden="true">
            <span className="barcode-scan-guide">この枠内の1本だけ</span>
            <span className="barcode-scan-line" />
          </div>
        ) : null}
        {!isScanning ? <div className="camera-placeholder">{barcode ? '読取完了' : 'カメラ停止中'}</div> : null}
        <div className={`barcode-status state-${saveState}`}>
          <strong>{getStateLabel(saveState)}</strong>
          <span>{statusMessage}</span>
        </div>
      </div>

      <div className="barcode-actions">
        <button className="primary-button" type="button" onClick={startScanning} disabled={isScanning || saveState === 'saving'}>
          {barcode ? '読み直す' : 'カメラ開始'}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            stopCamera('カメラを停止しました。');
            if (saveState === 'scanning') setSaveState('idle');
          }}
          disabled={!isScanning || saveState === 'saving'}
        >
          カメラ停止
        </button>
      </div>

      {cameraErrorMessage ? (
        <div className="inline-error" role="alert">
          {cameraErrorMessage}
        </div>
      ) : null}

      <div className="manual-barcode-box">
        <label>
          <span>読み取れない場合の手入力</span>
          <input
            className="operator-input"
            inputMode="numeric"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="バーコード番号を入力"
            disabled={saveState === 'saving'}
          />
        </label>
        <button className="secondary-button" type="button" onClick={applyManualCode} disabled={!manualCode.trim() || saveState === 'saving'}>
          手入力でセット
        </button>
      </div>

      <div className="barcode-result-panel">
        <span>読み取ったバーコード</span>
        <strong>{barcode || '未読取'}</strong>
        <small>
          {readAt ? `読み込み日時: ${formatDateTimeForDisplay(readAt)}` : '読み込み日時: 未読取'}
          {barcodeFormat ? ` / 形式: ${barcodeFormat}` : ''}
        </small>
      </div>

      <div className="sticky-actions send-actions">
        {saveState === 'saved' ? (
          <>
            <p className="saved-message">
              保存完了{savedSheet ? ` / 保存先 ${savedSheet}` : ''}{savedRow ? ` / 行 ${savedRow}` : ''}{requestId ? ` / ID ${requestId}` : ''}
            </p>
            <button className="primary-button" type="button" onClick={onStartOver}>
              次の申込表を撮影する
            </button>
          </>
        ) : (
          <>
            <button className="primary-button send-button" type="button" onClick={submitData} disabled={!barcode || saveState === 'saving'}>
              {saveState === 'saving' ? '送信中...' : 'データを送る'}
            </button>
            {sendErrorMessage ? (
              <div className="inline-error send-error" role="alert">
                {sendErrorMessage}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
