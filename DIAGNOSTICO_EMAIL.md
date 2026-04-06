# Diagnóstico de Problemas com Email

## Problema Identificado
O sistema está tentando enviar emails, mas eles não estão chegando no destino.

## Melhorias Implementadas

### 1. Logging Detalhado
- Adicionado logging completo em `email_service.py`
- Adicionado logging no endpoint de envio em `timesheets.py`
- Agora é possível ver exatamente onde o processo falha

### 2. Tratamento de Erros
- Melhor tratamento de exceções com stack traces completos
- Validação de configuração (verifica se SMTP_PASSWORD está configurado)
- Timeout de 10 segundos para evitar travamentos
- Debug SMTP ativado para ver comunicação com servidor

### 3. Script de Teste
Criado `backend/test_email.py` para testar a configuração de email isoladamente.

## Como Diagnosticar

### Passo 1: Verificar Logs do Backend
Após tentar enviar um email, verifique os logs do container backend:

```bash
docker-compose logs backend
```

Procure por mensagens como:
- `Email config: SMTP_SERVER=...` (configuração carregada)
- `Attempting to send HTML email to...` (tentativa de envio)
- `✓ HTML email sent successfully` (sucesso)
- `✗ Failed to send HTML email` (erro)

### Passo 2: Testar Configuração de Email

Entre no container do backend:
```bash
docker-compose exec backend bash
```

Execute o script de teste:
```bash
python test_email.py luis.gava@mentto.com.br
```

O script irá:
1. Mostrar a configuração atual
2. Validar se SMTP_PASSWORD está configurado
3. Tentar enviar um email de teste
4. Mostrar erros detalhados se houver

### Passo 3: Verificar Variáveis de Ambiente

Verifique se as variáveis estão configuradas corretamente no `.env`:

```bash
# No arquivo .env (raiz do projeto)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=mentto.tech@gmail.com
SMTP_PASSWORD=sua_senha_de_app_aqui
DEFAULT_FROM_EMAIL=mentto.tech@gmail.com
FRONTEND_URL=https://seu-dominio.com
```

**IMPORTANTE**: Para Gmail, você DEVE usar uma "Senha de App", não a senha normal da conta.

### Passo 4: Criar Senha de App do Gmail

Se estiver usando Gmail e autenticação de 2 fatores:

1. Acesse: https://myaccount.google.com/apppasswords
2. Selecione "App" → "Outro (nome personalizado)"
3. Digite "Sistema Folha de Ponto"
4. Clique em "Gerar"
5. Copie a senha gerada (16 caracteres sem espaços)
6. Cole no `.env`: `SMTP_PASSWORD=abcd efgh ijkl mnop` (sem espaços)

### Passo 5: Reiniciar Containers

Após alterar o `.env`:
```bash
docker-compose down
docker-compose up -d
```

## Problemas Comuns

### 1. SMTP_PASSWORD não configurado
**Sintoma**: Log mostra "SMTP_PASSWORD not configured"
**Solução**: Configure a senha de app no `.env`

### 2. Autenticação falha
**Sintoma**: "Authentication failed" ou "Username and Password not accepted"
**Causas possíveis**:
- Senha de app incorreta
- Autenticação de 2 fatores não ativada
- Usando senha normal ao invés de senha de app

**Solução**: 
- Gere uma nova senha de app
- Ative autenticação de 2 fatores no Gmail
- Use a senha de app, não a senha da conta

### 3. Conexão recusada
**Sintoma**: "Connection refused" ou timeout
**Causas possíveis**:
- Firewall bloqueando porta 587
- Servidor SMTP incorreto
- Problemas de rede

**Solução**:
- Verifique se a porta 587 está aberta
- Teste conexão: `telnet smtp.gmail.com 587`

### 4. Email vai para spam
**Sintoma**: Email é enviado mas não aparece na caixa de entrada
**Solução**:
- Verifique pasta de spam
- Configure SPF/DKIM no domínio (se usando domínio próprio)
- Use um email verificado como remetente

### 5. FRONTEND_URL incorreto
**Sintoma**: Email chega mas link não funciona
**Solução**: Configure `FRONTEND_URL` no `.env` com a URL correta do frontend

## Verificação Rápida

Execute este comando para ver se o email está configurado:
```bash
docker-compose exec backend python -c "from email_service import *; print(f'Server: {SMTP_SERVER}:{SMTP_PORT}'); print(f'User: {SMTP_USERNAME}'); print(f'Pass: {'OK' if SMTP_PASSWORD else 'MISSING'}')"
```

## Próximos Passos

1. Execute o script de teste: `python test_email.py seu@email.com`
2. Verifique os logs detalhados
3. Se o teste funcionar mas o sistema não, verifique o endpoint de envio
4. Confirme que `override_email` ou `employee.email` está correto

## Suporte Adicional

Se após seguir todos os passos o problema persistir, forneça:
1. Logs completos do backend após tentativa de envio
2. Saída do script `test_email.py`
3. Configuração do `.env` (SEM a senha)
