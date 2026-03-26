import { useState, useEffect } from 'react'

// types for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed',
    platform: string
  }>;
  prompt(): Promise<void>;
}

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled,   setIsInstalled]   = useState(false)
  const [isIOS,         setIsIOS]         = useState(false)

  useEffect(() => {
    // Detecta iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIOS(ios)

    // Detecta se já está instalado (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    if (standalone) { setIsInstalled(true); return }

    // Captura o evento de instalação (Android / Desktop)
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
      setIsInstallable(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Detecta instalação concluída
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setIsInstallable(false)
      localStorage.setItem('pwa-installed', 'true')
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setIsInstallable(false)
  }

  const dismiss = () => {
    setIsInstallable(false)
    localStorage.setItem('pwa-dismissed', Date.now().toString())
  }

  return { isInstallable, isInstalled, isIOS, install, dismiss }
}
