import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client: S3Client | null = null;

function s3Client(): S3Client {
  _client ??= new S3Client({
    region: process.env.AWS_REGION ?? 'eu-north-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        }
      : undefined,
  });
  return _client;
}

export async function presignGet(s3Key: string, expiresIn = 3600): Promise<string | null> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
  return getSignedUrl(s3Client(), cmd, { expiresIn });
}
