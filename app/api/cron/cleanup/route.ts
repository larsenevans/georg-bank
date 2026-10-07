import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transaction, accessSession, accessRequest } from '@/lib/db/schema'
import { lt } from 'drizzle-orm'
import { Storage } from '@google-cloud/storage'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Voliteľná ochrana endpointu (nastavte CRON_SECRET v env)
    const authHeader = request.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Čas pred 6 hodinami
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)

    // 2. Zmazať staré platby z databázy
    const deletedTransactions = await db
      .delete(transaction)
      .where(lt(transaction.createdAt, sixHoursAgo))
      .returning({ id: transaction.id })

    // 3. Zmazať staré relácie (sessions) a požiadavky (requests)
    const deletedSessions = await db
      .delete(accessSession)
      .where(lt(accessSession.createdAt, sixHoursAgo))
      .returning({ id: accessSession.id })

    const deletedRequests = await db
      .delete(accessRequest)
      .where(lt(accessRequest.createdAt, sixHoursAgo))
      .returning({ id: accessRequest.id })

    // 4. Zmazať staré PDF súbory z Google Cloud Storage
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
            if (fileTime < sixHoursAgo) {
              await file.delete()
              deletedPdfs++
            }
          }
        }
      } catch (gcsError) {
        console.error('[cleanup] GCS error:', gcsError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed successfully.',
      deleted: {
        transactions: deletedTransactions.length,
        sessions: deletedSessions.length,
        requests: deletedRequests.length,
        pdfs: deletedPdfs
      }
    })
  } catch (error) {
    console.error('[cleanup] Error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
