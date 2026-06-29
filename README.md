# 書籍申込 OCR・バーコード保存アプリ ver2

スマホで書籍申込表を撮影し、OpenAI APIで申込冊数を読み取り、アプリ側の価格マスタで金額を確定します。金額確認後に一次元バーコードを読み取り、バーコード番号と金額情報をGoogleスプレッドシートへ保存します。

## できること

- iOS / Android のブラウザで利用
- スマホ標準カメラで申込表を撮影
- 既存のOCR構成を維持して、No1〜No22の申込冊数を読み取り
- 合計冊数、合計金額、助成金、優待券、差引支払金額、優待券消化額を確認
- 「問題なければバーコード読み取りへ」ボタンでバーコード画面へ移動
- 一次元バーコードを読み取り
- 読み取り後に「データを送る」ボタンを押して保存
- Vercelアプリ全体に固定ID・パスワードを設定可能
- スプレッドシートは「制限付き共有」のままで運用可能

## 画面の流れ

```text
カメラ起動
↓
OCR取り込み
↓
金額確認・必要なら修正
↓
問題なければバーコード読み取りへ
↓
バーコード読み取り
↓
データを送る
↓
Googleスプレッドシートへ保存
```

次のアクションへ進むときは、基本的にボタンを押す設計です。バーコードは読み取っただけでは保存されません。読み取ったバーコード番号を確認してから「データを送る」を押します。

## 保存先シート

同じGoogleスプレッドシート内に、以下のシートを使います。

```text
Scans
  旧バーコード単体アプリ用。必要なければ使わなくてもOKです。

OCR_Barcode
  OCR金額 + バーコード番号を保存する新しいシートです。
```

この統合アプリから送られるデータは `OCR_Barcode` シートへ保存されます。

保存される列は以下です。

```text
バーコード番号
記録日時(JST)
合計金額
助成金
優待券
差引支払金額
優待券消化額
読み込み日時(端末/JST)
バーコード形式
担当者/端末名
User-Agent
Vercel受信日時(JST)
リクエストID
```

## 環境変数

Vercel の Project Settings > Environment Variables に以下を設定してください。

```text
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_IMAGE_DETAIL
GAS_WEB_APP_URL
GAS_SHARED_SECRET
APP_ACCESS_USER
APP_ACCESS_PASSWORD
```

最低限必須なのは以下です。

```text
OPENAI_API_KEY
GAS_WEB_APP_URL
GAS_SHARED_SECRET
APP_ACCESS_PASSWORD
```

`APP_ACCESS_USER` を省略した場合は `scanner` が使われます。

例です。

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_DETAIL=high

GAS_WEB_APP_URL=https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
GAS_SHARED_SECRET=自分で決めた長いsecret

APP_ACCESS_USER=scanner
APP_ACCESS_PASSWORD=自分で決めた長いアプリ用パスワード
```

`GAS_SHARED_SECRET` と `APP_ACCESS_PASSWORD` の本物の値はGitHubに書かず、Vercelの環境変数に入れてください。

## Googleスプレッドシート / Apps Script設定

### 1. スプレッドシートの共有設定

スプレッドシートは以下の状態にします。

```text
一般的なアクセス: 制限付き
あなた: オーナー
承認した管理者: 必要なら閲覧者または編集者
作業者: 共有しない
```

作業者にはスプレッドシートURLを渡さず、VercelアプリのURL、固定ID、固定パスワードだけ渡します。

### 2. Apps Scriptを更新

スプレッドシートを開きます。

```text
拡張機能
↓
Apps Script
```

このリポジトリの以下のファイルを開き、Apps Scriptの `Code.gs` に丸ごと貼り付けます。

```text
google-apps-script/Code.gs
```

`setupOnce()` の中にある以下を、自分のsecretに変更します。

```js
const secret = 'change_this_to_a_long_random_string';
```

例です。

```js
const secret = 'bcr_2026_9f8a7c2d4e6b1a0c3d5e7f9a2b4c6d8e';
```

この値をVercelの `GAS_SHARED_SECRET` にも同じように設定します。

### 3. setupOnceを実行

Apps Scriptエディタ上部の関数選択で `setupOnce` を選び、1回実行します。

これで以下のシートとヘッダーが作成されます。

```text
Scans
OCR_Barcode
```

疎通確認したい場合は、Apps Script上で `testWriteOcrBarcode` を実行してください。`OCR_Barcode` シートにテスト行が入ればOKです。

### 4. Webアプリを再デプロイ

既存のApps Scriptデプロイを使う場合でも、Code.gsを変更した後は新しいバージョンとして再デプロイしてください。

```text
デプロイ
↓
デプロイを管理
↓
鉛筆アイコンで編集
↓
バージョン: 新バージョン
↓
デプロイ
```

初回デプロイの場合は以下です。

```text
デプロイ
↓
新しいデプロイ
↓
種類: ウェブアプリ
↓
次のユーザーとして実行: 自分
アクセスできるユーザー: 全員
```

`アクセスできるユーザー: 全員` は、VercelからApps Scriptを呼べるようにするためです。スプレッドシート自体を全員公開する意味ではありません。スプレッドシートは「制限付き共有」のままで大丈夫です。

デプロイ後、末尾が `/exec` のウェブアプリURLをVercelの `GAS_WEB_APP_URL` に入れます。

## Vercel設定

GitHubにこのリポジトリをアップし、VercelでImportします。

Vercelの環境変数に以下を入れます。

```text
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_IMAGE_DETAIL
GAS_WEB_APP_URL
GAS_SHARED_SECRET
APP_ACCESS_USER
APP_ACCESS_PASSWORD
```

環境変数を変更したら、必ず再デプロイしてください。

## ローカル起動

```bash
npm install
cp .env.example .env.local
npm run dev
```

ブラウザで以下を開きます。

```text
http://localhost:3000
```

スマホカメラを実機で確認する場合は、VercelのHTTPS URLでテストするのが確実です。

## 価格・差引計算

価格は `lib/books.ts` に固定で入れています。

助成金・優待券は `lib/calc.ts` で計算しています。

```ts
const amountAfterSubsidy = Math.max(0, totalAmount - 5000);
const voucherFaceValue = Math.abs(voucherAmount);
const voucherUsed = Math.min(amountAfterSubsidy, voucherFaceValue);
const payableAmount = Math.max(0, amountAfterSubsidy - voucherUsed);
```

- 助成金は常に `-5,000円` 固定です。
- 優待券のデフォルトは `-4,000円` です。
- 優待券は `-4,000円 / -2,000円 / -6,000円 / 0円` から選択できます。
- 差引支払金額がマイナスになる場合は `0円` として表示します。
- 優待券消化額は、助成金適用後の残額に対して、実際に使えた優待券の金額です。

## 既存アプリからの主な追加ファイル

```text
components/OcrBarcodeScanner.tsx
app/api/submit-ocr-barcode/route.ts
google-apps-script/Code.gs
google-apps-script/appsscript.json
middleware.ts
```

主な変更ファイルは以下です。

```text
components/QuantityReview.tsx
components/ResultSummary.tsx
app/globals.css
app/layout.tsx
package.json
.env.example
README.md
```

## Vercelデプロイ時の注意

このリポジトリでは `package-lock.json` をコミットしない構成にしています。生成環境によっては lockfile の `resolved` URL が社内・一時的なnpmミラーを指してしまい、Vercel の `npm install` が失敗することがあるためです。

`vercel.json` で Vercel の install command を以下に固定しています。

```bash
npm install --package-lock=false --no-audit --no-fund --registry=https://registry.npmjs.org/
```
