import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transaction, accessSession, accessRequest } from '@/lib/db/schema'
import { and, eq, lt, not, like } from 'drizzle-orm'
import { Storage } from '@google-cloud/storage'
import { SUPERADMIN_TOKEN_PREFIX } from '@/lib/access-flow'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Voliteľná ochrana endpointu (nastavte CRON_SECRET v env)
    const authHeader = request.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Časové prahy pre dvojúrovňovú retenciu:
    // - Bežní hostia (CONTRACT-1+1): 6 hodín
    // - Superadmin (God-Mode): 30 dní
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    let deletedGuestTransactionsCount = 0
    let deletedSuperadminTransactionsCount = 0
    let deletedSessionsCount = 0
    let deletedRequestsCount = 0

    try {
      // 2. Zmazať staré bežné hosťovské platby (staršie ako 6 hodín)
      const deletedGuestTransactions = await db
        .delete(transaction)
        .where(and(eq(transaction.isSuperadmin, false), lt(transaction.createdAt, sixHoursAgo)))
        .returning({ id: transaction.id })
      deletedGuestTransactionsCount = deletedGuestTransactions.length

      // 3. Zmazať staré Superadmin platby (IBA ak sú staršie ako 30 dní)
      const deletedSuperadminTransactions = await db
        .delete(transaction)
        .where(and(eq(transaction.isSuperadmin, true), lt(transaction.createdAt, thirtyDaysAgo)))
        .returning({ id: transaction.id })
      deletedSuperadminTransactionsCount = deletedSuperadminTransactions.length

      // 4. Zmazať staré hosťovské relácie (sessions) a požiadavky (requests) staršie ako 6 hodín
      // Superadmin sessions s prefixom superadmin_ sú permanentné a nemažú sa
      const deletedSessions = await db
        .delete(accessSession)
        .where(and(not(like(accessSession.sessionToken, `${SUPERADMIN_TOKEN_PREFIX}%`)), lt(accessSession.createdAt, sixHoursAgo)))
        .returning({ id: accessSession.id })
      deletedSessionsCount = deletedSessions.length

      const deletedRequests = await db
        .delete(accessRequest)
        .where(lt(accessRequest.createdAt, sixHoursAgo))
        .returning({ id: accessRequest.id })
      deletedRequestsCount = deletedRequests.length
    } catch (dbError) {
      console.warn('[cleanup] Database cleanup skipped/error (e.g. local test mode):', dbError)
    }

    // 5. Zmazať staré PDF súbory z Google Cloud Storage:
    // - Hosťovské PDF: zmazať po 6 hodinách
    // - Superadmin PDF: zmazať až po 30 dňoch
    const gcsBucketName = process.env.RECEIPTS_GCS_BUCKET
    let deletedPdfs = 0
    if (gcsBucketName) {
      try {
        const storage = new Storage()
        const bucket = storage.bucket(gcsBucketName)
        const [files] = await bucket.getFiles()

        for (const file of files) {
          const [metadata] = await file.getMetadata()
          if (metadata && metadata.timeCreated) {
            const fileTime = new Date(metadata.timeCreated)
            const isSuperadminPdf = metadata.metadata?.isSuperadmin === 'true'
            const threshold = isSuperadminPdf ? thirtyDaysAgo : sixHoursAgo

            if (fileTime < threshold) {
              await file.delete()
              deletedPdfs++
            }
          }
        }
      } catch (gcsError) {
        console.warn('[cleanup] GCS cleanup warning:', gcsError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Two-tier cleanup completed successfully (Guest: 6h, Superadmin: 30d).',
      deleted: {
        guestTransactions: deletedGuestTransactionsCount,
        superadminTransactions: deletedSuperadminTransactionsCount,
        totalTransactions: deletedGuestTransactionsCount + deletedSuperadminTransactionsCount,
        sessions: deletedSessionsCount,
        requests: deletedRequestsCount,
        pdfs: deletedPdfs,
      },
    })
  } catch (error) {
    console.error('[cleanup] Error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
