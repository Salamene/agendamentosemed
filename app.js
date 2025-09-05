// Sistema de Agendamento de Notebooks - Versão com Backend e Perfis de Usuário
let isSignedIn = false;
let currentUser = null;
let agendamentos = [];

// URL do backend
const BACKEND_URL = 'https://agendamentosemed.onrender.com';

// Inicializar sistema
document.addEventListener('DOMContentLoaded', function() {
    console.log('Sistema iniciado!');
    
    // Configurar event listeners
    setupEventListeners();
    
    // Verificar sessão ativa
    verificarSessaoAtiva();
    
    // Carregar escolas do backend (agora depende do usuário logado)
    // carregarEscolas(); // Será chamado após o login ou verificação de sessão
    
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
    
    // Formulário de login
    const loginForm = document.getElementById('loginForm');
    if (loginForm && !loginForm.getAttribute('onsubmit')) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Formulário de cadastro
    const cadastroForm = document.getElementById('cadastroForm');
    if (cadastroForm && !cadastroForm.getAttribute('onsubmit')) {
        cadastroForm.addEventListener('submit', handleCadastro);
    }
}

async function carregarEscolas(userId, profileType) {
    try {
        const response = await fetch(`${BACKEND_URL}/schools?user_id=${userId}`);
        if (response.ok) {
            const escolas = await response.json();
            console.log('Escolas carregadas do backend:', escolas);
            
            // Atualizar dropdowns de escola se existirem
            const escolaSelects = document.querySelectorAll('select[id*="escola"]');
            escolaSelects.forEach(select => {
                select.innerHTML = '<option value="">Selecione uma escola</option>';
                escolas.forEach(escola => {
                    const option = document.createElement('option');
                    option.value = escola.id; // Usar o ID da escola
                    option.textContent = escola.name;
                    select.appendChild(option);
                });
            });
        }
    } catch (error) {
        console.error('Erro ao carregar escolas:', error);
    }
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
                try { hideAuthModal(); } catch (_) {}
                console.log('Sessão ativa encontrada:', currentUser.nome);
                // Carregar escolas após verificar sessão ativa
                carregarEscolas(currentUser.id, currentUser.profileType);
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

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const senha = document.getElementById('loginSenha').value.trim();
    
    console.log('Tentativa de login:', email);
    
    if (!email || !senha) {
        mostrarAlerta('Por favor, preencha todos os campos!', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                password: senha
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('Login bem-sucedido:', data.username);
            
            // Configurar usuário atual com profile_type e schools_associated
            currentUser = {
                id: data.user_id,
                nome: data.username,
                email: data.email,
                profileType: data.profile_type,
                schoolsAssociated: data.schools_associated ? data.schools_associated.split(',').map(Number) : []
            };
            isSignedIn = true;
            
            // Fechar modal
            try { hideAuthModal(); } catch (_) {}

            // Salvar sessão
            const manterConectadoEl = document.getElementById('manterConectado');
            const manterConectado = manterConectadoEl ? manterConectadoEl.checked : false;
            const durationMs = manterConectado ? (30 * 24 * 60 * 60 * 1000) : (24 * 60 * 60 * 1000);
            localStorage.setItem('sessao-ativa', JSON.stringify({
                usuario: currentUser,
                timestamp: Date.now(),
                durationMs: durationMs,
                lembrar: manterConectado
            }));
            
            // Atualizar interface e carregar escolas
            atualizarInterfaceLogin();
            carregarEscolas(currentUser.id, currentUser.profileType);
            mostrarAlerta(`✅ Bem-vindo(a), ${currentUser.nome}!`, 'success');
            
            // Preencher nome do professor
            const professorField = document.getElementById('professor');
            if (professorField) {
                professorField.value = currentUser.nome;
            }
            
        } else {
            console.log('Login falhou:', data.message);
            mostrarAlerta('❌ ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Erro no login:', error);
        mostrarAlerta('❌ Erro de conexão com o servidor.', 'danger');
    }
}

async function handleCadastro(e) {
    e.preventDefault();
    
    const nome = document.getElementById('cadastroNome').value.trim();
    const email = document.getElementById('cadastroEmail').value.trim().toLowerCase();
    const senha = document.getElementById('cadastroSenha').value.trim();
    const senhaConfirm = document.getElementById('cadastroConfirmarSenha').value.trim();
    const profileType = 'professor';
    const escolasSelecionadas = [];

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

    if (profileType !== 'semed' && escolasSelecionadas.length === 0) {
        mostrarAlerta('Por favor, selecione pelo menos uma escola para este tipo de perfil!', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: nome,
                email: email,
                password: senha,
                profile_type: profileType,
                schools_associated: escolasSelecionadas.join(',')
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('Cadastro bem-sucedido:', nome);
            mostrarAlerta('✅ Conta criada com sucesso! Faça login para continuar.', 'success');
            
            // Mudar para aba de login
            const loginTab = document.querySelector('.auth-tab[onclick="showLoginForm()"]');
            if (loginTab) {
                loginTab.click();
            }
            
            // Preencher email no formulário de login
            const loginEmailField = document.getElementById('loginEmail');
            if (loginEmailField) {
                loginEmailField.value = email;
            }
            
        } else {
            console.log('Cadastro falhou:', data.message);
            mostrarAlerta('❌ ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Erro no cadastro:', error);
        mostrarAlerta('❌ Erro de conexão com o servidor.', 'danger');
    }
}

async function handleAgendamento(e) {
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
    
    try {
        const response = await fetch(`${BACKEND_URL}/schedule`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: currentUser.id,
                school_id: parseInt(agendamento.escola), // Usar o ID da escola selecionada
                start_time: `${agendamento.dataAula}T${agendamento.horarios[0]}:00`,
                end_time: `${agendamento.dataAula}T${agendamento.horarios[agendamento.horarios.length - 1]}:00`
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('Agendamento criado:', data);
            mostrarAlerta('✅ Agendamento criado com sucesso!', 'success');
            limparFormulario();
        } else {
            console.log('Agendamento falhou:', data.message);
            mostrarAlerta('❌ ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Erro no agendamento:', error);
        mostrarAlerta('❌ Erro de conexão com o servidor.', 'danger');
    }
}

function handleNotebookDanificado(e) {
    e.preventDefault();
    
    if (!isSignedIn) {
        mostrarAlerta('❌ Você precisa fazer login para registrar notebooks danificados!', 'danger');
        showAuthModal();
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
    
    // Salvar no localStorage por enquanto
    let notebooksDanificados = JSON.parse(localStorage.getItem('notebooks-danificados')) || [];
    notebooksDanificados.push(registro);
    localStorage.setItem('notebooks-danificados', JSON.stringify(notebooksDanificados));
    
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
    const horariosSelecionados = Array.from(document.querySelectorAll('input[name="horarios"]:checked'))
        .map(input => input.value);

    return {
        id: Date.now(),
        professor: document.getElementById('professor').value.trim(),
        escola: document.getElementById('escola').value, // Agora é o ID da escola
        disciplina: document.getElementById('disciplina').value.trim(),
        turma: document.getElementById('turma').value.trim(),
        dataAula: document.getElementById('data-aula').value,
        turno: document.getElementById('turno').value,
        horarios: horariosSelecionados,
        observacoes: document.getElementById('observacoes')?.value.trim() || '',
        usuarioId: currentUser ? currentUser.id : null,
        emailUsuario: currentUser ? currentUser.email : null,
        dataCriacao: new Date().toISOString(),
        status: 'pendente'
    };
}

function limparFormulario() {
    const form = document.getElementById('agendamentoForm');
    if (form) {
        form.reset();
        
        // Reconfigurar data mínima
        const dataField = document.getElementById('data-aula');
        if (dataField) {
            const hojeStr = getLocalISODate();
            dataField.min = hojeStr;
            dataField.value = hojeStr;
        }
        
        // Preencher nome do professor novamente se logado
        if (currentUser && currentUser.profileType === 'professor') {
            const professorField = document.getElementById('professor');
            if (professorField) {
                professorField.value = currentUser.nome;
            }
        }
    }
}

function mostrarAlerta(mensagem, tipo = 'info') {
    // Remover alertas existentes
    const alertasExistentes = document.querySelectorAll('.alert');
    alertasExistentes.forEach(alerta => alerta.remove());
    
    // Criar novo alerta
    const alerta = document.createElement('div');
    alerta.className = `alert alert-${tipo}`;
    alerta.innerHTML = mensagem;
    
    // Inserir no topo do conteúdo principal
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.insertBefore(alerta, mainContent.firstChild);
    }
    
    // Remover automaticamente após 5 segundos
    setTimeout(() => {
        if (alerta.parentNode) {
            alerta.remove();
        }
    }, 5000);
}

function atualizarInterfaceLogin() {
    const authSection = document.querySelector('.auth-section');
    if (authSection && currentUser) {
        authSection.innerHTML = `
            <div class="user-info">
                <div class="user-avatar">${currentUser.nome.charAt(0).toUpperCase()}</div>
                <span>${currentUser.nome} (${currentUser.profileType})</span>
                <button class="btn btn-secondary" onclick="logout()" style="margin-left: 10px; padding: 5px 10px; font-size: 0.8rem;">Sair</button>
            </div>
        `;
    }
    
    // Mostrar conteúdo principal
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.classList.remove('hidden');
    }
    
    // Esconder prompt de autenticação
    const authPrompt = document.querySelector('.auth-prompt');
    if (authPrompt) {
        authPrompt.style.display = 'none';
    }

    // Ajustar visibilidade das abas com base no profileType
    const agendamentoTab = document.querySelector('[onclick="showTab(\'agendamento\')"]');
    const meusAgendamentosTab = document.querySelector('[onclick="showTab(\'meus-agendamentos\')"]');
    const notebookDanificadoTab = document.querySelector('[onclick="showTab(\'notebook-danificado\')"]');
    const relatoriosTab = document.querySelector('[onclick="showTab(\'relatorios\')"]');

    if (currentUser.profileType === 'professor') {
        agendamentoTab.style.display = 'block';
        meusAgendamentosTab.style.display = 'block';
        notebookDanificadoTab.style.display = 'none';
        relatoriosTab.style.display = 'none';
        showTab('agendamento'); // Redireciona para a aba de agendamento
    } else if (currentUser.profileType === 'tecnico') {
        agendamentoTab.style.display = 'none';
        meusAgendamentosTab.style.display = 'none';
        notebookDanificadoTab.style.display = 'block';
        relatoriosTab.style.display = 'none';
        showTab('notebook-danificado'); // Redireciona para a aba de notebook danificado
    } else if (currentUser.profileType === 'semed') {
        agendamentoTab.style.display = 'block';
        meusAgendamentosTab.style.display = 'block';
        notebookDanificadoTab.style.display = 'block';
        relatoriosTab.style.display = 'block';
        showTab('agendamento'); // Pode ser qualquer aba inicial para SEMED
    }
}

function atualizarInterfaceLogout() {
    const authSection = document.querySelector('.auth-section');
    if (authSection) {
        authSection.innerHTML = `
            <button class="btn-auth" onclick="showAuthModal()">🔐 Entrar</button>
        `;
    }
    
    // Esconder conteúdo principal
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.classList.add('hidden');
    }
    
    // Mostrar prompt de autenticação
    const authPrompt = document.querySelector('.auth-prompt');
    if (authPrompt) {
        authPrompt.style.display = 'block';
    }

    // Esconder todas as abas
    const agendamentoTab = document.querySelector('[onclick="showTab(\'agendamento\')"]');
    const meusAgendamentosTab = document.querySelector('[onclick="showTab(\'meus-agendamentos\')"]');
    const notebookDanificadoTab = document.querySelector('[onclick="showTab(\'notebook-danificado\')"]');
    const relatoriosTab = document.querySelector('[onclick="showTab(\'relatorios\')"]');

    agendamentoTab.style.display = 'none';
    meusAgendamentosTab.style.display = 'none';
    notebookDanificadoTab.style.display = 'none';
    relatoriosTab.style.display = 'none';
}

function logout() {
    currentUser = null;
    isSignedIn = false;
    localStorage.removeItem('sessao-ativa');
    atualizarInterfaceLogout();
    mostrarAlerta('✅ Logout realizado com sucesso!', 'success');
}

function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.add('active');
        // Carregar escolas no modal de cadastro
        carregarEscolasParaCadastro();
    }
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function showLoginForm() {
    document.getElementById('loginForm').classList.add('active');
    document.getElementById('cadastroForm').classList.remove('active');
    document.querySelector('.auth-tab[onclick="showLoginForm()"]')?.classList.add('active');
    document.querySelector('.auth-tab[onclick="showCadastroForm()"]')?.classList.remove('active');
}

function showCadastroForm() {
    document.getElementById('cadastroForm').classList.add('active');
    document.getElementById('loginForm').classList.remove('active');
    document.querySelector('.auth-tab[onclick="showCadastroForm()"]')?.classList.add('active');
    document.querySelector('.auth-tab[onclick="showLoginForm()"]')?.classList.remove('active');
}

// Funções para navegação entre abas
function showTab(tabName) {
    // Esconder todas as abas
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Remover classe active de todos os botões
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => tab.classList.remove('active'));
    
    // Mostrar aba selecionada
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Ativar botão correspondente
    const selectedNavTab = document.querySelector(`[onclick="showTab(\'${tabName}\')"]`);
    if (selectedNavTab) {
        selectedNavTab.classList.add('active');
    }
}

// Função para carregar escolas no formulário de cadastro
async function carregarEscolasParaCadastro() {
    try {
        const response = await fetch(`${BACKEND_URL}/schools?user_id=1`); // Usar um user_id de SEMED para pegar todas as escolas
        if (response.ok) {
            const escolas = await response.json();
            const escolasContainer = document.getElementById('cadastroEscolasContainer');
            if (escolasContainer) {
                escolasContainer.innerHTML = ''; // Limpar antes de adicionar
                escolas.forEach(escola => {
                    const div = document.createElement('div');
                    div.innerHTML = `
                        <input type="checkbox" id="escola-${escola.id}" name="cadastroEscolas" value="${escola.id}">
                        <label for="escola-${escola.id}">${escola.name}</label>
                    `;
                    escolasContainer.appendChild(div);
                });
            }
        }
    } catch (error) {
        console.error('Erro ao carregar escolas para cadastro:', error);
    }
}

// Lógica para mostrar/esconder seleção de escolas no cadastro
document.addEventListener('DOMContentLoaded', () => {
    const cadastroTipoSelect = document.getElementById('cadastroTipo');
    const cadastroEscolasDiv = document.getElementById('cadastroEscolasDiv');

    if (cadastroTipoSelect && cadastroEscolasDiv) {
        cadastroTipoSelect.addEventListener('change', () => {
            if (cadastroTipoSelect.value === 'professor' || cadastroTipoSelect.value === 'tecnico') {
                cadastroEscolasDiv.style.display = 'block';
            } else {
                cadastroEscolasDiv.style.display = 'none';
            }
        });
        // Estado inicial
        if (cadastroTipoSelect.value === 'professor' || cadastroTipoSelect.value === 'tecnico') {
            cadastroEscolasDiv.style.display = 'block';
        } else {
            cadastroEscolasDiv.style.display = 'none';
        }
    }
});


// Inicializar primeira aba como ativa (após login)
document.addEventListener('DOMContentLoaded', function() {
    // showTab('agendamento'); // Isso será feito após o login
});

// 🎯 SOLUÇÃO RÁPIDA - Adiciona o event listener que estava faltando
document.addEventListener('DOMContentLoaded', function() {
    const cadastroForm = document.getElementById('cadastroForm');
    if (cadastroForm) {
        cadastroForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Use valores padrão temporários
            const profileType = 'professor';
            const escolasSelecionadas = [];
            
            // Continue com o resto do cadastro
            handleCadastro(e, profileType, escolasSelecionadas);
        });
    }
});

// 🎯 Modifica a função handleCadastro para aceitar os parâmetros
async function handleCadastro(e, profileType = 'professor', escolasSelecionadas = []) {
    e.preventDefault();
    
    const nome = document.getElementById('cadastroNome').value.trim();
    const email = document.getElementById('cadastroEmail').value.trim().toLowerCase();
    const senha = document.getElementById('cadastroSenha').value.trim();
    const senhaConfirm = document.getElementById('cadastroConfirmarSenha').value.trim();
    
    // ... o resto do código continua igual
    if (!nome || !email || !senha || !senhaConfirm) {
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
    
    try {
        const response = await fetch(`${BACKEND_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: nome,
                email: email,
                password: senha,
                profile_type: profileType,
                schools_associated: escolasSelecionadas.join(',')
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('Cadastro bem-sucedido:', nome);
            mostrarAlerta('✅ Conta criada com sucesso! Faça login para continuar.', 'success');
            
            // Mudar para aba de login
            const loginTab = document.querySelector('.auth-tab[onclick="showLoginForm()"]');
            if (loginTab) {
                loginTab.click();
            }
            
            // Preencher email no formulário de login
            const loginEmailField = document.getElementById('loginEmail');
            if (loginEmailField) {
                loginEmailField.value = email;
            }
            
        } else {
            console.log('Cadastro falhou:', data.message);
            mostrarAlerta('❌ ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Erro no cadastro:', error);
        mostrarAlerta('❌ Erro de conexão com o servidor.', 'danger');
    }
}
