import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          }
        : undefined,
    });
  }
  return _client;
}

/**
 * Upload a buffer to S3 if S3_BUCKET is configured.
 * Returns the effective storage key used in the DB (S3 key or local path).
 */
export async function s3PutObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return;

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    }),
  );
}

/** Returns the key that should be stored in the DB. */
export function resolveStorageKey(s3Key: string, localPath: string): string {
  return process.env.S3_BUCKET ? s3Key : localPath;
}
