# ApontaMentto

## 1. Resumo

O ApontaMentto é um sistema interno de controle de ponto utilizado para registrar as horas trabalhadas pelos colaboradores em projetos e locais específicos.

A plataforma centraliza o registro diário de entradas e saídas, apontamentos de atividades por projeto, banco de horas e justificativas de ausência, facilitando o acompanhamento da jornada de trabalho da equipe.

O sistema também permite gerenciamento de usuários, projetos e locais, cálculo de custo por projeto, geração de folhas de ponto em PDF e um fluxo de assinatura digital entre gestor e colaborador.

---

## 2. Objetivo de Negócio

O projeto foi desenvolvido para substituir o controle manual de horas, aumentando a organização e a precisão no acompanhamento da jornada dos colaboradores e dos custos alocados por projeto.

Seu principal objetivo é reduzir erros operacionais, dar visibilidade financeira sobre o custo de cada projeto e formalizar o processo de assinatura da folha de ponto.

---

## 3. Stack

- Frontend: React (TypeScript + Vite)
- Backend: FastAPI (Python)
- Banco de Dados: PostgreSQL
- Containerização: Docker
- Arquitetura: Frontend + API REST + Banco relacional
- Envio de e-mail: Resend
- Armazenamento de arquivos: AWS S3 (PDFs assinados)

---

## 4. Infraestrutura / Deploy

O sistema utiliza uma arquitetura distribuída em serviços cloud:

- Frontend hospedado na Vercel.
- Backend hospedado no Render utilizando ambiente serverless.
- Banco de dados hospedado no NeonDB.

Toda a aplicação é containerizada com Docker para padronização de ambiente e facilidade de manutenção local.

---

## 5. Repositórios

- Frontend: [Inserir link]
- Backend: [Inserir link]

---

## 6. Credenciais / Keys

As credenciais e variáveis sensíveis estão armazenadas nos respectivos ambientes de deploy:

- Variáveis de ambiente da Vercel
- Secrets do Render
- Credenciais do banco no NeonDB
- Chaves AWS S3 para armazenamento de PDFs
- API Key do Resend para envio de e-mails
- Variáveis locais de desenvolvimento via `.env`

Nenhuma credencial sensível deve ser armazenada neste documento. Consulte o `.env.example` para referência das variáveis necessárias.

---

## 7. Entidades Principais

| Entidade | Descrição |
|---|---|
| `User` | Colaborador do sistema. Possui role (admin/user), categoria (CLT/PJ/Estagiário/Dono), valor/hora e carga horária semanal. |
| `Project` | Projeto ao qual horas podem ser apontadas. Pode ser interno ou externo. |
| `Location` | Local físico ou remoto onde o trabalho foi realizado. |
| `TimeEntry` | Apontamento de horas: intervalo de tempo vinculado a um projeto e local. |
| `DailyRecord` | Registro diário de ponto com 2 pares entrada/saída, horário de almoço, horas extras e dados de geolocalização. |
| `AbsenceJustification` | Justificativa de falta com texto e anexo opcional. |
| `PunchLog` | Log imutável de cada batida de ponto realizada (auditoria). |
| `TimeBankEntry` | Entrada no banco de horas: crédito ou débito de minutos, manual ou automático. |
| `TimesheetSignRequest` | Solicitação de assinatura da folha de ponto para um colaborador em um mês. |
| `TimesheetSignedPdf` | PDF da folha de ponto assinado por gestor e colaborador, armazenado no S3. |

---

## 8. Roles e Permissões

- `admin`: acesso total — pode ver registros de todos os usuários, configurar valor/hora, gerenciar projetos/locais/usuários, iniciar fluxo de assinatura da folha de ponto e visualizar custo por projeto.
- `user`: acesso restrito aos próprios registros — pode registrar ponto, fazer apontamentos, gerenciar justificativas e assinar a própria folha de ponto.

---

## 9. Funcionalidades

- Registro de ponto diário com 2 pares entrada/saída e intervalo de almoço
- Captura de geolocalização e IP no momento do registro
- Apontamento de horas por projeto e local
- Controle de horas extras com registro separado
- Banco de horas (crédito/débito manual ou automático)
- Justificativa de ausência com upload de arquivo
- Log de auditoria de todas as batidas de ponto
- Cálculo de custo por projeto baseado no valor/hora de cada colaborador
- Geração de folha de ponto mensal em PDF
- Fluxo de assinatura digital: gestor assina primeiro, link enviado por e-mail ao colaborador para assinar
- PDFs assinados armazenados no S3
- Dashboard com visão consolidada por período
- Visão mensal dos registros
- Exportação e importação de dados (admin)
- Gestão de projetos, locais e usuários (admin)

---

## 10. Telas (Frontend)

| Rota | Tela | Acesso |
|---|---|---|
| `/` | Home / Registro de ponto | Todos |
| `/monthly` | Visão mensal | Todos |
| `/timesheet` | Folha de ponto | Todos |
| `/time-bank` | Banco de horas | Todos |
| `/justifications` | Justificativas de ausência | Todos |
| `/projects` | Gerenciamento de projetos | Todos |
| `/locations` | Gerenciamento de locais | Todos |
| `/profile` | Perfil do usuário | Todos |
| `/my-signed-timesheets` | Minhas folhas assinadas | Todos |
| `/sign/:token` | Assinatura de folha (link por e-mail) | Todos |
| `/dashboard` | Dashboard de custos por projeto | Admin |
| `/admin/users` | Gerenciamento de usuários | Admin |
| `/admin/settings` | Configurações do sistema | Admin |
| `/admin/punch-logs` | Logs de ponto | Admin |
| `/admin/signed-pdfs` | PDFs assinados | Admin |

---

## 11. Observações Técnicas

- A lógica principal de cálculo de totais, horas extras e custo por projeto está concentrada no backend.
- O valor/hora do usuário é visível apenas para o admin — colaboradores não veem o custo dos projetos.
- O fluxo de assinatura da folha de ponto é tokenizado com expiração e enviado por e-mail via Resend.
- PDFs podem ser armazenados tanto no banco (LargeBinary) quanto no S3, com migração disponível via script.
- O sistema captura geolocalização do dispositivo opcionalmente no registro de ponto.
- O sistema é de uso exclusivamente interno.
