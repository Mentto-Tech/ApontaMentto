import { useState } from 'react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { IOSInstallModal } from './IOSInstallModal'
import './InstallBanner.css'

export function InstallBanner() {
  const { isInstallable, isInstalled, isIOS, install, dismiss } = useInstallPrompt()
  const [showIOSModal, setShowIOSModal] = useState(false)

  // Não mostra nada se já instalado
  if (isInstalled) return null

  // Não mostra se foi dispensado nos últimos 7 dias
  const dismissed = localStorage.getItem('pwa-dismissed')
  if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return null

  // iOS: botão que abre modal de instrução
  if (isIOS) {
    return (
      <>
        <div className="install-banner">
          <span>📲 Instale o app para acesso rápido</span>
          <button onClick={() => setShowIOSModal(true)}>Como instalar</button>
          <button className="dismiss" onClick={dismiss}>✕</button>
        </div>
        {showIOSModal && <IOSInstallModal onClose={() => setShowIOSModal(false)} />}
      </>
    )
  }

  // Android / Desktop: prompt nativo
  if (!isInstallable) return null

  return (
    <div className="install-banner">
      <span>📲 Instale o app para acesso rápido</span>
      <button onClick={install}>Instalar</button>
      <button className="dismiss" onClick={dismiss}>✕</button>
    </div>
  )
}
