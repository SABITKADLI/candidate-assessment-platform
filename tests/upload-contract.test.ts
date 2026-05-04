import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UPLOAD_CONTRACTS,
  extensionForMimeType,
  isAllowedMimeType,
} from '../apps/candidate/lib/upload-contract';

test('upload contracts keep large artifacts off Vercel Functions', () => {
  assert.equal(UPLOAD_CONTRACTS.async_video.maxBytes, 150 * 1024 * 1024);
  assert.equal(UPLOAD_CONTRACTS.verbal_audio.maxBytes, 40 * 1024 * 1024);
  assert.equal(UPLOAD_CONTRACTS.resume.prefix, 'resumes');
  assert.equal(UPLOAD_CONTRACTS.async_video.prefix, 'async_video');
  assert.equal(UPLOAD_CONTRACTS.verbal_audio.prefix, 'verbal');
});

test('upload contracts reject mismatched MIME types', () => {
  assert.equal(isAllowedMimeType(UPLOAD_CONTRACTS.resume, 'application/pdf'), true);
  assert.equal(isAllowedMimeType(UPLOAD_CONTRACTS.resume, 'video/webm'), false);
  assert.equal(isAllowedMimeType(UPLOAD_CONTRACTS.id_photo, 'image/png'), false);
});

test('upload contracts derive stable object extensions', () => {
  assert.equal(extensionForMimeType(UPLOAD_CONTRACTS.resume, 'application/pdf'), 'pdf');
  assert.equal(extensionForMimeType(UPLOAD_CONTRACTS.resume, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx');
  assert.equal(extensionForMimeType(UPLOAD_CONTRACTS.verbal_audio, 'audio/ogg;codecs=opus'), 'ogg');
});
