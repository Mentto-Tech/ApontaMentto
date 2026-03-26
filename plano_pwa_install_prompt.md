# Plano de Ação — PWA Install Prompt
**Stack:** React + FastAPI + PostgreSQL | Vercel · Render · Neon

---

## 1. Contexto e Objetivo

O app já funciona como PWA (manifest + service worker configurados). O problema é que o fluxo de instalação depende do usuário navegar manualmente pelo menu do navegador — um processo desconhecido para a maioria.

**Objetivo:** criar um banner de instalação dentro do próprio app que dispare o prompt nativo do sistema operacional com um único clique.

---

## 2. Resultado Final Esperado

- Usuário acessa o site pela primeira vez e vê um **banner fixo** no rodapé com botão "Instalar App"
- No **Android/Desktop**: um clique abre o prompt nativo de instalação do SO
- No **iOS**: um clique abre um modal com instruções passo a passo (Safari não suporta prompt automático)
- Após instalar, o banner **some permanentemente**
- Se o usuário fechar o banner (✕), ele **não aparece por 7 dias**

---

## 3. Suporte por Plataforma

| Plataforma | Suporte | Comportamento |
|---|---|---|
| Android (Chrome) | ✅ Total | Prompt nativo via `beforeinstallprompt` |
| Desktop Chrome | ✅ Total | Ícone na barra de endereço + prompt ao clicar |
| Desktop Edge | ✅ Total | Idêntico ao Chrome |
| iOS 16.4+ (Safari) | ⚠️ Parcial | Sem prompt automático — modal com instrução manual |
| Firefox Desktop | ⚠️ Parcial | Suporte limitado, sem `beforeinstallprompt` |
| Samsung Browser | ✅ Total | Suporta `beforeinstallprompt` normalmente |

---

## 4. Arquivos a Criar / Modificar

| Arquivo | Ação |
|---|---|
| `src/hooks/useInstallPrompt.js` | Criar |
| `src/components/InstallBanner.jsx` | Criar |
| `src/components/IOSInstallModal.jsx` | Criar |
| `src/components/InstallBanner.css` | Criar |
| `src/App.jsx` (ou layout raiz) | Modificar — importar e renderizar `<InstallBanner />` |

---

## 5. Verificações Pré-Implementação

Antes de começar, confirme que o PWA já atende estes requisitos (sem eles o `beforeinstallprompt` nunca dispara):

- [ ] `manifest.json` referenciado no `index.html` com `<link rel="manifest">`
- [ ] `manifest.json` contém: `name`, `short_name`, `start_url`, `display: "standalone"`, `icons` (192x192 e 512x512)
- [ ] Service worker registrado (via `vite-plugin-pwa` ou similar)
- [ ] App servido em HTTPS (Vercel já garante isso)

> **Como verificar:** Chrome DevTools → Application → Manifest. Se não houver erros vermelhos, está válido.

---

## 6. Implementação

### 6.1 `src/hooks/useInstallPrompt.js`

```js
import { useState, useEffect } from 'react'

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null)
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
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
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
    localStorage.setItem('pwa-dismissed', Date.now())
  }

  return { isInstallable, isInstalled, isIOS, install, dismiss }
}
```

---

### 6.2 `src/components/InstallBanner.jsx`

```jsx
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
```

---

### 6.3 `src/components/IOSInstallModal.jsx`

```jsx
export function IOSInstallModal({ onClose }) {
  return (
    <div className="ios-modal-overlay" onClick={onClose}>
      <div className="ios-modal" onClick={e => e.stopPropagation()}>
        <h3>Instalar no iPhone / iPad</h3>
        <ol>
          <li>Toque no botão <strong>Compartilhar</strong> (ícone de quadrado com seta) na barra do Safari</li>
          <li>Role para baixo e toque em <strong>Adicionar à Tela de Início</strong></li>
          <li>Toque em <strong>Adicionar</strong> no canto superior direito</li>
        </ol>
        <button onClick={onClose}>Entendi</button>
      </div>
    </div>
  )
}
```

---

### 6.4 `src/components/InstallBanner.css`

```css
.install-banner {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: #1E40AF;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 16px;
  z-index: 9999;
  font-size: 14px;
}

.install-banner button {
  background: white;
  color: #1E40AF;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-weight: 600;
  cursor: pointer;
}

.install-banner button.dismiss {
  background: transparent;
  color: white;
  font-size: 18px;
  padding: 4px 8px;
}

.ios-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 10000;
}

.ios-modal {
  background: white;
  border-radius: 16px 16px 0 0;
  padding: 24px;
  max-width: 480px;
  width: 100%;
}

.ios-modal ol { padding-left: 20px; line-height: 1.8; }

.ios-modal button {
  margin-top: 16px;
  width: 100%;
  background: #1E40AF;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px;
  font-size: 16px;
  cursor: pointer;
}
```

---

### 6.5 Registrar no App

No `src/App.jsx` (ou componente de layout raiz):

```jsx
import { InstallBanner } from './components/InstallBanner'

function App() {
  return (
    <>
      <InstallBanner />  {/* Adicione esta linha */}
      {/* ... resto do app ... */}
    </>
  )
}
```

---

## 7. Regras de Exibição do Banner

| Condição | Comportamento |
|---|---|
| App já instalado (standalone mode) | Banner não aparece |
| Usuário clicou em ✕ | Não aparece por 7 dias |
| Usuário instalou com sucesso | Banner não aparece mais |
| iOS com Safari | Botão "Como instalar" → abre modal |
| Android / Desktop Chrome | Botão "Instalar" → prompt nativo |

---

## 8. Backend (FastAPI / Render)

Nenhuma alteração necessária. Apenas confirme:

- CORS configurado para aceitar o domínio da Vercel
- Backend respondendo via HTTPS (Render já faz isso por padrão)

> O install prompt é 100% front-end.

---

## 9. Como Testar Localmente

O `beforeinstallprompt` só dispara em HTTPS.

**Opção A — Chrome DevTools (mais rápido):**
DevTools → Application → Manifest → clique em "Add to home screen"

**Opção B — ngrok (teste real no celular):**
```bash
npm run dev        # porta 5173
ngrok http 5173    # gera URL HTTPS pública — acesse no celular
```

---

## 10. Checklist de Entrega

- [ ] `useInstallPrompt.js` criado
- [ ] `InstallBanner.jsx` criado
- [ ] `IOSInstallModal.jsx` criado
- [ ] `InstallBanner.css` criado e importado
- [ ] `InstallBanner` adicionado no `App.jsx`
- [ ] Testado no Android — prompt nativo aparece
- [ ] Testado no iOS — modal com instruções aparece
- [ ] Testado no Desktop Chrome — botão instalar funciona
- [ ] Banner some após instalar e após dismiss
- [ ] Deploy na Vercel e testado em produção
