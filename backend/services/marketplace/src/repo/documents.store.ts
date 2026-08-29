// Mentor ID documents live in a PRIVATE S3 bucket (block-all-public-access, SSE, versioned).
// The browser never sees a stored URL: uploads go through a short-TTL presigned PUT to a
// SERVER-generated key, admin reads through a short-TTL presigned GET minted per request and
// written to the audit trail. Uploaded ID cards are sensitive personal data of (often) minors.
//
// Local dev / tests use an in-memory store with the same contract (no S3, no network).
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectTaggingCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// The presigner + client each pin their own @smithy/types copy in the pnpm store; the runtime
// contract is identical, so the client is passed through a structural cast.
type PresignClient = Parameters<typeof getSignedUrl>[0];
type PresignCommand = Parameters<typeof getSignedUrl>[1];
import { getEnv, isLocal } from '@sc/config';

export const PUT_TTL_SEC = 5 * 60;   // the browser uploads right away
export const GET_TTL_SEC = 3 * 60;   // an admin preview, minted per click

export interface PresignedPut { url: string; method: 'PUT'; headers: Record<string, string>; expiresInSec: number }
export interface PresignedGet { url: string; expiresInSec: number }
export interface ObjectMeta { contentType?: string; sizeBytes: number }

export interface DocumentStore {
  presignPut(key: string, contentType: string): Promise<PresignedPut>;
  head(key: string): Promise<ObjectMeta | null>;
  presignGet(key: string): Promise<PresignedGet>;
  tag(key: string, tags: Record<string, string>): Promise<void>;
  remove(key: string): Promise<void>;
}

class S3DocumentStore implements DocumentStore {
  private readonly s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });
  constructor(private readonly bucket: string) {}
  async presignPut(key: string, contentType: string): Promise<PresignedPut> {
    // ContentType is part of the signature → the browser must send exactly this header.
    const url = await getSignedUrl(this.s3 as unknown as PresignClient, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }) as unknown as PresignCommand, { expiresIn: PUT_TTL_SEC });
    return { url, method: 'PUT', headers: { 'content-type': contentType }, expiresInSec: PUT_TTL_SEC };
  }
  async head(key: string): Promise<ObjectMeta | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { contentType: r.ContentType, sizeBytes: r.ContentLength ?? 0 };
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey' || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }
  async presignGet(key: string): Promise<PresignedGet> {
    const url = await getSignedUrl(this.s3 as unknown as PresignClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }) as unknown as PresignCommand, { expiresIn: GET_TTL_SEC });
    return { url, expiresInSec: GET_TTL_SEC };
  }
  async tag(key: string, tags: Record<string, string>): Promise<void> {
    await this.s3.send(new PutObjectTaggingCommand({ Bucket: this.bucket, Key: key, Tagging: { TagSet: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) } }));
  }
  async remove(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** DEV/TEST: same contract, no S3. A presigned key counts as uploaded (the browser PUT is out of scope locally). */
export class MemoryDocumentStore implements DocumentStore {
  readonly objects = new Map<string, ObjectMeta & { tags?: Record<string, string> }>();
  async presignPut(key: string, contentType: string): Promise<PresignedPut> {
    this.objects.set(key, { contentType, sizeBytes: 0 });
    return { url: `memory://${key}`, method: 'PUT', headers: { 'content-type': contentType }, expiresInSec: PUT_TTL_SEC };
  }
  /** test hook: pretend the browser uploaded `sizeBytes` bytes */
  setSize(key: string, sizeBytes: number): void {
    const cur = this.objects.get(key);
    if (cur) cur.sizeBytes = sizeBytes;
  }
  async head(key: string): Promise<ObjectMeta | null> {
    const o = this.objects.get(key);
    return o ? { contentType: o.contentType, sizeBytes: o.sizeBytes } : null;
  }
  async presignGet(key: string): Promise<PresignedGet> {
    return { url: `memory://${key}?signed`, expiresInSec: GET_TTL_SEC };
  }
  async tag(key: string, tags: Record<string, string>): Promise<void> {
    const cur = this.objects.get(key);
    if (cur) cur.tags = { ...(cur.tags ?? {}), ...tags };
  }
  async remove(key: string): Promise<void> { this.objects.delete(key); }
}

let store: DocumentStore | null = null;
export function getDocumentStore(): DocumentStore {
  if (store) return store;
  const bucket = getEnv().BUCKET_MENTOR_DOCS;
  store = !isLocal() && bucket ? new S3DocumentStore(bucket) : new MemoryDocumentStore();
  return store;
}
/** Test hook. */
export function setDocumentStore(s: DocumentStore | null): void { store = s; }
