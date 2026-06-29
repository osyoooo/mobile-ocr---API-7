export type Book = {
  no: number;
  title: string;
  price: number;
};

export type QuantityRow = {
  no: number;
  quantity: number;
  raw: string;
  needsReview: boolean;
  confidence: number;
};

export type FullTableOcrResult = {
  targetFound: boolean;
  targetTitle: string;
  quantities: QuantityRow[];
  warnings: string[];
};

export type FullTableOcrApiSuccess = {
  ok: true;
  result: FullTableOcrResult;
  meta: {
    model: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  };
};

export type FullTableOcrApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    status?: number;
  };
};

export type FullTableOcrApiResponse = FullTableOcrApiSuccess | FullTableOcrApiError;
