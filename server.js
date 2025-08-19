const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
const JWT_SECRET = process.env.JWT_SECRET || 'barbershop_elite_secret_2025';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Servir arquivos estáticos

// Inicializar banco de dados
const db = new sqlite3.Database('./barbershop.db', (err) => {
    if (err) {
        console.error('Erro ao conectar com o banco de dados:', err);
    } else {
        console.log('🗄️ Conectado ao banco de dados SQLite');
        initializeDatabase();
    }
});

// Inicializar tabelas do banco
function initializeDatabase() {
    // Tabela de administradores
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de configurações
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_name TEXT UNIQUE NOT NULL,
        key_value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de agendamentos
    db.run(`CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        service TEXT NOT NULL,
        barber TEXT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        notes TEXT,
        status TEXT DEFAULT 'Pendente',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de horários bloqueados
    db.run(`CREATE TABLE IF NOT EXISTS blocked_times (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, time)
    )`);

    // Criar admin padrão
    createDefaultAdmin();
    
    // Configurações padrão
    insertDefaultSettings();
}

// Criar administrador padrão
async function createDefaultAdmin() {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    db.run(`INSERT OR IGNORE INTO admins (username, password, email) 
            VALUES (?, ?, ?)`, 
            ['admin', hashedPassword, 'silvaabraao739@gmail.com'], 
            function(err) {
                if (err) {
                    console.error('Erro ao criar admin padrão:', err);
                } else if (this.changes > 0) {
                    console.log('👤 Admin padrão criado - Username: admin, Password: admin123');
                }
            });
}

// Configurações padrão
function insertDefaultSettings() {
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

    defaultSettings.forEach(([key, value]) => {
        db.run(`INSERT OR IGNORE INTO settings (key_name, key_value) VALUES (?, ?)`, 
                [key, value]);
    });
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

// Configurar transporter de email
function createEmailTransporter() {
    return new Promise((resolve, reject) => {
        db.get(`SELECT key_value FROM settings WHERE key_name = 'email_config'`, 
               (err, row) => {
            if (err || !row) {
                // Usar configuração padrão (Formspree como fallback)
                resolve(null);
            } else {
                try {
                    const emailConfig = JSON.parse(row.key_value);
                    const transporter = nodemailer.createTransporter({
                        service: emailConfig.service || 'gmail',
                        auth: {
                            user: emailConfig.user,
                            pass: emailConfig.password
                        }
                    });
                    resolve(transporter);
                } catch (error) {
                    resolve(null);
                }
            }
        });
    });
}

// ROTAS DE AUTENTICAÇÃO

// Login do admin
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username e password são obrigatórios' });
    }

    db.get(`SELECT * FROM admins WHERE username = ?`, [username], async (err, admin) => {
        if (err) {
            return res.status(500).json({ error: 'Erro no servidor' });
        }

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
    });
});

// Verificar token
app.get('/api/admin/verify', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
});

// ROTAS DE CONFIGURAÇÕES

// Obter todas as configurações
app.get('/api/settings', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM settings`, (err, settings) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar configurações' });
        }

        const settingsObj = {};
        settings.forEach(setting => {
            settingsObj[setting.key_name] = setting.key_value;
        });

        res.json(settingsObj);
    });
});

// Atualizar configurações
app.post('/api/settings', authenticateToken, (req, res) => {
    const settings = req.body;
    
    const promises = Object.entries(settings).map(([key, value]) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT OR REPLACE INTO settings (key_name, key_value, updated_at) 
                    VALUES (?, ?, CURRENT_TIMESTAMP)`, 
                    [key, value], 
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
        });
    });

    Promise.all(promises)
        .then(() => {
            res.json({ success: true, message: 'Configurações atualizadas com sucesso' });
        })
        .catch(err => {
            console.error('Erro ao atualizar configurações:', err);
            res.status(500).json({ error: 'Erro ao atualizar configurações' });
        });
});

// ROTAS DE HORÁRIOS BLOQUEADOS

// Obter horários bloqueados
app.get('/api/blocked-times', (req, res) => {
    const { date } = req.query;
    
    let query = `SELECT * FROM blocked_times`;
    let params = [];
    
    if (date) {
        query += ` WHERE date = ?`;
        params.push(date);
    }
    
    query += ` ORDER BY date, time`;

    db.all(query, params, (err, blockedTimes) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar horários bloqueados' });
        }
        res.json(blockedTimes);
    });
});

// Adicionar horário bloqueado
app.post('/api/blocked-times', authenticateToken, (req, res) => {
    const { date, time, reason } = req.body;

    if (!date || !time) {
        return res.status(400).json({ error: 'Data e horário são obrigatórios' });
    }

    db.run(`INSERT INTO blocked_times (date, time, reason) VALUES (?, ?, ?)`,
           [date, time, reason || 'Horário bloqueado pelo administrador'],
           function(err) {
               if (err) {
                   if (err.code === 'SQLITE_CONSTRAINT') {
                       return res.status(400).json({ error: 'Horário já está bloqueado' });
                   }
                   return res.status(500).json({ error: 'Erro ao bloquear horário' });
               }
               
               res.json({
                   success: true,
                   id: this.lastID,
                   message: 'Horário bloqueado com sucesso'
               });
           });
});

// Remover horário bloqueado
app.delete('/api/blocked-times/:id', authenticateToken, (req, res) => {
    const { id } = req.params;

    db.run(`DELETE FROM blocked_times WHERE id = ?`, [id], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Erro ao remover bloqueio' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Horário bloqueado não encontrado' });
        }
        
        res.json({ success: true, message: 'Bloqueio removido com sucesso' });
    });
});

// ROTAS DE AGENDAMENTOS

// Obter todos os agendamentos
app.get('/api/bookings', authenticateToken, (req, res) => {
    const { date, status } = req.query;
    
    let query = `SELECT * FROM bookings`;
    let params = [];
    let conditions = [];
    
    if (date) {
        conditions.push(`date = ?`);
        params.push(date);
    }
    
    if (status) {
        conditions.push(`status = ?`);
        params.push(status);
    }
    
    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }
    
    query += ` ORDER BY date DESC, time DESC`;

    db.all(query, params, (err, bookings) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar agendamentos' });
        }
        res.json(bookings);
    });
});

// Criar novo agendamento
app.post('/api/bookings', async (req, res) => {
    const { name, phone, email, service, barber, date, time, notes } = req.body;

    if (!name || !phone || !email || !service || !date || !time) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    // Verificar se o horário está disponível
    db.get(`SELECT COUNT(*) as count FROM bookings 
            WHERE date = ? AND time = ? AND status != 'Cancelado'`, 
           [date, time], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao verificar disponibilidade' });
        }

        if (result.count > 0) {
            return res.status(400).json({ error: 'Horário já está ocupado' });
        }

        // Verificar se o horário está bloqueado
        db.get(`SELECT COUNT(*) as count FROM blocked_times WHERE date = ? AND time = ?`,
               [date, time], (err, blockedResult) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao verificar bloqueios' });
            }

            if (blockedResult.count > 0) {
                return res.status(400).json({ error: 'Horário não está disponível' });
            }

            // Criar o agendamento
            db.run(`INSERT INTO bookings (name, phone, email, service, barber, date, time, notes, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pendente')`,
                   [name, phone, email, service, barber, date, time, notes],
                   async function(err) {
                       if (err) {
                           return res.status(500).json({ error: 'Erro ao criar agendamento' });
                       }

                       const bookingId = this.lastID;
                       
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
                   });
        });
    });
});

// Atualizar status do agendamento
app.patch('/api/bookings/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status é obrigatório' });
    }

    let query = `UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP`;
    let params = [status];

    if (notes !== undefined) {
        query += `, notes = ?`;
        params.push(notes);
    }

    query += ` WHERE id = ?`;
    params.push(id);

    db.run(query, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Erro ao atualizar agendamento' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        }

        res.json({ success: true, message: 'Agendamento atualizado com sucesso' });
    });
});

// Função para enviar notificação de agendamento
async function sendBookingNotification(booking) {
    try {
        // Obter configurações de email
        const settings = await new Promise((resolve, reject) => {
            db.all(`SELECT * FROM settings WHERE key_name IN ('owner_email', 'owner_name', 'email_notifications')`,
                   (err, rows) => {
                       if (err) reject(err);
                       else {
                           const config = {};
                           rows.forEach(row => {
                               config[row.key_name] = row.key_value;
                           });
                           resolve(config);
                       }
                   });
        });

        if (settings.email_notifications !== 'true') {
            console.log('Notificações por email desabilitadas');
            return;
        }

        // Usar Formspree como método principal
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
app.get('/api/available-times', (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Data é obrigatória' });
    }

    // Horários padrão (9:00 às 18:00, exceto 12:00-14:00)
    const allTimes = [
        '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'
    ];

    // Buscar horários ocupados e bloqueados
    Promise.all([
        new Promise((resolve, reject) => {
            db.all(`SELECT time FROM bookings WHERE date = ? AND status != 'Cancelado'`,
                   [date], (err, rows) => {
                       if (err) reject(err);
                       else resolve(rows.map(row => row.time));
                   });
        }),
        new Promise((resolve, reject) => {
            db.all(`SELECT time FROM blocked_times WHERE date = ?`,
                   [date], (err, rows) => {
                       if (err) reject(err);
                       else resolve(rows.map(row => row.time));
                   });
        })
    ]).then(([bookedTimes, blockedTimes]) => {
        const unavailableTimes = [...bookedTimes, ...blockedTimes];
        const availableTimes = allTimes.filter(time => !unavailableTimes.includes(time));

        res.json({
            date,
            available: availableTimes,
            booked: bookedTimes,
            blocked: blockedTimes
        });
    }).catch(err => {
        console.error('Erro ao buscar horários disponíveis:', err);
        res.status(500).json({ error: 'Erro ao buscar horários disponíveis' });
    });
});

// Servir página de administração
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Acesso público: http://localhost:${PORT}`);
    console.log(`🔐 Área admin: http://localhost:${PORT}/admin`);
    console.log(`👤 Login padrão: admin / admin123`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🔄 Fechando servidor...');
    db.close((err) => {
        if (err) {
            console.error('Erro ao fechar banco de dados:', err);
        } else {
            console.log('🗄️ Banco de dados fechado');
        }
        process.exit(0);
    });
});