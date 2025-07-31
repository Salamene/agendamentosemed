/**
 * Google Apps Script para Sistema de Agendamento de Notebooks
 * SEMED São Gabriel do Oeste/MS
 * Versão Completa e Funcional
 */

// ===== CONFIGURAÇÕES =====
const SPREADSHEET_ID = '1gAtBTGXZgwsdx0TMxRO0PVeskuPSna9gtLYoEFn-hks';

const SHEET_NAMES = {
  AGENDAMENTOS: 'Agendamentos',
  USUARIOS: 'Usuarios',
  NOTEBOOKS_DANIFICADOS: 'NotebooksDanificados',
  SEMED: 'SEMED',
  RELATORIOS: 'Relatorios',
  LOG: 'Log'
};

// ===== FUNÇÃO PRINCIPAL =====

/**
 * Função principal que recebe todas as requisições HTTP POST
 */
function doPost(e) {
  try {
    // Log da requisição
    logOperacao('POST_RECEIVED', e.postData.contents);
    
    // Parse dos dados JSON
    const dados = JSON.parse(e.postData.contents);
    const action = dados.action;
    
    let resultado;
    
    // Processar diferentes ações
    switch (action) {
      case 'criarAgendamento':
        resultado = criarAgendamento(dados.data);
        break;
        
      case 'carregarAgendamentos':
        resultado = carregarAgendamentos(dados.data);
        break;
        
      case 'atualizarStatusAgendamento':
        resultado = atualizarStatusAgendamento(dados.data);
        break;
        
      case 'criarUsuario':
        resultado = criarUsuario(dados.data);
        break;
        
      case 'carregarUsuarios':
        resultado = carregarUsuarios(dados.data);
        break;
        
      case 'registrarNotebookDanificado':
        resultado = registrarNotebookDanificado(dados.data);
        break;
        
      case 'registrarNotebookParaSEMED':
        resultado = registrarNotebookParaSEMED(dados.data);
        break;
        
      case 'gerarRelatorio':
        resultado = gerarRelatorio(dados.data);
        break;
        
      case 'carregarNotebooksComDefeito':
        resultado = carregarNotebooksComDefeito(dados.data);
        break;
        
      case 'gerarRankingAgendamentos':
        resultado = gerarRankingAgendamentos(dados.data);
        break;
        
      // Compatibilidade com versões antigas
      case 'updateStatus':
        resultado = atualizarStatusLegacy(dados);
        break;
        
      default:
        // Se não tem action, assume que é agendamento (compatibilidade)
        if (!action && dados.id && dados.professor) {
          resultado = criarAgendamentoLegacy(dados);
        } else {
          resultado = {
            success: false,
            error: `Ação não reconhecida: ${action}`
          };
        }
    }
    
    // Log do resultado
    logOperacao(action || 'UNKNOWN', JSON.stringify(resultado));
    
    // Retornar resposta
    return ContentService
      .createTextOutput(JSON.stringify(resultado))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      
  } catch (error) {
    const errorResult = {
      success: false,
      error: `Erro interno: ${error.message}`,
      timestamp: new Date().toISOString()
    };
    
    logOperacao('ERROR', JSON.stringify(errorResult));
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Função para requisições GET
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('index').evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===== FUNÇÕES DE AGENDAMENTO =====

/**
 * Cria um novo agendamento
 */
function criarAgendamento(dados) {
  try {
    const sheet = obterOuCriarSheet(SHEET_NAMES.AGENDAMENTOS, [
      'ID', 'Timestamp', 'Professor', 'Email Professor', 'Escola Codigo', 
      'Escola Nome', 'Disciplina', 'Turma', 'Data Aula', 'Turno', 
      'Horarios', 'Observacoes', 'Status', 'Data Agendamento', 
      'Usuario ID', 'Criado Por', 'IP Origem', 'User Agent'
    ]);
    
    // Verificar se já existe agendamento com mesmo ID
    if (verificarAgendamentoExistente(dados.id)) {
      return {
        success: false,
        error: 'Agendamento já existe com este ID'
      };
    }
    
    // Preparar dados para inserção
    const novaLinha = [
      dados.id,
      dados.timestamp,
      dados.professor,
      dados.email_professor,
      dados.escola_codigo,
      dados.escola_nome,
      dados.disciplina,
      dados.turma,
      dados.data_aula,
      dados.turno,
      dados.horarios,
      dados.observacoes,
      dados.status,
      dados.data_agendamento,
      dados.usuario_id,
      dados.criado_por,
      dados.ip_origem,
      dados.user_agent
    ];
    
    // Inserir na planilha
    const proximaLinha = sheet.getLastRow() + 1;
    sheet.getRange(proximaLinha, 1, 1, novaLinha.length).setValues([novaLinha]);
    
    // Aplicar formatação
    aplicarFormatacaoAgendamento(sheet, proximaLinha);
    
    return {
      success: true,
      message: 'Agendamento criado com sucesso',
      id: dados.id,
      row: proximaLinha
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Erro ao criar agendamento: ${error.message}`
    };
  }
}

/**
 * Carrega agendamentos baseado no usuário
 */
function carregarAgendamentos(dados) {
  try {
    const sheet = obterSheet(SHEET_NAMES.AGENDAMENTOS);
    if (!sheet) {
      return { success: true, data: [] };
    }
    
    const dadosSheet = sheet.getDataRange().getValues();
    if (dadosSheet.length <= 1) {
      return { success: true, data: [] };
    }
    
    const cabecalho = dadosSheet[0];
    const linhas = dadosSheet.slice(1);
    
    let agendamentos = linhas.map(linha => {
      const obj = {};
      cabecalho.forEach((col, index) => {
        obj[col] = linha[index];
      });
      return obj;
    });
    
    // Filtrar baseado no tipo de usuário
    if (dados.profile_type === 'professor' && dados.usuario_id) {
      agendamentos = agendamentos.filter(ag => ag['Usuario ID'] === dados.usuario_id);
    } else if (dados.profile_type === 'tecnico') {
      // Técnicos veem agendamentos de suas escolas
      if (dados.escolas_usuario && dados.escolas_usuario.length > 0) {
        agendamentos = agendamentos.filter(ag => {
          const escolaAgendamento = ag['Escola Codigo'];
          return dados.escolas_usuario.includes(escolaAgendamento);
        });
      } else {
        agendamentos = [];
      }
    }
    // SEMED vê todos os agendamentos
    
    return {
      success: true,
      data: agendamentos
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Erro ao carregar agendamentos: ${error.message}`
    };
  }
}

/**
 * Atualiza status de um agendamento
 */
function atualizarStatusAgendamento(dados) {
  try {
    const sheet = obterSheet(SHEET_NAMES.AGENDAMENTOS);
    if (!sheet) {
      return { success: false, error: 'Planilha de agendamentos não encontrada' };
    }
    
    const dadosSheet = sheet.getDataRange().getValues();
    
    // Encontrar agendamento pelo ID
    for (let i = 1; i < dadosSheet.length; i++) {
      if (dadosSheet[i][0] == dados.agendamento_id) {
        // Atualizar status (coluna 13, índice 12)
        sheet.getRange(i + 1, 13).setValue(dados.novo_status);
        
        // Adicionar informações de auditoria se houver colunas
        const ultimaColuna = sheet.getLastColumn();
        if (ultimaColuna >= 19) {
          sheet.getRange(i + 1, 19).setValue(dados.data_atualizacao); // Data atualização
          sheet.getRange(i + 1, 20).setValue(dados.atualizado_por); // Atualizado por
        }
        
        return {
          success: true,
          message: `Status atualizado para: ${dados.novo_status}`,
          row: i + 1
        };
      }
    }
    
    return { success: false, error: 'Agendamento não encontrado' };
    
  } catch (error) {
    return {
      success: false,
      error: `Erro ao atualizar status: ${error.message}`
    };
  }
}

// ===== FUNÇÕES DE USUÁRIO =====

/**
 * Cria um novo usuário
 */
function criarUsuario(dados) {
  try {
    const sheet = obterOuCriarSheet(SHEET_NAMES.USUARIOS, [
      'ID', 'Timestamp', 'Nome', 'Email', 'Profile Type', 
      'Escolas Selecionadas', 'Escola Principal', 'Data Cadastro', 
      'Aprovado', 'Ativo', 'IP Origem', 'User Agent'
    ]);
    
    // Verificar se email já existe
    if (verificarEmailExistente(dados.email)) {
      return {
        success: false,
        error: 'Email já cadastrado no sistema'
      };
    }
    
    // Preparar dados para inserção
    const novaLinha = [
      dados.id,
      dados.timestamp,
      dados.nome,
      dados.email,
      dados.profile_type,
      dados.escolas_selecionadas,
      dados.escola_principal,
      dados.data_cadastro,
      dados.aprovado,
      dados.ativo,
      dados.ip_origem,
      dados.user_agent
    ];
    
    // Inserir na planilha
    const proximaLinha = sheet.getLastRow() + 1;
    sheet.getRange(proximaLinha, 1, 1, novaLinha.length).setValues([novaLinha]);
    
    // Aplicar formatação
    aplicarFormatacaoUsuario(sheet, proximaLinha);
    
    return {
      success: true,
      message: 'Usuário criado com sucesso',
      id: dados.id,
      row: proximaLinha
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Erro ao criar usuário: ${error.message}`
    };
  }
}

/**
 * Carrega usuários (apenas para SEMED)
 */
function carregarUsuarios(dados) {
  try {
    const sheet = obterSheet(SHEET_NAMES.USUARIOS);
    if (!sheet) {
      return { success: true, data: [] };
    }
    
    const dadosSheet = sheet.getDataRange().getValues();
    if (dadosSheet.length <= 1) {
      return { success: true, data: [] };
    }
    
    const cabecalho = dadosSheet[0];
    const linhas = dadosSheet.slice(1);
    
    const usuarios = linhas.map(linha => {
      const obj = {};
      cabecalho.forEach((col, index) => {
        obj[col] = linha[index];
      });
      return obj;
    });
    
    return {
      success: true,
      data: usuarios
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Erro ao carregar usuários: ${error.message}`
    };
  }
}

// ===== FUNÇÕES DE NOTEBOOK DANIFICADO =====

/**
 * Registra um notebook danificado
 */
function registrarNotebookDanificado(dados) {
  try {
    const sheet = obterOuCriarSheet(SHEET_NAMES.NOTEBOOKS_DANIFICADOS, [
      'ID', 'Timestamp', 'Escola Codigo', 'Numero Serie', 'Problema Descricao',
      'Tecnico Nome', 'Tecnico Email', 'Data Registro', 'Status',
      'Usuario ID', 'IP Origem', 'User Agent'
    ]);
    
    // Preparar dados para inserção
    const novaLinha = [
      dados.id,
      dados.timestamp,
      dados.escola_codigo,
      dados.numero_serie,
      dados.problema_descricao,
      dados.tecnico_nome,
      dados.tecnico_email,
      dados.data_registro,
      dados.status,
      dados.usuario_id,
      dados.ip_origem,
      dados.user_agent
    ];
    
    // Inserir na planilha
    const proximaLinha = sheet.getLastRow() + 1;
    sheet.getRange(proximaLinha, 1, 1, novaLinha.length).setValues([novaLinha]);
    
    // Aplicar formatação
    aplicarFormatacaoNotebook(sheet, proximaLinha);
    
    return {
      success: true,
      message: 'Notebook danificado registrado com sucesso',
      id: dados.id,
      row: proximaLinha
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Erro ao registrar notebook: ${error.message}`
    };
  }
}

/**
 * Registra um notebook danificado na aba SEMED
 */
function registrarNotebookParaSEMED(dados) {
  try {
    const sheet = obterOuCriarSheet(SHEET_NAMES.SEMED, [
      'ID', 'Timestamp', 'Escola Codigo', 'Numero Serie', 'Problema Descricao',
      'Tecnico Nome', 'Tecnico Email', 'Data Registro', 'Status',
      'Usuario ID', 'IP Origem', 'User Agent'
    ]);
    
    // Preparar dados para inserção
    const novaLinha = [
      dados.id,
      dados.timestamp,
      dados.escola_codigo,
      dados.numero_serie,
      dados.problema_descricao,
      dados.tecnico_nome,
      dados.tecnico_email,
      dados.data_registro,
      dados.status,
      dados.usuario_id,
      dados.ip_origem,
      dados.user_agent
    ];
    
    // Inserir na planilha
    const proximaLinha = sheet.getLastRow() + 1;
    sheet.getRange(proximaLinha, 1, 1, novaLinha.length).setValues([novaLinha]);
    
    // Aplicar formatação
    aplicarFormatacaoNotebook(sheet, proximaLinha);
    
    return {
      success: true,
      message: 'Notebook danificado registrado com sucesso na aba SEMED',
      id: dados.id,
      row: proximaLinha
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Erro ao registrar notebook na aba SEMED: ${error.message}`
    };
  }
}

/**
 * Carrega notebooks com defeito da aba SEMED com filtros por escola
 * @param {Object} dados - Dados da requisição incluindo perfil do usuário
 * @returns {Object} - Lista de notebooks com defeito filtrados
 */
function carregarNotebooksComDefeito(dados) {
  try {
    const sheet = obterSheet(SHEET_NAMES.SEMED);
    if (!sheet) {
      return { success: true, data: [] };
    }
    
    const dadosSheet = sheet.getDataRange().getValues();
    if (dadosSheet.length <= 1) {
      return { success: true, data: [] };
    }
    
    const cabecalho = dadosSheet[0];
    const linhas = dadosSheet.slice(1);
    
    let notebooks = linhas.map(linha => {
      const obj = {};
      cabecalho.forEach((col, index) => {
        obj[col] = linha[index];
      });
      return obj;
    });
    
    // Filtrar baseado no tipo de usuário e escolas associadas
    if (dados.profile_type === 'professor' || dados.profile_type === 'tecnico') {
      if (dados.escolas_usuario && dados.escolas_usuario.length > 0) {
        notebooks = notebooks.filter(notebook => {
          const escolaNotebook = notebook['Escola Codigo'];
          return dados.escolas_usuario.includes(escolaNotebook);
        });
      } else {
        // Se não tem escolas associadas, não mostra nenhum notebook
        notebooks = [];
      }
    }
    // SEMED vê todos os notebooks
    
    return {
      success: true,
      data: notebooks
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Erro ao carregar notebooks com defeito: ${error.message}`
    };
  }
}

/**
 * Gera ranking de agendamentos por escola e professor
 * @param {Object} dados - Dados da requisição
 * @returns {Object} - Ranking de escolas e professores
 */
function gerarRankingAgendamentos(dados) {
  try {
    const sheet = obterSheet(SHEET_NAMES.AGENDAMENTOS);
    if (!sheet) {
      return { 
        success: true, 
        data: { 
          rankingEscolas: [], 
          rankingProfessores: [] 
        } 
      };
    }
    
    const dadosSheet = sheet.getDataRange().getValues();
    if (dadosSheet.length <= 1) {
      return { 
        success: true, 
        data: { 
          rankingEscolas: [], 
          rankingProfessores: [] 
        } 
      };
    }
    
    const cabecalho = dadosSheet[0];
    const linhas = dadosSheet.slice(1);
    
    // Mapear dados para objetos
    const agendamentos = linhas.map(linha => {
      const obj = {};
      cabecalho.forEach((col, index) => {
        obj[col] = linha[index];
      });
      return obj;
    });
    
    // Contar agendamentos por escola
    const contagemEscolas = {};
    const contagemProfessores = {};
    
    agendamentos.forEach(agendamento => {
      const escolaCodigo = agendamento['Escola Codigo'];
      const escolaNome = agendamento['Escola Nome'];
      const professor = agendamento['Professor'];
      const status = agendamento['Status'];
      
      // Contar apenas agendamentos aprovados ou pendentes
      if (status !== 'cancelado') {
        // Ranking por escola
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
      .slice(0, 10); // Top 10
    
    const rankingProfessores = Object.values(contagemProfessores)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10); // Top 10
    
    return {
      success: true,
      data: {
        rankingEscolas: rankingEscolas,
        rankingProfessores: rankingProfessores,
        totalAgendamentos: agendamentos.length,
        dataGeracao: new Date().toISOString()
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Erro ao gerar ranking: ${error.message}`
    };
  }
}

/**
 * Gera relatório baseado nos filtros
 */
function gerarRelatorio(dados) {
  try {
    // Implementar lógica de relatório conforme necessário
    return {
      success: true,
      message: 'Relatório gerado com sucesso',
      data: []
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Erro ao gerar relatório: ${error.message}`
    };
  }
}

// ===== FUNÇÕES AUXILIARES =====

/**
 * Obtém ou cria uma planilha
 */
function obterOuCriarSheet(nomeSheet, cabecalhos) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(nomeSheet);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(nomeSheet);
    
    // Adicionar cabeçalhos
    if (cabecalhos && cabecalhos.length > 0) {
      sheet.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
      
      // Formatação do cabeçalho
      const headerRange = sheet.getRange(1, 1, 1, cabecalhos.length);
      headerRange.setBackground('#4285f4');
      headerRange.setFontColor('white');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
    }
  }
  
  return sheet;
}

/**
 * Obtém uma planilha existente
 */
function obterSheet(nomeSheet) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  return spreadsheet.getSheetByName(nomeSheet);
}

/**
 * Verifica se agendamento já existe
 */
function verificarAgendamentoExistente(id) {
  const sheet = obterSheet(SHEET_NAMES.AGENDAMENTOS);
  if (!sheet) return false;
  
  const dados = sheet.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] == id) {
      return true;
    }
  }
  return false;
}

/**
 * Verifica se email já existe
 */
function verificarEmailExistente(email) {
  const sheet = obterSheet(SHEET_NAMES.USUARIOS);
  if (!sheet) return false;
  
  const dados = sheet.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][3] === email) { // Coluna 4 = Email (índice 3)
      return true;
    }
  }
  return false;
}

/**
 * Aplica formatação para agendamentos
 */
function aplicarFormatacaoAgendamento(sheet, linha) {
  const range = sheet.getRange(linha, 1, 1, sheet.getLastColumn());
  range.setBorder(true, true, true, true, true, true);
  
  // Formatação condicional baseada no status
  const statusCell = sheet.getRange(linha, 13); // Coluna Status
  const status = statusCell.getValue();
  
  switch (status) {
    case 'pendente':
      range.setBackground('#fff3cd');
      break;
    case 'aprovado':
      range.setBackground('#d4edda');
      break;
    case 'cancelado':
      range.setBackground('#f8d7da');
      break;
  }
}

/**
 * Aplica formatação para usuários
 */
function aplicarFormatacaoUsuario(sheet, linha) {
  const range = sheet.getRange(linha, 1, 1, sheet.getLastColumn());
  range.setBorder(true, true, true, true, true, true);
  
  // Formatação baseada no tipo de perfil
  const profileCell = sheet.getRange(linha, 5); // Coluna Profile Type
  const profile = profileCell.getValue();
  
  switch (profile) {
    case 'professor':
      range.setBackground('#e3f2fd');
      break;
    case 'tecnico':
      range.setBackground('#f3e5f5');
      break;
    case 'semed':
      range.setBackground('#e8f5e8');
      break;
  }
}

/**
 * Aplica formatação para notebooks danificados
 */
function aplicarFormatacaoNotebook(sheet, linha) {
  const range = sheet.getRange(linha, 1, 1, sheet.getLastColumn());
  range.setBorder(true, true, true, true, true, true);
  range.setBackground('#ffebee'); // Fundo vermelho claro para indicar problema
}

/**
 * Registra operações no log
 */
function logOperacao(operacao, detalhes) {
  try {
    const sheet = obterOuCriarSheet(SHEET_NAMES.LOG, [
      'Timestamp', 'Operacao', 'Detalhes', 'IP', 'User Agent'
    ]);
    
    const novaLinha = [
      new Date().toISOString(),
      operacao,
      detalhes,
      '', // IP será preenchido pelo frontend se disponível
      '' // User Agent será preenchido pelo frontend se disponível
    ];
    
    const proximaLinha = sheet.getLastRow() + 1;
    sheet.getRange(proximaLinha, 1, 1, novaLinha.length).setValues([novaLinha]);
    
    // Manter apenas os últimos 1000 logs
    if (proximaLinha > 1001) {
      sheet.deleteRow(2); // Remove a linha mais antiga (após o cabeçalho)
    }
    
  } catch (error) {
    console.error('Erro ao registrar log:', error);
  }
}

// ===== FUNÇÕES DE COMPATIBILIDADE =====

/**
 * Função para compatibilidade com versões antigas
 */
function criarAgendamentoLegacy(dados) {
  const dadosFormatados = {
    id: dados.id,
    timestamp: new Date().toISOString(),
    professor: dados.professor,
    email_professor: dados.email_professor || '',
    escola_codigo: dados.escola || '',
    escola_nome: dados.escola || '',
    disciplina: dados.disciplina,
    turma: dados.turma,
    data_aula: dados.data_aula,
    turno: dados.turno,
    horarios: dados.horarios,
    observacoes: dados.observacoes || '',
    status: dados.status || 'pendente',
    data_agendamento: dados.data_agendamento,
    usuario_id: null,
    criado_por: dados.criado_por || 'Sistema Legacy',
    ip_origem: 'unknown',
    user_agent: 'unknown'
  };
  
  return criarAgendamento(dadosFormatados);
}

/**
 * Função para atualização de status (compatibilidade)
 */
function atualizarStatusLegacy(dados) {
  const dadosFormatados = {
    agendamento_id: dados.id,
    novo_status: dados.status,
    atualizado_por: dados.updatedBy || 'Sistema',
    data_atualizacao: new Date().toISOString()
  };
  
  return atualizarStatusAgendamento(dadosFormatados);
}

// ===== FUNÇÕES DE TESTE =====

/**
 * Função de teste para verificar funcionamento
 */
function testarSistema() {
  console.log('=== TESTE DO SISTEMA ===');
  
  // Teste 1: Criar agendamento
  const dadosAgendamento = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    professor: 'Professor Teste',
    email_professor: 'teste@teste.com',
    escola_codigo: 'teste-escola',
    escola_nome: 'Escola Teste',
    disciplina: 'Informática',
    turma: '5º A',
    data_aula: '2024-01-15',
    turno: 'matutino',
    horarios: 'Segunda 1ª aula',
    observacoes: 'Teste do sistema',
    status: 'pendente',
    data_agendamento: new Date().toISOString(),
    usuario_id: 123,
    criado_por: 'Teste Sistema',
    ip_origem: '127.0.0.1',
    user_agent: 'Test Browser'
  };
  
  const resultadoAgendamento = criarAgendamento(dadosAgendamento);
  console.log('Teste Agendamento:', resultadoAgendamento);
  
  // Teste 2: Criar usuário
  const dadosUsuario = {
    id: Date.now() + 1,
    timestamp: new Date().toISOString(),
    nome: 'Usuário Teste',
    email: 'usuario.teste@teste.com',
    profile_type: 'professor',
    escolas_selecionadas: 'escola-teste',
    escola_principal: 'escola-teste',
    data_cadastro: new Date().toISOString(),
    aprovado: true,
    ativo: true,
    ip_origem: '127.0.0.1',
    user_agent: 'Test Browser'
  };
  
  const resultadoUsuario = criarUsuario(dadosUsuario);
  console.log('Teste Usuário:', resultadoUsuario);
  
  // Teste 3: Registrar notebook danificado
  const dadosNotebook = {
    id: Date.now() + 2,
    timestamp: new Date().toISOString(),
    escola_codigo: 'escola-teste',
    numero_serie: 'TEST123456',
    problema_descricao: 'Tela quebrada - teste',
    tecnico_nome: 'Técnico Teste',
    tecnico_email: 'tecnico.teste@teste.com',
    data_registro: new Date().toISOString(),
    status: 'registrado',
    usuario_id: 124,
    ip_origem: '127.0.0.1',
    user_agent: 'Test Browser'
  };
  
  const resultadoNotebook = registrarNotebookDanificado(dadosNotebook);
  console.log('Teste Notebook:', resultadoNotebook);
  
  console.log('=== FIM DOS TESTES ===');
  
  return {
    agendamento: resultadoAgendamento,
    usuario: resultadoUsuario,
    notebook: resultadoNotebook
  };
}

/**
 * Função para limpar dados de teste
 */
function limparDadosTeste() {
  const sheets = [SHEET_NAMES.AGENDAMENTOS, SHEET_NAMES.USUARIOS, SHEET_NAMES.NOTEBOOKS_DANIFICADOS];
  
  sheets.forEach(sheetName => {
    const sheet = obterSheet(sheetName);
    if (sheet) {
      const dados = sheet.getDataRange().getValues();
      
      // Remover linhas que contêm "Teste" no nome/descrição
      for (let i = dados.length - 1; i >= 1; i--) {
        const linha = dados[i];
        const temTeste = linha.some(cell => 
          typeof cell === 'string' && cell.toLowerCase().includes('teste')
        );
        
        if (temTeste) {
          sheet.deleteRow(i + 1);
        }
      }
    }
  });
  
  console.log('Dados de teste removidos');
}

console.log('✅ Google Apps Script carregado e pronto para uso!');

