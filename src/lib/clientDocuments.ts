/** Papers a company may keep on file for a client. */
export const CLIENT_DOCUMENT_KINDS = [
  "KRA PIN certificate",
  "Certificate of registration",
  "CR12",
  "National ID",
  "Business permit",
  "Lease or title deed",
  "Signed service agreement",
  "Other",
] as const;

export type ClientDocumentKind = (typeof CLIENT_DOCUMENT_KINDS)[number];

/** What a registered company is asked for; each can take several files. */
export const BUSINESS_DOCUMENT_KINDS = ["KRA PIN certificate", "Certificate of registration", "CR12"] as const;

export const isBusinessKind = (kind: string) => (BUSINESS_DOCUMENT_KINDS as readonly string[]).includes(kind);

/** The business papers not yet among `kinds`; a business can't be registered without them. */
export const missingBusinessKinds = (kinds: string[]) => BUSINESS_DOCUMENT_KINDS.filter((k) => !kinds.includes(k));

/** At most this many documents go with one registration. */
export const MAX_CLIENT_DOCUMENTS = 12;

/** A document as sent with a registration: an uploaded file and what it is. */
export interface ClientDocumentInput {
  file: string;
  kind: ClientDocumentKind;
  name: string;
}

export interface ClientDocument extends ClientDocumentInput {
  id: number;
  mime: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}
