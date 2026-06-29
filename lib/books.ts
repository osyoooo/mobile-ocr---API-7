import type { Book } from '@/types';

export const BOOKS: Book[] = [
  { no: 1, title: '法人税基本通達逐条解説', price: 10890 },
  { no: 2, title: '法人税関係 租税特別措置法通達逐条解説', price: 9702 },
  { no: 3, title: '税務インデックス', price: 1881 },
  { no: 4, title: '消費税Q&A大全', price: 6237 },
  { no: 5, title: '顧客の信頼を得る交付と税務調査を想定した保存 インボイスQA', price: 2277 },
  { no: 6, title: '資産税実例回答集', price: 8613 },
  { no: 7, title: '小規模宅地特例100', price: 2970 },
  { no: 8, title: '医療法人をつなぐ 承継・M&Aの実務ポイント', price: 2772 },
  { no: 9, title: 'ゼロからわかる 私的整理手続90問90答', price: 3564 },
  { no: 10, title: '資金繰りとキャッシュフロー', price: 2178 },
  { no: 11, title: '法人税申告書 別表四、五（一）のケース・スタディ', price: 3465 },
  { no: 12, title: '法人税入門の入門', price: 1980 },
  { no: 13, title: '実務家のための 減価償却資産等の留意点', price: 2178 },
  { no: 14, title: 'オーナーと同族会社間の税務', price: 3465 },
  { no: 15, title: '出向・転籍の税務', price: 4950 },
  { no: 16, title: '「固定資産の税務・会計」完全解説', price: 4356 },
  { no: 17, title: '否認事例にみる 法人税・消費税 修正申告の実務', price: 3465 },
  { no: 18, title: '質問応答記録書のポイントと税理士の対応策', price: 2970 },
  { no: 19, title: '「新リース会計基準と税務」完全解説', price: 3267 },
  { no: 20, title: '年収の壁をめぐる 税務・社会保険の実務ハンドブック', price: 1881 },
  { no: 21, title: '国際税務NEWケース・スタディ', price: 4455 },
  { no: 22, title: '移転価格税制についての素朴な疑問', price: 5445 },
];

export function getBookByNo(no: number): Book {
  const book = BOOKS.find((item) => item.no === no);
  if (!book) {
    throw new Error(`Book not found: No${no}`);
  }
  return book;
}
