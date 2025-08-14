// Sistema de Agendamento de Notebooks - Versão Completa
let isSignedIn = false;
let currentUser = null;
let agendamentos = [];

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
    
    // Carregar dados existentes
    let usuarios = JSON.parse(localStorage.getItem('usuarios-sistema')) || [];
    console.log('Usuários carregados:', usuarios.length);
    
    // Carregar agendamentos existentes
    agendamentos = JSON.parse(localStorage.getItem('agendamentos-sistema')) || [];
    
    // Configurar event listeners
    setupEventListeners();
    
    // Verificar sessão ativa
    verificarSessaoAtiva();
    
    // Configurar data mínima
    const dataField = document.getElementById('data-aula');
    if (dataField) {
        const hoje = new Date();
        dataField.min = hoje.toISOString().split('T')[0];
        dataField.value = hoje.toISOString().split('T')[0];
    }
    


});

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
    
    // Formulário de login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Formulário de cadastro
    const cadastroForm = document.getElementById('cadastroForm');
    if (cadastroForm) {
        cadastroForm.addEventListener('submit', handleCadastro);
    }
    
    // Fechar modal clicando fora
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.addEventListener('click', function(e) {
            if (e.target === this) {
                hideAuthModal();
            }
        });
    }
}

function verificarSessaoAtiva() {
    const sessaoAtiva = localStorage.getItem('sessao-ativa');
    if (sessaoAtiva) {
        try {
            const dadosSessao = JSON.parse(sessaoAtiva);
            const agora = new Date().getTime();
            
            // Sessão válida por 24 horas
            if (agora - dadosSessao.timestamp < 24 * 60 * 60 * 1000) {
                currentUser = dadosSessao.usuario;
                isSignedIn = true;
                atualizarInterfaceLogin();
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
    
    const email = document.getElementById('loginEmail').value.trim();
    const senha = document.getElementById('loginSenha').value;
    
    console.log('Tentativa de login:', email);
    
    if (!email || !senha) {
        mostrarAlerta('Por favor, preencha todos os campos!', 'warning');
        return;
    }
    
    // Buscar usuário
    const usuarios = JSON.parse(localStorage.getItem('usuarios-sistema')) || [];
    const usuario = usuarios.find(u => u.email === email && u.senha === senha);
    
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
        
        // Salvar sessão
        localStorage.setItem('sessao-ativa', JSON.stringify({
            usuario: currentUser,
            timestamp: new Date().getTime()
        }));
        
        // Atualizar interface
        atualizarInterfaceLogin();
        hideAuthModal();
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
        mostrarAlerta('❌ E-mail ou senha incorretos!', 'danger');
    }
}

function handleCadastro(e) {
    e.preventDefault();
    
    const nome = document.getElementById('cadastroNome').value.trim();
    const email = document.getElementById('cadastroEmail').value.trim();
    const senha = document.getElementById('cadastroSenha').value;
    const senhaConfirm = document.getElementById('cadastroConfirmarSenha').value;
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
    const usuarios = JSON.parse(localStorage.getItem('usuarios-sistema')) || [];
    if (usuarios.find(u => u.email === email)) {
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
    
    localStorage.setItem("sessao-ativa", JSON.stringify({
        usuario: currentUser,
        timestamp: new Date().getTime()
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
        const escolasComMultiplosAgendamentos = ['EM PINGO DE GENTE', 'EM NILMA GLÓRIA'];
        if (escolasComMultiplosAgendamentos.includes(agendamento.escolaNome)) {
            mostrarAlerta('Esta escola já possui 2 agendamentos para este horário, data e escola! Limite máximo atingido.', 'danger');
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
    const escolasComMultiplosAgendamentos = ['EM PINGO DE GENTE', 'EM NILMA GLÓRIA'];

    // Se a escola do novo agendamento estiver na lista de exceção, permitir múltiplos agendamentos
    if (escolasComMultiplosAgendamentos.includes(novoAgendamento.escolaNome)) {
        // Contar quantos agendamentos existem para o mesmo horário, data e escola
        let count = 0;
        agendamentos.forEach(agendamento => {
            if (agendamento.escola === novoAgendamento.escola &&
                agendamento.dataAula === novoAgendamento.dataAula &&
                agendamento.status !== 'cancelado' &&
                agendamento.horarios.some(horario => novoAgendamento.horarios.includes(horario))) {
                count++;
            }
        });
        // Permitir até 2 agendamentos para estas escolas
        return count >= 2;
    } else {
        // Para outras escolas, manter a verificação de conflito original (apenas 1 agendamento por horário)
        return agendamentos.some(agendamento =>
            agendamento.escola === novoAgendamento.escola &&
            agendamento.dataAula === novoAgendamento.dataAula &&
            agendamento.status !== 'cancelado' &&
            agendamento.horarios.some(
                horario => novoAgendamento.horarios.includes(horario)
            )
        );
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
    if (turno === 'matutino') {
        return [
            { aula: '1ª Aula' },
            { aula: '2ª Aula' },
            { aula: '3ª Aula' },
            { aula: '4ª Aula' },
            { aula: '5ª Aula' }
        ];
    } else {
        return [
            { aula: '1ª Aula' },
            { aula: '2ª Aula' },
            { aula: '3ª Aula' },
            { aula: '4ª Aula' },
            { aula: '5ª Aula' }
        ];
 function verificarHorarioOcupado(escola, data, horario) {
    const escolasComMultiplosAgendamentos = ["EM PINGO DE GENTE", "EM NILMA GLÓRIA"];
    const escolaNome = document.getElementById("escola").selectedOptions[0].text;

    let count = 0;
    agendamentos.forEach(agendamento => {
        if (agendamento.escola === escola &&
            agendamento.dataAula === data &&
            agendamento.status !== 'cancelado' &&
            agendamento.horarios.includes(horario)) {
            count++;
        }
    });

    if (escolasComMultiplosAgendamentos.includes(escolaNome)) {
        return count >= 2 ? { professor: `Ocupado (${count}/2)` } : null;
    } else {
        return count >= 1 ? { professor: `Ocupado (${count}/1)` } : null;
    }
}
    const escolasComMultiplosAgendamentos = ["EM PINGO DE GENTE", "EM NILMA GLÓRIA"];
    const escolaNome = document.getElementById("escola").selectedOptions[0].text;

    if (escolasComMultiplosAgendamentos.includes(escolaNome)) {
        // Para escolas com múltiplos agendamentos, verificar se já existem 2 agendamentos para o mesmo horário
        let count = 0;
        agendamentos.forEach(agendamento => {
            if (agendamento.escola === escola &&
                agendamento.dataAula === data &&
                agendamento.status !== 'cancelado' &&
                agendamento.horarios.includes(horario)) {
                count++;
            }
        });
        return count >= 2;
    } else {
        // Para outras escolas, manter a verificação de conflito o    );
    }
}    );
    }
}     );
    }
}endamento.status !== 'cancelado'
    );
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
}

function showAuthModal() {
    document.getElementById('authModal').classList.add('active');
}

function hideAuthModal() {
    document.getElementById('authModal').classList.remove('active');
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
        
        // Carregar dados específicos da aba
        if (tabName === 'meus-agendamentos') {
            carregarMeusAgendamentos();
        } else if (tabName === 'gerenciar-professores') {
            carregarProfessores();
        } else if (tabName === 'gerenciar-agendamentos') {
            carregarTodosAgendamentos();
        } else if (tabName === 'semed') {
            carregarNotebooksComDefeitoSEMED();
            carregarRankingAgendamentosSEMED();
        } else if (tabName === 'relatorios') {
            // Aba relatórios agora só tem filtros, sem ranking
        }
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
    
    if (currentUser) {
        if (currentUser.profileType === 'semed') {
            // SEMED vê todas as abas especiais
            if (gerenciarProfessoresTab) gerenciarProfessoresTab.style.display = 'block';
            if (semedTab) semedTab.style.display = 'block';
            if (relatoriosTab) relatoriosTab.style.display = 'block';
        }
        
        if (currentUser.profileType === 'tecnico') {
            // Técnico vê apenas gerenciar agendamentos e registrar notebook
            if (gerenciarAgendamentosTab) gerenciarAgendamentosTab.style.display = 'block';
            if (registrarNotebookTab) registrarNotebookTab.style.display = 'block';
            // Remover acesso à aba SEMED e Relatórios
            if (semedTab) semedTab.style.display = 'none';
            if (relatoriosTab) relatoriosTab.style.display = 'none';
        }
        
        if (currentUser.profileType === 'professor') {
            // Professor não vê nenhuma aba especial (apenas as básicas)
            if (semedTab) semedTab.style.display = 'none';
            if (relatoriosTab) relatoriosTab.style.display = 'none';
        }
    }
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
        const hoje = new Date();
        dataField.min = hoje.toISOString().split('T')[0];
        dataField.value = hoje.toISOString().split('T')[0];
    }
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



function carregarMeusAgendamentos() {
    const container = document.getElementById('agendamentosList');
    if (!container || !currentUser) return;
    
    const meusAgendamentos = agendamentos.filter(ag => ag.usuarioId === currentUser.id);
    
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
    
    if (agendamentos.length === 0) {
        container.innerHTML = '<p class="alert alert-info">Nenhum agendamento encontrado.</p>';
        return;
    }
    
    let html = '';
    agendamentos.forEach(agendamento => {
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
                <div class="agendamento-actions">
                    <button class="btn btn-success" onclick="aprovarAgendamento(${agendamento.id})">Aprovar</button>
                    <button class="btn btn-danger" onclick="cancelarAgendamento(${agendamento.id})">Cancelar</button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function aprovarAgendamento(id) {
    const agendamento = agendamentos.find(ag => ag.id === id);
    if (agendamento) {
        agendamento.status = 'aprovado';
        localStorage.setItem('agendamentos-sistema', JSON.stringify(agendamentos));
        carregarTodosAgendamentos();
        mostrarAlerta('Agendamento aprovado com sucesso!', 'success');
    }
}

function cancelarAgendamento(id) {
    const agendamento = agendamentos.find(ag => ag.id === id);
    if (agendamento) {
        agendamento.status = 'cancelado';
        localStorage.setItem('agendamentos-sistema', JSON.stringify(agendamentos));
        carregarTodosAgendamentos();
        mostrarAlerta('Agendamento cancelado!', 'warning');
    }
}

function gerarRelatorio() {
    const escola = document.getElementById('relatorio-escola').value;
    const dataInicio = document.getElementById('relatorio-data-inicio').value;
    const dataFim = document.getElementById('relatorio-data-fim').value;
    const container = document.getElementById('relatorioResult');
    
    let agendamentosFiltrados = agendamentos;
    
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
        localStorage.setItem('sessao-ativa', JSON.stringify({
            usuario: currentUser,
            timestamp: new Date().getTime()
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
    
    const contagemEscolas = {};
    const contagemProfessores = {};
    
    agendamentosLocais.forEach(agendamento => {
        if (agendamento.status !== 'cancelado') {
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
    
    const rankingProfessores = Object.values(contagemProfessores)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    
    return {
        rankingEscolas: rankingEscolas,
        rankingProfessores: rankingProfessores,
        totalAgendamentos: agendamentosLocais.length
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
    html += '<h4>👨‍🏫 Top Professores que Mais Agendam</h4>';
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
    
    // Estatísticas gerais - SEMPRE SEPARADAS DO MÊS (dados históricos completos)
    const dataAtual = new Date();
    const mesAtual = dataAtual.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    
    if (ranking.totalAgendamentos) {
        html += `
            <div style="margin-top: 30px; text-align: center; background: #e3f2fd; padding: 20px; border-radius: 10px; border: 2px solid var(--primary);">
                <h4 style="color: var(--primary); margin: 0 0 10px 0;">📈 Estatísticas Históricas Completas</h4>
                <div style="font-size: 1.2rem; font-weight: bold; color: var(--dark);">
                    Total Geral de Agendamentos: ${ranking.totalAgendamentos}
                </div>
                <div style="margin-top: 10px; font-size: 0.9rem; color: #6c757d;">
                    <strong>Período:</strong> Todos os registros históricos (não limitado ao mês de ${mesAtual})
                </div>
                ${ranking.dataGeracao ? `<div style="margin-top: 5px; font-size: 0.8rem; color: #6c757d;">Última atualização: ${new Date(ranking.dataGeracao).toLocaleString('pt-BR')}</div>` : ''}
            </div>
        `;
    }
    
    container.innerHTML = html;
}



function showAuthModal() {
    const authModal = document.getElementById("authModal");
    if (authModal) {
        authModal.classList.add("active");
    }
}

function hideAuthModal() {
    const authModal = document.getElementById("authModal");
    if (authModal) {
        authModal.classList.remove("active");
    }
}




window.showAuthModal = showAuthModal;
window.hideAuthModal = hideAuthModal;


