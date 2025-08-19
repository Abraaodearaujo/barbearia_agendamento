#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Configurando BarberShop Elite...\n');

// Criar estrutura de diretórios
const directories = [
    'public',
    'public/css',
    'public/js',
    'logs',
    'backup'
];

directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Diretório criado: ${dir}`);
    }
});

// Criar arquivo .env e .env.example
const envContent = `# Configurações do BarberShop Elite
PORT=3000
JWT_SECRET=barbershop_elite_secret_2025
NODE_ENV=development

# Configurações de Email (opcional)
EMAIL_SERVICE=gmail
EMAIL_USER=seu_email@gmail.com
EMAIL_PASS=sua_senha_de_app

# Configurações do Formspree (recomendado)
FORMSPREE_ENDPOINT=https://formspree.io/f/mwpqjgzz
`;

if (!fs.existsSync('.env')) {
    fs.writeFileSync('.env', envContent);
    console.log('📄 Arquivo .env criado');
}

if (!fs.existsSync('.env.example')) {
    fs.writeFileSync('.env.example', envContent);
    console.log('📄 Arquivo .env.example criado');
}

// Mover/copiar arquivos para a pasta public
const publicFiles = [
    { source: 'index.html', target: 'public/index.html' },
    { source: 'admin.html', target: 'public/admin.html' },
    { source: 'style.css', target: 'public/css/style.css' },
    { source: 'script.js', target: 'public/js/script.js' }
];

publicFiles.forEach(file => {
    if (fs.existsSync(file.source)) {
        if (!fs.existsSync(file.target)) {
            fs.copyFileSync(file.source, file.target);
            console.log(`📂 Arquivo copiado: ${file.source} → ${file.target}`);
        }
    }
});

// Criar README.md
const readme = `# BarberShop Elite - Sistema de Agendamento

Sistema completo de agendamento para barbearia com painel administrativo.

## 🚀 Recursos

- ✂️ Sistema de agendamento online
- 📧 Notificações por email automáticas
- 🔐 Painel administrativo seguro
- 📱 Interface responsiva
- 🗄️ Banco de dados SQLite
- ⏰ Gerenciamento de horários
- 📊 Estatísticas e relatórios

## 📦 Instalação

\`\`\`bash
# Instalar dependências
npm install

# Configurar (criar diretórios e arquivos)
npm run setup

# Iniciar servidor
npm start

# Desenvolvimento (com auto-reload)
npm run dev
\`\`\`

## 🌐 Acesso

- **Site público**: http://localhost:3000
- **Área administrativa**: http://localhost:3000/admin
  - Usuário: \`admin\`
  - Senha: \`admin123\`

## 📁 Estrutura do Projeto

\`\`\`
barbershop-elite/
├── server.js              # Servidor principal
├── package.json           # Dependências
├── barbershop.db          # Banco SQLite (criado automaticamente)
├── public/                # Arquivos estáticos
│   ├── index.html         # Página principal
│   ├── admin.html         # Painel admin
│   ├── css/
│   │   └── style.css      # Estilos
│   └── js/
│       └── script.js      # JavaScript frontend
├── logs/                  # Logs do sistema
└── backup/                # Backups do banco
\`\`\`

## ⚙️ Configurações

### Email
O sistema usa Formspree por padrão para envio de emails. Para configurar:

1. Acesse https://formspree.io
2. Crie uma conta gratuita
3. Crie um novo formulário
4. Substitua o endpoint no código

### Banco de Dados
O sistema usa SQLite por padrão. O banco é criado automaticamente na primeira execução.

### Horários de Funcionamento
Configure no painel administrativo:
- Horário de funcionamento
- Horário de almoço
- Horários bloqueados

## 🔧 API Endpoints

### Públicos
- \`GET /\` - Página principal
- \`GET /admin\` - Painel administrativo
- \`POST /api/bookings\` - Criar agendamento
- \`GET /api/available-times\` - Horários disponíveis

### Administrativos (requer autenticação)
- \`POST /api/admin/login\` - Login admin
- \`GET /api/bookings\` - Listar agendamentos
- \`PATCH /api/bookings/:id\` - Atualizar agendamento
- \`GET /api/settings\` - Obter configurações
- \`POST /api/settings\` - Salvar configurações
- \`GET /api/blocked-times\` - Horários bloqueados
- \`POST /api/blocked-times\` - Bloquear horário
- \`DELETE /api/blocked-times/:id\` - Desbloquear horário

## 🚀 Deploy

### Heroku
\`\`\`bash
heroku create seu-barbershop
git push heroku main
\`\`\`

### VPS/Servidor Próprio
\`\`\`bash
git clone seu-repositorio
cd barbershop-elite
npm install
cp .env.example .env
nano .env
npm install -g pm2
pm2 start server.js --name "barbershop"
pm2 startup
pm2 save
\`\`\`

## 🔒 Segurança

- Senhas são criptografadas com bcrypt
- Tokens JWT para autenticação
- Validação de dados no servidor
- Rate limiting (implementar se necessário)

## 🛠️ Personalização

### Serviços
Edite os serviços no arquivo \`public/js/script.js\`:
\`\`\`javascript
const services = {
    'corte': 'Corte Tradicional - R$ 35,00',
    'barba': 'Barba Completa - R$ 25,00',
};
\`\`\`

### Profissionais
Edite a lista de profissionais no arquivo \`public/index.html\`:
\`\`\`html
<option value="carlos">Carlos - Especialista em cortes clássicos</option>
<option value="rafael">Rafael - Expert em barbas</option>
\`\`\`

### Horários
Edite os horários padrão no arquivo \`server.js\`:
\`\`\`javascript
const allTimes = [
    '09:00', '09:30', '10:00', '10:30',
    '11:00', '11:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00'
];
\`\`\`

## 📧 Configuração de Email Avançada

### Gmail
1. Ativar verificação em 2 etapas
2. Gerar senha de app
3. Configurar no painel admin

### SMTP Personalizado
Configure no arquivo \`.env\`:
\`\`\`
EMAIL_SERVICE=custom
SMTP_HOST=seu-smtp.com
SMTP_PORT=587
SMTP_USER=usuario
SMTP_PASS=senha
\`\`\`

## 🔄 Backup

\`\`\`bash
cp barbershop.db backup/barbershop_$(date +%Y%m%d).db
cp backup/barbershop_20231201.db barbershop.db
\`\`\`

## 📊 Analytics

Adicione Google Analytics no \`public/index.html\`:
\`\`\`html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_TRACKING_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_TRACKING_ID');
</script>
\`\`\`

---

MIT License
`;

if (!fs.existsSync('README.md')) {
    fs.writeFileSync('README.md', readme);
    console.log('📖 README.md criado');
}

// Criar arquivo .gitignore
const gitignore = `# Dependencies
node_modules/
npm-debug.log*

# Database
barbershop.db
*.db-journal

# Environment variables
.env
.env.local
.env.production

# Logs
logs/
*.log

# Runtime
.cache/
dist/
build/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Backup
backup/
*.backup
`;

if (!fs.existsSync('.gitignore')) {
    fs.writeFileSync('.gitignore', gitignore);
    console.log('🔒 .gitignore criado');
}

console.log('\n✅ Configuração concluída!');
console.log('\n📋 Próximos passos:');
console.log('1. npm install');
console.log('2. npm start');
console.log('3. Abra http://localhost:3000');
console.log('4. Admin: http://localhost:3000/admin (admin/admin123)');
console.log('\n🎉 Seu BarberShop Elite está pronto para uso!');
