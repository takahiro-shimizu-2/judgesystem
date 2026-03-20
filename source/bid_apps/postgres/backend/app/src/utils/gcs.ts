import { Storage, File } from '@google-cloud/storage';

// GCS クライアントを初期化
const storage = new Storage();

/**
 * gs:// パスから GCS ファイルオブジェクトを取得
 */
function getGcsFile(gcsPath: string): File {
  if (!gcsPath || !gcsPath.startsWith('gs://')) {
    throw new Error(`Invalid GCS path: ${gcsPath}`);
  }

  const pathWithoutPrefix = gcsPath.replace('gs://', '');
  const firstSlashIndex = pathWithoutPrefix.indexOf('/');

  if (firstSlashIndex === -1) {
    throw new Error(`Invalid GCS path format: ${gcsPath}`);
  }

  const bucketName = pathWithoutPrefix.substring(0, firstSlashIndex);
  const filePath = pathWithoutPrefix.substring(firstSlashIndex + 1);

  return storage.bucket(bucketName).file(filePath);
}

/**
 * GCS から Markdown ファイルの内容を取得する
 * @param gcsPath - gs://bucket-name/path/to/file.md の形式のパス
 * @returns Markdown ファイルの内容
 */
export async function readMarkdownFromGCS(gcsPath: string): Promise<string> {
  try {
    const file = getGcsFile(gcsPath);
    const [content] = await file.download();
    return content.toString('utf-8');
  } catch (error) {
    console.error(`Failed to read from GCS: ${gcsPath}`, error);
    throw new Error(`Failed to read markdown from GCS: ${gcsPath}`);
  }
}

/**
 * 任意ファイルを Buffer として取得
 */
export async function downloadFileFromGCS(gcsPath: string): Promise<Buffer> {
  try {
    const file = getGcsFile(gcsPath);
    const [content] = await file.download();
    return content;
  } catch (error) {
    console.error(`Failed to download file from GCS: ${gcsPath}`, error);
    throw new Error(`Failed to download file from GCS: ${gcsPath}`);
  }
}

/**
 * 複数の GCS パスから Markdown ファイルの内容を並列で取得する
 * @param gcsPaths - GCS パスの配列
 * @returns Markdown 内容の配列（順序は入力と同じ）
 */
export async function readMultipleMarkdownFromGCS(gcsPaths: string[]): Promise<string[]> {
  const promises = gcsPaths.map(path => readMarkdownFromGCS(path));
  return Promise.all(promises);
}
