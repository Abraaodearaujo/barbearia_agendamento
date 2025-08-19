const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'barbershop_elite_secret_2025';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuração do PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Testar conexão
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Erro ao conectar com PostgreSQL:', err);
    } else {
        console.log('🗄️ Conectado ao PostgreSQL');
        release();
        initializeDatabase();
    }
});

// Inicializar tabelas do banco
async function initializeDatabase() {
    try {
        // Tabela de administradores
        await pool.query(`CREATE TABLE IF NOT EXISTS admins (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tabela de configurações
        await pool.query(`CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            key_name VARCHAR(255) UNIQUE NOT NULL,
            key_value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tabela de agendamentos
        await pool.query(`CREATE TABLE IF NOT EXISTS bookings (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50) NOT NULL,
            email VARCHAR(255) NOT NULL,
            service VARCHAR(255) NOT NULL,
            barber VARCHAR(255),
            date VARCHAR(20) NOT NULL,
            time VARCHAR(10) NOT NULL,
            notes TEXT,
            status VARCHAR(50) DEFAULT 'Pendente',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tabela de horários bloqueados
        await pool.query(`CREATE TABLE IF NOT EXISTS blocked_times (
            id SERIAL PRIMARY KEY,
            date VARCHAR(20) NOT NULL,
            time VARCHAR(10) NOT NULL,
            reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(date, time)
        )`);

        console.log('✅ Tabelas criadas/verificadas');
        
        // Criar admin padrão
        await createDefaultAdmin();
        
        // Configurações padrão
        await insertDefaultSettings();
        
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error);
    }
}

// Criar administrador padrão
async function createDefaultAdmin() {
    try {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        await pool.query(`INSERT INTO admins (username, password, email) 
                         VALUES ($1, $2, $3) 
                         ON CONFLICT (username) DO NOTHING`, 
                         ['admin', hashedPassword, 'silvaabraao739@gmail.com']);
        
        console.log('👤 Admin padrão verificado');
    } catch (error) {
        console.error('❌ Erro ao criar admin:', error);
    }
}

// Configurações padrão
async function insertDefaultSettings() {
    const defaultSettings = [
        ['owner_email', 'silvaabraao739@gmail.com'],
        ['owner_name', 'Abraão'],
        ['business_name', 'BarberShop Elite'],
        ['business_phone', '(71) 99999-9999'],
        ['business_address', 'Rua da Barbearia, 123 - Salvador, BA'],
        ['email_notifications', 'true'],
        ['working_hours_start', '09:00'],
        ['working_hours_end', '18:00'],
        ['lunch_break_start', '12:00'],
        ['lunch_break_end', '14:00']
    ];

    for (const [key, value] of defaultSettings) {
        try {
            await pool.query(`INSERT INTO settings (key_name, key_value) 
                             VALUES ($1, $2) 
                             ON CONFLICT (key_name) DO NOTHING`, 
                             [key, value]);
        } catch (error) {
            console.error(`Erro ao inserir configuração ${key}:`, error);
        }
    }
    console.log('⚙️ Configurações padrão verificadas');
}

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acesso requerido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// ROTAS DE AUTENTICAÇÃO

// Login do admin
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username e password são obrigatórios' });
    }

    try {
        const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
        const admin = result.rows[0];

        if (!admin || !await bcrypt.compare(password, admin.password)) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const token = jwt.sign(
            { id: admin.id, username: admin.username }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                email: admin.email
            }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// Verificar token
app.get('/api/admin/verify', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
});

// ROTAS DE CONFIGURAÇÕES

// Obter todas as configurações
app.get('/api/settings', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM settings');
        
        const settingsObj = {};
        result.rows.forEach(setting => {
            settingsObj[setting.key_name] = setting.key_value;
        });

        res.json(settingsObj);
    } catch (error) {
        console.error('Erro ao buscar configurações:', error);
        res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
});

// Atualizar configurações
app.post('/api/settings', authenticateToken, async (req, res) => {
    const settings = req.body;
    
    try {
        for (const [key, value] of Object.entries(settings)) {
            await pool.query(`INSERT INTO settings (key_name, key_value, updated_at) 
                             VALUES ($1, $2, CURRENT_TIMESTAMP) 
                             ON CONFLICT (key_name) 
                             DO UPDATE SET key_value = $2, updated_at = CURRENT_TIMESTAMP`, 
                             [key, value]);
        }

        res.json({ success: true, message: 'Configurações atualizadas com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar configurações:', error);
        res.status(500).json({ error: 'Erro ao atualizar configurações' });
    }
});

// ROTAS DE HORÁRIOS BLOQUEADOS

// Obter horários bloqueados
app.get('/api/blocked-times', async (req, res) => {
    const { date } = req.query;
    
    try {
        let query = 'SELECT * FROM blocked_times';
        let params = [];
        
        if (date) {
            query += ' WHERE date = $1';
            params.push(date);
        }
        
        query += ' ORDER BY date, time';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar horários bloqueados:', error);
        res.status(500).json({ error: 'Erro ao buscar horários bloqueados' });
    }
});

// Adicionar horário bloqueado
app.post('/api/blocked-times', authenticateToken, async (req, res) => {
    const { date, time, reason } = req.body;

    if (!date || !time) {
        return res.status(400).json({ error: 'Data e horário são obrigatórios' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO blocked_times (date, time, reason) VALUES ($1, $2, $3) RETURNING id',
            [date, time, reason || 'Horário bloqueado pelo administrador']
        );
        
        res.json({
            success: true,
            id: result.rows[0].id,
            message: 'Horário bloqueado com sucesso'
        });
    } catch (error) {
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({ error: 'Horário já está bloqueado' });
        }
        console.error('Erro ao bloquear horário:', error);
        res.status(500).json({ error: 'Erro ao bloquear horário' });
    }
});

// Remover horário bloqueado
app.delete('/api/blocked-times/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('DELETE FROM blocked_times WHERE id = $1', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Horário bloqueado não encontrado' });
        }
        
        res.json({ success: true, message: 'Bloqueio removido com sucesso' });
    } catch (error) {
        console.error('Erro ao remover bloqueio:', error);
        res.status(500).json({ error: 'Erro ao remover bloqueio' });
    }
});

// ROTAS DE AGENDAMENTOS

// Obter todos os agendamentos
app.get('/api/bookings', authenticateToken, async (req, res) => {
    const { date, status } = req.query;
    
    try {
        let query = 'SELECT * FROM bookings';
        let params = [];
        let conditions = [];
        
        if (date) {
            conditions.push(`date = $${params.length + 1}`);
            params.push(date);
        }
        
        if (status) {
            conditions.push(`status = $${params.length + 1}`);
            params.push(status);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY date DESC, time DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar agendamentos:', error);
        res.status(500).json({ error: 'Erro ao buscar agendamentos' });
    }
});

// Criar novo agendamento
app.post('/api/bookings', async (req, res) => {
    const { name, phone, email, service, barber, date, time, notes } = req.body;

    if (!name || !phone || !email || !service || !date || !time) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    try {
        // Verificar se o horário está disponível
        const bookingCheck = await pool.query(
            `SELECT COUNT(*) as count FROM bookings 
             WHERE date = $1 AND time = $2 AND status != 'Cancelado'`, 
            [date, time]
        );

        if (parseInt(bookingCheck.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Horário já está ocupado' });
        }

        // Verificar se o horário está bloqueado
        const blockedCheck = await pool.query(
            'SELECT COUNT(*) as count FROM blocked_times WHERE date = $1 AND time = $2',
            [date, time]
        );

        if (parseInt(blockedCheck.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Horário não está disponível' });
        }

        // Criar o agendamento
        const result = await pool.query(
            `INSERT INTO bookings (name, phone, email, service, barber, date, time, notes, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pendente') RETURNING id`,
            [name, phone, email, service, barber, date, time, notes]
        );

        const bookingId = result.rows[0].id;
        
        // Tentar enviar email de notificação
        try {
            await sendBookingNotification({
                id: bookingId,
                name, phone, email, service, barber, date, time, notes
            });
        } catch (emailError) {
            console.error('Erro ao enviar email:', emailError);
        }

        res.json({
            success: true,
            id: bookingId,
            message: 'Agendamento criado com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao criar agendamento:', error);
        res.status(500).json({ error: 'Erro ao criar agendamento' });
    }
});

// Atualizar status do agendamento
app.patch('/api/bookings/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status é obrigatório' });
    }

    try {
        let query = 'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP';
        let params = [status];

        if (notes !== undefined) {
            query += ', notes = $2';
            params.push(notes);
        }

        query += ` WHERE id = $${params.length + 1}`;
        params.push(id);

        const result = await pool.query(query, params);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        }

        res.json({ success: true, message: 'Agendamento atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar agendamento:', error);
        res.status(500).json({ error: 'Erro ao atualizar agendamento' });
    }
});

// Função para enviar notificação de agendamento
async function sendBookingNotification(booking) {
    try {
        // Obter configurações de email
        const result = await pool.query(
            `SELECT * FROM settings WHERE key_name IN ('owner_email', 'owner_name', 'email_notifications')`
        );
        
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key_name] = row.key_value;
        });

        if (settings.email_notifications !== 'true') {
            console.log('Notificações por email desabilitadas');
            return;
        }

        // Usar Formspree
        const formspreeResponse = await fetch('https://formspree.io/f/mwpqjgzz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                _replyto: booking.email,
                _subject: `Novo Agendamento - BarberShop Elite`,
                name: booking.name,
                phone: booking.phone,
                email: booking.email,
                service: booking.service,
                barber: booking.barber || 'Sem preferência',
                date: booking.date,
                time: booking.time,
                notes: booking.notes || 'Nenhuma',
                message: `🔔 NOVO AGENDAMENTO RECEBIDO!

👤 Cliente: ${booking.name}
📞 Telefone: ${booking.phone}
📧 Email: ${booking.email}
✂️ Serviço: ${booking.service}
👨‍💼 Profissional: ${booking.barber || 'Sem preferência'}
📅 Data: ${booking.date}
⏰ Horário: ${booking.time}
📝 Observações: ${booking.notes || 'Nenhuma'}

Status: Pendente confirmação`
            })
        });

        if (formspreeResponse.ok) {
            console.log('📧 Email de notificação enviado com sucesso');
        } else {
            throw new Error('Erro no Formspree');
        }

    } catch (error) {
        console.error('Erro ao enviar notificação:', error);
        throw error;
    }
}

// ROTA PARA OBTER HORÁRIOS DISPONÍVEIS
app.get('/api/available-times', async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Data é obrigatória' });
    }

    // Horários padrão (9:00 às 18:00, exceto 12:00-14:00)
    const allTimes = [
        '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'
    ];

    try {
        // Buscar horários ocupados e bloqueados
        const [bookedResult, blockedResult] = await Promise.all([
            pool.query(`SELECT time FROM bookings WHERE date = $1 AND status != 'Cancelado'`, [date]),
            pool.query(`SELECT time FROM blocked_times WHERE date = $1`, [date])
        ]);

        const bookedTimes = bookedResult.rows.map(row => row.time);
        const blockedTimes = blockedResult.rows.map(row => row.time);
        const unavailableTimes = [...bookedTimes, ...blockedTimes];
        const availableTimes = allTimes.filter(time => !unavailableTimes.includes(time));

        res.json({
            date,
            available: availableTimes,
            booked: bookedTimes,
            blocked: blockedTimes
        });
    } catch (error) {
        console.error('Erro ao buscar horários disponíveis:', error);
        res.status(500).json({ error: 'Erro ao buscar horários disponíveis' });
    }
});

// Servir página de administração
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 Área admin disponível em /admin`);
    console.log(`👤 Login padrão: admin / admin123`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Fechando servidor...');
    await pool.end();
    console.log('🗄️ Pool de conexões fechado');
    process.exit(0);
});