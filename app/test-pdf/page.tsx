'use client'
import { downloadPaymentConfirmationPdf, generateMaskedSenderIban } from '@/lib/payment-confirmation-pdf'

export default function TestPdf() {
  const handleDownload = () => {
    downloadPaymentConfirmationPdf({
      transactionId: 'TXN-2026-000001',
      createdAt: '25. 6. 2026 03:59:00',
      status: 'Štandardný platobný príkaz',

      transferType: 'external',
      fromAccountNumber: generateMaskedSenderIban(),
      recipientName: 'Jozef Mak',
      recipientAccountOrEmail: 'SK99 0900 0000 0000 1234 5678',
      amount: '100',
      currency: 'EUR',
      variableSymbol: '1234567890',
      constantSymbol: '0308',
      specificSymbol: '',
      note: '',
      payerReference: '',
      dueDate: '26. 6. 2026',
      repeatDays: '',
      createTemplate: false,
      emailConfirmation: false,
      balanceBefore: '1000.00',
      balanceAfter: '900.00'
    }).catch(console.error)
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <h1 style={{ marginBottom: '20px', fontSize: '24px' }}>HTML Export</h1>
      <button 
        onClick={handleDownload}
        style={{ padding: '10px 20px', fontSize: '18px', background: '#000', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}
      >
        Stiahnuť potvrdenie
      </button>
    </div>
  )
}
