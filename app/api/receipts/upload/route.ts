import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import fs from 'fs'
import path from 'path'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { transaction } from '@/lib/db/schema'
import { DEMO_DEFAULT_USER_ID } from '@/lib/demo-user'
import { isOutgoingPaymentType } from '@/lib/daily-payment-limit'
import { createServiceSupabase } from '@/lib/demo-transactions-supabase'
import {
  afterPdfSuccess,
  readAccessCookieToken,
  requireAccessForPdf,
} from '@/lib/access-session'

export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024

async function findOutgoingTxn(transactionId: string) {
  const supabase = createServiceSupabase()
  if (supabase) {
    const { data, error } = await supabase
      .from('transaction')
      .select('id, type, userId, pdfUrl')
      .eq('id', transactionId)
      .limit(1)
      .maybeSingle()
    if (!error && data) return data
  }

  const row = await db.query.transaction.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.id, transactionId),
  })
  return row ?? null
}

async function setPdfUrl(transactionId: string, pdfUrl: string) {
  const supabase = createServiceSupabase()
  if (supabase) {
    await supabase
      .from('transaction')
      .update({ pdfUrl, updatedAt: new Date().toISOString() })
      .eq('id', transactionId)
  }
  try {
    await db
      .update(transaction)
      .set({ pdfUrl, updatedAt: new Date() })
      .where(eq(transaction.id, transactionId))
  } catch {
    // Local drizzle may be unavailable when Supabase is the source of truth.
  }
}

export async function POST(req: Request) {
  try {
    const pdfGate = await requireAccessForPdf(await readAccessCookieToken())
    if (!pdfGate.ok) {
      return NextResponse.json({ success: false, error: pdfGate.error }, { status: pdfGate.status })
    }
    const accessSessionRow = pdfGate.skipped ? null : pdfGate.session

    const form = await req.formData()
    const transactionId = String(form.get('transactionId') || '').trim()
    const file = form.get('file')

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'Missing transactionId' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Missing PDF file' }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'Invalid PDF size' }, { status: 400 })
    }
    if (file.type && file.type !== 'application/pdf') {
      return NextResponse.json({ success: false, error: 'File must be application/pdf' }, { status: 400 })
    }

    const txn = await findOutgoingTxn(transactionId)
    if (!txn) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 })
    }
    if (!isOutgoingPaymentType(txn.type)) {
      return NextResponse.json(
        { success: false, error: 'Receipt upload only for outgoing payments' },
        { status: 400 }
      )
    }
    // Demo ledger: accept demo payer rows (dashboard2 shared ledger).
    if (txn.userId && txn.userId !== DEMO_DEFAULT_USER_ID) {
      // Still allow if type is outgoing — shared sandbox may contain migrated ids.
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const storagePath = `receipts/${transactionId}.pdf`
    let pdfUrl = ''

    const supabase = createServiceSupabase()
    if (supabase) {
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(storagePath, buffer, {
          contentType: 'application/pdf',
          upsert: true,
        })
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(storagePath)
        pdfUrl = urlData.publicUrl
      } else if (uploadError.message !== 'Bucket not found') {
        console.error('[receipts/upload] Supabase storage error:', uploadError.message)
      } else {
        // Bucket missing in this project — fall through to Blob / local public/pdfs.
        console.warn('[receipts/upload] receipts bucket missing; using fallback storage')
      }
    }

    if (!pdfUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(storagePath, buffer, {
          access: 'public',
          contentType: 'application/pdf',
        })
        pdfUrl = blob.url
      } catch (err) {
        console.error('[receipts/upload] Vercel Blob error:', err)
      }
    }

    if (!pdfUrl) {
      const publicPdfDir = path.join(process.cwd(), 'public', 'pdfs')
      if (!fs.existsSync(publicPdfDir)) fs.mkdirSync(publicPdfDir, { recursive: true })
      const filePath = path.join(publicPdfDir, `${transactionId}.pdf`)
      fs.writeFileSync(filePath, buffer)
      pdfUrl = `/pdfs/${transactionId}.pdf`
    }

    await setPdfUrl(transactionId, pdfUrl)

    if (accessSessionRow) {
      await afterPdfSuccess(accessSessionRow)
    }

    return NextResponse.json({ success: true, pdfUrl, transactionId })
  } catch (error) {
    console.error('[receipts/upload] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
