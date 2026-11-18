import 'server-only'

import { PDFDocument } from 'pdf-lib'
import { downloadLuxorPrivatePdf, saveLuxorPrivatePdf } from './luxorDocumentsServer'
import { embedLuxorCreatedDocumentFonts } from './luxorCreatedDocumentPdfFontsServer'
import {
  decodeLuxorSignaturePng,
  stampLuxorFieldsOnPdf,
  type LuxorFieldStampValue,
} from './luxorCreatedDocumentFieldStamp'
import { listLuxorCreatedDocumentFieldsForRole } from './luxorCreatedDocumentFieldsServer'
import { getLuxorCreatedDocument } from './luxorDocumentCreatorServer'

function signedPdfPath(documentId: string, signerId: string) {
  return `created-documents/${documentId}/signed/${signerId}.pdf`
}

export async function buildLuxorCreatedDocumentSignedPdf(input: {
  documentId: string
  signerId: string
  roleKey: string
  fieldValues: Record<string, unknown>
  signatureDataUrl: string
}) {
  const document = await getLuxorCreatedDocument(input.documentId)
  if (!document?.pdf_storage_path) throw new Error('The document PDF is not ready yet.')

  const roleFields = await listLuxorCreatedDocumentFieldsForRole(input.documentId, input.roleKey)
  const pdfBytes = await downloadLuxorPrivatePdf(document.pdf_storage_path)
  const pdf = await PDFDocument.load(pdfBytes)
  const fonts = await embedLuxorCreatedDocumentFonts(pdf)
  const signaturePng = decodeLuxorSignaturePng(input.signatureDataUrl)

  const stamps: LuxorFieldStampValue[] = roleFields.map((field) => {
    const raw = input.fieldValues[field.id]
    if (field.field_type === 'checkbox') {
      return { fieldId: field.id, fieldType: field.field_type, value: raw === true }
    }
    const text = typeof raw === 'string' ? raw : ''
    const needsImage = field.field_type === 'signature' || field.field_type === 'initials'
    return {
      fieldId: field.id,
      fieldType: field.field_type,
      value: text,
      ...(needsImage && signaturePng ? { signaturePng } : {}),
    }
  })

  await stampLuxorFieldsOnPdf({ pdf, fields: roleFields, stamps, fonts })
  const output = await pdf.save()
  const path = signedPdfPath(input.documentId, input.signerId)
  await saveLuxorPrivatePdf(path, Buffer.from(output))
  return path
}