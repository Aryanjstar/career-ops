/**
 * Azure Blob Storage client for uploading generated artifacts (resumes, cover letters).
 *
 * Required env vars:
 *   AZURE_STORAGE_CONNECTION_STRING — full connection string
 *   AZURE_STORAGE_CONTAINER — container name (default: "hireforge-artifacts")
 */

import { BlobServiceClient } from '@azure/storage-blob';
import { readFileSync, existsSync } from 'fs';
import { basename } from 'path';
import { createLogger } from './logger.mjs';

const log = createLogger('azure-storage');

let _client = null;
let _containerClient = null;

function getContainerClient() {
  if (_containerClient) return _containerClient;

  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) {
    log.warn('AZURE_STORAGE_CONNECTION_STRING not set — uploads disabled');
    return null;
  }

  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'hireforge-artifacts';

  try {
    _client = BlobServiceClient.fromConnectionString(connStr);
    _containerClient = _client.getContainerClient(containerName);
    return _containerClient;
  } catch (e) {
    log.error('Azure Storage init failed', { err: e.message });
    return null;
  }
}

/**
 * Upload a local file to Azure Blob Storage.
 * @param {string} filePath - Local path to the file
 * @param {string} [blobFolder] - Optional folder prefix in the container (e.g., "resumes/2025-04")
 * @returns {Promise<{url: string, blobName: string} | null>} Public URL if successful
 */
export async function uploadToBlob(filePath, blobFolder = '') {
  if (!existsSync(filePath)) {
    log.warn('File not found, skipping upload', { filePath });
    return null;
  }

  const container = getContainerClient();
  if (!container) return null;

  try {
    await container.createIfNotExists({ access: 'blob' });

    const fileName = basename(filePath);
    const blobName = blobFolder ? `${blobFolder}/${fileName}` : fileName;
    const blockBlob = container.getBlockBlobClient(blobName);

    const data = readFileSync(filePath);
    const contentType = filePath.endsWith('.pdf')
      ? 'application/pdf'
      : filePath.endsWith('.tex')
        ? 'text/plain'
        : 'application/octet-stream';

    await blockBlob.uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType },
      overwrite: true,
    });

    log.info('Uploaded to Azure Blob', { blobName, size: data.length });
    return { url: blockBlob.url, blobName };
  } catch (e) {
    log.error('Azure Blob upload failed', { err: e.message, filePath });
    return null;
  }
}

/**
 * Upload resume and cover letter artifacts after generation.
 * @param {Object} opts
 * @param {string} opts.company
 * @param {string} opts.role
 * @param {string} [opts.pdfPath] - Resume PDF path
 * @param {string} [opts.coverLetterPath] - Cover letter PDF path
 * @returns {Promise<{resumeUrl?: string, coverLetterUrl?: string}>}
 */
export async function uploadJobArtifacts({ company, role, pdfPath, coverLetterPath }) {
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const date = new Date().toISOString().split('T')[0];
  const folder = `${date}/${slug}`;

  const result = {};

  if (pdfPath) {
    const r = await uploadToBlob(pdfPath, `resumes/${folder}`);
    if (r) result.resumeUrl = r.url;
  }

  if (coverLetterPath) {
    const cl = await uploadToBlob(coverLetterPath, `cover-letters/${folder}`);
    if (cl) result.coverLetterUrl = cl.url;
  }

  return result;
}
