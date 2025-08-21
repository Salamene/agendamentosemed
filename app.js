// Sistema de Agendamento de Notebooks - Versão Completa
let isSignedIn = false;
let currentUser = null;
let agendamentos = [];

// Cache remoto de agendamentos (Google Sheets)
let agendamentosRemotos = [];
let ultimoSyncRemoto = 0;

// Configurações do Google Sheets
const GOOGLE_SHEETS_CONFIG = {
    CLIENT_ID: '11343027344-47mpug5vsg9ig2jhrmpk26cup8kn8uuh.apps.googleusercontent.com',
    CLIENT_SECRET: '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',
    SPREADSHEET_ID: '1gAtBTGXZgwsdx0TMxRO0PVeskuPSna9gtLYoEFn-hks',
    RANGE: 'Agendamentos!A:Z'
};

// Inicializar sistema
document.addEventListener('DOMContentLoaded', function() {
    console.log('Sistema iniciado!');
    
    // Carregar dados existentes e migrar para formato normalizado
    let usuarios = [];
    try {
        usuarios = JSON.parse(localStorage.getItem('usuarios-sistema')) || [];
    } catch (_) {
        usuarios = [];
    }
    if (Array.isArray(usuarios) && usuarios.length > 0) {
        usuarios = migrarUsuariosNormalizados(usuarios);
        localStorage.setItem('usuarios-sistema', JSON.stringify(usuarios));
    }
    console.log('Usuários carregados:', usuarios.length);
    
    // Carregar agendamentos existentes
    agendamentos = JSON.parse(localStorage.getItem('agendamentos-sistema')) || [];
    
    // Configurar event listeners
    setupEventListeners();
    
    // Verificar sessão ativa
    verificarSessaoAtiva();
    
    // Sincronizar agendamentos remotos (Google Sheets)
    setTimeout(() => { try { sincronizarAgendamentosRemotos(); } catch (e) { console.warn('Falha ao sincronizar no início:', e); } }, 300);
    // Atualização periódica
    setInterval(() => { try { sincronizarAgendamentosRemotos(true); } catch (_) {} }, 60 * 1000);
    
    // Configurar data mínima (hoje em horário local)
    const dataField = document.getElementById('data-aula');
    if (dataField) {
        const hojeStr = getLocalISODate();
        dataField.min = hojeStr;
        if (!dataField.value) dataField.value = hojeStr;
    }
    


});

// Retorna data em formato YYYY-MM-DD usando horário local
function getLocalISODate(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
}

function setupEventListeners() {
    // Formulário de agendamento
    const agendamentoForm = document.getElementById("agendamentoForm");
    if (agendamentoForm) {
        agendamentoForm.addEventListener("submit", handleAgendamento);
    }

    // Formulário de registro de notebook danificado
    const notebookDanificadoForm = document.getElementById("notebookDanificadoForm");
    if (notebookDanificadoForm) {
        notebookDanificadoForm.addEventListener("submit", handleNotebookDanificado);
    }
    
    // Formulário de login (evitar duplo bind se já houver onsubmit inline)
    const loginForm = document.getElementById('loginForm');
    if (loginForm && !loginForm.getAttribute('onsubmit')) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Formulário de cadastro (evitar duplo bind se já houver onsubmit inline)
    const cadastroForm = document.getElementById('cadastroForm');
    if (cadastroForm && !cadastroForm.getAttribute('onsubmit')) {
        cadastroForm.addEventListener('submit', handleCadastro);
    }
    
    // Removido: fechar modal ao clicar fora (evita fechamento acidental durante a digitação)
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.addEventListener('click', function(e) {
            // Não fecha ao clicar no backdrop
        });
    }

    // Adicionar event listeners para melhorar touch nos checkboxes
    setupTouchEventListeners();
}

function setupTouchEventListeners() {
    // Delegar eventos para checkboxes que são criados dinamicamente
    document.addEventListener('touchstart', function(e) {
        if (e.target.classList.contains('schedule-label')) {
            e.target.style.transform = 'scale(0.98)';
        }
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (e.target.classList.contains('schedule-label')) {
            setTimeout(() => {
                e.target.style.transform = '';
            }, 150);
        }
    }, { passive: true });

    // Melhorar responsividade dos labels
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('schedule-label') && !e.target.classList.contains('occupied')) {
            const checkbox = e.target.previousElementSibling;
            if (checkbox && checkbox.type === 'checkbox') {
                checkbox.checked = !checkbox.checked;
                // Disparar evento change para manter compatibilidade
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });
}

// Normaliza e deduplica usuários por e-mail (lowercase/trim) e aparar senha
function migrarUsuariosNormalizados(lista) {
    const emailToUser = {};
    lista.forEach((u) => {
        const emailNorm = (u.email || '').toString().trim().toLowerCase();
        const senhaNorm = (u.senha || '').toString().trim();
        const usuarioNorm = { ...u, email: emailNorm, senha: senhaNorm };
        // Mantém o último registro em caso de duplicidade por e-mail
        emailToUser[emailNorm] = usuarioNorm;
    });
    return Object.values(emailToUser);
}

function verificarSessaoAtiva() {
    const sessaoAtiva = localStorage.getItem('sessao-ativa');
    if (sessaoAtiva) {
        try {
            const dadosSessao = JSON.parse(sessaoAtiva);
            const agora = new Date().getTime();
            const validadePadrao = 24 * 60 * 60 * 1000; // 24h
            const validadeMs = typeof dadosSessao.durationMs === 'number' ? dadosSessao.durationMs : validadePadrao;
            
            if (agora - dadosSessao.timestamp < validadeMs) {
                currentUser = dadosSessao.usuario;
                isSignedIn = true;
                atualizarInterfaceLogin();
                // Garantir que o modal esteja fechado ao restaurar a sessão
                try { hideAuthModal(); } catch (_) {}
                console.log('Sessão ativa encontrada:', currentUser.nome);
                return;
            } else {
                localStorage.removeItem('sessao-ativa');
                console.log('Sessão expirada');
            }
        } catch (error) {
            console.error('Erro ao verificar sessão:', error);
            localStorage.removeItem('sessao-ativa');
        }
    }
    
    atualizarInterfaceLogout();
}

function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const senha = document.getElementById('loginSenha').value.trim();
    
    console.log('Tentativa de login:', email);
    
    if (!email || !senha) {
        mostrarAlerta('Por favor, preencha todos os campos!', 'warning');
        return;
    }
    
    // Buscar usuário
    const usuarios = migrarUsuariosNormalizados(JSON.parse(localStorage.getItem('usuarios-sistema')) || []);
    const usuario = usuarios.find(u => (u.email || '').toLowerCase() === email && (u.senha || '').toString().trim() === senha);
    
    if (usuario) {
        console.log('Login bem-sucedido:', usuario.nome);
        
        // Configurar usuário atual
        currentUser = {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            profileType: usuario.profileType,
            escolasSelecionadas: usuario.escolasSelecionadas || [],
            escolaAssociada: usuario.escolaAssociada || null
        };
        isSignedIn = true;
        
        // Fechar modal imediatamente (antes de atualizar UI)
        try { hideAuthModal(); } catch (_) {}

        // Salvar sessão (24h padrão ou 30 dias se marcar "manter conectado")
        const manterConectadoEl = document.getElementById('manterConectado');
        const manterConectado = manterConectadoEl ? manterConectadoEl.checked : false;
        const durationMs = manterConectado ? (30 * 24 * 60 * 60 * 1000) : (24 * 60 * 60 * 1000);
        localStorage.setItem('sessao-ativa', JSON.stringify({
            usuario: currentUser,
            timestamp: Date.now(),
            durationMs: durationMs,
            lembrar: manterConectado
        }));
        
        // Atualizar interface
        atualizarInterfaceLogin();
        // Garantir fechamento após ciclo de render (fallback)
        setTimeout(() => { try { hideAuthModal(); } catch (_) {} }, 50);
        mostrarAlerta(`✅ Bem-vindo(a), ${currentUser.nome}!`, 'success');
        
        // Preencher nome do professor se aplicável
        if (currentUser.profileType === 'professor') {
            const professorField = document.getElementById('professor');
            if (professorField) {
                professorField.value = currentUser.nome;
            }
        }
        
    } else {
        console.log('Login falhou para:', email);
        const usuarioPorEmail = usuarios.find(u => (u.email || '').toLowerCase() === email);
        if (usuarioPorEmail) {
            mostrarAlerta('❌ Senha incorreta para este e-mail.', 'danger');
        } else {
            mostrarAlerta('❌ E-mail não cadastrado.', 'danger');
        }
    }
}

function handleCadastro(e) {
    e.preventDefault();
    
    const nome = document.getElementById('cadastroNome').value.trim();
    const email = document.getElementById('cadastroEmail').value.trim().toLowerCase();
    const senha = document.getElementById('cadastroSenha').value.trim();
    const senhaConfirm = document.getElementById('cadastroConfirmarSenha').value.trim();
    const profileType = document.getElementById('cadastroTipo').value;
    
    console.log('Tentativa de cadastro:', email);
    
    // Validações
    if (!nome || !email || !senha || !senhaConfirm || !profileType) {
        mostrarAlerta('Por favor, preencha todos os campos!', 'warning');
        return;
    }
    
    if (senha.length < 6) {
        mostrarAlerta('A senha deve ter pelo menos 6 caracteres!', 'warning');
        return;
    }
    
    if (senha !== senhaConfirm) {
        mostrarAlerta('As senhas não coincidem!', 'warning');
        return;
    }
    
    // Verificar se email já existe
    let usuarios = migrarUsuariosNormalizados(JSON.parse(localStorage.getItem('usuarios-sistema')) || []);
    if (usuarios.find(u => (u.email || '').toLowerCase() === email)) {
        mostrarAlerta('❌ Este e-mail já está cadastrado!', 'danger');
        return;
    }
    
    // Coletar escolas selecionadas se for professor ou técnico
    let escolasSelecionadas = [];
    if (profileType === 'professor' || profileType === 'tecnico') {
        escolasSelecionadas = getEscolasSelecionadas();
        if (escolasSelecionadas.length === 0) {
            mostrarAlerta('Por favor, selecione pelo menos uma escola!', 'warning');
            return;
        }
        if (profileType === 'tecnico' && escolasSelecionadas.length !== 1) {
            mostrarAlerta('Técnico deve selecionar exatamente uma escola!', 'warning');
            return;
        }
    }
    
    // Criar novo usuário - REMOVIDA A NECESSIDADE DE APROVAÇÃO
    const novoUsuario = {
        id: Date.now(),
        nome: nome,
        email: email,
        senha: senha,
        profileType: profileType,
        dataCadastro: new Date().toISOString(),
        escolasSelecionadas: escolasSelecionadas,
        escolaAssociada: escolasSelecionadas.length > 0 ? escolasSelecionadas[0] : null,
        aprovado: true // TODOS OS USUÁRIOS SÃO APROVADOS AUTOMATICAMENTE
    };
    
    usuarios.push(novoUsuario);
    usuarios = migrarUsuariosNormalizados(usuarios);
    localStorage.setItem('usuarios-sistema', JSON.stringify(usuarios));
    
    console.log('Usuário cadastrado e aprovado automaticamente:', novoUsuario.nome);
    
    currentUser = {
        id: novoUsuario.id,
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        profileType: novoUsuario.profileType,
        escolasSelecionadas: novoUsuario.escolasSelecionadas,
        escolaAssociada: novoUsuario.escolaAssociada
    };
    isSignedIn = true;
    
    // Após cadastro, criar sessão padrão (24h) sem manter conectado por 30 dias
    localStorage.setItem("sessao-ativa", JSON.stringify({
        usuario: currentUser,
        timestamp: Date.now(),
        durationMs: 24 * 60 * 60 * 1000,
        lembrar: false
    }));
    
    atualizarInterfaceLogin();
    hideAuthModal();
    mostrarAlerta(`✅ Conta criada e aprovada! Bem-vindo(a), ${currentUser.nome}!`, "success");
}

function handleAgendamento(e) {
    e.preventDefault();
    
    if (!isSignedIn) {
        mostrarAlerta('❌ Você precisa fazer login para criar agendamentos!', 'danger');
        showAuthModal();
        return;
    }
    
    // Validar campos obrigatórios
    if (!validarFormulario()) {
        return;
    }
    
    // Coletar dados do formulário
    const agendamento = coletarDadosFormulario();
    
    // Verificar conflitos
    if (verificarConflitos(agendamento)) {
        const escolasComMultiplosAgendamentos = ['pingo-gente', 'nilma-gloria'];
        if (escolasComMultiplosAgendamentos.includes(agendamento.escola)) {
            // Checar se o conflito foi por mesmo professor
            const mesmoProfessor = agendamentos.some(ag =>
                ag.escola === agendamento.escola &&
                ag.dataAula === agendamento.dataAula &&
                ag.status !== 'cancelado' &&
                Array.isArray(ag.horarios) &&
                ag.horarios.some(h => agendamento.horarios.includes(h)) &&
                (
                    (ag.usuarioId && currentUser && ag.usuarioId === currentUser.id) ||
                    (ag.professor && agendamento.professor && ag.professor.trim().toLowerCase() === agendamento.professor.trim().toLowerCase())
                )
            );
            if (mesmoProfessor) {
                mostrarAlerta('Nesta escola, o mesmo professor não pode agendar duas vezes o mesmo horário.', 'danger');
            } else {
            mostrarAlerta('Esta escola já possui 2 agendamentos para este horário, data e escola! Limite máximo atingido.', 'danger');
            }
        } else {
            mostrarAlerta('Já existe um agendamento para este horário, escola e data!', 'danger');
        }
        return;
    }
    
    // Salvar agendamento
    agendamentos.push(agendamento);
    localStorage.setItem('agendamentos-sistema', JSON.stringify(agendamentos));
    
    // Enviar para Google Sheets
    enviarParaGoogleSheets(agendamento);
    
    console.log('Agendamento criado:', agendamento);
    
    mostrarAlerta('✅ Agendamento criado com sucesso!', 'success');
    limparFormulario();
}

function handleNotebookDanificado(e) {
    e.preventDefault();
    
    if (!isSignedIn) {
        mostrarAlerta('❌ Você precisa fazer login para registrar notebooks danificados!', 'danger');
        showAuthModal();
        return;
    }
    
    if (currentUser.profileType !== 'tecnico') {
        mostrarAlerta('❌ Apenas técnicos podem registrar notebooks danificados!', 'danger');
        return;
    }
    
    const escola = document.getElementById('escolaDanificado').value;
    const numeroSerie = document.getElementById('numeroSerieDanificado').value.trim();
    const problema = document.getElementById('problemaDanificado').value.trim();
    
    if (!escola || !numeroSerie || !problema) {
        mostrarAlerta('Por favor, preencha todos os campos!', 'warning');
        return;
    }
    
    const registro = {
        id: Date.now(),
        escola: escola,
        numeroSerie: numeroSerie,
        problema: problema,
        tecnico: currentUser.nome,
        emailTecnico: currentUser.email,
        dataRegistro: new Date().toISOString(),
        status: 'registrado'
    };
    
    // Salvar no localStorage
    let notebooksDanificados = JSON.parse(localStorage.getItem('notebooks-danificados')) || [];
    notebooksDanificados.push(registro);
    localStorage.setItem('notebooks-danificados', JSON.stringify(notebooksDanificados));
    
    // Enviar para Google Sheets
    enviarNotebookDanificadoParaSheets(registro);
    
    console.log('Notebook danificado registrado:', registro);
    
    mostrarAlerta('✅ Notebook danificado registrado com sucesso!', 'success');
    
    // Limpar formulário
    document.getElementById('notebookDanificadoForm').reset();
}

function validarFormulario() {
    const campos = ["professor", "escola", "disciplina", "turma", "data-aula", "turno"];
    
    for (const campo of campos) {
        const elemento = document.getElementById(campo);
        if (!elemento || !elemento.value.trim()) {
            mostrarAlerta(`Por favor, preencha o campo ${campo.replace('-', ' ')}.`, 'warning');
            elemento.focus();
            return false;
        }
    }

    // Data não pode ser no passado
    const dataSelecionada = document.getElementById('data-aula')?.value;
    const hojeStr = getLocalISODate();
    if (dataSelecionada && dataSelecionada < hojeStr) {
        mostrarAlerta('A data da aula não pode ser no passado. Selecione a partir de hoje.', 'warning');
        return false;
    }

    const horariosSelecionados = document.querySelectorAll('input[name="horarios"]:checked');
    if (horariosSelecionados.length === 0) {
        mostrarAlerta('Por favor, selecione pelo menos um horário!', 'warning');
        return false;
    }

    return true;
}

function coletarDadosFormulario() {
    const horariosSelecionados = [];
    const professoresHorarios = {};
    
    document.querySelectorAll('input[name="horarios"]:checked').forEach(checkbox => {
        horariosSelecionados.push(checkbox.value);
        
        const professorInput = document.querySelector(`input[data-horario="${checkbox.value}"]`);
        if (professorInput && professorInput.value.trim()) {
            professoresHorarios[checkbox.value] = professorInput.value.trim();
        }
    });

    return {
        id: Date.now(),
        professor: document.getElementById('professor').value.trim(),
        escola: document.getElementById('escola').value,
        escolaNome: document.getElementById('escola').selectedOptions[0].text,
        disciplina: document.getElementById('disciplina').value.trim(),
        turma: document.getElementById("turma").value.trim(),
        dataAula: document.getElementById("data-aula").value,
        turno: document.getElementById('turno').value,
        observacoes: document.getElementById('observacoes').value.trim(),
        horarios: horariosSelecionados,
        professoresHorarios: professoresHorarios,
        status: 'pendente',
        dataAgendamento: new Date().toISOString(),
        emailProfessor: currentUser ? currentUser.email : '',
        usuarioId: currentUser ? currentUser.id : null,
        escolaAgendamento: document.getElementById('escola').value
    };
}

function verificarConflitos(novoAgendamento) {
    const escolasComMultiplosAgendamentos = ['pingo-gente', 'nilma-gloria'];

    const base = obterAgendamentosUnificados();
    const coincidentes = base.filter(agendamento =>
            agendamento.escola === novoAgendamento.escola &&
            agendamento.dataAula === novoAgendamento.dataAula &&
            agendamento.status !== 'cancelado' &&
        Array.isArray(agendamento.horarios) &&
        agendamento.horarios.some(horario => novoAgendamento.horarios.includes(horario))
    );

    if (escolasComMultiplosAgendamentos.includes(novoAgendamento.escola)) {
        // Bloquear se for o mesmo professor
        const existeMesmoProfessor = coincidentes.some(ag =>
            (ag.usuarioId && currentUser && ag.usuarioId === currentUser.id) ||
            (ag.professor && novoAgendamento.professor && ag.professor.trim().toLowerCase() === novoAgendamento.professor.trim().toLowerCase())
        );
        if (existeMesmoProfessor) return true;

        // Caso não seja o mesmo professor, permitir até 2 no total
        return coincidentes.length >= 2;
    } else {
        // Outras escolas: apenas 1 agendamento por horário
        return coincidentes.length >= 1;
    }
}

function verificarDisponibilidade() {
    const escola = document.getElementById('escola').value;
    const data = document.getElementById('data-aula').value;
    const turno = document.getElementById('turno').value;
    
    if (escola && data && turno) {
        atualizarHorarios();
    }
}

function atualizarHorarios() {
    const turno = document.getElementById('turno').value;
    const escola = document.getElementById('escola').value;
    const data = document.getElementById('data-aula').value;
    const container = document.getElementById('scheduleGrid');
    
    if (!turno || !escola || !data) {
        container.style.display = 'none';
        return;
    }

    // Bloquear grid para datas passadas
    const hojeStr = getLocalISODate();
    if (data < hojeStr) {
        container.style.display = 'none';
        mostrarAlerta('Selecione uma data a partir de hoje para visualizar horários.', 'warning');
        return;
    }

    container.style.display = 'grid';
    
    const horarios = obterHorariosPorTurno(turno);
    const dias = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
    const diasNomes = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

    let html = `
        <div class="schedule-header">Horário</div>
        ${diasNomes.map(dia => `<div class="schedule-header">${dia}</div>`).join('')}
    `;

    horarios.forEach((h, index) => {
        const aulaNum = index + 1;
        html += `
            <div class="time-slot">${h.aula}</div>
            ${dias.map(dia => {
                const horarioId = `${dia}-${aulaNum}-${turno}`;
                const agendamentoExistente = verificarHorarioOcupado(escola, data, horarioId);
                
                if (agendamentoExistente) {
                    return `
                        <div class="schedule-cell">
                            <input type="checkbox" id="${horarioId}" class="schedule-checkbox" 
                                   name="horarios" value="${horarioId}" disabled>
                            <label for="${horarioId}" class="schedule-label occupied">
                                ${agendamentoExistente.professor || 'Ocupado'}
                            </label>
                        </div>
                    `;
                } else {
                    return `
                        <div class="schedule-cell">
                            <input type="checkbox" id="${horarioId}" class="schedule-checkbox" 
                                   name="horarios" value="${horarioId}">
                            <label for="${horarioId}" class="schedule-label">
                                Disponível
                            </label>
                        </div>
                    `;
                }
            }).join('')}
        `;
    });

    container.innerHTML = html;
}

function obterHorariosPorTurno(turno) {
        return [
            { aula: '1ª Aula' },
            { aula: '2ª Aula' },
            { aula: '3ª Aula' },
            { aula: '4ª Aula' },
            { aula: '5ª Aula' }
        ];
}

function verificarHorarioOcupado(escola, data, horarioId) {
    const escolasComMultiplosAgendamentos = ['pingo-gente', 'nilma-gloria'];

    const base = obterAgendamentosUnificados();
    const agendamentosMesmoHorario = base.filter(ag =>
        ag.escola === escola &&
        ag.dataAula === data &&
        ag.status !== 'cancelado' &&
        Array.isArray(ag.horarios) &&
        ag.horarios.includes(horarioId)
    );

    if (escolasComMultiplosAgendamentos.includes(escola)) {
        // Bloquear seleção se o usuário atual já tiver agendado este horário
        const mesmoUsuario = agendamentosMesmoHorario.some(a =>
            (a.usuarioId && currentUser && a.usuarioId === currentUser.id) ||
            (a.professor && currentUser && a.professor.trim().toLowerCase() === currentUser.nome.trim().toLowerCase())
        );
        if (mesmoUsuario) {
            return { professor: 'Você já agendou este horário' };
        }

        // Bloquear quando já houver 2 agendamentos no mesmo horário
        if (agendamentosMesmoHorario.length >= 2) {
            const nomes = agendamentosMesmoHorario.map(a => a.professor).filter(Boolean).join(', ');
            return { professor: nomes || `Ocupado (2/2)` };
        }
        return null;
    } else {
        // Demais escolas: bloquear a partir de 1 agendamento
        if (agendamentosMesmoHorario.length >= 1) {
            return { professor: agendamentosMesmoHorario[0].professor || 'Ocupado' };
    }
        return null;
    }
}

function getEscolasSelecionadas() {
    const checkboxes = document.querySelectorAll('input[name="escolas"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function toggleEscolasField() {
    const tipo = document.getElementById('cadastroTipo').value;
    const escolasGroup = document.getElementById('escolasGroup');
    
    if (tipo === 'professor' || tipo === 'tecnico') {
        escolasGroup.style.display = 'block';
    } else {
        escolasGroup.style.display = 'none';
    }

    aplicarRestricaoSelecaoEscolas();
}

// Restringe seleção de escolas no cadastro: técnico = exatamente 1; professor = múltiplas
function aplicarRestricaoSelecaoEscolas() {
    const tipo = document.getElementById('cadastroTipo').value;
    const checkboxes = Array.from(document.querySelectorAll('input[name="escolas"]'));
    if (checkboxes.length === 0) return;

    // Reset handlers e estado
    checkboxes.forEach(cb => {
        cb.onchange = null;
        cb.disabled = false;
    });

    if (tipo === 'tecnico') {
        // Permitir marcar apenas 1
        checkboxes.forEach(cb => {
            cb.onchange = () => {
                if (cb.checked) {
                    checkboxes.forEach(outro => { if (outro !== cb) outro.checked = false; });
                }
            };
        });
    }
}

function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.add('active');
    modal.style.display = 'flex';
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.display = 'none';
}

function showAuthTab(tab, element) {
    // Remover classe active de todas as abas
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    
    // Adicionar classe active na aba clicada
    if (element) {
        element.classList.add('active');
    }
    
    // Mostrar formulário correspondente
    if (tab === 'login') {
        document.getElementById('loginForm').classList.add('active');
    } else {
        document.getElementById('cadastroForm').classList.add('active');
    }
}

function showTab(tabName, element) {
    // Remover classe active de todas as abas
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Adicionar classe active na aba clicada
    if (element) {
        element.classList.add('active');
    }
    
    // Mostrar conteúdo da aba
    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');
        
        // Redirecionar usuários sem permissão
        if (currentUser) {
            if (currentUser.profileType === 'professor' && !['agendar', 'meus-agendamentos', 'configuracoes'].includes(tabName)) {
                tabName = 'agendar';
            }
            if (currentUser.profileType === 'tecnico' && !['gerenciar-agendamentos', 'configuracoes'].includes(tabName)) {
                tabName = 'gerenciar-agendamentos';
            }
        }
        
        // Carregar dados específicos da aba
        if (tabName === 'meus-agendamentos') {
            carregarMeusAgendamentos();
        } else if (tabName === 'gerenciar-professores') {
            carregarProfessores();
        } else if (tabName === 'gerenciar-agendamentos') {
            // Tenta sincronizar antes de listar
            try { sincronizarAgendamentosRemotos(); } catch (_) {}
            carregarTodosAgendamentos();
        } else if (tabName === 'semed') {
            carregarNotebooksComDefeitoSEMED();
            carregarRankingAgendamentosSEMED();
        } else if (tabName === 'relatorios') {
            // Aba relatórios agora só tem filtros, sem ranking
        }

        // Reaplicar filtro de escolas ao trocar de aba
        aplicarFiltroDeEscolasNosSelects();
    }
}

function atualizarInterfaceLogin() {
    const authButton = document.getElementById('authButton');
    const userInfo = document.getElementById('userInfo');
    const authAlert = document.getElementById('authAlert');
    const mainContent = document.querySelector('.main-content');
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    
    if (authButton) authButton.style.display = 'none';
    if (userInfo) userInfo.style.display = 'flex';
    if (authAlert) authAlert.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    
    if (userName && currentUser) userName.textContent = currentUser.nome;
    if (userAvatar && currentUser) userAvatar.textContent = currentUser.nome.charAt(0).toUpperCase();
    
    // Mostrar/ocultar abas baseado no tipo de usuário
    const gerenciarProfessoresTab = document.getElementById('gerenciarProfessoresTab');
    const gerenciarAgendamentosTab = document.getElementById('gerenciarAgendamentosTab');
    const registrarNotebookTab = document.getElementById('registrarNotebookDanificadoTab');
    const semedTab = document.getElementById('semedTab');
    const relatoriosTab = document.querySelector('.nav-tab[onclick*="relatorios"]');
    const agendarTab = document.querySelector('.nav-tab[onclick*="agendar"]');
    const meusAgendamentosTab = document.querySelector('.nav-tab[onclick*="meus-agendamentos"]');
    const configuracoesTab = document.querySelector('.nav-tab[onclick*="configuracoes"]');
    
    if (currentUser) {
        // Esconder tudo por padrão
        if (gerenciarProfessoresTab) gerenciarProfessoresTab.style.display = 'none';
        if (gerenciarAgendamentosTab) gerenciarAgendamentosTab.style.display = 'none';
        if (registrarNotebookTab) registrarNotebookTab.style.display = 'none';
        if (semedTab) semedTab.style.display = 'none';
        if (relatoriosTab) relatoriosTab.style.display = 'none';
        if (agendarTab) agendarTab.style.display = 'none';
        if (meusAgendamentosTab) meusAgendamentosTab.style.display = 'none';
        if (configuracoesTab) configuracoesTab.style.display = 'none';

        if (currentUser.profileType === 'semed') {
            // SEMED: vê tudo
            if (gerenciarProfessoresTab) gerenciarProfessoresTab.style.display = 'block';
            if (gerenciarAgendamentosTab) gerenciarAgendamentosTab.style.display = 'block';
            if (registrarNotebookTab) registrarNotebookTab.style.display = 'block';
            if (semedTab) semedTab.style.display = 'block';
            if (relatoriosTab) relatoriosTab.style.display = 'block';
            if (agendarTab) agendarTab.style.display = 'block';
            if (meusAgendamentosTab) meusAgendamentosTab.style.display = 'block';
            if (configuracoesTab) configuracoesTab.style.display = 'block';
        } else if (currentUser.profileType === 'tecnico') {
            // Técnico: vê apenas Configurações e Gerenciar Agendamentos (da sua escola)
            if (gerenciarAgendamentosTab) gerenciarAgendamentosTab.style.display = 'block';
            if (configuracoesTab) configuracoesTab.style.display = 'block';
        } else if (currentUser.profileType === 'professor') {
            // Professor: Agendar Aula, Meus Agendamentos, Configurações
            if (agendarTab) agendarTab.style.display = 'block';
            if (meusAgendamentosTab) meusAgendamentosTab.style.display = 'block';
            if (configuracoesTab) configuracoesTab.style.display = 'block';
        }
    }

    // Aplicar filtro de escolas nos selects conforme perfil
    aplicarFiltroDeEscolasNosSelects();

    // Atualizar dados remotos após login (perfil influencia filtros do Apps Script)
    try { sincronizarAgendamentosRemotos(); } catch (_) {}
}

function atualizarInterfaceLogout() {
    const authButton = document.getElementById('authButton');
    const userInfo = document.getElementById('userInfo');
    const authAlert = document.getElementById('authAlert');
    const mainContent = document.querySelector('.main-content');
    
    if (authButton) authButton.style.display = 'block';
    if (userInfo) userInfo.style.display = 'none';
    if (authAlert) authAlert.style.display = 'block';
    if (mainContent) mainContent.style.display = 'none';
    
    // Ocultar todas as abas especiais
    const gerenciarProfessoresTab = document.getElementById('gerenciarProfessoresTab');
    const gerenciarAgendamentosTab = document.getElementById('gerenciarAgendamentosTab');
    const registrarNotebookTab = document.getElementById('registrarNotebookDanificadoTab');
    const semedTab = document.getElementById('semedTab');
    const relatoriosTab = document.querySelector('.nav-tab[onclick*="relatorios"]');
    
    if (gerenciarProfessoresTab) gerenciarProfessoresTab.style.display = 'none';
    if (gerenciarAgendamentosTab) gerenciarAgendamentosTab.style.display = 'none';
    if (registrarNotebookTab) registrarNotebookTab.style.display = 'none';
    if (semedTab) semedTab.style.display = 'none';
    if (relatoriosTab) relatoriosTab.style.display = 'none';

    // Reabilitar todos os selects de escola
    resetFiltroEscolasNosSelects();
}

function logout() {
    currentUser = null;
    isSignedIn = false;
    localStorage.removeItem('sessao-ativa');
    atualizarInterfaceLogout();
    mostrarAlerta('Logout realizado com sucesso!', 'info');
}

function limparFormulario() {
    document.getElementById('agendamentoForm').reset();
    document.getElementById('scheduleGrid').style.display = 'none';
    
    // Configurar data mínima novamente
    const dataField = document.getElementById('data-aula');
    if (dataField) {
        const hojeStr = getLocalISODate();
        dataField.min = hojeStr;
        dataField.value = hojeStr;
    }

    // Atualiza grid conforme filtros atuais
    try { verificarDisponibilidade(); } catch (_) {}
}

function mostrarAlerta(mensagem, tipo) {
    // Remover alertas existentes
    const alertasExistentes = document.querySelectorAll('.alert-temp');
    alertasExistentes.forEach(alerta => alerta.remove());
    
    // Criar novo alerta
    const alerta = document.createElement('div');
    alerta.className = `alert alert-${tipo} alert-temp`;
    alerta.style.position = 'fixed';
    alerta.style.top = '20px';
    alerta.style.right = '20px';
    alerta.style.zIndex = '9999';
    alerta.style.maxWidth = '400px';
    alerta.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    alerta.innerHTML = mensagem;
    
    document.body.appendChild(alerta);
    
    // Remover após 5 segundos
    setTimeout(() => {
        if (alerta.parentNode) {
            alerta.remove();
        }
    }, 5000);
}



// Unifica dados locais e remotos evitando duplicidade por id
function obterAgendamentosUnificados() {
    const mapa = new Map();
    // Remotos primeiro para priorizar status mais atualizado
    for (const ag of Array.isArray(agendamentosRemotos) ? agendamentosRemotos : []) {
        if (!ag || !ag.id) continue;
        mapa.set(String(ag.id), normalizarAgendamento(ag));
    }
    // Locais depois para preencher lacunas (ids diferentes)
    for (const ag of Array.isArray(agendamentos) ? agendamentos : []) {
        if (!ag || !ag.id) continue;
        const chave = String(ag.id);
        if (!mapa.has(chave)) {
            mapa.set(chave, normalizarAgendamento(ag));
        }
    }
    return Array.from(mapa.values());
}

function normalizarAgendamento(raw) {
    // Aceitar formatos vindos do Sheets (colunas com nomes em PT) e do localStorage
    if (raw.professor) return raw;
    const m = {
        id: raw.ID || raw.id,
        professor: raw['Professor'] || raw.professor || '',
        emailProfessor: raw['Email Professor'] || raw.email_professor || raw.emailProfessor || '',
        escola: raw['Escola Codigo'] || raw.escola || raw.escola_codigo || '',
        escolaNome: raw['Escola Nome'] || raw.escolaNome || raw.escola_nome || '',
        disciplina: raw['Disciplina'] || raw.disciplina || '',
        turma: raw['Turma'] || raw.turma || '',
        dataAula: raw['Data Aula'] || raw.dataAula || raw.data_aula || '',
        turno: raw['Turno'] || raw.turno || '',
        horarios: Array.isArray(raw['Horarios']) ? raw['Horarios'] : Array.isArray(raw.horarios) ? raw.horarios : (typeof raw['Horarios'] === 'string' ? raw['Horarios'].split(',').map(s => s.trim()).filter(Boolean) : []),
        observacoes: raw['Observacoes'] || raw.observacoes || '',
        status: raw['Status'] || raw.status || 'pendente',
        dataAgendamento: raw['Data Agendamento'] || raw.dataAgendamento || raw.data_agendamento || '',
        usuarioId: raw['Usuario ID'] || raw.usuarioId || null
    };
    // Garantir tipos
    if (!Array.isArray(m.horarios)) m.horarios = [];
    return m;
}

// Sincroniza com Google Sheets via Apps Script
async function sincronizarAgendamentosRemotos(forcar = false) {
    const agora = Date.now();
    if (!forcar && agora - ultimoSyncRemoto < 15 * 1000) return; // evita flood
    if (typeof window.SheetsIntegration === 'undefined' || typeof window.SheetsIntegration.carregarAgendamentosDoSheets !== 'function') return;
    try {
        const dados = await window.SheetsIntegration.carregarAgendamentosDoSheets();
        agendamentosRemotos = Array.isArray(dados) ? dados : [];
        ultimoSyncRemoto = Date.now();
        // Atualizar UIs críticas
        try {
            const abaMeus = document.getElementById('meus-agendamentos');
            const abaGerenciar = document.getElementById('gerenciar-agendamentos');
            const abaRel = document.getElementById('relatorios');
            if (abaMeus && abaMeus.classList.contains('active')) carregarMeusAgendamentos();
            if (abaGerenciar && abaGerenciar.classList.contains('active')) carregarTodosAgendamentos();
            if (abaRel && abaRel.classList.contains('active')) gerarRelatorio();
            // Atualiza grid de disponibilidade se filtros estiverem preenchidos
            verificarDisponibilidade();
        } catch (_) {}
    } catch (e) {
        console.warn('Falha ao carregar agendamentos do Sheets:', e);
    }
}

function carregarMeusAgendamentos() {
    const container = document.getElementById('agendamentosList');
    if (!container || !currentUser) return;
    
    const base = obterAgendamentosUnificados();
    const meusAgendamentos = base.filter(ag => ag.usuarioId === currentUser.id || (ag.emailProfessor && ag.emailProfessor === currentUser.email));
    
    if (meusAgendamentos.length === 0) {
        container.innerHTML = '<p class="alert alert-info">Você ainda não possui agendamentos.</p>';
        return;
    }
    
    let html = '';
    meusAgendamentos.forEach(agendamento => {
        html += `
            <div class="agendamento-item">
                <h4>${agendamento.escolaNome}</h4>
                <p><strong>Professor:</strong> ${agendamento.professor}</p>
                <p><strong>Disciplina:</strong> ${agendamento.disciplina}</p>
                <p><strong>Turma:</strong> ${agendamento.turma}</p>
                <p><strong>Data:</strong> ${new Date(agendamento.dataAula).toLocaleDateString('pt-BR')}</p>
                <p><strong>Turno:</strong> ${agendamento.turno}</p>
                <p><strong>Horários:</strong> ${agendamento.horarios.join(', ')}</p>
                <span class="status ${agendamento.status}">${agendamento.status.toUpperCase()}</span>
                ${agendamento.observacoes ? `<p><strong>Observações:</strong> ${agendamento.observacoes}</p>` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function carregarProfessores() {
    const container = document.getElementById('professoresList');
    if (!container) return;
    
    const usuarios = JSON.parse(localStorage.getItem('usuarios-sistema')) || [];
    const professores = usuarios.filter(u => u.profileType === 'professor');
    
    if (professores.length === 0) {
        container.innerHTML = '<p class="alert alert-info">Nenhum professor cadastrado.</p>';
        return;
    }
    
    let html = '';
    professores.forEach(professor => {
        html += `
            <div class="agendamento-item">
                <h4>${professor.nome}</h4>
                <p><strong>E-mail:</strong> ${professor.email}</p>
                <p><strong>Escolas:</strong> ${professor.escolasSelecionadas ? professor.escolasSelecionadas.join(', ') : 'Não informado'}</p>
                <p><strong>Data de Cadastro:</strong> ${new Date(professor.dataCadastro).toLocaleDateString('pt-BR')}</p>
                <span class="status aprovado">APROVADO</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function carregarTodosAgendamentos() {
    const container = document.getElementById('agendamentosGerenciarList');
    if (!container) return;
    
    // Aplicar filtro: técnico vê apenas suas escolas; SEMED vê tudo; outros não acessam esta aba
    let lista = obterAgendamentosUnificados();
    if (currentUser && currentUser.profileType === 'tecnico') {
        const escolasPermitidas = currentUser.escolasSelecionadas && currentUser.escolasSelecionadas.length > 0
            ? currentUser.escolasSelecionadas
            : (currentUser.escolaAssociada ? [currentUser.escolaAssociada] : []);
        lista = agendamentos.filter(ag => escolasPermitidas.includes(ag.escola));
    }

    if (lista.length === 0) {
        container.innerHTML = '<p class="alert alert-info">Nenhum agendamento encontrado.</p>';
        return;
    }
    
    let html = '';
    const podeAprovarCancelar = currentUser && (currentUser.profileType === 'tecnico' || currentUser.profileType === 'semed');
    lista.forEach(agendamento => {
        html += `
            <div class="agendamento-item">
                <h4>${agendamento.escolaNome}</h4>
                <p><strong>Professor:</strong> ${agendamento.professor}</p>
                <p><strong>Disciplina:</strong> ${agendamento.disciplina}</p>
                <p><strong>Turma:</strong> ${agendamento.turma}</p>
                <p><strong>Data:</strong> ${new Date(agendamento.dataAula).toLocaleDateString('pt-BR')}</p>
                <p><strong>Turno:</strong> ${agendamento.turno}</p>
                <p><strong>Horários:</strong> ${agendamento.horarios.join(', ')}</p>
                <span class="status ${agendamento.status}">${agendamento.status.toUpperCase()}</span>
                ${agendamento.observacoes ? `<p><strong>Observações:</strong> ${agendamento.observacoes}</p>` : ''}
                ${podeAprovarCancelar ? `
                <div class="agendamento-actions">
                    <button class="btn btn-success" onclick="aprovarAgendamento(${agendamento.id})">Aprovar</button>
                    <button class="btn btn-danger" onclick="cancelarAgendamento(${agendamento.id})">Cancelar</button>
                </div>` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function aprovarAgendamento(id) {
    const agendamento = agendamentos.find(ag => ag.id === id);
    if (!currentUser || (currentUser.profileType !== 'tecnico' && currentUser.profileType !== 'semed')) {
        mostrarAlerta('Apenas técnicos ou SEMED podem aprovar agendamentos.', 'danger');
        return;
    }
    if (!agendamento) {
        mostrarAlerta('Agendamento não encontrado.', 'danger');
        return;
    }
    if (currentUser.profileType === 'tecnico' && !tecnicoTemPermissaoSobreAgendamento(agendamento)) {
        mostrarAlerta('Acesso negado: você só pode gerenciar agendamentos da sua escola.', 'danger');
        return;
    }
    if (agendamento) {
        agendamento.status = 'aprovado';
        localStorage.setItem('agendamentos-sistema', JSON.stringify(agendamentos));
        carregarTodosAgendamentos();
        mostrarAlerta('Agendamento aprovado com sucesso!', 'success');
        // Tentar sincronizar com Sheets
        try {
            if (window.SheetsIntegration && typeof window.SheetsIntegration.atualizarStatusAgendamento === 'function') {
                window.SheetsIntegration.atualizarStatusAgendamento(id, 'aprovado');
            }
        } catch (_) {}
    }
}

function cancelarAgendamento(id) {
    const agendamento = agendamentos.find(ag => ag.id === id);
    if (!currentUser || (currentUser.profileType !== 'tecnico' && currentUser.profileType !== 'semed')) {
        mostrarAlerta('Apenas técnicos ou SEMED podem cancelar agendamentos.', 'danger');
        return;
    }
    if (!agendamento) {
        mostrarAlerta('Agendamento não encontrado.', 'danger');
        return;
    }
    if (currentUser.profileType === 'tecnico' && !tecnicoTemPermissaoSobreAgendamento(agendamento)) {
        mostrarAlerta('Acesso negado: você só pode gerenciar agendamentos da sua escola.', 'danger');
        return;
    }
    if (agendamento) {
        agendamento.status = 'cancelado';
        localStorage.setItem('agendamentos-sistema', JSON.stringify(agendamentos));
        carregarTodosAgendamentos();
        mostrarAlerta('Agendamento cancelado!', 'warning');
        // Tentar sincronizar com Sheets
        try {
            if (window.SheetsIntegration && typeof window.SheetsIntegration.atualizarStatusAgendamento === 'function') {
                window.SheetsIntegration.atualizarStatusAgendamento(id, 'cancelado');
            }
        } catch (_) {}
    }
}

function tecnicoTemPermissaoSobreAgendamento(agendamento) {
    if (!currentUser || currentUser.profileType !== 'tecnico') return false;
    const escolasPermitidas = currentUser.escolasSelecionadas && currentUser.escolasSelecionadas.length > 0
        ? currentUser.escolasSelecionadas
        : (currentUser.escolaAssociada ? [currentUser.escolaAssociada] : []);
    return escolasPermitidas.includes(agendamento.escola);
}

function gerarRelatorio() {
    const escola = document.getElementById('relatorio-escola').value;
    const dataInicio = document.getElementById('relatorio-data-inicio').value;
    const dataFim = document.getElementById('relatorio-data-fim').value;
    const container = document.getElementById('relatorioResult');
    
    let agendamentosFiltrados = obterAgendamentosUnificados();
    
    if (escola) {
        agendamentosFiltrados = agendamentosFiltrados.filter(ag => ag.escola === escola);
    }
    
    if (dataInicio) {
        agendamentosFiltrados = agendamentosFiltrados.filter(ag => ag.dataAula >= dataInicio);
    }
    
    if (dataFim) {
        agendamentosFiltrados = agendamentosFiltrados.filter(ag => ag.dataAula <= dataFim);
    }
    
    if (agendamentosFiltrados.length === 0) {
        container.innerHTML = '<p class="alert alert-info">Nenhum agendamento encontrado para os filtros selecionados.</p>';
        return;
    }
    
    let html = `<h3>Relatório de Agendamentos (${agendamentosFiltrados.length} encontrados)</h3>`;
    
    agendamentosFiltrados.forEach(agendamento => {
        html += `
            <div class="agendamento-item">
                <h4>${agendamento.escolaNome}</h4>
                <p><strong>Professor:</strong> ${agendamento.professor}</p>
                <p><strong>Disciplina:</strong> ${agendamento.disciplina}</p>
                <p><strong>Data:</strong> ${new Date(agendamento.dataAula).toLocaleDateString('pt-BR')}</p>
                <p><strong>Status:</strong> <span class="status ${agendamento.status}">${agendamento.status.toUpperCase()}</span></p>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function salvarConfiguracoes() {
    if (!currentUser) return;
    
    const nome = document.getElementById('config-nome').value.trim();
    const senha = document.getElementById('config-senha').value;
    const confirmarSenha = document.getElementById('config-confirmar-senha').value;
    
    if (senha && senha !== confirmarSenha) {
        mostrarAlerta('As senhas não coincidem!', 'danger');
        return;
    }
    
    if (senha && senha.length < 6) {
        mostrarAlerta('A senha deve ter pelo menos 6 caracteres!', 'warning');
        return;
    }
    
    // Atualizar dados do usuário
    const usuarios = JSON.parse(localStorage.getItem('usuarios-sistema')) || [];
    const usuarioIndex = usuarios.findIndex(u => u.id === currentUser.id);
    
    if (usuarioIndex !== -1) {
        if (nome) {
            usuarios[usuarioIndex].nome = nome;
            currentUser.nome = nome;
        }
        
        if (senha) {
            usuarios[usuarioIndex].senha = senha;
        }
        
        localStorage.setItem('usuarios-sistema', JSON.stringify(usuarios));
        // Preservar a duração da sessão atual (lembrar) ao salvar configs
        let sessaoAtual = {};
        try { sessaoAtual = JSON.parse(localStorage.getItem('sessao-ativa') || '{}'); } catch (_) { sessaoAtual = {}; }
        const durationMs = typeof sessaoAtual.durationMs === 'number' ? sessaoAtual.durationMs : (24 * 60 * 60 * 1000);
        const lembrar = !!sessaoAtual.lembrar;
        localStorage.setItem('sessao-ativa', JSON.stringify({
            usuario: currentUser,
            timestamp: Date.now(),
            durationMs: durationMs,
            lembrar: lembrar
        }));
        
        atualizarInterfaceLogin();
        mostrarAlerta('Configurações salvas com sucesso!', 'success');
        
        // Limpar campos de senha
        document.getElementById('config-senha').value = '';
        document.getElementById('config-confirmar-senha').value = '';
    }
}


// ===== FUNÇÕES PARA ABA SEMED =====

/**
 * Carrega notebooks com defeito na aba SEMED
 */
async function carregarNotebooksComDefeitoSEMED() {
    const container = document.getElementById('notebooksComDefeitoList');
    if (!container) return;
    
    // Mostrar loading
    container.innerHTML = '<p class="alert alert-info">Carregando notebooks com defeito...</p>';
    
    try {
        // Primeiro tentar carregar do Google Sheets
        let notebooks = [];
        if (typeof carregarNotebooksComDefeito === 'function') {
            notebooks = await carregarNotebooksComDefeito();
        }
        
        // Se não conseguiu carregar do Sheets, usar dados locais
        if (notebooks.length === 0) {
            notebooks = carregarNotebooksLocais();
        }
        
        exibirNotebooksComDefeito(notebooks);
        
    } catch (error) {
        console.error('Erro ao carregar notebooks com defeito:', error);
        // Fallback para dados locais
        const notebooks = carregarNotebooksLocais();
        exibirNotebooksComDefeito(notebooks);
    }
}

/**
 * Carrega notebooks com defeito dos dados locais
 */
function carregarNotebooksLocais() {
    const notebooksLocais = JSON.parse(localStorage.getItem('notebooks-danificados')) || [];
    
    // Filtrar baseado no perfil do usuário
    if (!currentUser) return [];
    
    let notebooksFiltrados = notebooksLocais;
    
    if (currentUser.profileType === 'professor' || currentUser.profileType === 'tecnico') {
        // Filtrar por escolas do usuário
        if (currentUser.escolasSelecionadas && currentUser.escolasSelecionadas.length > 0) {
            notebooksFiltrados = notebooksLocais.filter(notebook => {
                return currentUser.escolasSelecionadas.includes(notebook.escola);
            });
        } else {
            notebooksFiltrados = [];
        }
    }
    // SEMED vê todos os notebooks
    
    return notebooksFiltrados;
}

/**
 * Exibe a lista de notebooks com defeito
 */
function exibirNotebooksComDefeito(notebooks) {
    const container = document.getElementById('notebooksComDefeitoList');
    if (!container) return;
    
    if (notebooks.length === 0) {
        container.innerHTML = '<p class="alert alert-info">Nenhum notebook com defeito encontrado.</p>';
        return;
    }
    
    let html = '';
    notebooks.forEach(notebook => {
        // Mapear códigos de escola para nomes
        const escolaNome = obterNomeEscola(notebook.escola || notebook['Escola Codigo']);
        const numeroSerie = notebook.numeroSerie || notebook['Numero Serie'];
        const problema = notebook.problema || notebook['Problema Descricao'];
        const tecnico = notebook.tecnico || notebook['Tecnico Nome'];
        const dataRegistro = notebook.dataRegistro || notebook['Data Registro'];
        const status = notebook.status || notebook['Status'] || 'registrado';
        
        html += `
            <div class="agendamento-item">
                <h4>🔧 ${escolaNome}</h4>
                <p><strong>Número de Série:</strong> ${numeroSerie}</p>
                <p><strong>Problema:</strong> ${problema}</p>
                <p><strong>Técnico:</strong> ${tecnico}</p>
                <p><strong>Data de Registro:</strong> ${new Date(dataRegistro).toLocaleDateString('pt-BR')}</p>
                <span class="status ${status}">${status.toUpperCase()}</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

/**
 * Mapeia código da escola para nome completo
 */
function obterNomeEscola(codigo) {
    const escolas = {
        'armelindo-tonon': 'E.M. Armelindo Tonon',
        'enio-carlos': 'E.M. Ênio Carlos',
        'filinto-muller': 'E.M. Filinto Muller',
        'nilma-gloria': 'E.M. Nilma Glória',
        'pingo-gente': 'E.M. Pingo de Gente'
    };
    
    return escolas[codigo] || codigo;
}


// ===== FUNÇÕES PARA ABA RELATÓRIOS =====

/**
 * Carrega ranking de agendamentos na aba SEMED
 */
async function carregarRankingAgendamentosSEMED() {
    const container = document.getElementById('rankingAgendamentos');
    if (!container) return;
    
    // Verificar se é SEMED
    if (!currentUser || currentUser.profileType !== 'semed') {
        container.innerHTML = '<p class="alert alert-warning">Acesso restrito à SEMED.</p>';
        return;
    }
    
    // Mostrar loading
    container.innerHTML = '<p class="alert alert-info">Carregando ranking de agendamentos...</p>';
    
    try {
        // Tentar carregar do Google Sheets
        let ranking = null;
        if (typeof carregarRankingAgendamentos === 'function') {
            ranking = await carregarRankingAgendamentos();
        }
        
        // Se não conseguiu carregar do Sheets, usar dados locais
        if (!ranking || (!ranking.rankingEscolas && !ranking.rankingProfessores)) {
            ranking = gerarRankingLocal();
        }
        
        exibirRankingAgendamentos(ranking);
        
    } catch (error) {
        console.error('Erro ao carregar ranking de agendamentos:', error);
        // Fallback para dados locais
        const ranking = gerarRankingLocal();
        exibirRankingAgendamentos(ranking);
    }
}

/**
 * Gera ranking baseado nos dados locais
 */
function gerarRankingLocal() {
    const agendamentosLocais = JSON.parse(localStorage.getItem('agendamentos-sistema')) || [];

    // Considerar apenas o mês/ano atuais
    const hoje = new Date();
    const mesAtual = hoje.getMonth(); // 0-11
    const anoAtual = hoje.getFullYear();
    
    const contagemEscolas = {};
    const contagemProfessores = {};
    
    agendamentosLocais.forEach(agendamento => {
        if (agendamento.status !== 'cancelado') {
            const dataAulaStr = agendamento.dataAula;
            if (!dataAulaStr) return;
            const dataAula = new Date(dataAulaStr + 'T00:00:00');
            if (isNaN(dataAula.getTime())) return;
            if (dataAula.getMonth() !== mesAtual || dataAula.getFullYear() !== anoAtual) return;

            // Ranking por escola
            const escolaCodigo = agendamento.escola;
            const escolaNome = agendamento.escolaNome;
            
            if (escolaCodigo && escolaNome) {
                if (!contagemEscolas[escolaCodigo]) {
                    contagemEscolas[escolaCodigo] = {
                        codigo: escolaCodigo,
                        nome: escolaNome,
                        total: 0
                    };
                }
                contagemEscolas[escolaCodigo].total++;
            }
            
            // Ranking por professor
            const professor = agendamento.professor;
            if (professor) {
                if (!contagemProfessores[professor]) {
                    contagemProfessores[professor] = {
                        nome: professor,
                        escola: escolaNome || 'Não informado',
                        total: 0
                    };
                }
                contagemProfessores[professor].total++;
            }
        }
    });
    
    // Converter para arrays e ordenar
    const rankingEscolas = Object.values(contagemEscolas)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    
    // Professores: top 20
    const rankingProfessores = Object.values(contagemProfessores)
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);
    
    return {
        rankingEscolas: rankingEscolas,
        rankingProfessores: rankingProfessores,
        totalAgendamentos: Object.values(contagemProfessores).reduce((sum, p) => sum + p.total, 0),
        periodo: new Date(anoAtual, mesAtual, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    };
}

/**
 * Exibe o ranking de agendamentos
 */
function exibirRankingAgendamentos(ranking) {
    const container = document.getElementById('rankingAgendamentos');
    if (!container) return;
    
    if (!ranking || (!ranking.rankingEscolas.length && !ranking.rankingProfessores.length)) {
        container.innerHTML = '<p class="alert alert-info">Nenhum dado de agendamento encontrado para gerar ranking.</p>';
        return;
    }
    
    let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 20px;">';
    
    // Ranking de Escolas
    html += '<div>';
    html += '<h4>🏫 Top Escolas que Mais Agendam</h4>';
    if (ranking.rankingEscolas.length > 0) {
        html += '<div style="background: #f8f9fa; padding: 15px; border-radius: 10px;">';
        ranking.rankingEscolas.forEach((escola, index) => {
            const posicao = index + 1;
            const medalha = posicao === 1 ? '🥇' : posicao === 2 ? '🥈' : posicao === 3 ? '🥉' : `${posicao}º`;
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #dee2e6;">
                    <span><strong>${medalha}</strong> ${escola.nome}</span>
                    <span class="badge" style="background: var(--primary); color: white; padding: 4px 8px; border-radius: 12px;">${escola.total} agendamentos</span>
                </div>
            `;
        });
        html += '</div>';
    } else {
        html += '<p class="alert alert-info">Nenhuma escola encontrada.</p>';
    }
    html += '</div>';
    
    // Ranking de Professores
    html += '<div>';
    html += '<h4>👨‍🏫 Top 20 Professores que Mais Agendam (mês atual)</h4>';
    if (ranking.rankingProfessores.length > 0) {
        html += '<div style="background: #f8f9fa; padding: 15px; border-radius: 10px;">';
        ranking.rankingProfessores.forEach((professor, index) => {
            const posicao = index + 1;
            const medalha = posicao === 1 ? '🥇' : posicao === 2 ? '🥈' : posicao === 3 ? '🥉' : `${posicao}º`;
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #dee2e6;">
                    <div>
                        <div><strong>${medalha}</strong> ${professor.nome}</div>
                        <small style="color: #6c757d;">${professor.escola}</small>
                    </div>
                    <span class="badge" style="background: var(--success); color: white; padding: 4px 8px; border-radius: 12px;">${professor.total} agendamentos</span>
                </div>
            `;
        });
        html += '</div>';
    } else {
        html += '<p class="alert alert-info">Nenhum professor encontrado.</p>';
    }
    html += '</div>';
    
    html += '</div>';
    
    // Estatísticas do mês atual (fechamento mensal ao final do mês)
    const dataAtual = new Date();
    const mesAtual = ranking.periodo || dataAtual.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    if (ranking.totalAgendamentos) {
        html += `
            <div style="margin-top: 30px; text-align: center; background: #e3f2fd; padding: 20px; border-radius: 10px; border: 2px solid var(--primary);">
                <h4 style="color: var(--primary); margin: 0 0 10px 0;">📈 Estatísticas do mês de ${mesAtual}</h4>
                <div style="font-size: 1.2rem; font-weight: bold; color: var(--dark);">
                    Total de Agendamentos no mês: ${ranking.totalAgendamentos}
                </div>
                <div style="margin-top: 10px; font-size: 0.9rem; color: #6c757d;">
                    <strong>Período:</strong> Mês corrente (classificações encerram automaticamente no último dia do mês)
                </div>
                ${ranking.dataGeracao ? `<div style="margin-top: 5px; font-size: 0.8rem; color: #6c757d;">Última atualização: ${new Date(ranking.dataGeracao).toLocaleString('pt-BR')}</div>` : ''}
            </div>
        `;
    }
    
    container.innerHTML = html;
}
