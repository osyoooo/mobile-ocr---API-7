const DEFAULT_MAX_LONG_EDGE = 1800;
const DEFAULT_JPEG_QUALITY = 0.82;

export type ImageCompressionOptions = {
  maxLongEdge?: number;
  jpegQuality?: number;
};

export async function fileToCompressedDataUrl(
  file: File,
  options: ImageCompressionOptions = {},
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('画像ファイルを選択してください。');
  }

  const maxLongEdge = options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const jpegQuality = options.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const { width, height } = getContainedSize(image.naturalWidth, image.naturalHeight, maxLongEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('画像処理用のCanvasを作成できませんでした。');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', jpegQuality);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    image.src = src;
  });
}

function getContainedSize(width: number, height: number, maxLongEdge: number) {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width, height };
  }

  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
