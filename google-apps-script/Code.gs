/**
 * OCR + Barcode receiver for Google Sheets.
 *
 * 使い方:
 * 1. 保存先のGoogleスプレッドシートを開く
 * 2. 拡張機能 > Apps Script を開く
 * 3. このファイルの中身を Code.gs に貼り付ける
 * 4. setupOnce() 内の secret を変更して、setupOnce を1回実行する
 * 5. デプロイ > 新しいデプロイ > ウェブアプリ で公開する
 */

const CONFIG = {
  BARCODE_ONLY_SHEET_NAME: 'Scans',
  OCR_BARCODE_SHEET_NAME: 'OCR_Barcode',
  TIME_ZONE: 'Asia/Tokyo',
  BARCODE_ONLY_HEADER: [
    '記録日時(JST)',
    '読み込み日時(端末/JST)',
    'バーコード番号',
    'バーコード形式',
    '担当者/端末名',
    'User-Agent',
    'Vercel受信日時(JST)',
    'リクエストID',
  ],
  OCR_BARCODE_HEADER: [
    'バーコード番号',
    '記録日時(JST)',
    '合計金額',
    '助成金',
    '優待券',
    '差引支払金額',
    '優待券消化額',
    '読み込み日時(端末/JST)',
    'バーコード形式',
    '担当者/端末名',
    'User-Agent',
    'Vercel受信日時(JST)',
    'リクエストID',
  ],
};

/**
 * 初回だけ実行してください。
 * secret は Vercel の GAS_SHARED_SECRET と同じ文字列にします。
 */
function setupOnce() {
  const secret = 'change_this_to_a_long_random_string';
  PropertiesService.getScriptProperties().setProperty('SHARED_SECRET', secret);

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const barcodeSheet = getOrCreateSheet_(spreadsheet, CONFIG.BARCODE_ONLY_SHEET_NAME);
  ensureHeader_(barcodeSheet, CONFIG.BARCODE_ONLY_HEADER);
  barcodeSheet.setFrozenRows(1);

  const ocrBarcodeSheet = getOrCreateSheet_(spreadsheet, CONFIG.OCR_BARCODE_SHEET_NAME);
  ensureHeader_(ocrBarcodeSheet, CONFIG.OCR_BARCODE_HEADER);
  ocrBarcodeSheet.setFrozenRows(1);
  setOcrBarcodeNumberFormat_(ocrBarcodeSheet);
}

function doGet() {
  return json_({ ok: true, message: 'OCR + Barcode receiver is running.' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const payload = parsePayload_(e);
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');

    if (!expectedSecret) {
      return json_({ ok: false, error: 'Apps Script の SHARED_SECRET が未設定です。setupOnce() を実行してください。' });
    }

    if (String(payload.secret || '') !== expectedSecret) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    if (String(payload.mode || '') === 'ocrBarcode') {
      return appendOcrBarcodeRow_(payload);
    }

    return appendBarcodeOnlyRow_(payload);
  } catch (error) {
    return json_({ ok: false, error: error && error.message ? error.message : String(error) });
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function appendOcrBarcodeRow_(payload) {
  const barcode = normalizeText_(payload.barcode, 256);
  if (!barcode) {
    return json_({ ok: false, error: 'barcode が空です。' });
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet_(spreadsheet, CONFIG.OCR_BARCODE_SHEET_NAME);
  ensureHeader_(sheet, CONFIG.OCR_BARCODE_HEADER);

  const requestId = Utilities.getUuid();
  const recordedAtText = formatDate_(new Date());
  const readAtText = formatDateOrRaw_(payload.readAt, 80);
  const appReceivedAtText = formatDateOrRaw_(payload.appReceivedAt, 80);

  sheet.appendRow([
    barcode,
    recordedAtText,
    normalizeNumber_(payload.totalAmount),
    normalizeNumber_(payload.subsidyAmount),
    normalizeNumber_(payload.voucherAmount),
    normalizeNumber_(payload.payableAmount),
    normalizeNumber_(payload.voucherUsed),
    readAtText,
    normalizeText_(payload.format, 64),
    normalizeText_(payload.operator, 100),
    normalizeText_(payload.userAgent, 500),
    appReceivedAtText,
    requestId,
  ]);

  SpreadsheetApp.flush();
  const row = sheet.getLastRow();

  return json_({ ok: true, row, requestId, sheet: CONFIG.OCR_BARCODE_SHEET_NAME });
}

function appendBarcodeOnlyRow_(payload) {
  const barcode = normalizeText_(payload.barcode, 256);
  if (!barcode) {
    return json_({ ok: false, error: 'barcode が空です。' });
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet_(spreadsheet, CONFIG.BARCODE_ONLY_SHEET_NAME);
  ensureHeader_(sheet, CONFIG.BARCODE_ONLY_HEADER);

  const requestId = Utilities.getUuid();
  const recordedAtText = formatDate_(new Date());
  const readAtText = formatDateOrRaw_(payload.readAt, 80);
  const appReceivedAtText = formatDateOrRaw_(payload.appReceivedAt, 80);

  sheet.appendRow([
    recordedAtText,
    readAtText,
    barcode,
    normalizeText_(payload.format, 64),
    normalizeText_(payload.operator, 100),
    normalizeText_(payload.userAgent, 500),
    appReceivedAtText,
    requestId,
  ]);

  SpreadsheetApp.flush();
  const row = sheet.getLastRow();

  return json_({ ok: true, row, requestId, sheet: CONFIG.BARCODE_ONLY_SHEET_NAME });
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (error) {
      // JSONではないPOSTの場合はURLパラメータとして扱います。
      return e.parameter || {};
    }
  }
  return (e && e.parameter) || {};
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

function ensureHeader_(sheet, header) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
    return;
  }

  const firstRowRange = sheet.getRange(1, 1, 1, header.length);
  const firstRowValues = firstRowRange.getValues()[0];
  const isEmpty = firstRowValues.every(function (value) {
    return value === '' || value === null;
  });

  if (isEmpty) {
    firstRowRange.setValues([header]);
    sheet.setFrozenRows(1);
  }
}

function setOcrBarcodeNumberFormat_(sheet) {
  // C〜G列: 合計金額、助成金、優待券、差引支払金額、優待券消化額
  sheet.getRange('C:G').setNumberFormat('#,##0');
}

function formatDate_(date) {
  return Utilities.formatDate(date, CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
}

function formatDateOrRaw_(value, maxLength) {
  const text = normalizeText_(value, maxLength);
  if (!text) return '';

  const date = new Date(text);
  if (isNaN(date.getTime())) return text;
  return formatDate_(date);
}

function normalizeNumber_(value) {
  if (typeof value === 'number' && isFinite(value)) {
    return Math.floor(value);
  }

  const text = normalizeText_(value, 80)
    .replace(/[０-９]/g, function (char) {
      return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
    })
    .replace(/[¥,円\s]/g, '');

  if (!text) return 0;
  const parsed = parseInt(text, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function normalizeText_(value, maxLength) {
  if (value === null || typeof value === 'undefined') return '';
  return String(value).trim().slice(0, maxLength);
}

function json_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Apps Script エディタ上でOCR+バーコード保存を確認したい場合に使います。
 * setupOnce() 実行後、この関数を実行すると OCR_Barcode シートにテスト行が追加されます。
 */
function testWriteOcrBarcode() {
  const secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        mode: 'ocrBarcode',
        secret: secret,
        barcode: 'TEST-OCR-1234567890',
        totalAmount: 12800,
        subsidyAmount: -5000,
        voucherAmount: -4000,
        payableAmount: 3800,
        voucherUsed: 4000,
        readAt: new Date().toISOString(),
        format: 'TEST',
        operator: 'Apps Script test',
        userAgent: 'Apps Script editor',
        appReceivedAt: new Date().toISOString(),
      }),
    },
  };

  const result = doPost(fakeEvent);
  Logger.log(result.getContent());
}

/**
 * 旧バーコード単体の保存を確認したい場合に使います。
 */
function testWriteBarcodeOnly() {
  const secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        secret: secret,
        barcode: 'TEST-1234567890',
        readAt: new Date().toISOString(),
        format: 'TEST',
        operator: 'Apps Script test',
        userAgent: 'Apps Script editor',
        appReceivedAt: new Date().toISOString(),
      }),
    },
  };

  const result = doPost(fakeEvent);
  Logger.log(result.getContent());
}
