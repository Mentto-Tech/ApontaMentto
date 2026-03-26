export function IOSInstallModal({ onClose }: { onClose: () => void }) {
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
