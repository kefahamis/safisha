/** Papers a company may keep on file for a client. */
export const CLIENT_DOCUMENT_KINDS = [
  "National ID",
  "Business permit",
  "KRA PIN certificate",
  "Lease or title deed",
  "Signed service agreement",
  "Other",
] as const;

export type ClientDocumentKind = (typeof CLIENT_DOCUMENT_KINDS)[number];

/** At most this many documents go with one registration. */
export const MAX_CLIENT_DOCUMENTS = 6;

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
