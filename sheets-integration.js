// Integração com Google Sheets - Versão Completa e Funcional
// Sistema de Agendamento de Notebooks - SEMED São Gabriel do Oeste/MS

// ===== CONFIGURAÇÕES REAIS =====
const SHEETS_CONFIG = {
    // ID da planilha real do Google Sheets
    SPREADSHEET_ID: '1gAtBTGXZgwsdx0TMxRO0PVeskuPSna9gtLYoEFn-hks',
    
    // URL do Google Apps Script Web App (substitua pelo seu)
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwxtUHwm6rSc52eX-zfrJCRUAJTuJViKf32OCf-4hDClnHERr4-ZGCx67FqTaR_msC4UQ/exec',
    
    // Configurações das abas
    RANGES: {
        AGENDAMENTOS: 'Agendamentos!A:Z',
        USUARIOS: 'Usuarios!A:Z',
        NOTEBOOKS_DANIFICADOS: 'NotebooksDanificados!A:Z',
        RELATORIOS: 'Relatorios!A:Z'
    },
    
    // Timeout para requisições
    TIMEOUT: 10000
};

// ===== FUNÇÕES PRINCIPAIS =====

/**
 * Envia agendamento para Google Sheets
 * @param {Object} agendamento - Dados do agendamento
 * @returns {Promise<boolean>} - Sucesso ou falha
 */
async function enviarParaGoogleSheets(agendamento) {
    try {
        console.log('📤 Enviando agendamento para Google Sheets...', agendamento.id);
        
        // Preparar dados formatados
        const dadosFormatados = {
            action: 'criarAgendamento',
            data: {
                id: agendamento.id,
                timestamp: new Date().toISOString(),
                professor: agendamento.professor,
                email_professor: agendamento.emailProfessor || '',
                escola_codigo: agendamento.escola,
                escola_nome: agendamento.escolaNome,
                disciplina: agendamento.disciplina,
                turma: agendamento.turma,
                data_aula: agendamento.dataAula,
                turno: agendamento.turno,
                horarios: Array.isArray(agendamento.horarios) ? agendamento.horarios.join(', ') : agendamento.horarios,
                observacoes: agendamento.observacoes || '',
                status: agendamento.status || 'pendente',
                data_agendamento: agendamento.dataAgendamento,
                usuario_id: agendamento.usuarioId,
                criado_por: currentUser ? currentUser.nome : 'Sistema',
                ip_origem: await obterIP(),
                user_agent: navigator.userAgent
            }
        };

        // Enviar dados
        const sucesso = await enviarDados(dadosFormatados);
        
        if (sucesso) {
            console.log('✅ Agendamento enviado com sucesso para Google Sheets');
            // Remover dos dados pendentes se existir
            removerDadosPendentes('agendamento', agendamento.id);
            return true;
        } else {
            throw new Error('Falha no envio');
        }
        
    } catch (error) {
        console.error('❌ Erro ao enviar agendamento:', error);
        
        // Salvar para tentar novamente depois
        salvarDadosPendentes('agendamento', agendamento);
        
        // Mostrar alerta para o usuário
        if (typeof mostrarAlerta === 'function') {
            mostrarAlerta('⚠️ Agendamento salvo localmente. Será sincronizado quando a conexão for restabelecida.', 'warning');
        }
        
        return false;
    }
}

/**
 * Envia registro de notebook danificado para Google Sheets
 * @param {Object} registro - Dados do notebook danificado
 * @returns {Promise<boolean>} - Sucesso ou falha
 */
async function enviarNotebookDanificadoParaSheets(registro) {
    try {
        console.log('📤 Enviando registro de notebook danificado para SEMED...', registro.id);
        
        const dadosFormatados = {
            action: 'registrarNotebookParaSEMED',
            data: {
                id: registro.id,
                timestamp: new Date().toISOString(),
                escola_codigo: registro.escola,
                numero_serie: registro.numeroSerie,
                problema_descricao: registro.problema,
                tecnico_nome: registro.tecnico,
                tecnico_email: registro.emailTecnico,
                data_registro: registro.dataRegistro,
                status: registro.status || 'registrado',
                usuario_id: currentUser ? currentUser.id : null,
                ip_origem: await obterIP(),
                user_agent: navigator.userAgent
            }
        };

        const sucesso = await enviarDados(dadosFormatados);
        
        if (sucesso) {
            console.log('✅ Notebook danificado registrado com sucesso na aba SEMED');
            removerDadosPendentes('notebook', registro.id);
            return true;
        } else {
            throw new Error('Falha no envio');
        }
        
    } catch (error) {
        console.error('❌ Erro ao registrar notebook danificado:', error);
        salvarDadosPendentes('notebook', registro);
        
        if (typeof mostrarAlerta === 'function') {
            mostrarAlerta('⚠️ Registro salvo localmente. Será sincronizado quando a conexão for restabelecida.', 'warning');
        }
        
        return false;
    }
}

/**
 * Envia dados de usuário para Google Sheets
 * @param {Object} usuario - Dados do usuário
 * @returns {Promise<boolean>} - Sucesso ou falha
 */
async function enviarUsuarioParaSheets(usuario) {
    try {
        console.log('📤 Enviando dados de usuário...', usuario.email);
        
        const dadosFormatados = {
            action: 'criarUsuario',
            data: {
                id: usuario.id,
                timestamp: new Date().toISOString(),
                nome: usuario.nome,
                email: usuario.email,
                profile_type: usuario.profileType,
                escolas_selecionadas: Array.isArray(usuario.escolasSelecionadas) ? usuario.escolasSelecionadas.join(', ') : '',
                escola_principal: usuario.escolaAssociada || '',
                data_cadastro: usuario.dataCadastro,
                aprovado: usuario.aprovado || true,
                ativo: true,
                ip_origem: await obterIP(),
                user_agent: navigator.userAgent
            }
        };

        const sucesso = await enviarDados(dadosFormatados);
        
        if (sucesso) {
            console.log('✅ Usuário enviado com sucesso');
            removerDadosPendentes('usuario', usuario.id);
            return true;
        } else {
            throw new Error('Falha no envio');
        }
        
    } catch (error) {
        console.error('❌ Erro ao enviar usuário:', error);
        salvarDadosPendentes('usuario', usuario);
        return false;
    }
}

/**
 * Carrega agendamentos do Google Sheets
 * @returns {Promise<Array>} - Lista de agendamentos
 */
async function carregarAgendamentosDoSheets() {
    try {
        console.log('📥 Carregando agendamentos do Google Sheets...');
        
        const dadosRequisicao = {
            action: 'carregarAgendamentos',
            data: {
                usuario_id: currentUser ? currentUser.id : null,
                profile_type: currentUser ? currentUser.profileType : null,
                escolas_usuario: currentUser ? currentUser.escolasSelecionadas : []
            }
        };

        const response = await enviarDados(dadosRequisicao, true);
        
        if (response && response.success && Array.isArray(response.data)) {
            console.log(`✅ ${response.data.length} agendamentos carregados`);
            return response.data;
        } else {
            console.warn('⚠️ Nenhum agendamento encontrado ou erro na resposta');
            return [];
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar agendamentos:', error);
        return [];
    }
}

/**
 * Carrega usuários do Google Sheets (apenas para SEMED)
 * @returns {Promise<Array>} - Lista de usuários
 */
async function carregarUsuariosDoSheets() {
    try {
        if (!currentUser || currentUser.profileType !== 'semed') {
            console.warn('⚠️ Acesso negado: apenas SEMED pode carregar usuários');
            return [];
        }
        
        console.log('📥 Carregando usuários do Google Sheets...');
        
        const dadosRequisicao = {
            action: 'carregarUsuarios',
            data: {
                solicitante_id: currentUser.id
            }
        };

        const response = await enviarDados(dadosRequisicao, true);
        
        if (response && response.success && Array.isArray(response.data)) {
            console.log(`✅ ${response.data.length} usuários carregados`);
            return response.data;
        } else {
            console.warn('⚠️ Nenhum usuário encontrado ou erro na resposta');
            return [];
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar usuários:', error);
        return [];
    }
}

/**
 * Carrega notebooks com defeito da aba SEMED
 * @returns {Promise<Array>} - Lista de notebooks com defeito
 */
async function carregarNotebooksComDefeito() {
    try {
        console.log('📥 Carregando notebooks com defeito da aba SEMED...');
        
        const dadosRequisicao = {
            action: 'carregarNotebooksComDefeito',
            data: {
                usuario_id: currentUser ? currentUser.id : null,
                profile_type: currentUser ? currentUser.profileType : null,
                escolas_usuario: currentUser ? currentUser.escolasSelecionadas : []
            }
        };

        const response = await enviarDados(dadosRequisicao, true);
        
        if (response && response.success && Array.isArray(response.data)) {
            console.log(`✅ ${response.data.length} notebooks com defeito carregados`);
            return response.data;
        } else {
            console.warn('⚠️ Nenhum notebook com defeito encontrado ou erro na resposta');
            return [];
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar notebooks com defeito:', error);
        return [];
    }
}

/**
 * Carrega ranking de agendamentos por escola e professor
 * @returns {Promise<Object>} - Ranking de escolas e professores
 */
async function carregarRankingAgendamentos() {
    try {
        console.log('📊 Carregando ranking de agendamentos...');
        
        const dadosRequisicao = {
            action: 'gerarRankingAgendamentos',
            data: {
                solicitante_id: currentUser ? currentUser.id : null,
                profile_type: currentUser ? currentUser.profileType : null
            }
        };

        const response = await enviarDados(dadosRequisicao, true);
        
        if (response && response.success) {
            console.log('✅ Ranking de agendamentos carregado com sucesso');
            return response.data;
        } else {
            console.warn('⚠️ Erro ao carregar ranking ou dados não encontrados');
            return {
                rankingEscolas: [],
                rankingProfessores: [],
                totalAgendamentos: 0
            };
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar ranking de agendamentos:', error);
        return {
            rankingEscolas: [],
            rankingProfessores: [],
            totalAgendamentos: 0
        };
    }
}

/**
 * Atualiza status de agendamento
 * @param {number} agendamentoId - ID do agendamento
 * @param {string} novoStatus - Novo status
 * @returns {Promise<boolean>} - Sucesso ou falha
 */
async function atualizarStatusAgendamento(agendamentoId, novoStatus) {
    try {
        console.log(`📝 Atualizando status do agendamento ${agendamentoId} para ${novoStatus}`);
        
        const dadosFormatados = {
            action: 'atualizarStatusAgendamento',
            data: {
                agendamento_id: agendamentoId,
                novo_status: novoStatus,
                atualizado_por: currentUser ? currentUser.nome : 'Sistema',
                data_atualizacao: new Date().toISOString()
            }
        };

        const sucesso = await enviarDados(dadosFormatados);
        
        if (sucesso) {
            console.log('✅ Status atualizado com sucesso');
            return true;
        } else {
            throw new Error('Falha na atualização');
        }
        
    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
        return false;
    }
}

// ===== FUNÇÕES AUXILIARES =====

/**
 * Função genérica para enviar dados
 * @param {Object} dados - Dados a serem enviados
 * @param {boolean} esperarResposta - Se deve aguardar resposta
 * @returns {Promise<any>} - Resposta ou boolean
 */
async function enviarDados(dados, esperarResposta = false) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SHEETS_CONFIG.TIMEOUT);
        
        const response = await fetch(SHEETS_CONFIG.SCRIPT_URL, {
            method: 'POST',
            mode: esperarResposta ? 'cors' : 'no-cors',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(dados),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (esperarResposta) {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const resultado = await response.json();
            return resultado;
        } else {
            // Para mode: 'no-cors', assumimos sucesso se não houve erro
            return true;
        }
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('❌ Timeout na requisição');
        } else {
            console.error('❌ Erro na requisição:', error);
        }
        throw error;
    }
}

/**
 * Obtém IP do usuário
 * @returns {Promise<string>} - IP do usuário
 */
async function obterIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json', {
            timeout: 3000
        });
        const data = await response.json();
        return data.ip || 'unknown';
    } catch (error) {
        console.warn('⚠️ Não foi possível obter IP:', error);
        return 'unknown';
    }
}

/**
 * Salva dados que falharam no envio
 * @param {string} tipo - Tipo de dados (agendamento, usuario, notebook)
 * @param {Object} dados - Dados a serem salvos
 */
function salvarDadosPendentes(tipo, dados) {
    try {
        const chave = `sheets-pendentes-${tipo}`;
        const dadosPendentes = JSON.parse(localStorage.getItem(chave) || '[]');
        
        // Evitar duplicatas
        const existe = dadosPendentes.find(item => item.id === dados.id);
        if (!existe) {
            dadosPendentes.push({
                ...dados,
                tentativa_envio: new Date().toISOString(),
                tentativas: 1
            });
            
            localStorage.setItem(chave, JSON.stringify(dadosPendentes));
            console.log(`📝 ${tipo} salvo para nova tentativa:`, dados.id);
        }
    } catch (error) {
        console.error('❌ Erro ao salvar dados pendentes:', error);
    }
}

/**
 * Remove dados dos pendentes após envio bem-sucedido
 * @param {string} tipo - Tipo de dados
 * @param {number} id - ID dos dados
 */
function removerDadosPendentes(tipo, id) {
    try {
        const chave = `sheets-pendentes-${tipo}`;
        const dadosPendentes = JSON.parse(localStorage.getItem(chave) || '[]');
        const dadosFiltrados = dadosPendentes.filter(item => item.id !== id);
        
        localStorage.setItem(chave, JSON.stringify(dadosFiltrados));
        console.log(`🗑️ ${tipo} removido dos pendentes:`, id);
    } catch (error) {
        console.error('❌ Erro ao remover dados pendentes:', error);
    }
}

/**
 * Tenta reenviar todos os dados pendentes
 * @returns {Promise<Object>} - Resultado das tentativas
 */
async function reenviarDadosPendentes() {
    console.log('🔄 Iniciando reenvio de dados pendentes...');
    
    const tipos = ['agendamento', 'usuario', 'notebook'];
    const resultado = {
        total: 0,
        sucessos: 0,
        falhas: 0,
        detalhes: {}
    };
    
    for (const tipo of tipos) {
        const chave = `sheets-pendentes-${tipo}`;
        const dadosPendentes = JSON.parse(localStorage.getItem(chave) || '[]');
        
        if (dadosPendentes.length === 0) continue;
        
        console.log(`🔄 Reenviando ${dadosPendentes.length} ${tipo}(s) pendente(s)...`);
        
        resultado.detalhes[tipo] = { total: dadosPendentes.length, sucessos: 0, falhas: 0 };
        resultado.total += dadosPendentes.length;
        
        for (const dados of dadosPendentes) {
            try {
                let sucesso = false;
                
                // Incrementar tentativas
                dados.tentativas = (dados.tentativas || 0) + 1;
                
                // Máximo de 5 tentativas
                if (dados.tentativas > 5) {
                    console.warn(`⚠️ ${tipo} ${dados.id} excedeu máximo de tentativas`);
                    resultado.falhas++;
                    resultado.detalhes[tipo].falhas++;
                    continue;
                }
                
                switch (tipo) {
                    case 'agendamento':
                        sucesso = await enviarParaGoogleSheets(dados);
                        break;
                    case 'usuario':
                        sucesso = await enviarUsuarioParaSheets(dados);
                        break;
                    case 'notebook':
                        sucesso = await enviarNotebookDanificadoParaSheets(dados);
                        break;
                }
                
                if (sucesso) {
                    resultado.sucessos++;
                    resultado.detalhes[tipo].sucessos++;
                } else {
                    resultado.falhas++;
                    resultado.detalhes[tipo].falhas++;
                    
                    // Atualizar dados com nova tentativa
                    const dadosAtualizados = JSON.parse(localStorage.getItem(chave) || '[]');
                    const index = dadosAtualizados.findIndex(item => item.id === dados.id);
                    if (index !== -1) {
                        dadosAtualizados[index] = dados;
                        localStorage.setItem(chave, JSON.stringify(dadosAtualizados));
                    }
                }
                
                // Pequena pausa entre envios
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error(`❌ Erro ao reenviar ${tipo}:`, error);
                resultado.falhas++;
                resultado.detalhes[tipo].falhas++;
            }
        }
    }
    
    console.log('📊 Resultado do reenvio:', resultado);
    
    if (typeof mostrarAlerta === 'function') {
        if (resultado.sucessos > 0) {
            mostrarAlerta(`✅ ${resultado.sucessos} item(s) sincronizado(s) com sucesso!`, 'success');
        }
        if (resultado.falhas > 0) {
            mostrarAlerta(`⚠️ ${resultado.falhas} item(s) ainda pendente(s) de sincronização.`, 'warning');
        }
    }
    
    return resultado;
}

/**
 * Verifica conectividade e tenta reenviar dados pendentes
 */
async function verificarConectividadeEReenviar() {
    try {
        // Teste simples de conectividade
        const response = await fetch('https://www.google.com/favicon.ico', {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache'
        });
        
        console.log('🌐 Conectividade verificada, tentando reenviar dados pendentes...');
        await reenviarDadosPendentes();
        
    } catch (error) {
        console.log('📡 Sem conectividade, dados pendentes serão enviados quando a conexão for restabelecida');
    }
}

/**
 * Obtém estatísticas dos dados pendentes
 * @returns {Object} - Estatísticas
 */
function obterEstatisticasPendentes() {
    const tipos = ['agendamento', 'usuario', 'notebook'];
    const estatisticas = {
        total: 0,
        por_tipo: {}
    };
    
    tipos.forEach(tipo => {
        const chave = `sheets-pendentes-${tipo}`;
        const dados = JSON.parse(localStorage.getItem(chave) || '[]');
        estatisticas.por_tipo[tipo] = dados.length;
        estatisticas.total += dados.length;
    });
    
    return estatisticas;
}

// ===== INICIALIZAÇÃO =====

// Verificar dados pendentes ao carregar a página
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        const stats = obterEstatisticasPendentes();
        if (stats.total > 0) {
            console.log(`📋 ${stats.total} item(s) pendente(s) de sincronização encontrado(s)`);
            
            // Tentar reenviar após 5 segundos
            setTimeout(verificarConectividadeEReenviar, 5000);
        }
    }, 2000);
});

// Verificar periodicamente se há dados pendentes (a cada 5 minutos)
setInterval(() => {
    const stats = obterEstatisticasPendentes();
    if (stats.total > 0) {
        verificarConectividadeEReenviar();
    }
}, 5 * 60 * 1000);

// Tentar reenviar quando a conexão for restabelecida
window.addEventListener('online', () => {
    console.log('🌐 Conexão restabelecida, tentando sincronizar dados...');
    setTimeout(verificarConectividadeEReenviar, 1000);
});

// ===== EXPORTAÇÕES =====

// Para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        enviarParaGoogleSheets,
        enviarNotebookDanificadoParaSheets,
        enviarUsuarioParaSheets,
        carregarAgendamentosDoSheets,
        carregarUsuariosDoSheets,
        atualizarStatusAgendamento,
        reenviarDadosPendentes,
        obterEstatisticasPendentes,
        verificarConectividadeEReenviar
    };
}

// Disponibilizar globalmente
window.SheetsIntegration = {
    enviarParaGoogleSheets,
    enviarNotebookDanificadoParaSheets,
    enviarUsuarioParaSheets,
    carregarAgendamentosDoSheets,
    carregarUsuariosDoSheets,
    atualizarStatusAgendamento,
    reenviarDadosPendentes,
    obterEstatisticasPendentes,
    verificarConectividadeEReenviar
};

console.log('✅ Integração com Google Sheets carregada e pronta para uso!');

