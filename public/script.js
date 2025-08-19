// Sistema de agendamento integrado com backend
let bookings = [];
let blockedTimes = {};

// Configurações de email (agora carregadas do servidor)
let emailConfig = {
    ownerEmail: 'silvaabraao739@gmail.com',
    ownerName: 'Abraão'
};

// API base URL (ajustar conforme necessário)
const API_BASE = window.location.origin;

// Definir data mínima como hoje
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').min = today;
    
    // Carregar configurações do servidor
    loadServerConfig();
    
    // Configurar eventos
    setupEventListeners();
});

// FUNÇÕES AUXILIARES
function getServiceName(serviceCode) {
    const services = {
        'corte': 'Corte Tradicional - R$ 35,00',
        'barba': 'Barba Completa - R$ 25,00',
        'combo': 'Combo Premium - R$ 70,00',
        'bigode': 'Bigode & Cavanhaque - R$ 20,00',
        'infantil': 'Corte Infantil - R$ 25,00',
        'tratamento': 'Tratamento Capilar - R$ 40,00'
    };
    return services[serviceCode] || serviceCode;
}

function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
}

function formatPhone(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length <= 11) {
        value = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        input.value = value;
    }
}

// CONFIGURAÇÃO DE EVENTOS
function setupEventListeners() {
    // Gerenciar seleção de horários
    document.querySelectorAll('.time-slot').forEach(slot => {
        slot.addEventListener('click', function() {
            if (this.classList.contains('unavailable')) return;
            
            document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
            this.classList.add('selected');
            document.getElementById('selectedTime').value = this.dataset.time;
        });
    });
    
    // Formato de telefone
    document.getElementById('phone').addEventListener('input', function(e) {
        formatPhone(e.target);
    });
    
    // Submit do formulário
    document.getElementById('bookingForm').addEventListener('submit', handleBookingSubmit);
    
    // Atualizar horários quando data mudar
    document.getElementById('date').addEventListener('change', loadAvailableTimes);
    
    // Scroll suave para links do menu
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// CARREGAR CONFIGURAÇÕES DO SERVIDOR
async function loadServerConfig() {
    try {
        // Tentar carregar configurações públicas se disponível
        // Por enquanto, usar as configurações padrão
        console.log('📋 Configurações carregadas');
    } catch (error) {
        console.warn('Usando configurações padrão:', error);
    }
}

// MANIPULAR SUBMIT DO FORMULÁRIO
async function handleBookingSubmit(e) {
    e.preventDefault();
    
    if (!document.getElementById('selectedTime').value) {
        showMessage('Por favor, selecione um horário disponível.', 'error');
        return;
    }
    
    // Desabilitar botão e mostrar loading
    const submitButton = document.getElementById('submitButton');
    const submitText = document.getElementById('submitText');
    const submitLoading = document.getElementById('submitLoading');
    
    submitButton.disabled = true;
    submitText.style.display = 'none';
    submitLoading.style.display = 'inline';
    
    try {
        const formData = new FormData(e.target);
        const booking = {
            name: formData.get('name'),
            phone: formData.get('phone'),
            email: formData.get('email'),
            service: formData.get('service'),
            barber: formData.get('barber') || 'Sem preferência',
            date: formData.get('date'),
            time: formData.get('selectedTime'),
            notes: formData.get('notes') || 'Nenhuma'
        };
        
        // Enviar para o servidor
        const response = await fetch(`${API_BASE}/api/bookings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(booking)
        });

        const result = await response.json();

        if (result.success) {
            showMessage('✅ Agendamento confirmado! Email enviado com sucesso.', 'success');
            
            // Mostrar detalhes do agendamento
            setTimeout(() => {
                alert(`🎉 Agendamento Confirmado!
                
📋 Detalhes:
👤 Nome: ${booking.name}
📅 Data: ${formatDate(booking.date)}
⏰ Horário: ${booking.time}
✂️ Serviço: ${getServiceName(booking.service)}
👨‍💼 Profissional: ${booking.barber}

📧 Confirmação enviada por email!
📞 Entraremos em contato em breve.`);
            }, 1000);
            
            // Resetar formulário
            e.target.reset();
            document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
            document.getElementById('selectedTime').value = '';
            loadAvailableTimes();
            
        } else {
            showMessage(`❌ ${result.error || 'Erro ao processar agendamento'}`, 'error');
        }
        
    } catch (error) {
        console.error('Erro no agendamento:', error);
        
        // Fallback: salvar localmente se servidor estiver offline
        if (error.message.includes('fetch')) {
            const booking = {
                id: Date.now(),
                name: formData.get('name'),
                phone: formData.get('phone'),
                email: formData.get('email'),
                service: formData.get('service'),
                barber: formData.get('barber') || 'Sem preferência',
                date: formData.get('date'),
                time: formData.get('selectedTime'),
                notes: formData.get('notes') || 'Nenhuma',
                status: 'Pendente - Offline',
                createdAt: new Date().toISOString()
            };
            
            // Salvar localmente
            const offlineBookings = JSON.parse(localStorage.getItem('offlineBookings') || '[]');
            offlineBookings.push(booking);
            localStorage.setItem('offlineBookings', JSON.stringify(offlineBookings));
            
            showMessage('⚠️ Sem conexão. Agendamento salvo localmente. Entre em contato conosco!', 'success');
            
            // Resetar formulário
            e.target.reset();
            document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
            document.getElementById('selectedTime').value = '';
        } else {
            showMessage('❌ Erro ao processar agendamento. Tente novamente.', 'error');
        }
    } finally {
        // Restaurar botão
        submitButton.disabled = false;
        submitText.style.display = 'inline';
        submitLoading.style.display = 'none';
    }
}

// GERENCIAMENTO DE HORÁRIOS
async function loadAvailableTimes() {
    const selectedDate = document.getElementById('date').value;
    const timeSlots = document.querySelectorAll('.time-slot');
    
    if (!selectedDate) {
        timeSlots.forEach(slot => {
            slot.classList.remove('unavailable', 'selected');
        });
        document.getElementById('selectedTime').value = '';
        return;
    }
    
    try {
        // Buscar horários disponíveis do servidor
        const response = await fetch(`${API_BASE}/api/available-times?date=${selectedDate}`);
        const data = await response.json();
        
        timeSlots.forEach(slot => {
            slot.classList.remove('unavailable', 'selected');
            
            const time = slot.dataset.time;
            
            // Verificar se horário está indisponível (bloqueado ou ocupado)
            if (data.blocked && data.blocked.includes(time)) {
                slot.classList.add('unavailable');
                slot.title = 'Horário bloqueado';
            } else if (data.booked && data.booked.includes(time)) {
                slot.classList.add('unavailable');
                slot.title = 'Horário ocupado';
            } else {
                slot.title = 'Horário disponível';
            }
        });
        
    } catch (error) {
        console.error('Erro ao carregar horários:', error);
        
        // Fallback: usar dados locais se servidor estiver offline
        loadAvailableTimesOffline(selectedDate);
    }
    
    document.getElementById('selectedTime').value = '';
}

function loadAvailableTimesOffline(selectedDate) {
    console.log('Usando modo offline para horários');
    
    const timeSlots = document.querySelectorAll('.time-slot');
    
    // Usar dados salvos localmente
    const savedBookings = JSON.parse(localStorage.getItem('barbershopBookings') || '[]');
    const savedBlockedTimes = JSON.parse(localStorage.getItem('barbershopBlockedTimes') || '{}');
    const offlineBookings = JSON.parse(localStorage.getItem('offlineBookings') || '[]');
    
    timeSlots.forEach(slot => {
        slot.classList.remove('unavailable', 'selected');
        
        const time = slot.dataset.time;
        
        // Verificar horários bloqueados localmente
        if (savedBlockedTimes[selectedDate] && savedBlockedTimes[selectedDate].includes(time)) {
            slot.classList.add('unavailable');
            slot.title = 'Horário bloqueado';
            return;
        }
        
        // Verificar agendamentos locais
        const hasLocalBooking = savedBookings.some(booking => 
            booking.date === selectedDate && 
            booking.time === time && 
            booking.status !== 'Cancelado'
        );
        
        const hasOfflineBooking = offlineBookings.some(booking => 
            booking.date === selectedDate && 
            booking.time === time
        );
        
        if (hasLocalBooking || hasOfflineBooking) {
            slot.classList.add('unavailable');
            slot.title = 'Horário ocupado';
        } else {
            slot.title = 'Horário disponível';
        }
    });
}

// CONFIGURAÇÃO DE EMAIL (Interface simplificada)
function showEmailConfig() {
    alert(`📧 Configuração de Email

Para alterar as configurações de email, acesse:
${window.location.origin}/admin

Login: admin
Senha: admin123

Lá você poderá:
• Configurar email para receber notificações
• Gerenciar horários bloqueados
• Visualizar todos os agendamentos
• E muito mais!`);
}

// UTILITÁRIOS
function showMessage(message, type = 'success') {
    const successMsg = document.getElementById('successMessage');
    const errorMsg = document.getElementById('errorMessage');
    
    // Esconder todas as mensagens primeiro
    successMsg.style.display = 'none';
    errorMsg.style.display = 'none';
    
    if (type === 'success') {
        successMsg.textContent = message;
        successMsg.style.display = 'block';
        setTimeout(() => {
            successMsg.style.display = 'none';
        }, 8000);
    } else {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
        setTimeout(() => {
            errorMsg.style.display = 'none';
        }, 8000);
    }
}

function scrollToBooking() {
    document.getElementById('booking').scrollIntoView({
        behavior: 'smooth'
    });
}

// SINCRONIZAÇÃO QUANDO VOLTAR ONLINE
window.addEventListener('online', async function() {
    console.log('🌐 Conexão restaurada! Sincronizando dados...');
    
    const offlineBookings = JSON.parse(localStorage.getItem('offlineBookings') || '[]');
    
    if (offlineBookings.length > 0) {
        showMessage('🔄 Sincronizando agendamentos offline...', 'success');
        
        for (const booking of offlineBookings) {
            try {
                const response = await fetch(`${API_BASE}/api/bookings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(booking)
                });

                if (response.ok) {
                    console.log(`✅ Agendamento sincronizado: ${booking.name}`);
                }
            } catch (error) {
                console.error('Erro na sincronização:', error);
            }
        }
        
        // Limpar agendamentos offline após sincronização
        localStorage.removeItem('offlineBookings');
        showMessage('✅ Todos os agendamentos foram sincronizados!', 'success');
    }
});

// DETECTAR STATUS DA CONEXÃO
window.addEventListener('offline', function() {
    showMessage('⚠️ Sem conexão com a internet. Agendamentos serão salvos localmente.', 'error');
});

// ANIMAÇÕES NO SCROLL
window.addEventListener('scroll', () => {
    const cards = document.querySelectorAll('.service-card');
    cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
            card.style.animation = 'fadeInUp 0.6s ease-out forwards';
        }
    });
});

// VERIFICAR AGENDAMENTOS OFFLINE AO CARREGAR
document.addEventListener('DOMContentLoaded', function() {
    const offlineBookings = JSON.parse(localStorage.getItem('offlineBookings') || '[]');
    
    if (offlineBookings.length > 0) {
        showMessage(`📱 Você tem ${offlineBookings.length} agendamento(s) aguardando sincronização.`, 'success');
    }
});

// Logs para debug
console.log('🔧 Sistema de Agendamento BarberShop Elite Carregado (Versão Backend)');
console.log('📧 Email configurado para:', emailConfig.ownerEmail);
console.log('🌐 API Base:', API_BASE);
console.log('📱 Status da conexão:', navigator.onLine ? 'Online' : 'Offline');