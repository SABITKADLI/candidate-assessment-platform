import type { StageGroup, StageKey } from '@cap/shared';

export type UploadKind =
  | 'resume'
  | 'id_photo'
  | 'liveness_frame'
  | 'async_video'
  | 'verbal_audio';

export type UploadContract = {
  kind: UploadKind;
  stageKey: StageKey;
  stageGroup: StageGroup;
  artifactKind: 'resume' | 'liveness' | 'video' | 'audio';
  prefix: string;
  maxBytes: number;
  allowedMimeTypes: readonly string[];
  fallbackExtension: string;
};

export const UPLOAD_CONTRACTS: Record<UploadKind, UploadContract> = {
  resume: {
    kind: 'resume',
    stageKey: 'A_RESUME',
    stageGroup: 'A',
    artifactKind: 'resume',
    prefix: 'resumes',
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    fallbackExtension: 'pdf',
  },
  id_photo: {
    kind: 'id_photo',
    stageKey: 'A_ID_LIVENESS',
    stageGroup: 'A',
    artifactKind: 'liveness',
    prefix: 'liveness',
    maxBytes: 4 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg'],
    fallbackExtension: 'jpg',
  },
  liveness_frame: {
    kind: 'liveness_frame',
    stageKey: 'A_ID_LIVENESS',
    stageGroup: 'A',
    artifactKind: 'liveness',
    prefix: 'liveness',
    maxBytes: 4 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg'],
    fallbackExtension: 'jpg',
  },
  async_video: {
    kind: 'async_video',
    stageKey: 'B_ASYNC_VIDEO',
    stageGroup: 'B',
    artifactKind: 'video',
    prefix: 'async_video',
    maxBytes: 150 * 1024 * 1024,
    allowedMimeTypes: ['video/webm', 'video/mp4'],
    fallbackExtension: 'webm',
  },
  verbal_audio: {
    kind: 'verbal_audio',
    stageKey: 'B_VERBAL',
    stageGroup: 'B',
    artifactKind: 'audio',
    prefix: 'verbal',
    maxBytes: 40 * 1024 * 1024,
    allowedMimeTypes: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'],
    fallbackExtension: 'webm',
  },
};

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
};

export function getUploadContract(kind: UploadKind): UploadContract {
  return UPLOAD_CONTRACTS[kind];
}

export function isAllowedMimeType(contract: UploadContract, mimeType: string): boolean {
  return contract.allowedMimeTypes.includes(normalizeMimeType(mimeType));
}

export function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() || 'application/octet-stream';
}

export function extensionForMimeType(contract: UploadContract, mimeType: string): string {
  return MIME_EXTENSIONS[normalizeMimeType(mimeType)] ?? contract.fallbackExtension;
}
