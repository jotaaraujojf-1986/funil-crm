(function(){

var STAGES = [
  {id:'lead', label:'Lead', color:'#8A8F94'},
  {id:'contato', label:'Em contato', color:'#2B6CA3'},
  {id:'proposta', label:'Proposta', color:'#E8A317'},
  {id:'negociacao', label:'Negociação', color:'#C0392B'},
  {id:'fechado', label:'Fechado', color:'#2E7D4F'},
  {id:'perdido', label:'Perdido', color:'#5B5F63'}
];

var CANAIS = {
  presencial: 'Presencial',
  telefone: 'Telefone',
  whatsapp: 'WhatsApp',
  indicacao: 'Indicação'
};

var SUPABASE_URL = 'https://atgwsmrottssynagejyw.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0Z3dzbXJvdHRzc3luYWdlanl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTA3MTAsImV4cCI6MjA5ODEyNjcxMH0.oukOKymd4AY3PM7QqwZ50bzobzQsUhONuc7bWwKsfPk';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
var currentUserId = null;
var leads = [];
var clientes = [];
var filtroAtivo = 'todos';
var periodoTipo = 'todos';
var periodoInicio = null;
var periodoFim = null;
var equipeAtual = null;
var papelAtual = null;
var filtroVendedorId = '';
var membrosDaEquipe = {};

var onboardingState = { etapasConcluidas: [], dispensado: false };
var notificacoes = [];
var painelNotifAberto = false;

// Web Audio API — gera sons sem arquivos externos
function criarContextoAudio(){
  try{ return new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ return null; }
}

function tocarSomNotificacao(tipo){
  var ctx = criarContextoAudio();
  if(!ctx) return;

  var configs = {
    atrasado: [
      { freq: 880, duracao: 0.12, delay: 0 },
      { freq: 660, duracao: 0.12, delay: 0.14 },
      { freq: 440, duracao: 0.2,  delay: 0.28 }
    ],
    urgente: [
      { freq: 1046, duracao: 0.1, delay: 0 },
      { freq: 1046, duracao: 0.1, delay: 0.15 },
      { freq: 1318, duracao: 0.25, delay: 0.3 }
    ],
    hoje: [
      { freq: 660, duracao: 0.15, delay: 0 },
      { freq: 880, duracao: 0.2,  delay: 0.18 }
    ],
    nova: [
      { freq: 523, duracao: 0.12, delay: 0 },
      { freq: 784, duracao: 0.18, delay: 0.14 }
    ]
  };

  var notas = configs[tipo] || configs.nova;
  notas.forEach(function(nota){
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(nota.freq, ctx.currentTime + nota.delay);
    gain.gain.setValueAtTime(0, ctx.currentTime + nota.delay);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + nota.delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + nota.delay + nota.duracao);
    osc.start(ctx.currentTime + nota.delay);
    osc.stop(ctx.currentTime + nota.delay + nota.duracao + 0.05);
  });
}

var ONBOARDING_ETAPAS = [
  {
    id: 'equipe_criada',
    titulo: 'Equipe criada',
    desc: 'Sua equipe já está configurada e pronta.',
    acao: null
  },
  {
    id: 'membro_adicionado',
    titulo: 'Adicione um vendedor',
    desc: 'Crie o acesso para o primeiro membro da sua equipe.',
    acao: 'equipe',
    acaoLabel: '→ Ir para Equipe'
  },
  {
    id: 'negocio_criado',
    titulo: 'Crie seu primeiro negócio',
    desc: 'Adicione um negócio no funil de vendas.',
    acao: 'funil',
    acaoLabel: '→ Ir para Funil'
  },
  {
    id: 'meta_definida',
    titulo: 'Defina a meta do mês',
    desc: 'Configure quanto quer vender este mês.',
    acao: 'metas',
    acaoLabel: '→ Ir para Metas'
  },
  {
    id: 'dados_exportados',
    titulo: 'Exporte seus dados',
    desc: 'Veja como exportar seus negócios e clientes.',
    acao: 'exportar',
    acaoLabel: '→ Exportar dados'
  }
];

var TITULOS_SECAO = {
  funil: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> Funil',
  dash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Dashboard',
  clientes: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Clientes',
  calendario: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Calendário',
  metas: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> Metas',
  tarefas: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> Tarefas',
  equipe: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> Equipe',
  notificacoes: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Notificações'
};

function abrirSidebar(){
  document.getElementById('sidebar-nav').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('open');
}

function fecharSidebar(){
  document.getElementById('sidebar-nav').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

function getUserIdFiltro(){
  if(filtroVendedorId) return filtroVendedorId;
  if(papelAtual === 'admin') return null;
  return currentUserId;
}

function getUserIdParaSalvar(){
  return filtroVendedorId || currentUserId;
}

function aplicarFiltroUsuario(query){
  var uid = getUserIdFiltro();
  if(equipeAtual){
    query = query.eq('equipe_id', equipeAtual.id);
    if(uid) query = query.eq('user_id', uid);
  } else {
    query = query.eq('user_id', currentUserId);
  }
  return query;
}
var limitesEtapa = {
  lead: {alerta:7, critico:14},
  contato: {alerta:7, critico:14},
  proposta: {alerta:5, critico:10},
  negociacao: {alerta:7, critico:14}
};
var metaMensal = 0;
var sabadosUteis = [];

function toast(mensagem, tipo){
  tipo = tipo || 'info';
  var container = document.getElementById('toast-container');
  var el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.textContent = mensagem;
  container.appendChild(el);
  setTimeout(function(){
    el.classList.add('saindo');
    setTimeout(function(){ el.remove(); }, 250);
  }, 4000);
}

function customConfirm(mensagem, titulo){
  return new Promise(function(resolve){
    document.getElementById('confirm-titulo').textContent = titulo || 'Confirmar ação';
    document.getElementById('confirm-mensagem').textContent = mensagem;
    var overlay = document.getElementById('overlay-confirm');
    overlay.classList.add('open');

    var btnConfirmar = document.getElementById('confirm-btn-confirmar');
    var btnCancelar = document.getElementById('confirm-btn-cancelar');

    function limpar(resultado){
      overlay.classList.remove('open');
      btnConfirmar.onclick = null;
      btnCancelar.onclick = null;
      resolve(resultado);
    }
    btnConfirmar.onclick = function(){ limpar(true); };
    btnCancelar.onclick = function(){ limpar(false); };
  });
}

function uid(){ return 'l' + Date.now() + Math.floor(Math.random()*10000); }

function todayStr(){
  var d = new Date();
  var ano = d.getFullYear();
  var mes = String(d.getMonth() + 1).padStart(2, '0');
  var dia = String(d.getDate()).padStart(2, '0');
  return ano + '-' + mes + '-' + dia;
}

function addDays(dateStr, n){
  var d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}

function diffDays(dateStr){
  var today = new Date(todayStr() + 'T00:00:00');
  var target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function validarCamposObrigatorios(lead){
  if(lead.stage === 'proposta' && !(Number(lead.valor) > 0)){
    return 'Pra mover pra "Proposta", informe um valor estimado maior que zero.';
  }
  if(lead.stage === 'negociacao'){
    if(!(Number(lead.valor) > 0)) return 'Pra mover pra "Negociação", informe um valor estimado maior que zero.';
  }
  if(lead.stage === 'fechado' && !(Number(lead.valor) > 0)){
    return 'Pra marcar como "Fechado", informe um valor maior que zero.';
  }
  return null;
}

function setStage(lead, novoStage){
  if(novoStage === 'fechado' && lead.stage !== 'fechado'){
    lead.fechadoEm = todayStr();
  } else if(novoStage !== 'fechado'){
    delete lead.fechadoEm;
  }
  if(novoStage !== lead.stage){
    lead.etapaAlteradaEm = new Date().toISOString();
  }
  lead.stage = novoStage;
}

async function concluirFollowUp(lead){
  if(lead.clienteId){
    var tipoInteracao = 'outro';
    if(lead.atividadeTipo === 'Ligar') tipoInteracao = 'ligacao';
    else if(lead.atividadeTipo === 'Visita') tipoInteracao = 'visita';
    else if(lead.atividadeTipo === 'Reunião') tipoInteracao = 'outro';
    else if(lead.atividadeTipo === 'Enviar proposta') tipoInteracao = 'outro';

    var nota = 'Follow-up concluído' + (lead.atividadeTipo ? ' — ' + lead.atividadeTipo : '') + (lead.atividadeDesc ? ': ' + lead.atividadeDesc : '');
    await criarInteracaoNoDb({ clienteId: lead.clienteId, leadId: lead.id, tipo: tipoInteracao, nota: nota, data: todayStr() });
  }
  lead.nextFollowUp = null;
  lead.atividadeTipo = '';
  lead.atividadeDesc = '';
  await atualizarLeadNoDb(lead);
}

function fromDb(row){
  return {
    id: row.id,
    userId: row.user_id,
    nome: row.nome,
    contato: row.contato,
    canal: row.canal,
    interesse: row.interesse,
    valor: Number(row.valor) || 0,
    stage: row.stage,
    nextFollowUp: row.next_follow_up,
    notas: row.notas,
    criado: row.criado,
    fechadoEm: row.fechado_em || undefined,
    anexos: Array.isArray(row.anexos) ? row.anexos : [],
    clienteId: row.cliente_id || null,
    motivoPerda: row.motivo_perda || '',
    etapaAlteradaEm: row.etapa_alterada_em || row.created_at,
    atividadeTipo: row.proxima_atividade_tipo || '',
    atividadeDesc: row.proxima_atividade_desc || ''
  };
}

function toDb(lead){
  return {
    user_id: currentUserId,
    equipe_id: equipeAtual ? equipeAtual.id : null,
    nome: lead.nome,
    contato: lead.contato || null,
    canal: lead.canal,
    valor: Number(lead.valor) || 0,
    stage: lead.stage,
    next_follow_up: lead.nextFollowUp || null,
    notas: lead.notas || null,
    criado: lead.criado || todayStr(),
    fechado_em: lead.fechadoEm || null,
    anexos: lead.anexos || [],
    cliente_id: lead.clienteId || null,
    motivo_perda: lead.motivoPerda || null,
    etapa_alterada_em: lead.etapaAlteradaEm || new Date().toISOString(),
    proxima_atividade_tipo: lead.atividadeTipo || null,
    proxima_atividade_desc: lead.atividadeDesc || null
  };
}

async function loadLeadsFromDb(){
  var query = aplicarFiltroUsuario(sb.from('leads').select('*'));
  var res = await query.order('created_at', {ascending:true});
  if(res.error){ console.error('Erro ao carregar leads', res.error); leads = []; return; }
  leads = res.data.map(fromDb);
}

async function criarLeadNoDb(lead){
  var res = await sb.from('leads').insert(toDb(lead)).select().single();
  if(res.error){ console.error('Erro ao criar lead', res.error); return null; }
  return fromDb(res.data);
}

async function atualizarLeadNoDb(lead){
  var res = await sb.from('leads').update(toDb(lead)).eq('id', lead.id);
  if(res.error){ console.error('Erro ao atualizar lead', res.error); showSyncError(); }
}

async function excluirLeadNoDb(id){
  var res = await sb.from('leads').delete().eq('id', id);
  if(res.error){ console.error('Erro ao excluir lead', res.error); showSyncError(); }
}

function showSyncError(){
  toast('Não foi possível sincronizar com o servidor agora. Verifique sua internet — a alteração pode não ter sido salva.', 'erro');
}

// ---------- Clientes ----------

function clienteFromDb(row){
  return {
    id: row.id,
    codigo: row.codigo,
    nome: row.nome,
    contato: row.contato,
    canal: row.canal,
    notas: row.notas,
    criado: row.criado,
    cnpj: row.cnpj || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    responsavel: row.responsavel || '',
    tipo: row.tipo || 'juridica'
  };
}

function clienteToDb(cliente){
  return {
    user_id: currentUserId,
    equipe_id: equipeAtual ? equipeAtual.id : null,
    nome: cliente.nome,
    contato: cliente.contato || null,
    canal: cliente.canal || null,
    notas: cliente.notas || null,
    criado: cliente.criado || todayStr(),
    cnpj: cliente.cnpj || null,
    responsavel: cliente.responsavel || null,
    tipo: cliente.tipo || 'juridica',
    tags: cliente.tags || []
  };
}

async function buscarDadosCnpj(cnpj){
  var digitos = String(cnpj || '').replace(/\D/g, '');
  if(digitos.length !== 14){
    toast('CNPJ inválido. Deve ter 14 números.', 'erro');
    return null;
  }
  try{
    var res = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + digitos);
    if(!res.ok){
      toast('CNPJ não encontrado na Receita Federal.', 'erro');
      return null;
    }
    var dados = await res.json();
    return {
      nome: dados.nome_fantasia || dados.razao_social || '',
      contato: dados.ddd_telefone_1 ? dados.ddd_telefone_1.replace(/\D/g,'') : ''
    };
  }catch(e){
    console.error('Erro ao consultar CNPJ', e);
    toast('Não foi possível consultar o CNPJ agora. Verifique sua internet.', 'erro');
    return null;
  }
}

async function loadClientesFromDb(){
  var query = aplicarFiltroUsuario(sb.from('clientes').select('*'));
  var res = await query.order('nome', {ascending:true});
  if(res.error){ console.error('Erro ao carregar clientes', res.error); clientes = []; return; }
  clientes = res.data.map(clienteFromDb);
}

async function criarClienteNoDb(cliente){
  var res = await sb.from('clientes').insert(clienteToDb(cliente)).select().single();
  if(res.error){ console.error('Erro ao criar cliente', res.error); return null; }
  return clienteFromDb(res.data);
}

async function atualizarClienteNoDb(cliente){
  var res = await sb.from('clientes').update(clienteToDb(cliente)).eq('id', cliente.id);
  if(res.error){ console.error('Erro ao atualizar cliente', res.error); showSyncError(); }
}

async function excluirClienteNoDb(id){
  var res = await sb.from('clientes').delete().eq('id', id);
  if(res.error){ console.error('Erro ao excluir cliente', res.error); showSyncError(); }
}

// ---------- Interações (histórico de contato) ----------

function interacaoFromDb(row){
  return { id: row.id, clienteId: row.cliente_id, leadId: row.lead_id, tipo: row.tipo, nota: row.nota, data: row.data };
}

async function loadInteracoesDoCliente(clienteId){
  var query = sb.from('interacoes').select('*').eq('cliente_id', clienteId);
  if(equipeAtual){
    query = query.eq('equipe_id', equipeAtual.id);
  } else {
    query = query.eq('user_id', currentUserId);
  }
  var res = await query.order('data', {ascending:false});
  if(res.error){ console.error('Erro ao carregar interações', res.error); return []; }
  return res.data.map(interacaoFromDb);
}

async function criarInteracaoNoDb(interacao){
  var res = await sb.from('interacoes').insert({
    user_id: currentUserId,
    equipe_id: equipeAtual ? equipeAtual.id : null,
    cliente_id: interacao.clienteId,
    lead_id: interacao.leadId || null,
    tipo: interacao.tipo,
    nota: interacao.nota || null,
    data: interacao.data || todayStr()
  }).select().single();
  if(res.error){ console.error('Erro ao registrar interação', res.error); showSyncError(); return null; }
  return interacaoFromDb(res.data);
}

async function excluirInteracaoNoDb(id){
  var res = await sb.from('interacoes').delete().eq('id', id);
  if(res.error){ console.error('Erro ao excluir interação', res.error); showSyncError(); }
}

function tarefaFromDb(row){
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao || '',
    data: String(row.data).slice(0,10),
    prioridade: row.prioridade || 'normal',
    categoria: row.categoria || 'administrativo',
    concluida: row.concluida || false,
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
    anexos: Array.isArray(row.anexos) ? row.anexos : [],
    historico: Array.isArray(row.historico) ? row.historico : [],
    userId: row.user_id
  };
}

async function loadTarefasDoDia(dataStr){
  var query = aplicarFiltroUsuario(sb.from('tarefas').select('*'));
  var res = await query.eq('data', dataStr).order('created_at', {ascending:true});
  if(res.error){ console.error('Erro ao carregar tarefas', res.error); return []; }
  return res.data.map(tarefaFromDb);
}

async function loadTarefasDoMes(ano, mes){
  var inicio = ano + '-' + String(mes+1).padStart(2,'0').padStart(2,'00') + '-01';
  var fim = new Date(ano, mes+1, 0).toISOString().slice(0,10);
  var query = aplicarFiltroUsuario(sb.from('tarefas').select('*'));
  var res = await query.gte('data', inicio).lte('data', fim).order('data', {ascending:true});
  if(res.error){ console.error('Erro ao carregar tarefas do mês', res.error); return []; }
  return res.data.map(tarefaFromDb);
}

async function loadTodasTarefas(filtros){
  var query = aplicarFiltroUsuario(sb.from('tarefas').select('*'));

  if(filtros.status === 'pendentes') query = query.eq('concluida', false);
  else if(filtros.status === 'concluidas') query = query.eq('concluida', true);
  else if(filtros.status === 'atrasadas') query = query.eq('concluida', false).lt('data', todayStr());
  else if(filtros.status === 'hoje') query = query.eq('data', todayStr());
  else if(filtros.status === 'proximos7'){
    var d7 = new Date(); d7.setDate(d7.getDate() + 7);
    query = query.eq('concluida', false).gte('data', todayStr()).lte('data', d7.toISOString().slice(0,10));
  }
  if(filtros.categoria) query = query.eq('categoria', filtros.categoria);
  if(filtros.prioridade) query = query.eq('prioridade', filtros.prioridade);
  query = query.order('data', {ascending:true});

  var res = await query;
  if(res.error){ console.error('Erro ao carregar tarefas', res.error); return []; }
  return res.data.map(tarefaFromDb);
}

var buscaTarefaTexto = '';
var tarefasExpandidasPan = {};

async function renderTarefasView(){
  var lista = document.getElementById('tarefas-lista-panorama');
  lista.innerHTML = '<p class="anexo-vazio">Carregando tarefas...</p>';

  var filtros = {
    status: document.getElementById('filtro-tarefa-status').value,
    categoria: document.getElementById('filtro-tarefa-categoria').value,
    prioridade: document.getElementById('filtro-tarefa-prioridade').value
  };

  var todasTarefas = await loadTodasTarefas(filtros);

  var termo = buscaTarefaTexto.trim().toLowerCase();
  if(termo){
    todasTarefas = todasTarefas.filter(function(t){
      return t.titulo.toLowerCase().indexOf(termo) !== -1 ||
             (t.descricao && t.descricao.toLowerCase().indexOf(termo) !== -1);
    });
  }

  if(todasTarefas.length === 0){
    lista.innerHTML = '<p class="anexo-vazio">Nenhuma tarefa encontrada para os filtros selecionados.</p>';
    return;
  }

  var hoje = todayStr();
  var d7 = new Date(); d7.setDate(d7.getDate() + 7);
  var d7str = d7.toISOString().slice(0,10);

  var atrasadas = todasTarefas.filter(function(t){ return !t.concluida && t.data < hoje; });
  var deHoje = todasTarefas.filter(function(t){ return t.data === hoje; });
  var proximas = todasTarefas.filter(function(t){ return !t.concluida && t.data > hoje && t.data <= d7str; });
  var futuras = todasTarefas.filter(function(t){ return !t.concluida && t.data > d7str; });
  var concluidas = todasTarefas.filter(function(t){ return t.concluida; });

  var grupos = [];
  if(filtros.status === 'todas' || filtros.status === 'atrasadas'){
    if(atrasadas.length) grupos.push({ titulo:'🔴 Atrasadas', tarefas: atrasadas, cor:'var(--red)' });
  }
  if(filtros.status === 'todas' || filtros.status === 'hoje' || filtros.status === 'pendentes'){
    if(deHoje.length) grupos.push({ titulo:'🟡 Hoje', tarefas: deHoje, cor:'var(--amber-dark)' });
  }
  if(filtros.status === 'todas' || filtros.status === 'proximos7' || filtros.status === 'pendentes'){
    if(proximas.length) grupos.push({ titulo:'🔵 Próximos 7 dias', tarefas: proximas, cor:'var(--blue)' });
  }
  if(filtros.status === 'todas' || filtros.status === 'pendentes'){
    if(futuras.length) grupos.push({ titulo:'⬜ Futuras', tarefas: futuras, cor:'var(--ink-soft)' });
  }
  if(filtros.status === 'todas' || filtros.status === 'concluidas'){
    if(concluidas.length) grupos.push({ titulo:'✅ Concluídas', tarefas: concluidas, cor:'var(--green)' });
  }

  if(grupos.length === 0){
    lista.innerHTML = '<p class="anexo-vazio">Nenhuma tarefa encontrada para os filtros selecionados.</p>';
    return;
  }

  function fmtDataCompleta(dataStr){
    var d = new Date(dataStr + 'T00:00:00');
    return d.getDate() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
  }

  function buildLinhaHtml(t){
    var dataStr = t.data;
    var dataAtrasada = !t.concluida && dataStr < hoje;
    var dataHoje = dataStr === hoje;
    var dataClasse = dataAtrasada ? 'tarefa-lista-data-atrasada' : (dataHoje ? 'tarefa-lista-data-hoje' : '');
    var checklistInfo = t.checklist && t.checklist.length > 0
      ? t.checklist.filter(function(c){return c.concluido;}).length + '/' + t.checklist.length + ' itens'
      : '';

    function fmtDataCompleta(dataStr){
      var d = new Date(dataStr + 'T00:00:00');
      return d.getDate() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
    }

    // Checklist HTML
    var checklistHtml = '<p class="tarefa-secao-label">Checklist</p>';
    if(t.checklist && t.checklist.length > 0){
      checklistHtml += t.checklist.map(function(item, idx){
        return '<div class="checklist-item">' +
          '<div class="checklist-check' + (item.concluido ? ' marcada' : '') + '" data-pan-cl-check data-tarefa-id="' + t.id + '" data-cl-idx="' + idx + '">' + (item.concluido ? '✓' : '') + '</div>' +
          '<span class="checklist-texto' + (item.concluido ? ' riscado' : '') + '">' + escapeHtml(item.texto) + '</span>' +
          '<button class="checklist-del" data-pan-cl-del data-tarefa-id="' + t.id + '" data-cl-idx="' + idx + '" title="Remover">✕</button>' +
        '</div>';
      }).join('');
    } else {
      checklistHtml += '<p class="anexo-vazio">Nenhum item ainda.</p>';
    }
    checklistHtml += '<div class="add-checklist-row">' +
      '<input type="text" id="pan-cl-input-' + t.id + '" class="campo-padrao campo-padrao-flex" placeholder="Adicionar item...">' +
      '<button class="btn-ghost" style="font-size:12px;" data-pan-cl-add data-tarefa-id="' + t.id + '">+ Adicionar</button>' +
    '</div>';

    // Anexos HTML
    var anexosHtml = '<p class="tarefa-secao-label">Anexos</p>';
    if(t.anexos && t.anexos.length > 0){
      anexosHtml += t.anexos.map(function(a, idx){
        return '<div class="tarefa-anexo-item">' +
          '<span class="tarefa-anexo-link" data-pan-anx-abrir data-tarefa-id="' + t.id + '" data-anx-idx="' + idx + '">📎 ' + escapeHtml(a.nome) + '</span>' +
          '<span style="color:var(--ink-faint);font-size:11px;">(' + fmtTamanho(a.tamanho) + ')</span>' +
          '<button class="tarefa-del" data-pan-anx-del data-tarefa-id="' + t.id + '" data-anx-idx="' + idx + '" title="Excluir">✕</button>' +
        '</div>';
      }).join('');
    } else {
      anexosHtml += '<p class="anexo-vazio">Nenhum arquivo anexado.</p>';
    }
    anexosHtml += '<div class="anexo-drop-area pan-drop-area" data-tarefa-id="' + t.id + '" style="margin-top:6px; padding:10px;">' +
      '<input type="file" class="pan-file-input" data-tarefa-id="' + t.id + '">' +
      '📎 Arraste ou clique para anexar' +
    '</div>';

    // Histórico da tarefa
    var historicoHtml = '';
    if(t.historico && t.historico.length > 0){
      historicoHtml = '<div class="historico-tarefa">';
      historicoHtml += '<p class="tarefa-secao-label">Histórico</p>';
      historicoHtml += t.historico.map(function(h){
        if(h.tipo === 'criacao'){
          return '<div class="historico-item historico-tipo-criacao">' +
            '<div><span class="hist-tipo">Criada</span> por ' + escapeHtml(h.nome) +
            ' <span class="hist-data">· ' + fmtDateBR(h.data) + '</span></div>' +
          '</div>';
        }
        if(h.tipo === 'transferencia'){
          return '<div class="historico-item historico-tipo-transferencia">' +
            '<div><span class="hist-tipo">Transferida</span> de ' + escapeHtml(h.de_nome) +
            ' para <strong>' + escapeHtml(h.para_nome) + '</strong>' +
            (h.feito_por ? ' por ' + escapeHtml(h.feito_por) : '') +
            ' <span class="hist-data">· ' + fmtDateBR(h.data) + '</span></div>' +
          '</div>';
        }
        return '';
      }).join('');
      historicoHtml += '</div>';
    }

    // Botão de transferência (só para admin)
    var transferirHtml = '';
    if(papelAtual === 'admin' && equipeAtual && Object.keys(membrosDaEquipe).length > 1){
      var outrosMembros = Object.entries(membrosDaEquipe).filter(function(e){ return e[0] !== t.userId; });
      if(outrosMembros.length > 0){
        transferirHtml =
          '<button class="btn-ghost" style="font-size:12px; padding:5px 10px;" data-abrir-transferir="' + t.id + '">↔ Transferir</button>' +
          '<div id="form-transferir-' + t.id + '" style="display:none;" class="form-transferencia">' +
            '<p class="tarefa-secao-label" style="margin-top:0;">Transferir para</p>' +
            '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">' +
              '<select id="sel-transferir-' + t.id + '" style="flex:1;" class="campo-padrao">' +
                outrosMembros.map(function(e){
                  return '<option value="' + e[0] + '">' + escapeHtml(e[1]) + '</option>';
                }).join('') +
              '</select>' +
              '<button class="btn-primary" style="font-size:13px;" data-confirmar-transferir="' + t.id + '">Transferir</button>' +
              '<button class="btn-ghost" style="font-size:13px;" data-cancelar-transferir="' + t.id + '">Cancelar</button>' +
            '</div>' +
          '</div>';
      }
    }

    var detalheHtml =
      '<div class="tarefa-lista-detalhe" id="pan-det-' + t.id + '" style="display:none; padding:12px 14px 14px 50px; border-top:1px solid var(--line);">' +
        (t.descricao ? '<p style="font-size:13px; color:var(--ink-soft); margin:0 0 12px;">' + escapeHtml(t.descricao) + '</p>' : '') +
        '<div class="row2" style="align-items:start;">' +
          '<div>' + checklistHtml + '</div>' +
          '<div>' + anexosHtml + '</div>' +
        '</div>' +
        '<div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">' +
          '<button class="btn-ghost" style="font-size:12px; padding:5px 10px;" data-pan-edit-id="' + t.id + '">✏️ Editar</button>' +
          transferirHtml +
        '</div>' +
        historicoHtml +
        '<div id="pan-form-edit-' + t.id + '" style="display:none; margin-top:10px; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:12px;"></div>' +
      '</div>';

    return '<div class="tarefa-lista-wrapper" data-tid="' + t.id + '">' +
      '<div class="tarefa-lista-row' + (t.concluida ? ' concluida' : '') + '" data-tarefa-id="' + t.id + '" data-tarefa-data="' + dataStr + '">' +
        '<div class="tarefa-lista-check' + (t.concluida ? ' marcada' : '') + '" data-check-pan="' + t.id + '">' + (t.concluida ? '✓' : '') + '</div>' +
        '<div class="tarefa-lista-corpo">' +
          '<p class="tarefa-lista-titulo">' + escapeHtml(t.titulo) + '</p>' +
          '<div class="tarefa-lista-meta">' +
            '<span class="' + dataClasse + '">' + (dataAtrasada ? '⚠ ' : '') + fmtDataCompleta(dataStr) + '</span>' +
            '<span>' + t.categoria + '</span>' +
            (papelAtual === 'admin' && !filtroVendedorId && t.userId && membrosDaEquipe[t.userId] ? '<span class="badge-vendedor">👤 ' + escapeHtml(membrosDaEquipe[t.userId]) + '</span>' : '') +
            (t.prioridade !== 'normal' ? '<span style="color:' + (t.prioridade === 'urgente' ? 'var(--red)' : '#856404') + '; font-weight:700;">' + t.prioridade + '</span>' : '') +
            (t.descricao ? '<span>' + escapeHtml(t.descricao.slice(0,50)) + (t.descricao.length > 50 ? '…' : '') + '</span>' : '') +
            (checklistInfo ? '<span>☑ ' + checklistInfo + '</span>' : '') +
            (t.anexos && t.anexos.length > 0 ? '<span>📎 ' + t.anexos.length + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="tarefa-lista-acoes">' +
          '<button class="btn-ghost" style="font-size:12px; padding:4px 8px;" data-abrir-cal="' + dataStr + '" title="Ver no calendário">📅</button>' +
          '<button class="tarefa-del" data-del-pan="' + t.id + '" title="Excluir">✕</button>' +
        '</div>' +
      '</div>' +
      detalheHtml +
    '</div>';
  }

  lista.innerHTML = grupos.map(function(g){
    return '<div class="tarefas-grupo">' +
      '<div class="tarefas-grupo-titulo" style="color:' + g.cor + ';">' + g.titulo + ' <span class="badge-count">' + g.tarefas.length + '</span></div>' +
      g.tarefas.map(buildLinhaHtml).join('') +
    '</div>';
  }).join('');

  // Restaurar estado expandido
  Object.keys(tarefasExpandidasPan).forEach(function(tid){
    if(tarefasExpandidasPan[tid]){
      var det = document.getElementById('pan-det-' + tid);
      if(det) det.style.display = 'block';
    }
  });

  // Expandir ao clicar na row (mas não em botões)
  lista.querySelectorAll('.tarefa-lista-row').forEach(function(row){
    row.addEventListener('click', function(e){
      if(e.target.closest('button') || e.target.closest('[data-check-pan]')) return;
      var tid = row.getAttribute('data-tarefa-id');
      var det = document.getElementById('pan-det-' + tid);
      if(!det) return;
      var aberto = det.style.display !== 'none';
      det.style.display = aberto ? 'none' : 'block';
      tarefasExpandidasPan[tid] = !aberto;
    });
  });

  // Check — concluir/reabrir
  lista.querySelectorAll('[data-check-pan]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-check-pan');
      btn.textContent = '...';
      var res = await sb.from('tarefas').select('*').eq('id', tid).single();
      if(res.error) return;
      var tarefa = tarefaFromDb(res.data);
      tarefa.concluida = !tarefa.concluida;
      await atualizarTarefa(tarefa);
      renderTarefasView();
      carregarNotificacoes();
    });
  });

  // Excluir
  lista.querySelectorAll('[data-del-pan]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var ok = await customConfirm('Essa ação não pode ser desfeita.', 'Excluir esta tarefa?');
      if(!ok) return;
      await excluirTarefa(btn.getAttribute('data-del-pan'));
      toast('Tarefa excluída.', 'sucesso');
      renderTarefasView();
    });
  });

  // Abrir no calendário
  lista.querySelectorAll('[data-abrir-cal]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var dataStr = btn.getAttribute('data-abrir-cal');
      var d = new Date(dataStr + 'T00:00:00');
      calendarioRef = new Date(d.getFullYear(), d.getMonth(), 1);
      diaSelecionado = dataStr;
      switchTab('calendario');
      await renderCalendario();
      await renderDetalheDoDia(dataStr);
    });
  });

  // Checklist — adicionar
  lista.querySelectorAll('[data-pan-cl-add]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-tarefa-id');
      var input = document.getElementById('pan-cl-input-' + tid);
      var val = input ? input.value.trim() : '';
      if(!val) return;
      var res = await sb.from('tarefas').select('*').eq('id', tid).single();
      if(res.error) return;
      var tarefa = tarefaFromDb(res.data);
      tarefa.checklist.push({ id: Date.now().toString(), texto: val, concluido: false });
      await atualizarTarefa(tarefa);
      tarefasExpandidasPan[tid] = true;
      renderTarefasView();
    });
  });

  // Checklist — marcar/desmarcar
  lista.querySelectorAll('[data-pan-cl-check]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-tarefa-id');
      var idx = Number(btn.getAttribute('data-cl-idx'));
      var res = await sb.from('tarefas').select('*').eq('id', tid).single();
      if(res.error) return;
      var tarefa = tarefaFromDb(res.data);
      if(!tarefa.checklist[idx]) return;
      tarefa.checklist[idx].concluido = !tarefa.checklist[idx].concluido;
      await atualizarTarefa(tarefa);
      tarefasExpandidasPan[tid] = true;
      renderTarefasView();
    });
  });

  // Checklist — remover
  lista.querySelectorAll('[data-pan-cl-del]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-tarefa-id');
      var idx = Number(btn.getAttribute('data-cl-idx'));
      var res = await sb.from('tarefas').select('*').eq('id', tid).single();
      if(res.error) return;
      var tarefa = tarefaFromDb(res.data);
      tarefa.checklist.splice(idx, 1);
      await atualizarTarefa(tarefa);
      tarefasExpandidasPan[tid] = true;
      renderTarefasView();
    });
  });

  // Anexos — abrir
  lista.querySelectorAll('[data-pan-anx-abrir]').forEach(function(el){
    el.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = el.getAttribute('data-tarefa-id');
      var idx = Number(el.getAttribute('data-anx-idx'));
      var res = await sb.from('tarefas').select('*').eq('id', tid).single();
      if(res.error) return;
      var tarefa = tarefaFromDb(res.data);
      if(!tarefa.anexos[idx]) return;
      await abrirAnexoTarefa(tarefa.anexos[idx]);
    });
  });

  // Anexos — excluir
  lista.querySelectorAll('[data-pan-anx-del]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-tarefa-id');
      var idx = Number(btn.getAttribute('data-anx-idx'));
      var ok = await customConfirm('Essa ação não pode ser desfeita.', 'Excluir este arquivo?');
      if(!ok) return;
      var res = await sb.from('tarefas').select('*').eq('id', tid).single();
      if(res.error) return;
      var tarefa = tarefaFromDb(res.data);
      if(!tarefa.anexos[idx]) return;
      await excluirAnexoTarefa(tarefa, tarefa.anexos[idx]);
      tarefasExpandidasPan[tid] = true;
      renderTarefasView();
    });
  });

  // Anexos — upload
  lista.querySelectorAll('.pan-drop-area').forEach(function(dropArea){
    var tid = dropArea.getAttribute('data-tarefa-id');
    var input = dropArea.querySelector('.pan-file-input');
    async function enviarArquivo(file){
      dropArea.textContent = 'Enviando...';
      var res = await sb.from('tarefas').select('*').eq('id', tid).single();
      if(res.error) return;
      var tarefa = tarefaFromDb(res.data);
      await uploadAnexoTarefa(tarefa, file);
      tarefasExpandidasPan[tid] = true;
      renderTarefasView();
    }
    input.addEventListener('change', async function(e){
      e.stopPropagation();
      if(input.files[0]) await enviarArquivo(input.files[0]);
    });
    setupDropArea(dropArea, enviarArquivo);
  });

  // Editar tarefa
  lista.querySelectorAll('[data-pan-edit-id]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-pan-edit-id');
      var formDiv = document.getElementById('pan-form-edit-' + tid);
      if(formDiv.style.display !== 'none'){ formDiv.style.display = 'none'; return; }
      var res = await sb.from('tarefas').select('*').eq('id', tid).single();
      if(res.error) return;
      var tarefa = tarefaFromDb(res.data);
      formDiv.style.display = 'block';
      formDiv.innerHTML =
        '<div class="field"><label>Título *</label><input type="text" id="pedt-titulo-' + tid + '" value="' + escapeHtml(tarefa.titulo) + '"></div>' +
        '<div class="row2">' +
          '<div class="field"><label>Data</label><input type="date" id="pedt-data-' + tid + '" value="' + tarefa.data + '"></div>' +
          '<div class="field"><label>Prioridade</label><select id="pedt-prior-' + tid + '">' +
            '<option value="normal"' + (tarefa.prioridade==='normal'?' selected':'') + '>Normal</option>' +
            '<option value="alta"' + (tarefa.prioridade==='alta'?' selected':'') + '>Alta</option>' +
            '<option value="urgente"' + (tarefa.prioridade==='urgente'?' selected':'') + '>Urgente</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="field"><label>Categoria</label><select id="pedt-cat-' + tid + '">' +
          '<option value="administrativo"' + (tarefa.categoria==='administrativo'?' selected':'') + '>Administrativo</option>' +
          '<option value="financeiro"' + (tarefa.categoria==='financeiro'?' selected':'') + '>Financeiro</option>' +
          '<option value="visita"' + (tarefa.categoria==='visita'?' selected':'') + '>Visita</option>' +
          '<option value="outro"' + (tarefa.categoria==='outro'?' selected':'') + '>Outro</option>' +
        '</select></div>' +
        '<div class="field"><label>Notas</label><textarea id="pedt-desc-' + tid + '">' + escapeHtml(tarefa.descricao) + '</textarea></div>' +
        '<div style="display:flex; gap:8px;">' +
          '<button class="btn-primary" style="font-size:13px;" id="pedt-salvar-' + tid + '">Salvar</button>' +
          '<button class="btn-ghost" style="font-size:13px;" id="pedt-cancelar-' + tid + '">Cancelar</button>' +
        '</div>';

      document.getElementById('pedt-cancelar-' + tid).addEventListener('click', function(){ formDiv.style.display = 'none'; });
      document.getElementById('pedt-salvar-' + tid).addEventListener('click', async function(){
        var novoTitulo = document.getElementById('pedt-titulo-' + tid).value.trim();
        if(!novoTitulo){ toast('O título não pode ser vazio.', 'erro'); return; }
        this.disabled = true; this.textContent = 'Salvando...';
        tarefa.titulo = novoTitulo;
        tarefa.data = document.getElementById('pedt-data-' + tid).value || tarefa.data;
        tarefa.prioridade = document.getElementById('pedt-prior-' + tid).value;
        tarefa.categoria = document.getElementById('pedt-cat-' + tid).value;
        tarefa.descricao = document.getElementById('pedt-desc-' + tid).value.trim();
        await atualizarTarefa(tarefa);
        toast('Tarefa atualizada!', 'sucesso');
        tarefasExpandidasPan[tid] = true;
        renderTarefasView();
      });
    });
  });

  lista.querySelectorAll('[data-abrir-transferir]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-abrir-transferir');
      var form = document.getElementById('form-transferir-' + tid);
      if(form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
  });

  lista.querySelectorAll('[data-cancelar-transferir]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-cancelar-transferir');
      var form = document.getElementById('form-transferir-' + tid);
      if(form) form.style.display = 'none';
    });
  });

  lista.querySelectorAll('[data-confirmar-transferir]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-confirmar-transferir');
      var sel = document.getElementById('sel-transferir-' + tid);
      if(!sel) return;
      var novoUserId = sel.value;
      var novoNome = membrosDaEquipe[novoUserId] || 'Desconhecido';
      btn.disabled = true;
      btn.textContent = 'Transferindo...';
      var res = await sb.from('tarefas').select('*').eq('id', tid).single();
      if(res.error){ toast('Erro ao carregar tarefa.', 'erro'); return; }
      var tarefa = tarefaFromDb(res.data);
      await transferirTarefa(tarefa, novoUserId, novoNome);
      toast('Tarefa transferida para ' + novoNome + '!', 'sucesso');
      tarefasExpandidasPan[tid] = true;
      renderTarefasView();
    });
  });
}

async function criarTarefa(tarefa){
  var nomeCreator = membrosDaEquipe[currentUserId] || 'Usuário';
  var historicoInicial = [{
    tipo: 'criacao',
    user_id: currentUserId,
    nome: nomeCreator,
    data: todayStr()
  }];
  var res = await sb.from('tarefas').insert({
    user_id: getUserIdParaSalvar(),
    equipe_id: equipeAtual ? equipeAtual.id : null,
    titulo: tarefa.titulo,
    descricao: tarefa.descricao || null,
    data: tarefa.data,
    prioridade: tarefa.prioridade || 'normal',
    categoria: tarefa.categoria || 'administrativo',
    concluida: false,
    historico: historicoInicial
  }).select().single();
  if(res.error){ console.error('Erro ao criar tarefa', res.error); showSyncError(); return null; }
  return tarefaFromDb(res.data);
}

async function atualizarTarefa(tarefa){
  var res = await sb.from('tarefas').update({
    titulo: tarefa.titulo,
    descricao: tarefa.descricao || null,
    data: tarefa.data,
    prioridade: tarefa.prioridade,
    categoria: tarefa.categoria,
    concluida: tarefa.concluida,
    checklist: tarefa.checklist || [],
    anexos: tarefa.anexos || [],
    historico: tarefa.historico || [],
    user_id: tarefa.userId
  }).eq('id', tarefa.id);
  if(res.error){ console.error('Erro ao atualizar tarefa', res.error); showSyncError(); }
}

async function transferirTarefa(tarefa, novoUserId, novoNome){
  var nomeAtual = membrosDaEquipe[tarefa.userId] || 'Desconhecido';
  var evento = {
    tipo: 'transferencia',
    de_user_id: tarefa.userId,
    de_nome: nomeAtual,
    para_user_id: novoUserId,
    para_nome: novoNome,
    data: todayStr(),
    feito_por: membrosDaEquipe[currentUserId] || 'Admin'
  };
  tarefa.historico = tarefa.historico || [];
  tarefa.historico.push(evento);
  tarefa.userId = novoUserId;
  await atualizarTarefa(tarefa);
}

async function uploadFotoEquipe(file){
  if(!file) return null;
  if(file.size > 2 * 1024 * 1024){
    toast('A foto deve ter no máximo 2MB.', 'erro');
    return null;
  }
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
    toast('Use uma imagem JPG, PNG ou WebP.', 'erro');
    return null;
  }
  var caminho = 'equipes/' + equipeAtual.id + '/perfil.' + file.name.split('.').pop();
  var res = await sb.storage.from('fotos-equipe').upload(caminho, file, { upsert: true });
  if(res.error){
    toast('Erro ao enviar a foto: ' + res.error.message, 'erro');
    return null;
  }
  var publicUrl = sb.storage.from('fotos-equipe').getPublicUrl(caminho).data.publicUrl;
  var resUpdate = await sb.from('equipes').update({ foto_url: publicUrl }).eq('id', equipeAtual.id);
  if(resUpdate.error){
    toast('Foto enviada mas erro ao salvar o link.', 'erro');
    return null;
  }
  equipeAtual.foto_url = publicUrl;
  return publicUrl;
}

async function excluirTarefa(id){
  var res = await sb.from('tarefas').delete().eq('id', id).eq('user_id', currentUserId);
  if(res.error){ console.error('Erro ao excluir tarefa', res.error); showSyncError(); }
}

async function loadLancamentosDoMes(ano, mes){
  var inicio = ano + '-' + String(mes+1).padStart(2,'0') + '-01';
  var fim = new Date(ano, mes+1, 0).toISOString().slice(0,10);
  var query = aplicarFiltroUsuario(sb.from('lancamentos_diarios').select('*'));
  var res = await query.gte('data', inicio).lte('data', fim).order('data', {ascending:false});
  if(res.error){ console.error('Erro ao carregar lançamentos', res.error); return []; }
  return res.data.map(function(r){
    return { id:r.id, data:String(r.data).slice(0,10), valor:Number(r.valor)||0, descricao:r.descricao||'' };
  });
}

async function criarLancamento(data, valor, descricao){
  var res = await sb.from('lancamentos_diarios').insert({
    user_id: getUserIdParaSalvar(),
    equipe_id: equipeAtual ? equipeAtual.id : null,
    data: data,
    valor: valor,
    descricao: descricao || null
  }).select().single();
  if(res.error){ console.error('Erro ao criar lançamento', res.error); showSyncError(); return null; }
  return { id:res.data.id, data:res.data.data, valor:Number(res.data.valor)||0, descricao:res.data.descricao||'' };
}

async function excluirLancamento(id){
  var res = await sb.from('lancamentos_diarios').delete().eq('id', id);
  if(res.error){ console.error('Erro ao excluir lançamento', res.error); showSyncError(); }
}

async function salvarSabadosUteis(sabados){
  var uidSalvar = getUserIdParaSalvar();
  var res = await sb.from('configuracoes').upsert({
    user_id: uidSalvar,
    equipe_id: equipeAtual ? equipeAtual.id : null,
    limites_etapa: limitesEtapa,
    meta_mensal: 0,
    sabados_uteis: sabados
  });
  if(res.error){ console.error('Erro ao salvar sábados', res.error); showSyncError(); }
}

async function loadMetasMensais(ano){
  var query = aplicarFiltroUsuario(sb.from('metas_mensais').select('*'));
  var res = await query.eq('ano', ano).order('mes', {ascending:true});
  if(res.error){ console.error('Erro ao carregar metas mensais', res.error); return []; }
  return res.data.map(function(r){ return {mes: r.mes, valor: Number(r.valor)||0}; });
}

async function salvarMetaMensal(ano, mes, valor){
  var uidSalvar = getUserIdParaSalvar();
  await sb.from('metas_mensais').delete()
    .eq('user_id', uidSalvar)
    .eq('ano', Number(ano))
    .eq('mes', Number(mes));

  if(!valor || valor <= 0) return true;

  var res = await sb.from('metas_mensais').insert({
    user_id: uidSalvar,
    ano: Number(ano),
    mes: Number(mes),
    valor: Number(valor),
    equipe_id: equipeAtual ? equipeAtual.id : null
  });

  if(res.error){
    console.error('Erro ao salvar meta mensal', res.error);
    showSyncError();
    return false;
  }
  return true;
}

async function loadLancamentosDoAno(ano){
  var inicio = ano + '-01-01';
  var fim = ano + '-12-31';
  var query = aplicarFiltroUsuario(sb.from('lancamentos_diarios').select('*'));
  var res = await query.gte('data', inicio).lte('data', fim).order('data', {ascending:true});
  if(res.error){ console.error('Erro ao carregar lançamentos do ano', res.error); return []; }
  return res.data.map(function(r){
    return { id:r.id, data:String(r.data).slice(0,10), valor:Number(r.valor)||0, descricao:r.descricao||'' };
  });
}

// ---------- Configurações (limites de tempo por etapa) ----------

async function loadConfiguracoes(){
  var query = sb.from('configuracoes').select('*');
  if(equipeAtual){
    query = query.eq('equipe_id', equipeAtual.id);
  } else {
    query = query.eq('user_id', currentUserId);
  }
  var res = await query.maybeSingle();
  if(res.error){ console.error('Erro ao carregar configurações', res.error); return; }
  if(res.data && res.data.limites_etapa){
    limitesEtapa = res.data.limites_etapa;
    metaMensal = 0;
    sabadosUteis = Array.isArray(res.data.sabados_uteis) ? res.data.sabados_uteis : [];
  } else {
    // primeiro acesso: cria a linha de configuração com os valores padrão
    await sb.from('configuracoes').insert({
      user_id: currentUserId,
      equipe_id: equipeAtual ? equipeAtual.id : null,
      limites_etapa: limitesEtapa,
      meta_mensal: metaMensal
    });
  }
}

async function loadEquipe(){
  var res = await sb.from('membros_equipe')
    .select('*, equipes(*)')
    .eq('user_id', currentUserId)
    .eq('ativo', true)
    .maybeSingle();
  if(res.error){ console.error('Erro ao carregar equipe', res.error); return null; }
  if(!res.data) return null;
  equipeAtual = res.data.equipes;
  papelAtual = res.data.papel;
  return res.data;
}

async function renderEquipeView(){
  if(papelAtual !== 'admin') return;

  var container = document.getElementById('equipe-container');
  container.innerHTML = '<p class="anexo-vazio">Carregando equipe...</p>';

  var res = await sb.from('membros_equipe')
    .select('*')
    .eq('equipe_id', equipeAtual.id)
    .eq('ativo', true)
    .order('created_at', {ascending:true});

  if(res.error){ container.innerHTML = '<p class="anexo-vazio">Erro ao carregar membros.</p>'; return; }
  var membros = res.data;

  var html = '';

  // Linha 1: cabeçalho da equipe (largura total)
  html += '<div style="margin-bottom:16px;">';
  html += '<div class="metas-section" style="border-left:4px solid var(--amber);">';
  html += '<div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">';
  var fotoHtml = '';
  if(equipeAtual.foto_url){
    fotoHtml = '<div style="position:relative; width:64px; height:64px; flex:0 0 64px;">' +
      '<img src="' + equipeAtual.foto_url + '?t=' + Date.now() + '" style="width:64px; height:64px; border-radius:50%; object-fit:cover; border:2px solid var(--amber);">' +
      (papelAtual === 'admin' ? '<label for="input-foto-equipe" style="position:absolute; bottom:0; right:0; background:var(--amber); color:var(--steel-dark); border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer;" title="Alterar foto">✏️</label>' : '') +
    '</div>';
  } else {
    fotoHtml = '<div style="position:relative; width:64px; height:64px; flex:0 0 64px;">' +
      '<div class="membro-avatar" style="width:64px; height:64px; font-size:24px; background:var(--amber); color:var(--steel-dark);">' + (equipeAtual.nome || 'E').slice(0,2).toUpperCase() + '</div>' +
      (papelAtual === 'admin' ? '<label for="input-foto-equipe" style="position:absolute; bottom:0; right:0; background:var(--panel); border:1px solid var(--line); color:var(--ink-soft); border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer;" title="Adicionar foto">📷</label>' : '') +
    '</div>';
  }
  html += fotoHtml;
  if(papelAtual === 'admin'){
    html += '<input type="file" id="input-foto-equipe" accept="image/jpeg,image/png,image/webp" style="display:none;">';
  }
  html += '<div style="flex:1; min-width:0;">';
  html += '<div id="equipe-nome-display" style="display:flex; align-items:center; gap:10px;">';
  html += '<h3 style="margin:0; font-family:\'Barlow Condensed\',sans-serif; font-size:22px; font-weight:800;">' + escapeHtml(equipeAtual.nome) + '</h3>';
  html += '<button class="btn-ghost" style="font-size:12px; padding:4px 8px;" id="btn-editar-nome-equipe">✏️ Editar nome</button>';
  html += '</div>';
  html += '<div id="equipe-nome-form" style="display:none; margin-top:8px;">';
  html += '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">';
  html += '<input type="text" id="input-nome-equipe" value="' + escapeHtml(equipeAtual.nome) + '" style="font-family:\'Barlow Condensed\',sans-serif; font-size:18px; font-weight:700; flex:1; min-width:160px;" class="campo-padrao">';
  html += '<button class="btn-primary" style="padding:8px 14px; font-size:13px;" id="btn-salvar-nome-equipe">Salvar</button>';
  html += '<button class="btn-ghost" style="padding:8px 14px; font-size:13px;" id="btn-cancelar-nome-equipe">Cancelar</button>';
  html += '</div>';
  html += '</div>';
  html += '<p style="margin:4px 0 0; font-size:12px; color:var(--ink-faint);">' + membros.length + ' membro(s) ativo(s)</p>';
  html += '</div>';
  html += '</div>';
  html += '</div>';
  html += '</div>';

  // Linha 2: duas colunas
  html += '<div class="metas-grid">';

  // Coluna esquerda: lista de membros
  html += '<div class="metas-section">';
  html += '<h3>Membros da equipe</h3>';
  html += membros.map(function(m){
    var iniciais = m.nome.trim().slice(0,2).toUpperCase();
    var ehEuMesmo = m.user_id === currentUserId;
    return '<div class="membro-row">' +
      '<div class="membro-avatar">' + iniciais + '</div>' +
      '<div class="membro-info">' +
        '<div class="membro-nome">' + escapeHtml(m.nome) + (ehEuMesmo ? ' <span style="font-size:10px; color:var(--ink-faint); font-weight:400;">(você)</span>' : '') + '</div>' +
        '<div class="membro-email">' + escapeHtml(m.username || m.email) + '</div>' +
      '</div>' +
      '<span class="membro-papel ' + m.papel + '">' + (m.papel === 'admin' ? 'Admin' : 'Vendedor') + '</span>' +
      '<div style="display:flex; gap:6px;">' +
        '<button class="btn-ghost" style="font-size:12px; padding:4px 8px;" data-editar-membro-id="' + m.user_id + '" data-editar-membro-nome="' + escapeHtml(m.nome) + '" data-editar-membro-username="' + escapeHtml(m.username || '') + '">✏️</button>' +
        (!ehEuMesmo ? '<button class="btn-ghost" style="font-size:12px; padding:4px 8px; color:var(--red);" data-remover-id="' + m.id + '">✕</button>' : '') +
      '</div>' +
    '</div>' +
    '<div id="form-editar-membro-' + m.user_id + '" style="display:none; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:14px; margin-bottom:8px;"></div>';
  }).join('');
  html += '</div>';

  // Coluna direita: adicionar membro
  html += '<div class="metas-section">';
  html += '<h3>Adicionar vendedor</h3>';
  html += '<p class="meta-dia-label" style="margin-bottom:14px;">Crie o acesso para um novo membro. O vendedor fará login com o nome de usuário e senha definidos aqui.</p>';
  html += field('Nome completo', '<input type="text" id="novo-membro-nome" placeholder="Ex: João Silva">');
  html += field('Nome de usuário', '<input type="text" id="novo-membro-username" placeholder="Ex: joao.silva">');
  html += '<div class="row2">';
  html += field('Senha', '<input type="password" id="novo-membro-senha" placeholder="Mínimo 6 caracteres">');
  html += field('Papel', '<select id="novo-membro-papel"><option value="vendedor">Vendedor</option><option value="admin">Administrador</option></select>');
  html += '</div>';
  html += '<button class="btn-primary" id="btn-adicionar-membro">Criar acesso</button>';
  html += '</div>';

  html += '</div>'; // fecha metas-grid

  container.innerHTML = html;

  var inputFoto = document.getElementById('input-foto-equipe');
  if(inputFoto){
    inputFoto.addEventListener('change', async function(){
      if(!inputFoto.files[0]) return;
      var label = document.querySelector('label[for="input-foto-equipe"]');
      if(label) label.textContent = '⏳';
      var url = await uploadFotoEquipe(inputFoto.files[0]);
      if(url){
        toast('Foto da equipe atualizada!', 'sucesso');
        renderEquipeView();
      }
    });
  }

  var btnEditarNome = document.getElementById('btn-editar-nome-equipe');
  var formNome = document.getElementById('equipe-nome-form');
  var displayNome = document.getElementById('equipe-nome-display');

  if(btnEditarNome){
    btnEditarNome.addEventListener('click', function(){
      formNome.style.display = 'block';
      displayNome.style.display = 'none';
    });
  }

  document.getElementById('btn-cancelar-nome-equipe').addEventListener('click', function(){
    formNome.style.display = 'none';
    displayNome.style.display = 'flex';
  });

  document.getElementById('btn-salvar-nome-equipe').addEventListener('click', async function(){
    var novoNome = document.getElementById('input-nome-equipe').value.trim();
    if(!novoNome){
      toast('O nome da equipe não pode ser vazio.', 'erro');
      return;
    }
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    var res = await sb.from('equipes').update({ nome: novoNome }).eq('id', equipeAtual.id);
    if(res.error){
      toast('Erro ao salvar o nome da equipe.', 'erro');
      btn.disabled = false;
      btn.textContent = 'Salvar';
      return;
    }
    equipeAtual.nome = novoNome;
    toast('Nome da equipe atualizado!', 'sucesso');
    renderEquipeView();
  });

  container.querySelectorAll('[data-remover-id]').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var ok = await customConfirm('O membro perderá o acesso imediatamente.', 'Remover este membro da equipe?');
      if(!ok) return;
      await sb.from('membros_equipe').update({ ativo: false }).eq('id', btn.getAttribute('data-remover-id'));
      toast('Membro removido.', 'sucesso');
      renderEquipeView();
    });
  });

  container.querySelectorAll('[data-editar-membro-id]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var uid = btn.getAttribute('data-editar-membro-id');
      var nomeAtual = btn.getAttribute('data-editar-membro-nome');
      var usernameAtual = btn.getAttribute('data-editar-membro-username');
      var ehEuMesmo = uid === currentUserId;
      var formDiv = document.getElementById('form-editar-membro-' + uid);

      if(formDiv.style.display !== 'none'){
        formDiv.style.display = 'none';
        btn.textContent = '✏️ Editar';
        return;
      }

      btn.textContent = '✕ Fechar';
      formDiv.style.display = 'block';
      formDiv.innerHTML =
        '<p style="font-size:13px; font-weight:700; margin:0 0 12px;">Editar: ' + escapeHtml(nomeAtual) + '</p>' +
        (ehEuMesmo
          ? ''
          : field('Novo nome de usuário', '<input type="text" id="em-username-' + uid + '" value="' + escapeHtml(usernameAtual) + '" placeholder="Ex: joao.silva">')
        ) +
        field('Nova senha', '<input type="password" id="em-senha-' + uid + '" placeholder="Deixe em branco para não alterar">') +
        field('Confirmar nova senha', '<input type="password" id="em-confirmar-' + uid + '" placeholder="Repita a nova senha">') +
        '<button class="btn-primary" style="font-size:13px;" id="em-salvar-' + uid + '">Salvar alterações</button>';

      document.getElementById('em-salvar-' + uid).addEventListener('click', async function(){
        var nova_senha = document.getElementById('em-senha-' + uid).value;
        var confirmar = document.getElementById('em-confirmar-' + uid).value;
        var novo_username = !ehEuMesmo && document.getElementById('em-username-' + uid)
          ? document.getElementById('em-username-' + uid).value.trim().toLowerCase()
          : null;

        if(nova_senha && nova_senha.length < 6){
          toast('A senha deve ter pelo menos 6 caracteres.', 'erro');
          return;
        }
        if(nova_senha && nova_senha !== confirmar){
          toast('As senhas não coincidem.', 'erro');
          return;
        }
        if(!nova_senha && !novo_username){
          toast('Informe ao menos um campo para alterar.', 'erro');
          return;
        }

        var btn2 = this;
        btn2.disabled = true;
        btn2.textContent = 'Salvando...';

        // Se for o próprio usuário, usa o método nativo do Supabase (mais seguro)
        if(ehEuMesmo && nova_senha){
          var res = await sb.auth.updateUser({ password: nova_senha });
          if(res.error){
            toast('Erro ao alterar senha: ' + res.error.message, 'erro');
            btn2.disabled = false;
            btn2.textContent = 'Salvar alterações';
            return;
          }
          toast('Senha alterada com sucesso!', 'sucesso');
          formDiv.style.display = 'none';
          btn.textContent = '✏️ Editar';
          return;
        }

        // Para outros usuários, chama a Edge Function
        try{
          var sessao = await sb.auth.getSession();
          var token = sessao.data.session.access_token;
          var payload = { target_user_id: uid };
          if(nova_senha) payload.nova_senha = nova_senha;
          if(novo_username) payload.novo_username = novo_username;

          var res2 = await fetch('https://atgwsmrottssynagejyw.supabase.co/functions/v1/atualizar-usuario', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(payload)
          });

          var dados = await res2.json();
          if(!res2.ok || dados.error){
            toast('Erro: ' + (dados.error || 'Não foi possível atualizar.'), 'erro');
            btn2.disabled = false;
            btn2.textContent = 'Salvar alterações';
            return;
          }

          toast(dados.mensagem || 'Dados atualizados!', 'sucesso');
          formDiv.style.display = 'none';
          btn.textContent = '✏️ Editar';
          renderEquipeView();

        }catch(err){
          toast('Erro de conexão. Tente novamente.', 'erro');
          btn2.disabled = false;
          btn2.textContent = 'Salvar alterações';
        }
      });
    });
  });

  document.getElementById('btn-adicionar-membro').addEventListener('click', async function(){
    var nome = document.getElementById('novo-membro-nome').value.trim();
    var username = document.getElementById('novo-membro-username').value.trim().toLowerCase();
    var senha = document.getElementById('novo-membro-senha').value;
    var papel = document.getElementById('novo-membro-papel').value;

    if(!nome || !username || !senha){
      toast('Preencha todos os campos.', 'erro');
      return;
    }
    if(senha.length < 6){
      toast('A senha deve ter pelo menos 6 caracteres.', 'erro');
      return;
    }
    if(!/^[a-z0-9._-]+$/.test(username)){
      toast('Nome de usuário inválido. Use apenas letras minúsculas, números, ponto, hífen ou underscore.', 'erro');
      return;
    }

    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Criando...';

    try{
      var sessao = await sb.auth.getSession();
      var token = sessao.data.session.access_token;

      var res = await fetch('https://atgwsmrottssynagejyw.supabase.co/functions/v1/criar-usuario', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          nome: nome,
          username: username,
          senha: senha,
          equipe_id: equipeAtual.id,
          papel: papel
        })
      });

      var dados = await res.json();

      if(!res.ok || dados.error){
        toast('Erro: ' + (dados.error || 'Não foi possível criar o usuário.'), 'erro');
        btn.disabled = false;
        btn.textContent = 'Criar acesso';
        return;
      }

      toast(dados.mensagem || 'Acesso criado com sucesso!', 'sucesso');
      document.getElementById('novo-membro-nome').value = '';
      document.getElementById('novo-membro-username').value = '';
      document.getElementById('novo-membro-senha').value = '';
      btn.disabled = false;
      btn.textContent = 'Criar acesso';
      renderEquipeView();
      atualizarFiltroVendedores();

    }catch(err){
      console.error('Erro ao criar usuário', err);
      toast('Erro de conexão. Tente novamente.', 'erro');
      btn.disabled = false;
      btn.textContent = 'Criar acesso';
    }
  });
}

async function loadOnboarding(){
  if(!equipeAtual) return;
  var res = await sb.from('onboarding').select('*').eq('equipe_id', equipeAtual.id).maybeSingle();
  if(res.data){
    onboardingState.etapasConcluidas = res.data.etapas_concluidas || [];
    onboardingState.dispensado = res.data.dispensado || false;
  }
}

async function salvarOnboarding(){
  if(!equipeAtual) return;
  await sb.from('onboarding').upsert({
    equipe_id: equipeAtual.id,
    etapas_concluidas: onboardingState.etapasConcluidas,
    dispensado: onboardingState.dispensado
  }, { onConflict: 'equipe_id' });
}

async function marcarEtapaOnboarding(etapaId){
  if(onboardingState.etapasConcluidas.indexOf(etapaId) === -1){
    onboardingState.etapasConcluidas.push(etapaId);
    await salvarOnboarding();
  }
}

function abrirOnboarding(){
  var existente = document.getElementById('onboarding-overlay');
  if(existente) existente.remove();

  var concluidas = onboardingState.etapasConcluidas;
  var total = ONBOARDING_ETAPAS.length;
  var qtdConcluidas = ONBOARDING_ETAPAS.filter(function(e){ return concluidas.indexOf(e.id) !== -1; }).length;
  var pct = Math.round((qtdConcluidas / total) * 100);

  var overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.className = 'onboarding-overlay';

  var etapasHtml = ONBOARDING_ETAPAS.map(function(etapa){
    var feita = concluidas.indexOf(etapa.id) !== -1;
    var clicavel = etapa.acao;
    return '<div class="onboarding-etapa ' + (feita ? 'concluida' : 'pendente') + '"' +
      (clicavel ? ' data-onb-acao="' + etapa.acao + '" data-onb-id="' + etapa.id + '" style="cursor:pointer;"' : '') + '>' +
      '<div class="onboarding-check">' + (feita ? '✓' : '○') + '</div>' +
      '<div class="onboarding-etapa-info">' +
        '<p class="onboarding-etapa-titulo">' + etapa.titulo + '</p>' +
        '<p class="onboarding-etapa-desc">' + etapa.desc + '</p>' +
      '</div>' +
      (clicavel ? '<span class="onboarding-etapa-acao">' + (feita ? '↗ Acessar novamente' : (etapa.acaoLabel || '')) + '</span>' : '<span class="onboarding-etapa-acao" style="color:var(--green);">✓ Concluído</span>') +
    '</div>';
  }).join('');

  overlay.innerHTML =
    '<div class="onboarding-box">' +
      '<div class="onboarding-header">' +
        '<h2 class="onboarding-titulo">🚀 Primeiros passos</h2>' +
        '<button class="btn-ghost" id="btn-fechar-onboarding" style="font-size:13px;">✕ Fechar</button>' +
      '</div>' +
      '<p class="onboarding-sub">' + qtdConcluidas + ' de ' + total + ' etapas concluídas</p>' +
      '<div class="onboarding-progresso-barra"><div class="onboarding-progresso-fill" style="width:' + pct + '%;"></div></div>' +
      etapasHtml +
      '<div class="onboarding-footer">' +
        '<button class="btn-ghost" style="font-size:12px; color:var(--ink-faint);" id="btn-dispensar-onboarding">Não mostrar novamente</button>' +
        (qtdConcluidas === total ? '<span style="font-size:13px; font-weight:700; color:var(--green);">🎉 Tudo pronto!</span>' : '<span style="font-size:12px; color:var(--ink-faint);">Clique em uma etapa para ir direto</span>') +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  document.getElementById('btn-fechar-onboarding').addEventListener('click', function(){
    overlay.remove();
  });

  document.getElementById('btn-dispensar-onboarding').addEventListener('click', async function(){
    onboardingState.dispensado = true;
    await salvarOnboarding();
    overlay.remove();
  });

  overlay.querySelectorAll('[data-onb-acao]').forEach(function(el){
    el.addEventListener('click', async function(){
      var acao = el.getAttribute('data-onb-acao');
      var etapaId = el.getAttribute('data-onb-id');
      overlay.remove();
      if(acao === 'exportar'){
        document.getElementById('btn-exportar-dados').click();
        await marcarEtapaOnboarding(etapaId);
      } else {
        switchTab(acao);
        await marcarEtapaOnboarding(etapaId);
      }
    });
  });
}

async function verificarProgressoOnboarding(){
  if(!equipeAtual || papelAtual !== 'admin') return;

  // Verificar etapas automaticamente pelo estado atual do sistema
  if(equipeAtual) await marcarEtapaOnboarding('equipe_criada');

  var resMembros = await sb.from('membros_equipe').select('id').eq('equipe_id', equipeAtual.id).eq('ativo', true);
  if(resMembros.data && resMembros.data.length > 1) await marcarEtapaOnboarding('membro_adicionado');

  var resLeads = await sb.from('leads').select('id').eq('equipe_id', equipeAtual.id).limit(1);
  if(resLeads.data && resLeads.data.length > 0) await marcarEtapaOnboarding('negocio_criado');

  var resMetas = await sb.from('metas_mensais').select('id').eq('equipe_id', equipeAtual.id).limit(1);
  if(resMetas.data && resMetas.data.length > 0) await marcarEtapaOnboarding('meta_definida');
}

async function carregarNotificacoes(){
  if(!currentUserId) return;
  var hoje = todayStr();
  var novas = [];

  // Buscar follow-ups atrasados e de hoje
  var queryLeads = sb.from('leads')
    .select('id, nome, next_follow_up, stage, user_id')
    .not('next_follow_up', 'is', null)
    .not('stage', 'in', '("fechado","perdido")')
    .lte('next_follow_up', hoje);

  if(equipeAtual && papelAtual === 'admin'){
    queryLeads = queryLeads.eq('equipe_id', equipeAtual.id);
  } else {
    queryLeads = queryLeads.eq('user_id', currentUserId);
  }

  var resLeads = await queryLeads;
  if(resLeads.data){
    resLeads.data.forEach(function(l){
      var atrasado = l.next_follow_up < hoje;
      novas.push({
        id: 'lead-' + l.id,
        tipo: atrasado ? 'atrasado' : 'hoje',
        categoria: 'followup',
        titulo: atrasado ? 'Follow-up atrasado' : 'Follow-up hoje',
        desc: l.nome,
        data: l.next_follow_up,
        vendedor: membrosDaEquipe[l.user_id] || null,
        acao: function(id){ return function(){ openModal(id); fecharNotifPainel(); }; }(l.id)
      });
    });
  }

  // Buscar tarefas atrasadas, de hoje e urgentes
  var queryTarefas = sb.from('tarefas')
    .select('id, titulo, data, prioridade, user_id')
    .eq('concluida', false);

  var condicoes = 'data.lte.' + hoje + ',prioridade.eq.urgente';

  if(equipeAtual && papelAtual === 'admin'){
    queryTarefas = queryTarefas.eq('equipe_id', equipeAtual.id);
  } else {
    queryTarefas = queryTarefas.eq('user_id', currentUserId);
  }

  var resTarefas = await queryTarefas.or('data.lte.' + hoje + ',prioridade.eq.urgente');
  if(resTarefas.data){
    resTarefas.data.forEach(function(t){
      var atrasada = t.data < hoje;
      var ehHoje = t.data === hoje;
      var urgente = t.prioridade === 'urgente';
      if(!atrasada && !ehHoje && !urgente) return;
      var tipo = atrasada ? 'atrasado' : (urgente ? 'urgente' : 'hoje');
      var titulo = atrasada ? 'Tarefa atrasada' : (urgente ? 'Tarefa urgente' : 'Tarefa para hoje');
      novas.push({
        id: 'tarefa-' + t.id,
        tipo: tipo,
        categoria: 'tarefa',
        titulo: titulo,
        desc: t.titulo,
        data: t.data,
        vendedor: membrosDaEquipe[t.user_id] || null,
        acao: function(data){ return function(){
          var d = new Date(data + 'T00:00:00');
          calendarioRef = new Date(d.getFullYear(), d.getMonth(), 1);
          diaSelecionado = data;
          switchTab('calendario');
          renderCalendario().then(function(){ renderDetalheDoDia(data); });
          fecharNotifPainel();
        }; }(t.data)
      });
    });
  }

  // Ordenar: atrasados primeiro, depois hoje, depois urgentes
  var ordem = { atrasado: 0, hoje: 1, urgente: 2 };
  novas.sort(function(a,b){ return (ordem[a.tipo]||9) - (ordem[b.tipo]||9); });

  // Tocar som se houver notificações novas
  var totalAnterior = notificacoes.length;
  notificacoes = novas;
  atualizarBadgeNotificacoes();

  // Verificar se há notificações novas em relação à última verificação
  if(novas.length > totalAnterior){
    var temUrgente = novas.some(function(n){ return n.tipo === 'urgente'; });
    var temAtrasado = novas.some(function(n){ return n.tipo === 'atrasado'; });
    if(temUrgente){
      tocarSomNotificacao('urgente');
    } else if(temAtrasado){
      tocarSomNotificacao('atrasado');
    } else {
      tocarSomNotificacao('hoje');
    }
  }
}

function atualizarBadgeNotificacoes(){
  var badge = document.getElementById('badge-notificacoes');
  var badgeSidebar = document.getElementById('badge-notif-sidebar');
  var count = notificacoes.length;
  if(count > 0){
    if(badge){ badge.textContent = count > 99 ? '99+' : count; badge.style.display = 'inline-flex'; }
    if(badgeSidebar){ badgeSidebar.textContent = count > 99 ? '99+' : count; badgeSidebar.style.display = 'inline-flex'; }
  } else {
    if(badge) badge.style.display = 'none';
    if(badgeSidebar) badgeSidebar.style.display = 'none';
  }
}

async function renderNotificacoesView(){
  var container = document.getElementById('notificacoes-container');
  container.innerHTML = '<p class="anexo-vazio">Atualizando notificações...</p>';
  await carregarNotificacoes();

  if(notificacoes.length === 0){
    container.innerHTML =
      '<div style="text-align:center; padding:48px 0;">' +
        '<div style="font-size:48px; margin-bottom:12px;">✅</div>' +
        '<p style="font-size:16px; font-weight:600; color:var(--ink);">Tudo em dia!</p>' +
        '<p style="font-size:13px; color:var(--ink-soft);">Nenhum follow-up ou tarefa pendente.</p>' +
      '</div>';
    return;
  }

  var icones = { atrasado: '⚠', hoje: '📅', urgente: '🔴' };
  var grupos = [
    { tipo: 'atrasado', label: 'Atrasados', cor: 'var(--red)' },
    { tipo: 'urgente',  label: 'Urgentes',  cor: 'var(--red)' },
    { tipo: 'hoje',     label: 'Hoje',      cor: 'var(--amber-dark)' }
  ];

  var html = '';
  grupos.forEach(function(g){
    var itens = notificacoes.filter(function(n){ return n.tipo === g.tipo; });
    if(!itens.length) return;
    html += '<div class="metas-section">';
    html += '<h3 style="color:' + g.cor + ';">' + icones[g.tipo] + ' ' + g.label + ' <span class="badge-count">' + itens.length + '</span></h3>';
    html += itens.map(function(n, idx){
      return '<div class="notif-item" style="border-radius:8px; margin-bottom:6px;" data-notif-idx="' + notificacoes.indexOf(n) + '">' +
        '<div class="notif-icone ' + n.tipo + '">' + icones[n.tipo] + '</div>' +
        '<div class="notif-corpo">' +
          '<p class="notif-titulo">' + n.titulo + '</p>' +
          '<p class="notif-desc">' + escapeHtml(n.desc) + (n.data ? ' · ' + fmtDateBR(n.data) : '') + '</p>' +
          (n.vendedor ? '<p class="notif-vendedor">👤 ' + escapeHtml(n.vendedor) + '</p>' : '') +
        '</div>' +
        '<span style="font-size:12px; color:var(--amber); font-weight:600; white-space:nowrap;">Ver →</span>' +
      '</div>';
    }).join('');
    html += '</div>';
  });

  container.innerHTML = html;

  container.querySelectorAll('.notif-item').forEach(function(el){
    el.addEventListener('click', function(){
      var idx = Number(el.getAttribute('data-notif-idx'));
      if(notificacoes[idx] && notificacoes[idx].acao) notificacoes[idx].acao();
    });
  });
}

function fecharNotifPainel(){
  var painel = document.getElementById('notif-painel');
  if(painel) painel.remove();
  painelNotifAberto = false;
}

function abrirNotifPainel(){
  fecharNotifPainel();
  if(notificacoes.length > 0) tocarSomNotificacao('nova');
  painelNotifAberto = true;

  var painel = document.createElement('div');
  painel.id = 'notif-painel';
  painel.className = 'notif-painel';

  var icones = { atrasado: '⚠', hoje: '📅', urgente: '🔴' };
  var listaHtml = notificacoes.length > 0
    ? notificacoes.map(function(n, idx){
        return '<div class="notif-item" data-notif-idx="' + idx + '">' +
          '<div class="notif-icone ' + n.tipo + '">' + (icones[n.tipo] || '●') + '</div>' +
          '<div class="notif-corpo">' +
            '<p class="notif-titulo">' + n.titulo + '</p>' +
            '<p class="notif-desc">' + escapeHtml(n.desc) + (n.data ? ' · ' + fmtDateBR(n.data) : '') + '</p>' +
            (n.vendedor ? '<p class="notif-vendedor">👤 ' + escapeHtml(n.vendedor) + '</p>' : '') +
          '</div>' +
        '</div>';
      }).join('')
    : '<div class="notif-vazio">✅ Nenhuma notificação pendente</div>';

  painel.innerHTML =
    '<div class="notif-header">' +
      '<span>🔔 Notificações' + (notificacoes.length > 0 ? ' (' + notificacoes.length + ')' : '') + '</span>' +
      '<button class="btn-ghost" style="font-size:12px; padding:4px 8px;" id="btn-fechar-notif">✕</button>' +
    '</div>' +
    '<div class="notif-lista">' + listaHtml + '</div>' +
    (notificacoes.length > 0 ? '<div class="notif-footer"><span style="font-size:11px; color:var(--ink-faint);">Clique em uma notificação para ir direto</span></div>' : '');

  document.body.appendChild(painel);

  document.getElementById('btn-fechar-notif').addEventListener('click', fecharNotifPainel);

  painel.querySelectorAll('.notif-item').forEach(function(el){
    el.addEventListener('click', function(){
      var idx = Number(el.getAttribute('data-notif-idx'));
      if(notificacoes[idx] && notificacoes[idx].acao) notificacoes[idx].acao();
    });
  });

  // Fechar ao clicar fora
  setTimeout(function(){
    document.addEventListener('click', function fecharFora(e){
      if(!painel.contains(e.target) && e.target.id !== 'btn-notificacoes'){
        fecharNotifPainel();
        document.removeEventListener('click', fecharFora);
      }
    });
  }, 100);
}

// Converte array de objetos para sheet do SheetJS
function dadosParaSheet(dados, colunas){
  var header = colunas.map(function(c){ return c.label; });
  var rows = dados.map(function(d){
    return colunas.map(function(c){ return d[c.key] !== undefined && d[c.key] !== null ? d[c.key] : ''; });
  });
  return [header].concat(rows);
}

// Gera e baixa um CSV a partir de um array 2D
function baixarCSV(dados2d, nomeArquivo){
  var csv = dados2d.map(function(row){
    return row.map(function(cel){
      var s = String(cel).replace(/"/g, '""');
      return s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 ? '"' + s + '"' : s;
    }).join(',');
  }).join('\n');
  var bom = '\uFEFF';
  var blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

async function carregarDadosParaExportacao(){
  var query1 = sb.from('leads').select('*, clientes(nome)');
  var query2 = sb.from('clientes').select('*');
  var query3 = sb.from('tarefas').select('*');
  var query4 = sb.from('lancamentos_diarios').select('*');

  if(equipeAtual){
    query1 = query1.eq('equipe_id', equipeAtual.id);
    query2 = query2.eq('equipe_id', equipeAtual.id);
    query3 = query3.eq('equipe_id', equipeAtual.id);
    query4 = query4.eq('equipe_id', equipeAtual.id);
  } else {
    query1 = query1.eq('user_id', currentUserId);
    query2 = query2.eq('user_id', currentUserId);
    query3 = query3.eq('user_id', currentUserId);
    query4 = query4.eq('user_id', currentUserId);
  }

  var results = await Promise.all([
    query1.order('created_at', {ascending:false}),
    query2.order('nome', {ascending:true}),
    query3.order('data', {ascending:false}),
    query4.order('data', {ascending:false})
  ]);

  return {
    negocios: (results[0].data || []).map(function(r){
      return {
        'Nome': r.nome || '',
        'Cliente': r.clientes ? r.clientes.nome : '',
        'Vendedor': membrosDaEquipe[r.user_id] || r.user_id || '',
        'Etapa': r.stage || '',
        'Valor (R$)': Number(r.valor) || 0,
        'Canal': r.canal || '',
        'Próximo follow-up': r.next_follow_up || '',
        'Notas': r.notas || '',
        'Criado em': r.criado || ''
      };
    }),
    clientes: (results[1].data || []).map(function(r){
      return {
        'Código': r.codigo || '',
        'Nome': r.nome || '',
        'Vendedor responsável': membrosDaEquipe[r.user_id] || r.user_id || '',
        'Tipo': r.tipo === 'fisica' ? 'Pessoa Física' : 'Pessoa Jurídica',
        'CNPJ': r.cnpj || '',
        'Telefone': r.contato || '',
        'Canal': r.canal || '',
        'Responsável': r.responsavel || '',
        'Tags': Array.isArray(r.tags) ? r.tags.join(', ') : '',
        'Criado em': r.criado || ''
      };
    }),
    tarefas: (results[2].data || []).map(function(r){
      return {
        'Título': r.titulo || '',
        'Responsável': membrosDaEquipe[r.user_id] || r.user_id || '',
        'Categoria': r.categoria || '',
        'Prioridade': r.prioridade || '',
        'Data': r.data || '',
        'Status': r.concluida ? 'Concluída' : 'Pendente',
        'Descrição': r.descricao || ''
      };
    }),
    lancamentos: (results[3].data || []).map(function(r){
      return {
        'Data': r.data || '',
        'Vendedor': membrosDaEquipe[r.user_id] || r.user_id || '',
        'Valor (R$)': Number(r.valor) || 0,
        'Descrição': r.descricao || ''
      };
    })
  };
}

async function exportarExcel(){
  var btn = document.getElementById('btn-exp-excel');
  if(btn){ btn.disabled = true; btn.textContent = 'Gerando...'; }

  if(equipeAtual && Object.keys(membrosDaEquipe).length === 0){
    await loadMembrosDaEquipe();
  }

  try{
    var dados = await carregarDadosParaExportacao();
    var wb = XLSX.utils.book_new();

    var sheets = [
      { dados: dados.negocios, nome: 'Negócios' },
      { dados: dados.clientes, nome: 'Clientes' },
      { dados: dados.tarefas, nome: 'Tarefas' },
      { dados: dados.lancamentos, nome: 'Lançamentos de Metas' }
    ];

    sheets.forEach(function(s){
      var ws = XLSX.utils.json_to_sheet(s.dados.length > 0 ? s.dados : [{}]);
      XLSX.utils.book_append_sheet(wb, ws, s.nome);
    });

    var dataHoje = todayStr();
    var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tractar-exportacao-' + dataHoje + '.xlsx';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
    toast('Excel gerado com sucesso!', 'sucesso');
    marcarEtapaOnboarding('dados_exportados');
  }catch(err){
    toast('Erro ao gerar Excel: ' + err.message, 'erro');
  }

  if(btn){ btn.disabled = false; btn.textContent = 'Baixar Excel (.xlsx)'; }
}

async function exportarCSV(){
  var btn = document.getElementById('btn-exp-csv');
  if(btn){ btn.disabled = true; btn.textContent = 'Gerando...'; }

  if(equipeAtual && Object.keys(membrosDaEquipe).length === 0){
    await loadMembrosDaEquipe();
  }

  try{
    var dados = await carregarDadosParaExportacao();
    var dataHoje = todayStr();

    var arquivos = [
      { dados: dados.negocios, nome: 'tractar-negocios-' + dataHoje + '.csv' },
      { dados: dados.clientes, nome: 'tractar-clientes-' + dataHoje + '.csv' },
      { dados: dados.tarefas, nome: 'tractar-tarefas-' + dataHoje + '.csv' },
      { dados: dados.lancamentos, nome: 'tractar-lancamentos-' + dataHoje + '.csv' }
    ];

    arquivos.forEach(function(a, i){
      setTimeout(function(){
        if(a.dados.length === 0){ baixarCSV([[]], a.nome); return; }
        var header = Object.keys(a.dados[0]);
        var rows = a.dados.map(function(d){ return header.map(function(k){ return d[k]; }); });
        baixarCSV([header].concat(rows), a.nome);
      }, i * 400);
    });

    toast('Arquivos CSV sendo baixados...', 'sucesso');
    marcarEtapaOnboarding('dados_exportados');
  }catch(err){
    toast('Erro ao gerar CSV: ' + err.message, 'erro');
  }

  if(btn){ btn.disabled = false; btn.textContent = 'Baixar CSV (4 arquivos)'; }
}

async function atualizarFiltroVendedores(){
  if(papelAtual !== 'admin' || !equipeAtual) return;
  var res = await sb.from('membros_equipe')
    .select('*')
    .eq('equipe_id', equipeAtual.id)
    .eq('ativo', true);
  if(res.error || !res.data) return;
  var sel = document.getElementById('filtro-vendedor');
  if(!sel) return;
  sel.innerHTML = '<option value="">Todos os vendedores</option>' +
    res.data.map(function(m){
      return '<option value="' + m.user_id + '">' + escapeHtml(m.nome) + '</option>';
    }).join('');
}

async function loadMembrosDaEquipe(){
  if(papelAtual !== 'admin' || !equipeAtual) return;
  var res = await sb.from('membros_equipe')
    .select('user_id, nome')
    .eq('equipe_id', equipeAtual.id)
    .eq('ativo', true);
  if(res.error || !res.data) return;
  membrosDaEquipe = {};
  res.data.forEach(function(m){
    membrosDaEquipe[m.user_id] = m.nome;
  });
}

async function salvarConfiguracoes(novosLimites, novaMeta){
  limitesEtapa = novosLimites;
  metaMensal = novaMeta;
  var uidSalvar = getUserIdParaSalvar();
  var res = await sb.from('configuracoes').upsert({
    user_id: uidSalvar,
    equipe_id: equipeAtual ? equipeAtual.id : null,
    limites_etapa: novosLimites,
    meta_mensal: 0,
    sabados_uteis: sabadosUteis
  });
  if(res.error){ console.error('Erro ao salvar configurações', res.error); showSyncError(); }
}

async function uploadAnexo(lead, file){
  if(file.size > 10 * 1024 * 1024){
    toast('Arquivo muito grande. O limite é 10MB por arquivo.', 'erro');
    return null;
  }
  var caminho = currentUserId + '/' + lead.id + '/' + Date.now() + '_' + file.name.replace(/[^\w.\-]/g, '_');
  var res = await sb.storage.from('anexos').upload(caminho, file);
  if(res.error){
    console.error('Erro ao enviar anexo', res.error);
    toast('Não foi possível enviar o arquivo. Tente novamente.', 'erro');
    return null;
  }
  var anexo = { path: caminho, nome: file.name, tamanho: file.size, enviadoEm: new Date().toISOString() };
  lead.anexos = lead.anexos || [];
  lead.anexos.push(anexo);
  await atualizarLeadNoDb(lead);
  return anexo;
}

async function excluirAnexo(lead, anexo){
  var res = await sb.storage.from('anexos').remove([anexo.path]);
  if(res.error){
    console.error('Erro ao excluir anexo', res.error);
    showSyncError();
    return;
  }
  lead.anexos = (lead.anexos || []).filter(function(a){ return a.path !== anexo.path; });
  await atualizarLeadNoDb(lead);
}

async function abrirAnexo(anexo){
  var res = await sb.storage.from('anexos').createSignedUrl(anexo.path, 60);
  if(res.error || !res.data){
    toast('Não foi possível abrir o arquivo agora.', 'erro');
    return;
  }
  window.open(res.data.signedUrl, '_blank');
}

async function abrirAnexoTarefa(anexo){
  await abrirAnexo(anexo);
}

function setupDropArea(areaEl, onFile){
  areaEl.addEventListener('dragover', function(e){
    e.preventDefault();
    e.stopPropagation();
    areaEl.classList.add('drag-over');
  });
  areaEl.addEventListener('dragleave', function(e){
    e.stopPropagation();
    areaEl.classList.remove('drag-over');
  });
  areaEl.addEventListener('drop', function(e){
    e.preventDefault();
    e.stopPropagation();
    areaEl.classList.remove('drag-over');
    var files = e.dataTransfer.files;
    if(files && files.length > 0){
      onFile(files[0]);
    }
  });
  areaEl.addEventListener('click', function(){
    var input = areaEl.querySelector('input[type="file"]');
    if(input) input.click();
  });
}

async function excluirAnexoTarefa(tarefa, anexo){
  var res = await sb.storage.from('anexos').remove([anexo.path]);
  if(res.error){
    console.error('Erro ao excluir anexo', res.error);
    showSyncError();
    return;
  }
  tarefa.anexos = (tarefa.anexos || []).filter(function(a){ return a.path !== anexo.path; });
  await atualizarTarefa(tarefa);
}

async function uploadAnexoTarefa(tarefa, file){
  if(file.size > 10 * 1024 * 1024){
    toast('Arquivo muito grande. O limite é 10MB por arquivo.', 'erro');
    return null;
  }
  var caminho = currentUserId + '/tarefas/' + tarefa.id + '/' + Date.now() + '_' + file.name.replace(/[^\w.\-]/g, '_');
  var res = await sb.storage.from('anexos').upload(caminho, file);
  if(res.error){
    console.error('Erro ao enviar anexo', res.error);
    toast('Não foi possível enviar o arquivo. Tente novamente.', 'erro');
    return null;
  }
  var anexo = { path: caminho, nome: file.name, tamanho: file.size, enviadoEm: new Date().toISOString() };
  tarefa.anexos = tarefa.anexos || [];
  tarefa.anexos.push(anexo);
  await atualizarTarefa(tarefa);
  return anexo;
}

function fmtTamanho(bytes){
  if(!bytes) return '';
  if(bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

function fmtMoney(v){
  v = Number(v) || 0;
  return 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function fmtDateBR(dateStr){
  var d = new Date(dateStr + 'T00:00:00');
  var dd = String(d.getDate()).padStart(2,'0');
  var mm = String(d.getMonth()+1).padStart(2,'0');
  return dd + '/' + mm;
}

function followUpBadge(lead){
  if(!lead.nextFollowUp){
    return '<span class="badge none">Sem follow-up</span>';
  }
  var diff = diffDays(lead.nextFollowUp);
  if(diff < 0) return '<span class="badge overdue">Atrasado ' + Math.abs(diff) + 'd</span>';
  if(diff === 0) return '<span class="badge today">Hoje</span>';
  if(diff === 1) return '<span class="badge tomorrow">Amanhã</span>';
  return '<span class="badge future">' + fmtDateBR(lead.nextFollowUp) + '</span>';
}

function diasNaEtapa(lead){
  if(!lead.etapaAlteradaEm) return 0;
  var inicio = new Date(lead.etapaAlteradaEm);
  var agora = new Date();
  return Math.floor((agora - inicio) / 86400000);
}

function tempoEtapaBadge(lead){
  if(lead.stage === 'fechado' || lead.stage === 'perdido') return '';
  var dias = diasNaEtapa(lead);
  var limites = limitesEtapa[lead.stage] || {alerta:7, critico:14};
  var cls = 'parado-ok';
  if(dias >= limites.critico) cls = 'parado-critico';
  else if(dias >= limites.alerta) cls = 'parado-alerta';
  var texto = dias === 0 ? 'Hoje nesta etapa' : (dias + (dias === 1 ? ' dia' : ' dias') + ' nesta etapa');
  return '<span class="badge-parado ' + cls + '">⏱ ' + texto + '</span>';
}

function atividadeBadge(lead){
  if(!lead.atividadeTipo) return '';
  return '<span class="badge-atividade" title="' + escapeHtml(lead.atividadeDesc || '') + '">📌 ' + escapeHtml(lead.atividadeTipo) + '</span>';
}

function maskTelefone(valor){
  var digitos = valor.replace(/\D/g, '').slice(0, 11);
  if(!digitos) return '';
  if(digitos.length <= 2) return digitos.replace(/^(\d{0,2})/, '($1');
  if(digitos.length <= 7) return digitos.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
  return digitos.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

function maskValor(valor){
  var digitos = valor.replace(/\D/g, '');
  digitos = digitos.replace(/^0+/, '');
  if(!digitos) return '';
  var numero = parseInt(digitos, 10) / 100;
  return numero.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function parseValorMascarado(valor){
  if(!valor) return 0;
  var digitos = String(valor).replace(/\D/g, '');
  if(!digitos) return 0;
  return parseInt(digitos, 10) / 100;
}

function formatValorParaInput(numero){
  if(!numero) return '';
  return Math.round(Number(numero)).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function isDesktopDevice(){
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildWaLink(lead){
  var digits = String(lead.contato || '').replace(/\D/g,'');
  if(!digits) return null;
  // Adiciona DDI do Brasil (55) se o número não vier com ele
  if(digits.length <= 11) digits = '55' + digits;
  var msg = 'Olá ' + (lead.nome || '') + ', aqui é da loja. Podemos conversar sobre seu orçamento?';
  var textoCodificado = encodeURIComponent(msg);
  // No computador, tenta abrir o aplicativo desktop instalado (protocolo whatsapp://)
  // No celular, usa wa.me, que abre o app nativo automaticamente
  if(isDesktopDevice()){
    return 'whatsapp://send?phone=' + digits + '&text=' + textoCodificado;
  }
  return 'https://wa.me/' + digits + '?text=' + textoCodificado;
}

function renderStats(){
  var emAberto = leads.filter(function(l){
    return l.stage === 'lead' || l.stage === 'contato' || l.stage === 'proposta' || l.stage === 'negociacao';
  });
  var fechados = leads.filter(function(l){ return l.stage === 'fechado'; });
  var perdidos = leads.filter(function(l){ return l.stage === 'perdido'; });
  var totalAberto = emAberto.reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
  var totalFechado = fechados.reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
  var hoje = leads.filter(function(l){ return l.nextFollowUp && diffDays(l.nextFollowUp) === 0; }).length;
  var atrasados = leads.filter(function(l){ return l.nextFollowUp && diffDays(l.nextFollowUp) < 0 && l.stage !== 'fechado' && l.stage !== 'perdido'; }).length;

  var html = '';
  html += statHtml('Em aberto', fmtMoney(totalAberto), '');
  html += statHtml('Fechado', fmtMoney(totalFechado), 'success');
  html += statHtml('Perdido', perdidos.length, perdidos.length > 0 ? 'danger' : '');
  html += statHtml('Follow-up hoje', hoje, hoje > 0 ? 'warn' : '');
  html += statHtml('Atrasados', atrasados, atrasados > 0 ? 'danger' : '');
  document.getElementById('stats').innerHTML = html;
}

function statHtml(label, value, cls){
  return '<div class="stat ' + cls + '"><div class="num">' + value + '</div><div class="lbl">' + label + '</div></div>';
}

function renderFilters(){
  var html = '<button class="chip ' + (filtroAtivo==='todos'?'active':'') + '" data-filter="todos">Todos</button>';
  html += '<button class="chip ' + (filtroAtivo==='atrasados'?'active':'') + '" data-filter="atrasados">Atrasados</button>';
  html += '<button class="chip ' + (filtroAtivo==='hoje'?'active':'') + '" data-filter="hoje">Hoje</button>';
  document.getElementById('filters').innerHTML = html;
  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function(chip){
    chip.onclick = function(){
      filtroAtivo = chip.getAttribute('data-filter');
      render();
    };
  });
}

function getPeriodoRange(){
  var hoje = new Date();
  var ano = hoje.getFullYear();
  var mes = hoje.getMonth();

  function fmt(d){ return d.toISOString().slice(0,10); }

  if(periodoTipo === 'este_mes'){
    var inicio = new Date(ano, mes, 1);
    var fim = new Date(ano, mes + 1, 0);
    return { inicio: fmt(inicio), fim: fmt(fim) };
  }
  if(periodoTipo === 'mes_passado'){
    var inicio2 = new Date(ano, mes - 1, 1);
    var fim2 = new Date(ano, mes, 0);
    return { inicio: fmt(inicio2), fim: fmt(fim2) };
  }
  if(periodoTipo === 'este_ano'){
    return { inicio: ano + '-01-01', fim: ano + '-12-31' };
  }
  if(periodoTipo === 'personalizado'){
    if(periodoInicio && periodoFim) return { inicio: periodoInicio, fim: periodoFim };
    return null;
  }
  return null;
}

function getPeriodoAnteriorRange(){
  var hoje = new Date();
  var ano = hoje.getFullYear();
  var mes = hoje.getMonth();

  function fmt(d){ return d.toISOString().slice(0,10); }

  if(periodoTipo === 'este_mes'){
    var inicio = new Date(ano, mes - 1, 1);
    var fim = new Date(ano, mes, 0);
    return { inicio: fmt(inicio), fim: fmt(fim) };
  }
  if(periodoTipo === 'mes_passado'){
    var inicio2 = new Date(ano, mes - 2, 1);
    var fim2 = new Date(ano, mes - 1, 0);
    return { inicio: fmt(inicio2), fim: fmt(fim2) };
  }
  if(periodoTipo === 'este_ano'){
    return { inicio: (ano-1) + '-01-01', fim: (ano-1) + '-12-31' };
  }
  if(periodoTipo === 'personalizado' && periodoInicio && periodoFim){
    var ini = new Date(periodoInicio + 'T00:00:00');
    var fimAtual = new Date(periodoFim + 'T00:00:00');
    var duracaoDias = Math.round((fimAtual - ini) / 86400000) + 1;
    var fimAnterior = new Date(ini);
    fimAnterior.setDate(fimAnterior.getDate() - 1);
    var inicioAnterior = new Date(fimAnterior);
    inicioAnterior.setDate(inicioAnterior.getDate() - duracaoDias + 1);
    return { inicio: fmt(inicioAnterior), fim: fmt(fimAnterior) };
  }
  return null;
}

function dentroDoPeriodoAnterior(lead){
  var range = getPeriodoAnteriorRange();
  if(!range) return false;
  var data = lead.criado;
  if(!data) return false;
  return data >= range.inicio && data <= range.fim;
}

function dentroDoPeriodo(lead){
  if(periodoTipo === 'todos') return true;
  var range = getPeriodoRange();
  if(!range) return true;
  // Usa a data de follow-up se existir (o negócio aparece no mês do follow-up),
  // caso contrário usa a data de criação
  var data = lead.nextFollowUp || lead.criado;
  if(!data) return false;
  return data >= range.inicio && data <= range.fim;
}

function pctDelta(atual, anterior){
  if(!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

function deltaHtml(delta){
  if(delta === null) return '';
  if(delta === 0) return '<span class="kpi-delta neutro">＝ igual ao período anterior</span>';
  var cls = delta > 0 ? 'positivo' : 'negativo';
  var seta = delta > 0 ? '▲' : '▼';
  return '<span class="kpi-delta ' + cls + '">' + seta + ' ' + Math.abs(delta) + '% vs. período anterior</span>';
}

function filteredLeads(){
  var base = leads.filter(dentroDoPeriodo);
  if(filtroAtivo === 'atrasados'){
    return base.filter(function(l){ return l.nextFollowUp && diffDays(l.nextFollowUp) < 0 && l.stage !== 'fechado'; });
  }
  if(filtroAtivo === 'hoje'){
    return base.filter(function(l){ return l.nextFollowUp && diffDays(l.nextFollowUp) === 0; });
  }
  return base;
}

function render(){
  renderStats();
  renderFilters();

  var visible = filteredLeads();
  var board = document.getElementById('board');
  board.innerHTML = '';

  if(leads.length === 0){
    var headersRow = document.getElementById('board-headers');
    if (headersRow) headersRow.innerHTML = '';
    board.innerHTML = '<div class="empty-state">Nenhum negócio cadastrado ainda. Clique em <strong>"+ Novo negócio"</strong> para começar.</div>';
    return;
  }

  var headersRow = document.getElementById('board-headers');
  if (headersRow) {
    headersRow.innerHTML = STAGES.map(function(stage){
      var stageLeadsCount = visible.filter(function(l){ return l.stage === stage.id; }).length;
      var stageTotalValor = visible.filter(function(l){ return l.stage === stage.id; }).reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
      return '<div class="col-head-cell" style="--cell-color:' + stage.color + ';">' +
        '<span class="title">' + stage.label + '</span><span class="count">' + stageLeadsCount + '</span>' +
        '<span class="total">' + fmtMoney(stageTotalValor) + '</span>' +
      '</div>';
    }).join('');
  }

  STAGES.forEach(function(stage){
    var col = document.createElement('div');
    col.className = 'column';
    col.style.setProperty('--stage-color', stage.color);
    col.setAttribute('data-stage', stage.id);

    col.addEventListener('dragover', function(e){
      e.preventDefault();
      col.classList.add('dragover');
    });
    col.addEventListener('dragleave', function(){
      col.classList.remove('dragover');
    });
    col.addEventListener('drop', function(e){
      e.preventDefault();
      col.classList.remove('dragover');
      var id = e.dataTransfer.getData('text/plain');
      var lead = leads.find(function(l){ return l.id === id; });
      if(lead && lead.stage !== stage.id){
        var stageAnterior = lead.stage;
        var etapaAnteriorTimestamp = lead.etapaAlteradaEm;
        setStage(lead, stage.id);
        var erro = validarCamposObrigatorios(lead);
        if(erro){
          lead.stage = stageAnterior;
          lead.etapaAlteradaEm = etapaAnteriorTimestamp;
          toast(erro + ' Abra o card e complete essa informação antes de mover.', 'erro');
          render();
          return;
        }
        render();
        atualizarLeadNoDb(lead);
      }
    });

    var stageLeads = visible.filter(function(l){ return l.stage === stage.id; });

    if(stageLeads.length === 0){
      var empty = document.createElement('div');
      empty.className = 'empty-col';
      empty.textContent = 'Arraste um cliente para aqui';
      col.appendChild(empty);
    } else {
      stageLeads
        .slice()
        .sort(function(a,b){
          if(!a.nextFollowUp) return 1;
          if(!b.nextFollowUp) return -1;
          return new Date(a.nextFollowUp) - new Date(b.nextFollowUp);
        })
        .forEach(function(lead){
          col.appendChild(buildCard(lead, stage.color));
        });
    }

    board.appendChild(col);
  });

  document.querySelectorAll('.btn-concluir-followup').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var leadId = btn.getAttribute('data-lead-id');
      var leadAlvo = leads.find(function(l){ return l.id === leadId; });
      if(!leadAlvo) return;
      btn.disabled = true;
      await concluirFollowUp(leadAlvo);
      render();
      carregarNotificacoes();
    });
  });
}

function buildCard(lead, stageColor){
  var card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.style.setProperty('--card-accent', stageColor);

  var canalLabel = CANAIS[lead.canal] || lead.canal;
  var waLink = buildWaLink(lead);
  var dias = diasNaEtapa(lead);
  var limites = limitesEtapa[lead.stage] || {alerta:7, critico:14};

  // Barra de progresso do tempo na etapa (0% = novo, 100% = crítico)
  var pct = 0;
  var barColor = 'var(--steel)';
  if(lead.stage !== 'fechado' && lead.stage !== 'perdido'){
    pct = Math.min(100, Math.round((dias / limites.critico) * 100));
    if(dias >= limites.critico) barColor = 'var(--red)';
    else if(dias >= limites.alerta) barColor = 'var(--amber)';
    else barColor = 'var(--green)';
  }

  // Texto do tempo na etapa
  var tempoTexto = '';
  if(lead.stage !== 'fechado' && lead.stage !== 'perdido'){
    tempoTexto = dias === 0 ? 'Hoje nesta etapa' : (dias + (dias === 1 ? ' dia' : ' dias') + ' nesta etapa');
  }

  // Follow-up
  var followUpTexto = '';
  var followUpCor = 'var(--ink-soft)';
  if(lead.nextFollowUp){
    var diff = diffDays(lead.nextFollowUp);
    if(diff < 0){ followUpTexto = 'Atrasado ' + Math.abs(diff) + 'd'; followUpCor = 'var(--red)'; }
    else if(diff === 0){ followUpTexto = 'Follow-up hoje'; followUpCor = 'var(--amber-dark)'; }
    else if(diff === 1){ followUpTexto = 'Follow-up amanhã'; }
    else { followUpTexto = 'Follow-up ' + fmtDateBR(lead.nextFollowUp); }
  }

  // Próxima atividade
  var atividadeTexto = lead.atividadeTipo ? lead.atividadeTipo + (lead.atividadeDesc ? ': ' + lead.atividadeDesc.slice(0,30) : '') : '';

  // Vendedor (só admin vendo todos)
  var vendedorNome = '';
  if(papelAtual === 'admin' && !filtroVendedorId && lead.userId && membrosDaEquipe[lead.userId]){
    vendedorNome = membrosDaEquipe[lead.userId];
  }

  // Botão WhatsApp (ícone apenas)
  var waBtnHtml = waLink
    ? '<a class="wa-btn-icon" href="' + waLink + '" target="_blank" rel="noopener" title="Abrir no WhatsApp" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:1px solid var(--line);background:transparent;color:var(--ink-soft);text-decoration:none;flex:0 0 28px;">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.2-.7.9-.9 1.1-.2.2-.3.2-.6.1-.9-.4-1.8-1-2.6-1.8-.7-.7-1.4-1.6-1.8-2.5-.1-.3 0-.4.1-.6.2-.2.8-.7 1-1 .1-.2.1-.4 0-.6-.1-.2-.6-1.5-.8-1.9-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.1 0 1.2.9 2.4 1 2.6.1.1 1.6 2.5 4 3.6 2 .9 2.4.8 2.8.7.4-.1 1.6-.6 1.8-1.2.2-.6.2-1.1.2-1.2 0-.1-.1-.2-.3-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.7 1.5 5.3L2 22l4.8-1.5C8.3 21.5 10.1 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.7 0-3.3-.5-4.7-1.3l-.3-.2-3 .9.9-2.9-.2-.3C3.9 14.9 3.4 13.5 3.4 12c0-4.7 3.9-8.6 8.6-8.6s8.6 3.9 8.6 8.6-3.9 8.6-8.6 8.6z"/></svg>' +
      '</a>'
    : '';

  // Botão concluir follow-up
  var btnFollowUp = lead.nextFollowUp
    ? '<button class="btn-concluir-followup" data-lead-id="' + lead.id + '" title="Marcar follow-up como concluído" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--line);background:transparent;color:var(--ink-soft);font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">✓</button>'
    : '';

  // Avatar com iniciais do vendedor
  var avatarHtml = vendedorNome
    ? '<div style="width:22px;height:22px;border-radius:50%;background:var(--line);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--ink-soft);flex:0 0 22px;">' + vendedorNome.slice(0,2).toUpperCase() + '</div>'
    : '';

  card.innerHTML =
    // Cabeçalho: nome + canal + valor
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">' +
      '<p class="name" style="margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(lead.nome) + '</p>' +
      waBtnHtml +
    '</div>' +
    '<p class="meta" style="margin:0 0 8px;">' + escapeHtml(canalLabel) + '<span class="dot"></span><span class="value">' + fmtMoney(lead.valor) + '</span></p>' +

    // Barra de progresso do tempo na etapa
    (lead.stage !== 'fechado' && lead.stage !== 'perdido' ?
      '<div style="height:3px;background:var(--line);border-radius:2px;margin-bottom:8px;overflow:hidden;">' +
        '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:2px;transition:width .3s;"></div>' +
      '</div>'
    : '') +

    // Informações em grade
    '<div style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-bottom:8px;">' +
      (tempoTexto ? '<div style="font-size:11px;color:var(--ink-faint);white-space:nowrap;">Tempo na etapa</div><div style="font-size:11px;color:var(--ink-soft);font-weight:500;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (dias + (dias === 1 ? ' dia' : ' dias')) + '</div>' : '') +
      (followUpTexto ? '<div style="font-size:11px;color:var(--ink-faint);white-space:nowrap;">Próxima ação</div><div style="font-size:11px;color:' + followUpCor + ';font-weight:500;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + followUpTexto + '</div>' : '') +
      (atividadeTexto ? '<div style="font-size:11px;color:var(--ink-faint);white-space:nowrap;">Atividade</div><div style="font-size:11px;color:var(--ink-soft);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(lead.atividadeTipo || '') + '</div>' : '') +
    '</div>' +

    // Rodapé: avatar + nome do vendedor + botão follow-up
    '<div style="display:flex;align-items:center;gap:6px;border-top:1px solid var(--line);padding-top:7px;">' +
      avatarHtml +
      (vendedorNome ? '<span style="font-size:11px;font-weight:600;color:var(--ink);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(vendedorNome) + '</span>' : '<span style="flex:1;"></span>') +
      btnFollowUp +
    '</div>';

  card.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click', function(e){ e.stopPropagation(); });
  });

  card.addEventListener('dragstart', function(e){
    e.dataTransfer.setData('text/plain', lead.id);
    setTimeout(function(){ card.classList.add('dragging'); }, 0);
  });
  card.addEventListener('dragend', function(){
    card.classList.remove('dragging');
  });
  card.addEventListener('click', function(){
    openModal(lead.id);
  });

  return card;
}

function openModal(id){
  var isNew = !id;
  var lead = isNew
    ? {id: uid(), nome:'', contato:'', canal:'whatsapp', interesse:'', valor:'', stage:'lead', nextFollowUp: null, notas:'', criado: todayStr(), clienteId:null, motivoPerda:'', anexos:[]}
    : leads.find(function(l){ return l.id === id; });

  if(!lead) return;

  var clienteVinculado = lead.clienteId ? clientes.find(function(c){ return c.id === lead.clienteId; }) : null;
  var iniciais = (lead.nome || '?').trim().slice(0,2).toUpperCase();

  var stageOptions = STAGES.map(function(s){
    return '<option value="' + s.id + '" ' + (lead.stage===s.id?'selected':'') + '>' + s.label + '</option>';
  }).join('');

  var canalOptions = Object.keys(CANAIS).map(function(k){
    return '<option value="' + k + '" ' + (lead.canal===k?'selected':'') + '>' + CANAIS[k] + '</option>';
  }).join('');

  var clienteOptions = isNew
    ? '<option value="">— Novo cliente —</option>' + clientes.map(function(c){
        return '<option value="' + c.id + '">' + escapeHtml(c.nome) + '</option>';
      }).join('')
    : '';

  var stageAtual = STAGES.find(function(s){ return s.id === lead.stage; }) || STAGES[0];
  var waLinkModal = !isNew ? buildWaLink(lead) : null;

  var modal = document.getElementById('modal');
  modal.className = 'modal modal-trello';

  modal.innerHTML =
    '<div class="modal-trello-topbar">' +
      '<select id="f-stage" style="font-weight:700; border:none; background:' + stageAtual.color + '; color:#fff; padding:6px 12px; border-radius:6px;">' + stageOptions + '</select>' +
      '<div class="right-actions">' +
        (isNew ? '' : '<button class="btn-danger" id="f-del">Excluir</button>') +
        '<button class="btn-ghost" id="f-cancel">Fechar</button>' +
        '<button class="btn-primary" id="f-save">Salvar</button>' +
      '</div>' +
    '</div>' +
    '<div class="modal-trello-body">' +
      '<div class="modal-trello-col-principal">' +

        (isNew ? '' : '<input id="f-nome" class="modal-trello-titulo" type="text" value="' + escapeHtml(lead.nome) + '" placeholder="Nome / empresa">') +
        '<p class="modal-trello-sub">' + (clienteVinculado ? 'Cliente: ' + escapeHtml(clienteVinculado.nome) : 'Negócio novo') + (lead.contato ? ' · ' + escapeHtml(lead.contato) : '') + '</p>' +

        (waLinkModal ? '<a class="wa-btn" style="margin-bottom:16px;" href="' + waLinkModal + '" target="_blank" rel="noopener">Abrir conversa no WhatsApp ↗</a>' : '') +

        (isNew ?
          '<div id="novo-cliente-campos">' +
            '<div class="tipo-cliente-selector" id="tipo-selector">' +
              '<label class="tipo-cliente-option selecionado" id="label-pj">' +
                '<input type="radio" name="tipo-cli" value="juridica" checked>' +
                '<div class="tipo-check">✓</div>' +
                'Pessoa Jurídica (CNPJ)' +
              '</label>' +
              '<label class="tipo-cliente-option" id="label-pf">' +
                '<input type="radio" name="tipo-cli" value="fisica">' +
                '<div class="tipo-check"></div>' +
                'Pessoa Física (CPF)' +
              '</label>' +
            '</div>' +
            '<div id="campos-tipo-cliente">' +
              field('Nome da empresa *', '<input id="f-nome-empresa" type="text" placeholder="Razão social ou nome fantasia">') +
              field('CNPJ (opcional)', '<div style="display:flex; gap:8px;"><input id="f-cnpj" type="text" placeholder="00.000.000/0000-00" style="flex:1;"><button type="button" class="btn-ghost" id="btn-buscar-cnpj">Buscar</button></div>') +
              field('Responsável (opcional)', '<input id="f-responsavel" type="text" placeholder="Nome de quem você fala na empresa">') +
            '</div>' +
            field('Tags', '<div class="tags-input-container"><div class="tags-chips" id="f-tags-chips"></div><div style="display:flex; gap:8px;"><input type="text" id="f-tags-input" autocomplete="off" placeholder="Digite uma tag..." class="campo-padrao campo-padrao-flex"><button type="button" class="btn-primary" id="btn-add-tag-novo-negocio" style="padding:8px 14px; font-size:13px;">Adicionar</button></div></div>') +
          '</div>'
        : '') +

        '<div class="row2" style="align-items:start;">' +
          '<div class="modal-trello-secao" style="margin-bottom:0;">' +
            '<span class="modal-trello-secao-label">Etiquetas</span>' +
            '<div class="etiquetas-row">' +
              '<span class="etiqueta-pill" style="background:' + stageAtual.color + ';">' + stageAtual.label + '</span>' +
              (clienteVinculado && clienteVinculado.tags && clienteVinculado.tags.length
                ? clienteVinculado.tags.map(function(t){ return '<span class="etiqueta-pill" style="background:var(--steel);">' + escapeHtml(t) + '</span>'; }).join('')
                : '') +
            '</div>' +
          '</div>' +
          '<div class="modal-trello-secao" style="margin-bottom:0;">' +
            '<span class="modal-trello-secao-label">Follow-up</span>' +
            '<div class="data-entrega-box">' +
              '<input type="date" id="f-followup" value="' + (lead.nextFollowUp || '') + '" style="border:none; background:transparent; color:var(--ink); width:100%;">' +
              (lead.nextFollowUp ? followUpBadge(lead) : '') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="row2">' +
          field('Telefone / contato', '<input id="f-contato" type="text" inputmode="numeric" value="' + maskTelefone(lead.contato || '') + '" placeholder="(32) 99999-9999">') +
          field('Canal', '<select id="f-canal">' + canalOptions + '</select>') +
        '</div>' +

        '<div id="motivo-perda-area">' + (lead.stage === 'perdido' ? field('Motivo da perda', '<textarea id="f-motivo-perda" placeholder="Por que o negócio não avançou?">' + escapeHtml(lead.motivoPerda) + '</textarea>') : '') + '</div>' +

        '<div class="row2">' +
          field('Valor estimado (R$)', '<input id="f-valor" type="text" inputmode="numeric" value="' + formatValorParaInput(lead.valor) + '" placeholder="0,00">') +
          field('Tipo de atividade', '<select id="f-atividade-tipo">' +
            '<option value="">Nenhuma</option>' +
            '<option value="Ligar"' + (lead.atividadeTipo==='Ligar'?' selected':'') + '>Ligar</option>' +
            '<option value="Enviar proposta"' + (lead.atividadeTipo==='Enviar proposta'?' selected':'') + '>Enviar proposta</option>' +
            '<option value="Reunião"' + (lead.atividadeTipo==='Reunião'?' selected':'') + '>Reunião</option>' +
            '<option value="Visita"' + (lead.atividadeTipo==='Visita'?' selected':'') + '>Visita</option>' +
            '<option value="Outro"' + (lead.atividadeTipo==='Outro'?' selected':'') + '>Outro</option>' +
          '</select>') +
        '</div>' +
        field('Descrição da atividade', '<input id="f-atividade-desc" type="text" value="' + escapeHtml(lead.atividadeDesc) + '" placeholder="Ex: Ligar confirmando prazo">') +

        '<div class="modal-trello-secao">' +
          '<span class="modal-trello-secao-label">Descrição / Notas</span>' +
          '<div class="field" style="margin:0;"><textarea id="f-notas" placeholder="Detalhes da conversa, objeções, combinados...">' + escapeHtml(lead.notas) + '</textarea></div>' +
        '</div>' +

        (isNew
          ? '<p class="aviso-info">💡 Salve o negócio primeiro para poder anexar arquivos.</p>'
          : '<div class="modal-trello-secao"><span class="modal-trello-secao-label">Anexos</span><div id="anexos-area"></div></div>'
        ) +



      '</div>' +
      '<div class="modal-trello-col-atividade">' +
        '<span class="modal-trello-secao-label">Atividade</span>' +
        '<div id="atividade-lead-area"><p class="anexo-vazio">Carregando...</p></div>' +
      '</div>' +
    '</div>';

  document.getElementById('overlay').classList.add('open');

  if(!isNew){
    renderAnexosArea(lead);
    carregarAtividadeDoLead(lead);
  } else {
    document.getElementById('atividade-lead-area').innerHTML = '<p class="anexo-vazio">A atividade aparece aqui depois que o negócio for salvo.</p>';
  }

  document.getElementById('f-cancel').onclick = closeModal;

  document.getElementById('f-stage').addEventListener('change', function(){
    var area = document.getElementById('motivo-perda-area');
    if(this.value === 'perdido'){
      area.innerHTML = field('Motivo da perda', '<textarea id="f-motivo-perda" placeholder="Por que o negócio não avançou?">' + escapeHtml(lead.motivoPerda || '') + '</textarea>');
    } else {
      area.innerHTML = '';
    }
  });

  var inputContato = document.getElementById('f-contato');
  if(inputContato){
    inputContato.addEventListener('input', function(){
      var posicaoCursor = this.selectionStart;
      var tamanhoAntes = this.value.length;
      this.value = maskTelefone(this.value);
      var diferenca = this.value.length - tamanhoAntes;
      this.setSelectionRange(posicaoCursor + diferenca, posicaoCursor + diferenca);
    });
  }

  var inputValor = document.getElementById('f-valor');
  if(inputValor){
    inputValor.addEventListener('input', function(){
      this.value = maskValor(this.value);
    });
  }

  var modalNewClientTags = [];
  function renderModalNewClientTags(){
    var chipsContainer = document.getElementById('f-tags-chips');
    if(!chipsContainer) return;
    chipsContainer.innerHTML = modalNewClientTags.map(function(t, idx){
      return '<span class="etiqueta-pill" style="background:var(--steel); display:inline-flex; align-items:center; gap:6px;">' + escapeHtml(t) + ' <span data-idx="' + idx + '" class="remover-tag-modal" style="cursor:pointer;">✕</span></span>';
    }).join('');
    chipsContainer.querySelectorAll('.remover-tag-modal').forEach(function(span){
      span.addEventListener('click', function(){
        modalNewClientTags.splice(Number(span.getAttribute('data-idx')), 1);
        renderModalNewClientTags();
      });
    });
  }

  if(isNew){
    // Listener de busca de CNPJ inicial (quando PJ é exibido por padrão)
    var btnCnpjInicial = document.getElementById('btn-buscar-cnpj');
    if(btnCnpjInicial){
      btnCnpjInicial.addEventListener('click', async function(){
        var btn = this;
        btn.disabled = true; btn.textContent = 'Buscando...';
        var dados = await buscarDadosCnpj(document.getElementById('f-cnpj').value);
        btn.disabled = false; btn.textContent = 'Buscar';
        if(dados && dados.nome) document.getElementById('f-nome-empresa').value = dados.nome;
      });
    }

    // Listener de tipo de cliente (PJ/PF)
    document.querySelectorAll('input[name="tipo-cli"]').forEach(function(radio){
      radio.addEventListener('change', function(){
        var tipo = this.value;
        var camposDiv = document.getElementById('campos-tipo-cliente');
        var labelPj = document.getElementById('label-pj');
        var labelPf = document.getElementById('label-pf');

        // Atualizar visual dos botões
        labelPj.classList.toggle('selecionado', tipo === 'juridica');
        labelPf.classList.toggle('selecionado', tipo === 'fisica');
        labelPj.querySelector('.tipo-check').textContent = tipo === 'juridica' ? '✓' : '';
        labelPf.querySelector('.tipo-check').textContent = tipo === 'fisica' ? '✓' : '';

        // Trocar campos conforme o tipo
        if(tipo === 'fisica'){
          camposDiv.innerHTML =
            field('Nome completo *', '<input id="f-nome-empresa" type="text" placeholder="Nome completo da pessoa">');
        } else {
          camposDiv.innerHTML =
            field('Nome da empresa *', '<input id="f-nome-empresa" type="text" placeholder="Razão social ou nome fantasia">') +
            field('CNPJ (opcional)', '<div style="display:flex; gap:8px;"><input id="f-cnpj" type="text" placeholder="00.000.000/0000-00" style="flex:1;"><button type="button" class="btn-ghost" id="btn-buscar-cnpj">Buscar</button></div>') +
            field('Responsável (opcional)', '<input id="f-responsavel" type="text" placeholder="Nome de quem você fala na empresa">');

          // Reativar o listener de busca de CNPJ
          var btnCnpj = document.getElementById('btn-buscar-cnpj');
          if(btnCnpj){
            btnCnpj.addEventListener('click', async function(){
              var btn = this;
              btn.disabled = true; btn.textContent = 'Buscando...';
              var dados = await buscarDadosCnpj(document.getElementById('f-cnpj').value);
              btn.disabled = false; btn.textContent = 'Buscar';
              if(dados && dados.nome) document.getElementById('f-nome-empresa').value = dados.nome;
            });
          }
        }
      });
    });

    var tagsInput = document.getElementById('f-tags-input');
    var btnAddTagNovo = document.getElementById('btn-add-tag-novo-negocio');
    function adicionarTagNovoNegocio(){
      var val = tagsInput.value.trim();
      if(val && modalNewClientTags.indexOf(val) === -1){
        modalNewClientTags.push(val);
        tagsInput.value = '';
        renderModalNewClientTags();
      }
    }
    if(tagsInput){
      tagsInput.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){
          e.preventDefault();
          adicionarTagNovoNegocio();
        }
      });
    }
    if(btnAddTagNovo){
      btnAddTagNovo.addEventListener('click', adicionarTagNovoNegocio);
    }
  }

  if(!isNew){
    document.getElementById('f-del').onclick = async function(){
      var ok = await customConfirm('O cadastro do cliente não será excluído.', 'Excluir este negócio do funil?');
      if(ok){
        leads = leads.filter(function(l){ return l.id !== lead.id; });
        render();
        renderClientesView();
        closeModal();
        await excluirLeadNoDb(lead.id);
        toast('Negócio excluído.', 'sucesso');
      }
    };
  }

  document.getElementById('f-save').onclick = async function(){
    var fNomeEl = document.getElementById('f-nome');
    var nomeEmpresa = document.getElementById('f-nome-empresa') ? document.getElementById('f-nome-empresa').value.trim() : '';
    var nome = fNomeEl ? fNomeEl.value.trim() : (document.getElementById('f-nome-empresa') ? document.getElementById('f-nome-empresa').value.trim() : '');
    lead.nome = nome || 'Sem nome';
    lead.contato = document.getElementById('f-contato').value.trim();
    lead.canal = document.getElementById('f-canal').value;
    lead.valor = parseValorMascarado(document.getElementById('f-valor').value);
    setStage(lead, document.getElementById('f-stage').value);
    lead.nextFollowUp = document.getElementById('f-followup').value || null;
    lead.notas = document.getElementById('f-notas').value.trim();
    lead.atividadeTipo = document.getElementById('f-atividade-tipo').value;
    lead.atividadeDesc = document.getElementById('f-atividade-desc').value.trim();
    var motivoEl = document.getElementById('f-motivo-perda');
    lead.motivoPerda = motivoEl ? motivoEl.value.trim() : (lead.stage === 'perdido' ? lead.motivoPerda : '');

    var erroValidacao = validarCamposObrigatorios(lead);
    if(erroValidacao){
      toast(erroValidacao, 'erro');
      return;
    }

    var saveBtn = document.getElementById('f-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    if(isNew){
      var fClienteExistenteEl = document.getElementById('f-cliente-existente');
      var clienteSelecionado = fClienteExistenteEl ? fClienteExistenteEl.value : '';
      if(clienteSelecionado){
        lead.clienteId = clienteSelecionado;
      } else {
        var cnpjInput = document.getElementById('f-cnpj');
        var novoCliente = await criarClienteNoDb({
          nome: nomeEmpresa || nome,
          contato: lead.contato,
          canal: lead.canal,
          criado: todayStr(),
          cnpj: cnpjInput ? cnpjInput.value.replace(/\D/g,'') : '',
          responsavel: document.getElementById('f-responsavel') ? document.getElementById('f-responsavel').value.trim() : '',
          tags: modalNewClientTags,
          tipo: (function(){ var r = document.querySelector('input[name="tipo-cli"]:checked'); return r ? r.value : 'juridica'; })()
        });
        if(novoCliente){
          novoCliente.tags = modalNewClientTags.slice();
          if(modalNewClientTags.length > 0){
            await atualizarClienteNoDb(novoCliente);
          }
          clientes.push(novoCliente);
          lead.clienteId = novoCliente.id;
        }
      }
      var criado = await criarLeadNoDb(lead);
      if(criado){
        lead.id = criado.id;
        leads.push(lead);
      } else {
        showSyncError();
      }
    } else {
      await atualizarLeadNoDb(lead);
    }

    toast('Negócio salvo com sucesso!', 'sucesso');
    if(isNew) marcarEtapaOnboarding('negocio_criado');
    render();
    renderClientesView();
    closeModal();
  };
}

async function loadInteracoesDoLead(leadId){
  var query = sb.from('interacoes').select('*').eq('lead_id', leadId);
  if(equipeAtual){
    query = query.eq('equipe_id', equipeAtual.id);
  } else {
    query = query.eq('user_id', currentUserId);
  }
  var res = await query.order('data', {ascending:false});
  if(res.error){ console.error('Erro ao carregar atividade do negócio', res.error); return []; }
  return res.data.map(interacaoFromDb);
}

async function carregarAtividadeDoLead(lead){
  var area = document.getElementById('atividade-lead-area');
  var interacoesLead = await loadInteracoesDoLead(lead.id);

  var eventos = [];

  eventos.push({ data: lead.criado, texto: 'criou este negócio', icone: '✛' });

  if(lead.stage === 'fechado' && lead.fechadoEm){
    eventos.push({ data: lead.fechadoEm, texto: 'marcou este negócio como Fechado', icone: '✓' });
  }
  if(lead.stage === 'perdido'){
    eventos.push({ data: lead.etapaAlteradaEm ? lead.etapaAlteradaEm.slice(0,10) : lead.criado, texto: 'marcou este negócio como Perdido' + (lead.motivoPerda ? ' — "' + lead.motivoPerda + '"' : ''), icone: '✕' });
  }

  interacoesLead.forEach(function(it){
    eventos.push({ data: it.data, texto: 'registrou uma interação (' + it.tipo + ')' + (it.nota ? ': "' + it.nota + '"' : ''), icone: '💬' });
  });

  eventos.sort(function(a,b){ return new Date(b.data) - new Date(a.data); });

  area.innerHTML = eventos.map(function(ev){
    return '<div class="atividade-item">' +
      '<div class="atividade-avatar">' + ev.icone + '</div>' +
      '<div class="atividade-texto"><span class="autor">Você</span> ' + ev.texto + '<div class="quando">' + fmtDateBR(ev.data) + '</div></div>' +
    '</div>';
  }).join('') || '<p class="anexo-vazio">Nenhuma atividade registrada ainda.</p>';
}

function field(label, inputHtml){
  return '<div class="field"><label>' + label + '</label>' + inputHtml + '</div>';
}

function renderAnexosArea(lead){
  var area = document.getElementById('anexos-area');
  if(!area) return;

  var anexos = lead.anexos || [];
  var listaHtml = anexos.length
    ? '<div class="anexos-list">' + anexos.map(function(a, idx){
        return '<div class="anexo-item">' +
          '<a href="#" data-idx="' + idx + '" class="anexo-abrir">📎 ' + escapeHtml(a.nome) + ' <span style="color:var(--ink-faint); font-weight:400;">(' + fmtTamanho(a.tamanho) + ')</span></a>' +
          '<button class="anexo-del" data-idx="' + idx + '" title="Excluir anexo">✕</button>' +
        '</div>';
      }).join('') + '</div>'
    : '<p class="anexo-vazio">Nenhum arquivo anexado ainda.</p>';

  area.innerHTML =
    listaHtml +
    '<div class="anexo-drop-area" id="f-anexo-drop">' +
      '<input type="file" id="f-anexo-input">' +
      '📎 Arraste um arquivo aqui ou clique para escolher<br><span style="font-size:11px;">PDF, imagem, etc. — até 10MB</span>' +
    '</div>';

  area.querySelectorAll('.anexo-abrir').forEach(function(a){
    a.addEventListener('click', function(e){
      e.preventDefault();
      var idx = Number(a.getAttribute('data-idx'));
      abrirAnexo(lead.anexos[idx]);
    });
  });

  area.querySelectorAll('.anexo-del').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var idx = Number(btn.getAttribute('data-idx'));
      var anexo = lead.anexos[idx];
      var ok = await customConfirm('Essa ação não pode ser desfeita.', 'Excluir o arquivo "' + anexo.nome + '"?');
      if(!ok) return;
      btn.disabled = true;
      await excluirAnexo(lead, anexo);
      renderAnexosArea(lead);
    });
  });

  var dropArea = document.getElementById('f-anexo-drop');
  var input = document.getElementById('f-anexo-input');
  input.addEventListener('change', async function(){
    if(!input.files[0]) return;
    dropArea.textContent = 'Enviando...';
    await uploadAnexo(lead, input.files[0]);
    renderAnexosArea(lead);
  });
  setupDropArea(dropArea, async function(file){
    dropArea.textContent = 'Enviando...';
    await uploadAnexo(lead, file);
    renderAnexosArea(lead);
  });
}

function closeModal(){
  document.getElementById('overlay').classList.remove('open');
}

document.getElementById('btn-novo').addEventListener('click', function(){ openModal(null); });
document.getElementById('overlay').addEventListener('click', function(e){
  if(e.target.id === 'overlay') closeModal();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') closeModal();
});

var charts = {};
var CHART_COLORS = {
  lead:'#8A8F94', contato:'#2B6CA3', proposta:'#E8A317', negociacao:'#C0392B', fechado:'#2E7D4F'
};

function destroyCharts(){
  Object.keys(charts).forEach(function(k){ if(charts[k]) charts[k].destroy(); });
  charts = {};
  // segurança extra: garante que nenhum canvas fique com instância órfã do Chart.js
  ['chart-funil','chart-valor','chart-canal','chart-evolucao'].forEach(function(id){
    var el = document.getElementById(id);
    if(!el) return;
    var existing = Chart.getChart(el);
    if(existing) existing.destroy();
  });
}

function weekKey(dateStr){
  var d = new Date(dateStr + 'T00:00:00');
  var jan1 = new Date(d.getFullYear(), 0, 1);
  var dayNum = Math.floor((d - jan1) / 86400000) + 1;
  var week = Math.ceil((dayNum + jan1.getDay()) / 7);
  return d.getFullYear() + '-S' + String(week).padStart(2,'0');
}

function renderMetaMensal(){
  var area = document.getElementById('meta-mensal-area');

  if(!metaMensal || metaMensal <= 0){
    area.innerHTML = '<div class="meta-box">' +
      '<div class="meta-box-head"><h3>Meta de vendas</h3></div>' +
      '<p class="anexo-vazio" style="margin:0;">Nenhuma meta mensal definida. Clique em ⚙️ no topo da página para configurar.</p>' +
    '</div>';
    return;
  }

  var hoje = new Date();
  var anoAtual = hoje.getFullYear();
  var mesAtual = hoje.getMonth();

  var fechadosMes = leads.filter(function(l){
    if(l.stage !== 'fechado' || !l.fechadoEm) return false;
    var d = new Date(l.fechadoEm + 'T00:00:00');
    return d.getFullYear() === anoAtual && d.getMonth() === mesAtual;
  });
  var valorFechadoMes = fechadosMes.reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
  var pct = Math.min(100, Math.round((valorFechadoMes / metaMensal) * 100));
  var faltam = Math.max(0, metaMensal - valorFechadoMes);

  area.innerHTML = '<div class="meta-box">' +
    '<div class="meta-box-head">' +
      '<h3>Meta de vendas — ' + MESES_PT[mesAtual] + '</h3>' +
      '<span class="pct">' + pct + '%</span>' +
    '</div>' +
    '<div class="meta-barra-fundo"><div class="meta-barra-preenchida" style="width:' + pct + '%;"></div></div>' +
    '<p class="meta-box-sub">' + fmtMoney(valorFechadoMes) + ' de ' + fmtMoney(metaMensal) +
      (faltam > 0 ? ' · faltam ' + fmtMoney(faltam) : ' · meta atingida! 🎉') +
    '</p>' +
  '</div>';
}

function renderDashboard(){
  destroyCharts();

  renderMetaMensal();

  var leadsFiltrados = leads.filter(dentroDoPeriodo);

  var totalLeads = leadsFiltrados.length;
  var fechados = leadsFiltrados.filter(function(l){ return l.stage === 'fechado'; });
  var valorFechado = fechados.reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
  var valorEmAberto = leadsFiltrados.filter(function(l){ return l.stage !== 'fechado'; }).reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
  var taxaConversao = totalLeads ? Math.round((fechados.length / totalLeads) * 100) : 0;
  var ticketMedio = fechados.length ? (valorFechado / fechados.length) : 0;

  // Período anterior, para comparação (só calcula se houver um período definido)
  var temComparacao = periodoTipo !== 'todos' && getPeriodoAnteriorRange() !== null;
  var deltaTotal = null, deltaConversao = null, deltaTicket = null, deltaAberto = null;
  if(temComparacao){
    var leadsAnterior = leads.filter(dentroDoPeriodoAnterior);
    var totalAnterior = leadsAnterior.length;
    var fechadosAnterior = leadsAnterior.filter(function(l){ return l.stage === 'fechado'; });
    var valorFechadoAnterior = fechadosAnterior.reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
    var valorAbertoAnterior = leadsAnterior.filter(function(l){ return l.stage !== 'fechado'; }).reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
    var conversaoAnterior = totalAnterior ? Math.round((fechadosAnterior.length / totalAnterior) * 100) : 0;
    var ticketAnterior = fechadosAnterior.length ? (valorFechadoAnterior / fechadosAnterior.length) : 0;

    deltaTotal = pctDelta(totalLeads, totalAnterior);
    deltaConversao = pctDelta(taxaConversao, conversaoAnterior);
    deltaTicket = pctDelta(ticketMedio, ticketAnterior);
    deltaAberto = pctDelta(valorEmAberto, valorAbertoAnterior);
  }

  document.getElementById('dash-kpis').innerHTML =
    kpiHtml(totalLeads, 'Clientes no funil', deltaTotal) +
    kpiHtml(taxaConversao + '%', 'Taxa de conversão', deltaConversao) +
    kpiHtml(fmtMoney(ticketMedio), 'Ticket médio (fechados)', deltaTicket) +
    kpiHtml(fmtMoney(valorEmAberto), 'Valor em negociação', deltaAberto);

  // 1. Quantidade por etapa
  try{
    var countsByStage = STAGES.map(function(s){ return leadsFiltrados.filter(function(l){ return l.stage === s.id; }).length; });
    charts.funil = new Chart(document.getElementById('chart-funil'), {
      type: 'bar',
      data: {
        labels: STAGES.map(function(s){ return s.label; }),
        datasets: [{ data: countsByStage, backgroundColor: STAGES.map(function(s){ return s.color; }), borderRadius: 6 }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{precision:0} } } }
    });
  }catch(e){ console.error('Erro no gráfico de funil', e); }

  // 2. Valor por etapa
  try{
    var valorByStage = STAGES.map(function(s){
      return leadsFiltrados.filter(function(l){ return l.stage === s.id; }).reduce(function(sum,l){ return sum + (Number(l.valor)||0); }, 0);
    });
    charts.valor = new Chart(document.getElementById('chart-valor'), {
      type: 'bar',
      data: {
        labels: STAGES.map(function(s){ return s.label; }),
        datasets: [{ data: valorByStage, backgroundColor: STAGES.map(function(s){ return s.color; }), borderRadius: 6 }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{ callback:function(v){ return 'R$ '+v; } } } } }
    });
  }catch(e){ console.error('Erro no gráfico de valor', e); }

  // 3. Origem por canal
  try{
    var canalKeys = Object.keys(CANAIS);
    var canalCounts = canalKeys.map(function(k){ return leadsFiltrados.filter(function(l){ return l.canal === k; }).length; });
    charts.canal = new Chart(document.getElementById('chart-canal'), {
      type: 'doughnut',
      data: {
        labels: canalKeys.map(function(k){ return CANAIS[k]; }),
        datasets: [{ data: canalCounts, backgroundColor: ['#3A4046', '#2B6CA3', '#2E7D4F', '#E8A317'] }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } }
    });
  }catch(e){ console.error('Erro no gráfico de origem', e); }

  // 4. Evolução de fechamentos por semana
  try{
    var fechadosComData = fechados.filter(function(l){ return l.fechadoEm; });
    var porSemana = {};
    fechadosComData.forEach(function(l){
      var k = weekKey(l.fechadoEm);
      porSemana[k] = (porSemana[k] || 0) + 1;
    });
    var semanasOrdenadas = Object.keys(porSemana).sort();
    charts.evolucao = new Chart(document.getElementById('chart-evolucao'), {
      type: 'line',
      data: {
        labels: semanasOrdenadas.length ? semanasOrdenadas : ['Sem dados ainda'],
        datasets: [{
          data: semanasOrdenadas.length ? semanasOrdenadas.map(function(k){ return porSemana[k]; }) : [0],
          borderColor: '#E8A317',
          backgroundColor: 'rgba(232,163,23,0.15)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#E8A317'
        }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{precision:0} } } }
    });
  }catch(e){ console.error('Erro no gráfico de evolução', e); }

  // 5. Conversão por etapa (cumulativa, ignora negócios perdidos)
  try{
    var funilOrdem = ['lead','contato','proposta','negociacao','fechado'];
    var leadsAtivos = leadsFiltrados.filter(function(l){ return l.stage !== 'perdido'; });
    var alcancados = funilOrdem.map(function(stageId){
      var idx = funilOrdem.indexOf(stageId);
      return leadsAtivos.filter(function(l){ return funilOrdem.indexOf(l.stage) >= idx; }).length;
    });

    var linhasHtml = '';
    for(var i = 0; i < funilOrdem.length - 1; i++){
      var de = STAGES.find(function(s){ return s.id === funilOrdem[i]; });
      var para = STAGES.find(function(s){ return s.id === funilOrdem[i+1]; });
      var pct = alcancados[i] > 0 ? Math.round((alcancados[i+1] / alcancados[i]) * 100) : 0;
      linhasHtml += '<div class="conversao-row">' +
        '<span class="rotulo">' + de.label + ' → ' + para.label + '</span>' +
        '<div class="barra-fundo"><div class="barra-preenchida" style="width:' + pct + '%; background:' + para.color + ';"></div></div>' +
        '<span class="valor">' + pct + '%</span>' +
      '</div>';
    }
    var totalPerdidos = leadsFiltrados.filter(function(l){ return l.stage === 'perdido'; }).length;
    if(totalPerdidos > 0){
      linhasHtml += '<p class="anexo-vazio" style="margin-top:10px;">' + totalPerdidos + ' negócio(s) perdido(s) no período não entram nesse cálculo.</p>';
    }
    document.getElementById('conversao-etapas').innerHTML = linhasHtml;
  }catch(e){ console.error('Erro ao calcular conversão por etapa', e); }

  var areaEquipe = document.getElementById('dash-equipe');
  if(areaEquipe){
    areaEquipe.style.display = (papelAtual === 'admin' && equipeAtual) ? 'grid' : 'none';
    areaEquipe.innerHTML = papelAtual === 'admin' ? '<p class="anexo-vazio">Carregando visão da equipe...</p>' : '';
  }

  // Visão de equipe — só para admin
  if(papelAtual === 'admin' && equipeAtual){
    renderDashboardEquipe(leadsFiltrados);
  }
}

async function renderDashboardEquipe(leadsFiltrados){
  var areaEquipe = document.getElementById('dash-equipe');
  if(!areaEquipe) return;

  // Carregar membros se ainda não carregados
  if(Object.keys(membrosDaEquipe).length === 0){
    await loadMembrosDaEquipe();
  }

  var membros = Object.entries(membrosDaEquipe);
  if(membros.length === 0){
    areaEquipe.innerHTML = '<p class="anexo-vazio">Nenhum membro encontrado na equipe.</p>';
    return;
  }

  // Resumo geral da equipe
  var totalLeadsEquipe = leadsFiltrados.length;
  var fechadosEquipe = leadsFiltrados.filter(function(l){ return l.stage === 'fechado'; });
  var valorEquipe = fechadosEquipe.reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
  var conversaoEquipe = totalLeadsEquipe ? Math.round((fechadosEquipe.length / totalLeadsEquipe) * 100) : 0;
  var ticketEquipe = fechadosEquipe.length ? valorEquipe / fechadosEquipe.length : 0;

  var html = '';

  // Card de resumo geral
  html += '<div class="dash-card" style="grid-column:1/-1; border-left:4px solid var(--amber);">';
  html += '<h3>Resumo da Equipe — ' + escapeHtml(equipeAtual.nome) + '</h3>';
  html += '<div class="dash-kpis">';
  html += kpiHtml(totalLeadsEquipe, 'Total de negócios');
  html += kpiHtml(fechadosEquipe.length, 'Fechados');
  html += kpiHtml(conversaoEquipe + '%', 'Taxa de conversão');
  html += kpiHtml(fmtMoney(valorEquipe), 'Receita total');
  html += kpiHtml(fmtMoney(ticketEquipe), 'Ticket médio');
  html += '</div>';
  html += '</div>';

  // Cards por vendedor
  membros.forEach(function(entry){
    var uid = entry[0];
    var nome = entry[1];

    var leadsVendedor = leadsFiltrados.filter(function(l){ return l.userId === uid; });
    var fechadosV = leadsVendedor.filter(function(l){ return l.stage === 'fechado'; });
    var perdidosV = leadsVendedor.filter(function(l){ return l.stage === 'perdido'; });
    var valorV = fechadosV.reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
    var conversaoV = leadsVendedor.length ? Math.round((fechadosV.length / leadsVendedor.length) * 100) : 0;
    var ticketV = fechadosV.length ? valorV / fechadosV.length : 0;
    var emAbertoV = leadsVendedor.filter(function(l){ return l.stage !== 'fechado' && l.stage !== 'perdido'; });
    var atrasadosV = leadsVendedor.filter(function(l){ return l.nextFollowUp && diffDays(l.nextFollowUp) < 0 && l.stage !== 'fechado' && l.stage !== 'perdido'; });

    var iniciais = nome.trim().slice(0,2).toUpperCase();

    html += '<div class="dash-card">';
    html += '<div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">';
    html += '<div class="membro-avatar" style="width:36px; height:36px; font-size:14px;">' + iniciais + '</div>';
    html += '<div><div style="font-weight:700; font-size:14px;">' + escapeHtml(nome) + '</div>';
    html += '<div style="font-size:11px; color:var(--ink-faint);">' + leadsVendedor.length + ' negócios no período</div></div>';
    html += '</div>';

    html += '<div style="display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-bottom:12px;">';
    html += '<div class="kpi" style="padding:10px;"><div class="num" style="font-size:20px;">' + fmtMoney(valorV) + '</div><div class="lbl">Receita fechada</div></div>';
    html += '<div class="kpi" style="padding:10px;"><div class="num" style="font-size:20px;">' + conversaoV + '%</div><div class="lbl">Conversão</div></div>';
    html += '<div class="kpi" style="padding:10px;"><div class="num" style="font-size:20px;">' + emAbertoV.length + '</div><div class="lbl">Em aberto</div></div>';
    html += '<div class="kpi" style="padding:10px;"><div class="num" style="font-size:20px; ' + (atrasadosV.length > 0 ? 'color:var(--red)' : '') + ';">' + atrasadosV.length + '</div><div class="lbl">Atrasados</div></div>';
    html += '</div>';

    // Mini barra de funil por etapa
    var estagiosAtivos = STAGES.filter(function(s){ return s.id !== 'perdido'; });
    html += '<div style="display:flex; gap:3px; height:6px; border-radius:4px; overflow:hidden;">';
    estagiosAtivos.forEach(function(stage){
      var qtd = leadsVendedor.filter(function(l){ return l.stage === stage.id; }).length;
      var pct = leadsVendedor.length ? (qtd / leadsVendedor.length) * 100 : 0;
      if(pct > 0){
        html += '<div style="flex:' + pct + '; background:' + stage.color + ';" title="' + stage.label + ': ' + qtd + '"></div>';
      }
    });
    html += '</div>';
    html += '<div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">';
    estagiosAtivos.forEach(function(stage){
      var qtd = leadsVendedor.filter(function(l){ return l.stage === stage.id; }).length;
      if(qtd > 0){
        html += '<span style="font-size:10px; color:var(--ink-faint);"><span style="color:' + stage.color + ';">●</span> ' + stage.label + ': ' + qtd + '</span>';
      }
    });
    html += '</div>';

    html += '</div>';
  });

  areaEquipe.innerHTML = html;
}

function kpiHtml(value, label, delta){
  return '<div class="kpi"><div class="num">' + value + '</div><div class="lbl">' + label + '</div>' + (delta !== undefined ? deltaHtml(delta) : '') + '</div>';
}

function negociacoesDoCliente(clienteId){
  return leads.filter(function(l){ return l.clienteId === clienteId; });
}

var buscaClienteTexto = '';
var filtroTagClienteSelecionada = '';

function populateFiltroTagCliente() {
  var select = document.getElementById('filtro-tag-cliente');
  if (!select) return;
  var allTags = [];
  clientes.forEach(function(c) {
    if (Array.isArray(c.tags)) {
      c.tags.forEach(function(tag) {
        if (allTags.indexOf(tag) === -1) {
          allTags.push(tag);
        }
      });
    }
  });
  allTags.sort();
  var selectedVal = select.value;
  select.innerHTML = '<option value="">Todas as tags</option>' + allTags.map(function(tag) {
    return '<option value="' + escapeHtml(tag) + '"' + (tag === selectedVal ? ' selected' : '') + '>' + escapeHtml(tag) + '</option>';
  }).join('');
}

function renderClientesView(){
  var grid = document.getElementById('clientes-grid');
  if(clientes.length === 0){
    grid.innerHTML = '<div class="empty-state">Nenhum cliente cadastrado ainda. Os clientes aparecem aqui automaticamente quando você cria um negócio no Funil.</div>';
    return;
  }

  populateFiltroTagCliente();

  var termo = buscaClienteTexto.trim().toLowerCase();
  var tagFiltro = filtroTagClienteSelecionada;

  var listaFiltrada = clientes.filter(function(c){
    var matchesSearch = true;
    if (termo) {
      var codigoStr = c.codigo ? String(c.codigo) : '';
      matchesSearch = c.nome.toLowerCase().indexOf(termo) !== -1 || codigoStr.indexOf(termo) !== -1;
    }
    var matchesTag = true;
    if (tagFiltro) {
      matchesTag = Array.isArray(c.tags) && c.tags.indexOf(tagFiltro) !== -1;
    }
    return matchesSearch && matchesTag;
  });

  if(listaFiltrada.length === 0){
    grid.innerHTML = '<div class="empty-state">Nenhum cliente encontrado para os filtros ativos.</div>';
    return;
  }

  grid.innerHTML = listaFiltrada.map(function(c){
    var negs = negociacoesDoCliente(c.id);
    var fechadas = negs.filter(function(n){ return n.stage === 'fechado'; });
    var perdidas = negs.filter(function(n){ return n.stage === 'perdido'; });
    var valorTotal = fechadas.reduce(function(s,n){ return s + (Number(n.valor)||0); }, 0);
    var canalLabel = CANAIS[c.canal] || c.canal || '—';
    var codigoFmt = c.codigo ? '#' + String(c.codigo).padStart(4, '0') : '';

    var tipoPilula = c.tipo === 'fisica'
      ? '<span style="font-size:10px; font-weight:700; padding:2px 7px; border-radius:5px; background:var(--blue-bg); color:var(--blue);">PF</span>'
      : '<span style="font-size:10px; font-weight:700; padding:2px 7px; border-radius:5px; background:var(--green-bg); color:var(--green);">PJ</span>';

    var tagsHtml = '';
    if (Array.isArray(c.tags) && c.tags.length > 0) {
      tagsHtml = '<div class="cliente-tags-list" style="display:inline-flex; gap:4px; margin-left:8px; flex-wrap:wrap;">' + c.tags.map(function(tag) {
        return '<span class="tag-chip-pill">' + escapeHtml(tag) + '</span>';
      }).join('') + '</div>';
    }

    return '<div class="cliente-card" data-id="' + c.id + '">' +
      '<p class="codigo">' + codigoFmt + ' ' + tipoPilula + '</p>' +
      '<div class="nome-container" style="flex:1 1 220px; min-width:0; display:flex; align-items:center;">' +
        '<p class="nome" style="margin:0; flex:none;">' + escapeHtml(c.nome) + '</p>' +
        tagsHtml +
      '</div>' +
      '<p class="meta">' + escapeHtml(canalLabel) + (c.contato ? ' · ' + escapeHtml(c.contato) : '') + '</p>' +
      '<div class="resumo">' +
        '<div><strong>' + negs.length + '</strong>negócios</div>' +
        '<div><strong>' + fechadas.length + '</strong>fechados</div>' +
        '<div><strong>' + perdidas.length + '</strong>perdidos</div>' +
        '<div><strong>' + fmtMoney(valorTotal) + '</strong>total</div>' +
      '</div>' +
    '</div>';
  }).join('');

  grid.querySelectorAll('.cliente-card').forEach(function(card){
    card.addEventListener('click', function(){
      openClienteModal(card.getAttribute('data-id'));
    });
  });
}

async function openClienteModal(clienteId){
  var cliente = clientes.find(function(c){ return c.id === clienteId; });
  if(!cliente) return;

  var modal = document.getElementById('modal-cliente');
  modal.innerHTML = '<p class="anexo-vazio">Carregando histórico...</p>';
  document.getElementById('overlay-cliente').classList.add('open');

  var interacoes = await loadInteracoesDoCliente(clienteId);
  var negs = negociacoesDoCliente(clienteId).slice().sort(function(a,b){
    return new Date(b.criado||0) - new Date(a.criado||0);
  });

  var negsHtml = negs.length
    ? negs.map(function(n){
        var st = STAGES.find(function(s){ return s.id === n.stage; }) || STAGES[0];
        return '<div class="negociacao-row" data-leadid="' + n.id + '">' +
          '<span>' + escapeHtml(n.nome) + ' · ' + fmtMoney(n.valor) + (n.criado ? ' · ' + fmtDateBR(n.criado) : '') + '</span>' +
          '<span class="badge-stage" style="background:' + st.color + ';">' + st.label + '</span>' +
        '</div>';
      }).join('')
    : '<p class="anexo-vazio">Nenhum negócio registrado ainda para este cliente.</p>';

  var interacoesHtml = interacoes.length
    ? interacoes.map(function(it){
        return '<div class="interacao-item" data-interid="' + it.id + '">' +
          '<span class="tipo">' + it.tipo + '</span> · <span class="data">' + fmtDateBR(it.data) + '</span>' +
          (it.nota ? '<p style="margin:3px 0 0;">' + escapeHtml(it.nota) + '</p>' : '') +
          '<button class="anexo-del interacao-del" data-interid="' + it.id + '" style="float:right;" title="Excluir">✕</button>' +
        '</div>';
      }).join('')
    : '<p class="anexo-vazio">Nenhuma interação registrada ainda.</p>';

  var clientTags = Array.isArray(cliente.tags) ? cliente.tags : [];
  var tagsHtml = '<div class="tags-input-container" style="margin-top:8px;">' +
    '<div class="tags-chips" id="modal-client-tags-chips" style="margin-bottom:8px; display:flex; gap:6px; flex-wrap:wrap;">' +
      clientTags.map(function(tag) {
        return '<span class="tag-chip">' + escapeHtml(tag) + '<span class="tag-chip-remove" data-tag-val="' + escapeHtml(tag) + '">✕</span></span>';
      }).join('') +
    '</div>' +
    '<div style="display:flex; gap:8px;">' +
      '<input type="text" id="modal-client-tags-input" placeholder="Nova tag..." class="campo-padrao campo-padrao-flex">' +
      '<button type="button" class="btn-primary" id="btn-modal-add-tag" style="padding:8px 14px; font-size:13px; display:flex; align-items:center;">Adicionar</button>' +
    '</div>' +
  '</div>';

  modal.innerHTML =
    '<h2>' + (cliente.codigo ? '#' + String(cliente.codigo).padStart(4,'0') + ' — ' : '') + escapeHtml(cliente.nome) + '</h2>' +
    '<p class="anexo-vazio">' + (CANAIS[cliente.canal] || cliente.canal || '') + (cliente.contato ? ' · ' + escapeHtml(cliente.contato) : '') + '</p>' +
    (cliente.responsavel ? '<p class="anexo-vazio">Responsável: ' + escapeHtml(cliente.responsavel) + '</p>' : '') +
    '<button class="btn-ghost" id="btn-editar-cliente" style="margin-bottom:12px;">✏️ Editar dados</button>' +
    '<div id="form-editar-cliente" style="display:none; background:var(--bg); border-radius:8px; padding:14px; margin-bottom:14px;"></div>' +

    '<p class="cliente-section-title" style="margin-bottom:4px;">Tags</p>' +
    tagsHtml +

    '<p class="cliente-section-title">Negócios</p>' +
    '<div id="cliente-negs">' + negsHtml + '</div>' +
    '<button class="btn-ghost" id="btn-novo-negocio-cliente" style="margin-top:6px;">+ Novo negócio para este cliente</button>' +

    '<p class="cliente-section-title">Histórico de interações</p>' +
    '<div id="cliente-interacoes">' + interacoesHtml + '</div>' +
    '<div class="interacao-form">' +
      '<select id="f-inter-tipo">' +
        '<option value="ligacao">Ligação</option>' +
        '<option value="whatsapp">WhatsApp</option>' +
        '<option value="visita">Visita</option>' +
        '<option value="email">E-mail</option>' +
        '<option value="outro">Outro</option>' +
      '</select>' +
      '<input type="date" id="f-inter-data" value="' + todayStr() + '">' +
      '<textarea id="f-inter-nota" placeholder="O que foi conversado?"></textarea>' +
    '</div>' +
    '<button class="btn-primary" id="btn-add-interacao" style="margin-top:8px;">Registrar interação</button>' +

    '<div class="modal-actions">' +
      '<button class="btn-danger" id="btn-del-cliente">Excluir cliente</button>' +
      '<div class="right-actions"><button class="btn-ghost" id="btn-fechar-cliente">Fechar</button></div>' +
    '</div>';

  modal.querySelectorAll('.negociacao-row').forEach(function(row){
    row.addEventListener('click', function(){
      document.getElementById('overlay-cliente').classList.remove('open');
      openModal(row.getAttribute('data-leadid'));
    });
  });

  modal.querySelectorAll('.interacao-del').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var ok = await customConfirm('Essa ação não pode ser desfeita.', 'Excluir este registro de interação?');
      if(!ok) return;
      await excluirInteracaoNoDb(btn.getAttribute('data-interid'));
      openClienteModal(clienteId);
    });
  });

  document.getElementById('btn-novo-negocio-cliente').addEventListener('click', function(){
    document.getElementById('overlay-cliente').classList.remove('open');
    openModal(null);
    var sel = document.getElementById('f-cliente-existente');
    if(sel){
      sel.value = clienteId;
      sel.dispatchEvent(new Event('change'));
    }
  });

  document.getElementById('btn-add-interacao').addEventListener('click', async function(){
    var tipo = document.getElementById('f-inter-tipo').value;
    var data = document.getElementById('f-inter-data').value || todayStr();
    var nota = document.getElementById('f-inter-nota').value.trim();
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    await criarInteracaoNoDb({ clienteId: clienteId, tipo: tipo, nota: nota, data: data });
    openClienteModal(clienteId);
  });

  document.getElementById('btn-fechar-cliente').addEventListener('click', closeClienteModal);

  document.getElementById('btn-del-cliente').addEventListener('click', async function(){
    if(negs.length > 0){
      toast('Este cliente tem ' + negs.length + ' negócio(s) vinculado(s). Exclua ou desvincule os negócios antes de excluir o cliente.', 'erro');
      return;
    }
    var ok = await customConfirm('Isso também exclui todo o histórico de interações. Essa ação não pode ser desfeita.', 'Excluir definitivamente este cliente?');
    if(!ok) return;
    await excluirClienteNoDb(clienteId);
    clientes = clientes.filter(function(c){ return c.id !== clienteId; });
    closeClienteModal();
    renderClientesView();
    toast('Cliente excluído.', 'sucesso');
  });

  document.getElementById('btn-editar-cliente').addEventListener('click', function(){
    var form = document.getElementById('form-editar-cliente');
    if(form.style.display !== 'none'){
      form.style.display = 'none';
      this.textContent = '✏️ Editar dados';
      return;
    }
    this.textContent = '✕ Cancelar edição';
    form.style.display = 'block';
    form.innerHTML =
      field('Nome / empresa', '<input id="edit-nome" type="text" value="' + escapeHtml(cliente.nome) + '">') +
      field('Tipo de cliente', '<select id="edit-tipo"><option value="juridica"' + (cliente.tipo==='juridica'?' selected':'') + '>Pessoa Jurídica</option><option value="fisica"' + (cliente.tipo==='fisica'?' selected':'') + '>Pessoa Física</option></select>') +
      field('Telefone / contato', '<input id="edit-contato" type="text" inputmode="numeric" value="' + maskTelefone(cliente.contato || '') + '" placeholder="(32) 99999-9999">') +
      field('Canal', '<select id="edit-canal"><option value="presencial"' + (cliente.canal==='presencial'?' selected':'') + '>Presencial</option><option value="telefone"' + (cliente.canal==='telefone'?' selected':'') + '>Telefone</option><option value="whatsapp"' + (cliente.canal==='whatsapp'?' selected':'') + '>WhatsApp</option><option value="indicacao"' + (cliente.canal==='indicacao'?' selected':'') + '>Indicação</option></select>') +
      field('Responsável', '<input id="edit-responsavel" type="text" value="' + escapeHtml(cliente.responsavel || '') + '" placeholder="Nome do contato na empresa">') +
      field('Notas', '<textarea id="edit-notas-cliente">' + escapeHtml(cliente.notas || '') + '</textarea>') +
      '<button class="btn-primary" id="btn-salvar-edicao-cliente">Salvar alterações</button>';

    var editContato = document.getElementById('edit-contato');
    if(editContato){
      editContato.addEventListener('input', function(){
        this.value = maskTelefone(this.value);
      });
    }

    document.getElementById('btn-salvar-edicao-cliente').addEventListener('click', async function(){
      this.disabled = true;
      this.textContent = 'Salvando...';
      cliente.nome = document.getElementById('edit-nome').value.trim() || cliente.nome;
      cliente.tipo = document.getElementById('edit-tipo').value;
      cliente.contato = document.getElementById('edit-contato').value.trim();
      cliente.canal = document.getElementById('edit-canal').value;
      cliente.responsavel = document.getElementById('edit-responsavel').value.trim();
      cliente.notes = document.getElementById('edit-notas-cliente').value.trim();
      cliente.notas = cliente.notes;
      await atualizarClienteNoDb(cliente);
      var idx = clientes.findIndex(function(c){ return c.id === cliente.id; });
      if(idx !== -1) clientes[idx] = Object.assign({}, cliente);
      toast('Dados do cliente atualizados.', 'sucesso');
      renderClientesView();
      openClienteModal(cliente.id);
    });
  });

  setupModalClientTagsEvents(cliente);
}

async function updateClientTags(cliente, newTags) {
  cliente.tags = newTags;
  await atualizarClienteNoDb(cliente);
  renderModalClientTags(cliente);
  renderClientesView();
}

function renderModalClientTags(cliente) {
  var chipsContainer = document.getElementById('modal-client-tags-chips');
  if (!chipsContainer) return;
  var clientTags = Array.isArray(cliente.tags) ? cliente.tags : [];
  chipsContainer.innerHTML = clientTags.map(function(tag) {
    return '<span class="tag-chip">' + escapeHtml(tag) + '<span class="tag-chip-remove" data-tag-val="' + escapeHtml(tag) + '">✕</span></span>';
  }).join('');
  
  chipsContainer.querySelectorAll('.tag-chip-remove').forEach(function(btn) {
    btn.onclick = async function(e) {
      e.stopPropagation();
      var tagVal = btn.getAttribute('data-tag-val');
      var currentTags = Array.isArray(cliente.tags) ? cliente.tags.slice() : [];
      var idx = currentTags.indexOf(tagVal);
      if (idx !== -1) {
        currentTags.splice(idx, 1);
        await updateClientTags(cliente, currentTags);
      }
    };
  });
}

function setupModalClientTagsEvents(cliente) {
  var btnAdd = document.getElementById('btn-modal-add-tag');
  var inputAdd = document.getElementById('modal-client-tags-input');
  
  async function addTag() {
    var val = inputAdd.value.trim();
    if (!val) return;
    var currentTags = Array.isArray(cliente.tags) ? cliente.tags.slice() : [];
    if (currentTags.indexOf(val) === -1) {
      currentTags.push(val);
      inputAdd.value = '';
      await updateClientTags(cliente, currentTags);
    }
  }
  
  if (btnAdd) {
    btnAdd.onclick = addTag;
  }
  if (inputAdd) {
    inputAdd.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTag();
      }
    });
  }
  
  renderModalClientTags(cliente);
}

function closeClienteModal(){
  document.getElementById('overlay-cliente').classList.remove('open');
}

document.getElementById('overlay-cliente').addEventListener('click', function(e){
  if(e.target.id === 'overlay-cliente') closeClienteModal();
});

// ---------- Calendário de atividades ----------

var calendarioRef = new Date();
var metasRef = new Date();
var diaSelecionado = null;
var tarefasExpandidas = {};

var MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
var DIAS_SEMANA_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function leadsNoDia(dataStr){
  return leads.filter(function(l){ return l.nextFollowUp === dataStr && l.stage !== 'fechado' && l.stage !== 'perdido'; });
}

async function renderCalendario(){
  var ano = calendarioRef.getFullYear();
  var mes = calendarioRef.getMonth();

  document.getElementById('cal-titulo').textContent = MESES_PT[mes] + ' de ' + ano;

  var primeiroDia = new Date(ano, mes, 1);
  var ultimoDia = new Date(ano, mes + 1, 0);
  var diaSemanaInicio = primeiroDia.getDay();
  var totalDiasMes = ultimoDia.getDate();

  var hojeStr = todayStr();
  var tarefasDoMes = await loadTarefasDoMes(ano, mes);

  var celulas = [];

  // dias do mês anterior, pra completar a primeira semana
  for(var i = 0; i < diaSemanaInicio; i++){
    var dPrev = new Date(ano, mes, i - diaSemanaInicio + 1);
    celulas.push({ data: dPrev, foraDoMes: true });
  }
  for(var dia = 1; dia <= totalDiasMes; dia++){
    celulas.push({ data: new Date(ano, mes, dia), foraDoMes: false });
  }
  // completa a última semana com dias do mês seguinte
  while(celulas.length % 7 !== 0){
    var ultimaData = celulas[celulas.length - 1].data;
    var dNext = new Date(ultimaData);
    dNext.setDate(dNext.getDate() + 1);
    celulas.push({ data: dNext, foraDoMes: true });
  }

  var html = DIAS_SEMANA_PT.map(function(d){ return '<div class="cal-weekday">' + d + '</div>'; }).join('');

  html += celulas.map(function(cel){
    var dataStr = cel.data.toISOString().slice(0,10);
    var itens = leadsNoDia(dataStr);
    var classes = 'cal-day';
    if(cel.foraDoMes) classes += ' fora-do-mes';
    if(dataStr === hojeStr) classes += ' hoje';
    if(dataStr === diaSelecionado) classes += ' selecionado';

    var tarefasDoDia = tarefasDoMes.filter(function(t){ return t.data === dataStr; });
    var totalItens = itens.length + tarefasDoDia.length;
    var mostrados = 0;
    var itensHtml = '';

    itens.slice(0, 3).forEach(function(l){
      if(mostrados >= 3) return;
      var atrasado = dataStr < hojeStr;
      var texto = (l.atividadeTipo ? l.atividadeTipo + ': ' : '') + l.nome;
      itensHtml += '<span class="cal-pill' + (atrasado ? ' atrasado' : '') + '">' + escapeHtml(texto) + '</span>';
      mostrados++;
    });

    tarefasDoDia.slice(0, Math.max(0, 3 - mostrados)).forEach(function(t){
      if(mostrados >= 3) return;
      var cls = t.concluida ? 'tarefa-normal' : 'tarefa-' + t.prioridade;
      itensHtml += '<span class="cal-pill ' + cls + '">📋 ' + escapeHtml(t.titulo) + '</span>';
      mostrados++;
    });

    if(totalItens > 3 && mostrados >= 3){
      itensHtml += '<span class="cal-pill mais">+' + (totalItens - 3) + '</span>';
    }

    return '<div class="' + classes + '" data-data="' + dataStr + '">' +
      '<div class="num">' + cel.data.getDate() + '</div>' +
      '<div class="itens">' + itensHtml + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('cal-grid').innerHTML = html;

  document.querySelectorAll('.cal-day').forEach(function(el){
    el.addEventListener('click', async function(){
      diaSelecionado = el.getAttribute('data-data');
      renderCalendario();
      await renderDetalheDoDia(diaSelecionado);
    });
  });

  if(!diaSelecionado){
    document.getElementById('cal-dia-detalhe').innerHTML = '';
  }
}

async function renderMetasView(){
  var container = document.getElementById('metas-container');
  if(!container.hasChildNodes()){
    container.innerHTML = '<p class="anexo-vazio">Carregando...</p>';
  }

  var hoje = new Date();
  var ano = metasRef.getFullYear();
  var mes = metasRef.getMonth();
  var anoAtual = ano;

  document.getElementById('metas-titulo').textContent = MESES_PT[mes].charAt(0).toUpperCase() + MESES_PT[mes].slice(1) + ' de ' + ano;
  var resultados = await Promise.all([
    loadLancamentosDoMes(ano, mes),
    loadLancamentosDoAno(anoAtual),
    loadMetasMensais(anoAtual)
  ]);
  var lancamentos = resultados[0];
  var lancamentosAno = resultados[1];
  var metasMensaisAno = resultados[2];

  // Calcular dias úteis do mês (seg-sex + sábados marcados pelo usuário)
  function getSabadosDoMes(ano, mes){
    var sabados = [];
    var d = new Date(ano, mes, 1);
    while(d.getMonth() === mes){
      if(d.getDay() === 6){
        sabados.push(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'));
      }
      d.setDate(d.getDate()+1);
    }
    return sabados;
  }

  function getDiasUteisDoMes(ano, mes, sabadosExtras){
    var count = 0;
    var d = new Date(ano, mes, 1);
    while(d.getMonth() === mes){
      var dow = d.getDay();
      var dataStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      if(dow >= 1 && dow <= 5) count++;
      else if(dow === 6 && sabadosExtras.indexOf(dataStr) !== -1) count++;
      d.setDate(d.getDate()+1);
    }
    return count;
  }

  function getDiasUteisAteHoje(ano, mes, sabadosExtras){
    var count = 0;
    var hoje = new Date();
    var d = new Date(ano, mes, 1);
    while(d.getMonth() === mes && d <= hoje){
      var dow = d.getDay();
      var dataStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      if(dow >= 1 && dow <= 5) count++;
      else if(dow === 6 && sabadosExtras.indexOf(dataStr) !== -1) count++;
      d.setDate(d.getDate()+1);
    }
    return count;
  }

  var totalDiasUteis = getDiasUteisDoMes(ano, mes, sabadosUteis);
  var diasUteisAteHoje = getDiasUteisAteHoje(ano, mes, sabadosUteis);
  var hojeStr = todayStr();

  function getMetaMes(m){
    var found = metasMensaisAno.find(function(x){ return x.mes === m; });
    return found ? found.valor : 0;
  }
  // Admin vendo todos: soma as metas de todos os membros da equipe
  if(papelAtual === 'admin' && equipeAtual && !filtroVendedorId){
    var todasMetasMes = await Promise.all(
      Object.keys(membrosDaEquipe).map(function(uid){
        return sb.from('metas_mensais').select('valor')
          .eq('equipe_id', equipeAtual.id)
          .eq('user_id', uid)
          .eq('ano', anoAtual)
          .eq('mes', mes)
          .maybeSingle();
      })
    );
    metaMensal = todasMetasMes.reduce(function(soma, res){
      return soma + (res.data ? Number(res.data.valor) || 0 : 0);
    }, 0);
  } else {
    metaMensal = getMetaMes(mes);
  }
  var metaDia = totalDiasUteis > 0 ? metaMensal / totalDiasUteis : 0;
  var totalLancado = lancamentos.reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
  var totalLancadoAntesDehoje = lancamentos.filter(function(l){ return String(l.data).slice(0,10) < hojeStr; }).reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
  var sabadosDoMes = getSabadosDoMes(ano, mes);
  var pctMes = metaMensal > 0 ? Math.min(100, Math.round((totalLancado / metaMensal) * 100)) : 0;
  var faltaMes = Math.max(0, metaMensal - totalLancado);

  // Calcular dias úteis RESTANTES (a partir de amanhã, não incluindo hoje)
  function getDiasUteisRestantes(ano, mes, sabadosExtras){
    var count = 0;
    var amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(0,0,0,0);
    var d = new Date(amanha);
    while(d.getMonth() === mes){
      var dow = d.getDay();
      var dataStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      if(dow >= 1 && dow <= 5) count++;
      else if(dow === 6 && sabadosExtras.indexOf(dataStr) !== -1) count++;
      d.setDate(d.getDate()+1);
    }
    return count;
  }

  var diasRestantes = getDiasUteisRestantes(ano, mes, sabadosUteis);
  var faltaParaMeta = Math.max(0, metaMensal - totalLancado);
  var faltaParaMetaNoInicioDoDia = Math.max(0, metaMensal - totalLancadoAntesDehoje);
  var metaAcumuladaAteHoje = metaDia * diasUteisAteHoje;
  var diferenca = totalLancado - metaAcumuladaAteHoje;

  // Calcular o que foi vendido especificamente hoje
  var vendidoHoje = lancamentos.filter(function(l){ return l.data === hojeStr; }).reduce(function(s,l){ return s + l.valor; }, 0);
  var diferencaHoje = vendidoHoje - metaDia;
  var pctHoje = metaDia > 0 ? Math.min(100, Math.round((vendidoHoje / metaDia) * 100)) : 0;
  var faltaHoje = Math.max(0, metaDia - vendidoHoje);

  var html = '';

  // Linha 1: card de hoje (largura total)
  html += '<div class="metas-grid metas-grid-full" style="display:block;">';
  html += '<div class="metas-section" style="border-left:4px solid var(--amber);">';
  html += '<h3>Meta de hoje — ' + (function(){ var d = new Date(); return d.getDate() + ' de ' + MESES_PT[d.getMonth()]; })() + '</h3>';

  var metaHojeRecalc = (diasRestantes + 1) > 0 ? faltaParaMetaNoInicioDoDia / (diasRestantes + 1) : metaDia;
  var diferencaHojeRecalc = vendidoHoje - metaHojeRecalc;
  var pctHojeRecalc = metaHojeRecalc > 0 ? Math.min(100, Math.round((vendidoHoje / metaHojeRecalc) * 100)) : 0;
  var faltaHojeRecalc = Math.max(0, metaHojeRecalc - vendidoHoje);
  var metaProxDias = diasRestantes > 0 ? Math.max(0, faltaParaMeta) / diasRestantes : 0;

  html += '<div style="display:flex; align-items:baseline; gap:32px; flex-wrap:wrap; margin-bottom:14px;">';
  html += '<div><div class="meta-dia-num">' + fmtMoney(metaHojeRecalc) + '</div><div class="meta-dia-label">Meta de hoje (recalculada)</div></div>';
  html += '<div><div class="meta-dia-num">' + fmtMoney(vendidoHoje) + '</div><div class="meta-dia-label">Vendido hoje</div></div>';
  html += '<div><div class="meta-dia-num" style="color:' + (diferencaHojeRecalc >= 0 ? 'var(--green)' : 'var(--red)') + ';">' + (diferencaHojeRecalc >= 0 ? '+' : '') + fmtMoney(diferencaHojeRecalc) + '</div><div class="meta-dia-label">Diferença</div></div>';
  if(diasRestantes > 0){
    html += '<div><div class="meta-dia-num" style="color:var(--blue);">' + fmtMoney(metaProxDias) + '</div><div class="meta-dia-label">Meta recalculada próx. dias</div></div>';
  }
  html += '</div>';
  html += '<div class="meta-barra-fundo"><div class="meta-barra-preenchida" style="width:' + pctHojeRecalc + '%;"></div></div>';
  html += '<p class="meta-box-sub">' + pctHojeRecalc + '% da meta de hoje · ';
  html += faltaHojeRecalc > 0 ? 'faltam ' + fmtMoney(faltaHojeRecalc) + ' para fechar o dia' : 'meta do dia atingida! 🎉';
  if(diasRestantes > 0) html += ' · ' + diasRestantes + ' dia(s) útil(eis) restantes no mês';
  html += '</p>';
  html += '</div>';
  html += '</div>';

  // Linha 2: dois cards lado a lado (resumo do mês + sábados/lançamento)
  html += '<div class="metas-grid">';

  // Card esquerdo: resumo do mês
  html += '<div class="metas-section">';
  html += '<h3>Meta de ' + MESES_PT[mes] + ' de ' + ano + '</h3>';
  html += '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;">';
  html += '<div class="kpi"><div class="num">' + fmtMoney(metaMensal) + '</div><div class="lbl">Meta do mês</div></div>';
  html += '<div class="kpi"><div class="num">' + fmtMoney(metaDia) + '</div><div class="lbl">Meta por dia útil</div></div>';
  html += '<div class="kpi"><div class="num">' + fmtMoney(totalLancado) + '</div><div class="lbl">Total lançado</div></div>';
  html += '<div class="kpi"><div class="num">' + totalDiasUteis + '</div><div class="lbl">Dias úteis no mês</div></div>';
  html += '<div class="kpi"><div class="num">' + diasUteisAteHoje + '</div><div class="lbl">Dias trabalhados</div></div>';
  html += '<div class="kpi"><div class="num" style="color:' + (diasRestantes <= 3 ? 'var(--red)' : diasRestantes <= 7 ? 'var(--amber-dark)' : 'var(--ink)') + ';">' + diasRestantes + '</div><div class="lbl">Dias úteis restantes</div></div>';
  html += '</div>';
  html += '<div class="meta-barra-fundo"><div class="meta-barra-preenchida" style="width:' + pctMes + '%;"></div></div>';
  html += '<p class="meta-box-sub">' + pctMes + '% da meta mensal · ' + (faltaMes > 0 ? 'faltam ' + fmtMoney(faltaMes) : 'meta mensal atingida! 🎉') + '</p>';
  if(diasUteisAteHoje > 0){
    html += diferenca >= 0
      ? '<p class="meta-status-ahead">▲ Você está ' + fmtMoney(Math.abs(diferenca)) + ' à frente da meta acumulada até hoje</p>'
      : '<p class="meta-status-behind">▼ Você está ' + fmtMoney(Math.abs(diferenca)) + ' abaixo da meta acumulada até hoje</p>';
  }
  html += '</div>';

  // Card direito: sábados + lançamento
  html += '<div>';

  if(sabadosDoMes.length > 0 && !(papelAtual === 'admin' && equipeAtual && !filtroVendedorId)){
    html += '<div class="metas-section">';
    html += '<h3>Sábados que vou trabalhar</h3>';
    html += '<div class="sabados-grid">';
    sabadosDoMes.forEach(function(dataStr){
      var d = new Date(dataStr + 'T00:00:00');
      var label = d.getDate() + '/' + String(d.getMonth()+1).padStart(2,'0');
      var ativo = sabadosUteis.indexOf(dataStr) !== -1;
      html += '<div class="sabado-chip' + (ativo?' ativo':'') + '" data-sabado="' + dataStr + '">' + label + '</div>';
    });
    html += '</div>';
    html += '</div>';
  }

  html += '<div class="metas-section">';
  html += '<h3>Lançar vendas do dia</h3>';
  html += '<div class="row2">';
  html += '<div class="field"><label>Data</label><input type="date" id="lanc-data" value="' + hojeStr + '"></div>';
  html += '<div class="field"><label>Valor vendido (R$)</label><input type="text" id="lanc-valor" inputmode="numeric" placeholder="0,00"></div>';
  html += '</div>';
  html += '<div class="field"><label>Descrição (opcional)</label><input type="text" id="lanc-desc" placeholder="Ex: Venda balcão, pedido recorrente..."></div>';
  html += '<button class="btn-primary" id="btn-lancar-venda">Registrar lançamento</button>';
  html += '</div>';

  html += '</div>';
  html += '</div>';

  // Linha 3: histórico (largura total)
  html += '<div class="metas-section">';
  html += '<h3>Lançamentos do mês</h3>';
  if(lancamentos.length === 0){
    html += '<p class="anexo-vazio">Nenhum lançamento registrado ainda este mês.</p>';
  } else {
    html += lancamentos.map(function(l){
      var d = new Date(l.data + 'T00:00:00');
      var dataFmt = d.getDate() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
      return '<div class="lancamento-row">' +
        '<div><span class="ldata">' + dataFmt + '</span>' + (l.descricao ? ' — <span class="ldesc">' + escapeHtml(l.descricao) + '</span>' : '') + '</div>' +
        '<div style="display:flex; align-items:center; gap:10px;">' +
          '<span class="lvalor">' + fmtMoney(l.valor) + '</span>' +
          '<button class="btn-ghost" style="font-size:12px; padding:5px 10px;" data-lanc-edit-id="' + l.id + '" data-lanc-data="' + l.data + '" data-lanc-valor="' + l.valor + '" data-lanc-desc="' + escapeHtml(l.descricao) + '" title="Editar">✏️</button>' +
          '<button class="lancamento-del" data-lanc-id="' + l.id + '" title="Excluir">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  html += '</div>';

  // Card: Planejador de metas mensais escaláveis
  html += '<div class="metas-section">';
  html += '<h3>Planejamento de metas por mês — ' + anoAtual + '</h3>';
  if(papelAtual === 'admin' && equipeAtual && !filtroVendedorId){
    html += '<p class="aviso-info">📋 Você está vendo a visão agregada da equipe. Para definir metas individuais, selecione um vendedor no filtro.</p>';
  } else {
    html += '<p class="meta-dia-label" style="margin-bottom:12px;">Defina uma meta diferente para cada mês. Deixe em branco para usar a meta padrão (R$ ' + fmtMoney(metaMensal) + ').</p>';
  }

  if(papelAtual === 'admin' && equipeAtual && !filtroVendedorId){
    // Modo agregado: mostrar só os totais por mês, sem campos de edição
    html += '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px;">';
    for(var pm2 = 0; pm2 < 12; pm2++){
      var prefMes = anoAtual + '-' + String(pm2+1).padStart(2,'0');
      var totalMes2 = lancamentosAno.filter(function(l){ return l.data.startsWith(prefMes); }).reduce(function(s,l){ return s + l.valor; }, 0);
      html += '<div class="field" style="margin:0;">';
      html += '<label>' + MESES_PT[pm2].charAt(0).toUpperCase() + MESES_PT[pm2].slice(1) + '</label>';
      html += '<div style="padding:8px 12px; background:var(--bg); border:1px solid var(--line); border-radius:8px; font-size:13px; color:var(--ink-soft);">' + fmtMoney(totalMes2) + '</div>';
      html += '</div>';
    }
    html += '</div>';
    html += '</div>'; // fecha metas-section do planejador
  } else {
    html += '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px;" id="planejador-metas-grid">';
    for(var pm = 0; pm < 12; pm++){
      var metaPmFound = metasMensaisAno.find(function(x){ return x.mes === pm; });
      var metaPmVal = metaPmFound ? metaPmFound.valor : 0;
      html += '<div class="field" style="margin:0;">';
      html += '<label>' + MESES_PT[pm].charAt(0).toUpperCase() + MESES_PT[pm].slice(1) + '</label>';
      html += '<input type="text" inputmode="numeric" class="meta-mes-input" data-mes="' + pm + '" value="' + (metaPmVal > 0 ? formatValorParaInput(metaPmVal) : '') + '" placeholder="Sem meta">';
      html += '</div>';
    }
    html += '</div>';
    html += '<button class="btn-primary" style="margin-top:14px;" id="btn-salvar-metas-mensais">Salvar planejamento</button>';
    html += '</div>';
  } // fecha else do modo individual

  // Card: Dashboard de evolução — gráficos
  html += '<div class="metas-section">';
  html += '<h3>Evolução de vendas — ' + anoAtual + '</h3>';
  html += '<div class="dash-grid" style="margin-bottom:16px;">';

  // Gráfico 1: diário (mês atual)
  html += '<div class="dash-card"><h3>Vendas dia a dia — ' + MESES_PT[mes] + '</h3><p class="sub">Vendido vs. meta diária</p><div class="chart-wrap"><canvas id="chart-evo-diario"></canvas></div></div>';

  // Gráfico 2: mensal (ano atual)
  html += '<div class="dash-card"><h3>Vendas mensais — ' + anoAtual + '</h3><p class="sub">Total vendido por mês vs. meta</p><div class="chart-wrap"><canvas id="chart-evo-mensal"></canvas></div></div>';

  // Gráfico 3: anual — acumulado + projeção
  html += '<div class="dash-card" style="grid-column:1/-1;"><h3>Acumulado anual e projeção</h3><p class="sub">Linha real + projeção de fechamento do ano no ritmo atual</p><div class="chart-wrap"><canvas id="chart-evo-anual"></canvas></div></div>';

  html += '</div>';
  html += '</div>';

  container.innerHTML = html;

  // Listeners sábados
  container.querySelectorAll('.sabado-chip').forEach(function(chip){
    chip.addEventListener('click', function(){
      var dataStr = chip.getAttribute('data-sabado');
      var idx = sabadosUteis.indexOf(dataStr);
      if(idx !== -1){
        sabadosUteis.splice(idx, 1);
        chip.classList.remove('ativo');
      } else {
        sabadosUteis.push(dataStr);
        chip.classList.add('ativo');
      }
      // Atualiza a tela imediatamente com o estado local
      renderMetasView();
      // Salva no banco em segundo plano sem bloquear a interface
      salvarSabadosUteis(sabadosUteis).catch(function(e){
        console.error('Erro ao salvar sábados', e);
        toast('Não foi possível salvar. Tente novamente.', 'erro');
      });
    });
  });

  // Máscara no valor
  var inputValor = document.getElementById('lanc-valor');
  if(inputValor){
    inputValor.addEventListener('input', function(){
      this.value = maskValor(this.value);
    });
  }

  // Registrar lançamento
  document.getElementById('btn-lancar-venda').addEventListener('click', async function(){
    var data = document.getElementById('lanc-data').value || hojeStr;
    var valor = parseValorMascarado(document.getElementById('lanc-valor').value);
    var descricao = document.getElementById('lanc-desc').value.trim();
    if(!valor || valor <= 0){
      toast('Informe um valor maior que zero.', 'erro');
      return;
    }
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Registrando...';
    var novo = await criarLancamento(data, valor, descricao);
    if(novo){
      toast('Lançamento registrado!', 'sucesso');
      renderMetasView();
    } else {
      btn.disabled = false;
      btn.textContent = 'Registrar lançamento';
    }
  });

  // Excluir lançamento
  container.querySelectorAll('.lancamento-del').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var ok = await customConfirm('Esse lançamento será excluído permanentemente.', 'Excluir lançamento?');
      if(!ok) return;
      await excluirLancamento(btn.getAttribute('data-lanc-id'));
      toast('Lançamento excluído.', 'sucesso');
      renderMetasView();
    });
  });

  container.querySelectorAll('[data-lanc-edit-id]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var lancId = btn.getAttribute('data-lanc-edit-id');
      var lancData = btn.getAttribute('data-lanc-data');
      var lancValor = Number(btn.getAttribute('data-lanc-valor')) || 0;
      var lancDesc = btn.getAttribute('data-lanc-desc') || '';

      var editArea = document.getElementById('edit-lanc-' + lancId);
      if(editArea){
        editArea.remove();
        return;
      }

      var row = btn.closest('.lancamento-row');
      var formDiv = document.createElement('div');
      formDiv.id = 'edit-lanc-' + lancId;
      formDiv.style = 'background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin-top:6px;';
      formDiv.innerHTML =
        '<div class="row2" style="margin-bottom:8px;">' +
          '<div class="field" style="margin:0;"><label>Data</label><input type="date" id="edit-lanc-data-' + lancId + '" value="' + lancData + '"></div>' +
          '<div class="field" style="margin:0;"><label>Valor (R$)</label><input type="text" id="edit-lanc-valor-' + lancId + '" inputmode="numeric" value="' + formatValorParaInput(lancValor) + '"></div>' +
        '</div>' +
        '<div class="field" style="margin-bottom:8px;"><label>Descrição</label><input type="text" id="edit-lanc-desc-' + lancId + '" value="' + lancDesc + '" placeholder="Descrição (opcional)"></div>' +
        '<div style="display:flex; gap:8px;">' +
          '<button class="btn-primary" style="font-size:13px; padding:8px 14px;" id="btn-salvar-lanc-' + lancId + '">Salvar</button>' +
          '<button class="btn-ghost" style="font-size:13px; padding:8px 14px;" id="btn-cancelar-lanc-' + lancId + '">Cancelar</button>' +
        '</div>';

      row.insertAdjacentElement('afterend', formDiv);

      var inputValorEdit = document.getElementById('edit-lanc-valor-' + lancId);
      if(inputValorEdit){
        inputValorEdit.addEventListener('input', function(){
          this.value = maskValor(this.value);
        });
      }

      document.getElementById('btn-cancelar-lanc-' + lancId).addEventListener('click', function(){
        formDiv.remove();
      });

      document.getElementById('btn-salvar-lanc-' + lancId).addEventListener('click', async function(){
        var novaData = document.getElementById('edit-lanc-data-' + lancId).value;
        var novoValor = parseValorMascarado(document.getElementById('edit-lanc-valor-' + lancId).value);
        var novaDesc = document.getElementById('edit-lanc-desc-' + lancId).value.trim();

        if(!novoValor || novoValor <= 0){
          toast('Informe um valor maior que zero.', 'erro');
          return;
        }

        this.disabled = true;
        this.textContent = 'Salvando...';

        var res = await sb.from('lancamentos_diarios').update({
          data: novaData,
          valor: novoValor,
          descricao: novaDesc || null
        }).eq('id', lancId).eq('user_id', currentUserId);

        if(res.error){
          toast('Não foi possível salvar a alteração.', 'erro');
          this.disabled = false;
          this.textContent = 'Salvar';
          return;
        }

        toast('Lançamento atualizado!', 'sucesso');
        formDiv.remove();
        renderMetasView();
      });
    });
  });

  // Listeners do planejador
  document.querySelectorAll('.meta-mes-input').forEach(function(input){
    input.addEventListener('input', function(){
      this.value = maskValor(this.value);
    });
  });

  var btnSalvarMetas = document.getElementById('btn-salvar-metas-mensais');
  if(btnSalvarMetas){
    btnSalvarMetas.addEventListener('click', async function(){
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Salvando...';

      var inputs = document.querySelectorAll('.meta-mes-input');
      var erros = 0;

      for(var i = 0; i < inputs.length; i++){
        var inp = inputs[i];
        var m = Number(inp.getAttribute('data-mes'));
        var valorDigitado = inp.value.replace(/\D/g, '');
        var v = valorDigitado ? parseValorMascarado(inp.value) : 0;
        if(v > 0){
          var ok = await salvarMetaMensal(anoAtual, m, v);
          if(!ok) erros++;
        } else {
          // campo vazio ou zero: apaga do banco pra não ficar lixo
          await sb.from('metas_mensais').delete()
            .eq('user_id', currentUserId)
            .eq('ano', Number(anoAtual))
            .eq('mes', Number(m));
        }
      }

      if(erros === 0){
        toast('Planejamento de metas salvo!', 'sucesso');
        marcarEtapaOnboarding('meta_definida');
      } else {
        toast('Algumas metas não foram salvas. Verifique sua conexão.', 'erro');
      }

      btn.disabled = false;
      btn.textContent = 'Salvar planejamento';
      renderMetasView();
    });
  }

  renderGraficosEvolucao();

  function renderGraficosEvolucao(){
    // Destruir gráficos existentes
    ['chart-evo-diario','chart-evo-mensal','chart-evo-anual'].forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      var existing = Chart.getChart(el);
      if(existing) existing.destroy();
    });

    // GRÁFICO 1: Vendas dia a dia no mês atual
    var diasDoMes = new Date(ano, mes+1, 0).getDate();
    var labelsDiario = [];
    var vendidoDiario = [];
    var metaDiaria = [];
    for(var d = 1; d <= diasDoMes; d++){
      var dStr = ano + '-' + String(mes+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      labelsDiario.push(String(d));
      var v = lancamentos.filter(function(l){ return String(l.data).slice(0,10) === dStr; }).reduce(function(s,l){ return s + l.valor; }, 0);
      vendidoDiario.push(v);
      metaDiaria.push(Math.round(metaHojeRecalc * 100) / 100);
    }
    try{
      new Chart(document.getElementById('chart-evo-diario'), {
        type: 'bar',
        data: {
          labels: labelsDiario,
          datasets: [
            { label:'Vendido', data: vendidoDiario, backgroundColor:'rgba(232,163,23,0.8)', borderRadius:4 },
            { label:'Meta do dia', data: metaDiaria, type:'line', borderColor:'#C0392B', borderWidth:2, pointRadius:0, fill:false }
          ]
        },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{ y:{ beginAtZero:true, ticks:{ callback:function(v){ return 'R$' + v.toLocaleString('pt-BR'); } } } } }
      });
    }catch(e){ console.error('Erro gráfico diário', e); }

    // GRÁFICO 2: Total vendido por mês vs. meta
    var labelsMensal = MESES_PT.map(function(m){ return m.slice(0,3).charAt(0).toUpperCase() + m.slice(1,3); });
    var vendidoMensal = [];
    var metaMensal12 = [];
    for(var m2 = 0; m2 < 12; m2++){
      var prefixo = anoAtual + '-' + String(m2+1).padStart(2,'0');
      var total = lancamentosAno.filter(function(l){ return l.data.startsWith(prefixo); }).reduce(function(s,l){ return s + l.valor; }, 0);
      vendidoMensal.push(total);
      metaMensal12.push(getMetaMes(m2));
    }
    try{
      new Chart(document.getElementById('chart-evo-mensal'), {
        type: 'bar',
        data: {
          labels: labelsMensal,
          datasets: [
            { label:'Vendido', data: vendidoMensal, backgroundColor:'rgba(46,125,79,0.8)', borderRadius:4 },
            { label:'Meta', data: metaMensal12, type:'line', borderColor:'#E8A317', borderWidth:2, pointRadius:3, fill:false }
          ]
        },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{ y:{ beginAtZero:true, ticks:{ callback:function(v){ return 'R$' + v.toLocaleString('pt-BR'); } } } } }
      });
    }catch(e){ console.error('Erro gráfico mensal', e); }

    // GRÁFICO 3: Acumulado anual + projeção
    var labelsAnual = MESES_PT.map(function(m){ return m.slice(0,3).charAt(0).toUpperCase() + m.slice(1,3); });
    var acumuladoReal = [];
    var acumuladoMeta = [];
    var acumuladoProjecao = [];
    var somaReal = 0;
    var somaMeta = 0;
    var mesAtualIdx = new Date().getMonth();
    var totalVendidoAte = 0;
    var mesesComDados = 0;
    for(var m3 = 0; m3 < 12; m3++){
      var pref = anoAtual + '-' + String(m3+1).padStart(2,'0');
      var tv = lancamentosAno.filter(function(l){ return l.data.startsWith(pref); }).reduce(function(s,l){ return s + l.valor; }, 0);
      somaReal += tv;
      somaMeta += getMetaMes(m3);
      acumuladoMeta.push(somaMeta);
      if(m3 <= mesAtualIdx){
        acumuladoReal.push(somaReal);
        if(tv > 0) mesesComDados++;
        totalVendidoAte = somaReal;
        acumuladoProjecao.push(null);
      } else {
        acumuladoReal.push(null);
        var mediasMeses = mesAtualIdx + 1;
        var mediaMensalVal = mediasMeses > 0 ? totalVendidoAte / mediasMeses : 0;
        acumuladoProjecao.push(totalVendidoAte + mediaMensalVal * (m3 - mesAtualIdx));
      }
    }
    try{
      new Chart(document.getElementById('chart-evo-anual'), {
        type: 'line',
        data: {
          labels: labelsAnual,
          datasets: [
            { label:'Acumulado real', data: acumuladoReal, borderColor:'#2E7D4F', backgroundColor:'rgba(46,125,79,0.1)', fill:true, tension:0.3, pointBackgroundColor:'#2E7D4F' },
            { label:'Meta acumulada', data: acumuladoMeta, borderColor:'#E8A317', borderDash:[6,3], borderWidth:2, pointRadius:0, fill:false },
            { label:'Projeção', data: acumuladoProjecao, borderColor:'#2B6CA3', borderDash:[4,4], borderWidth:2, pointRadius:3, fill:false }
          ]
        },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{ y:{ beginAtZero:true, ticks:{ callback:function(v){ return 'R$' + v.toLocaleString('pt-BR'); } } } } }
      });
    }catch(e){ console.error('Erro gráfico anual', e); }
  }
}

async function renderDetalheDoDia(dataStr){
  var itens = leadsNoDia(dataStr);
  var d = new Date(dataStr + 'T00:00:00');
  var titulo = d.getDate() + ' de ' + MESES_PT[d.getMonth()] + ' de ' + d.getFullYear();
  var tarefasDia = await loadTarefasDoDia(dataStr);

  function buildTarefaHtml(t){
    var cls = 'tarefa-prioridade-' + t.prioridade;
    var checklistHtml = '';
    if(t.checklist && t.checklist.length > 0){
      checklistHtml = '<p class="tarefa-secao-label">Checklist (' + t.checklist.filter(function(c){return c.concluido;}).length + '/' + t.checklist.length + ')</p>';
      checklistHtml += t.checklist.map(function(item, idx){
        return '<div class="checklist-item">' +
          '<div class="checklist-check' + (item.concluido ? ' marcada' : '') + '" data-cl-check data-tarefa-id="' + t.id + '" data-cl-idx="' + idx + '">' + (item.concluido ? '✓' : '') + '</div>' +
          '<span class="checklist-texto' + (item.concluido ? ' riscado' : '') + '">' + escapeHtml(item.texto) + '</span>' +
          '<button class="checklist-del" data-cl-del data-tarefa-id="' + t.id + '" data-cl-idx="' + idx + '" title="Remover">✕</button>' +
        '</div>';
      }).join('');
    }
    checklistHtml += '<div class="add-checklist-row">' +
      '<input type="text" id="cl-input-' + t.id + '" class="campo-padrao campo-padrao-flex" placeholder="Adicionar item ao checklist...">' +
      '<button class="btn-ghost" style="font-size:12px;" data-cl-add data-tarefa-id="' + t.id + '">+ Adicionar</button>' +
    '</div>';

    var anexosHtml = '<p class="tarefa-secao-label">Anexos</p>';
    if(t.anexos && t.anexos.length > 0){
      anexosHtml += t.anexos.map(function(a, idx){
        return '<div class="tarefa-anexo-item">' +
          '<span class="tarefa-anexo-link" data-anexo-abrir data-tarefa-id="' + t.id + '" data-anx-idx="' + idx + '">📎 ' + escapeHtml(a.nome) + '</span>' +
          '<span style="color:var(--ink-faint); font-size:11px;">(' + fmtTamanho(a.tamanho) + ')</span>' +
          '<button class="tarefa-del" data-anexo-del data-tarefa-id="' + t.id + '" data-anx-idx="' + idx + '" title="Excluir">✕</button>' +
        '</div>';
      }).join('');
    }
    anexosHtml += '<div class="anexo-drop-area tarefa-drop-area" data-tarefa-id="' + t.id + '" style="margin-top:6px; padding:10px;">' +
      '<input type="file" class="tarefa-file-input" data-tarefa-id="' + t.id + '">' +
      '📎 Arraste ou clique para anexar' +
    '</div>';

    // Histórico da tarefa
    var historicoHtml = '';
    if(t.historico && t.historico.length > 0){
      historicoHtml = '<div class="historico-tarefa">';
      historicoHtml += '<p class="tarefa-secao-label">Histórico</p>';
      historicoHtml += t.historico.map(function(h){
        if(h.tipo === 'criacao'){
          return '<div class="historico-item historico-tipo-criacao">' +
            '<div><span class="hist-tipo">Criada</span> por ' + escapeHtml(h.nome) +
            ' <span class="hist-data">· ' + fmtDateBR(h.data) + '</span></div>' +
          '</div>';
        }
        if(h.tipo === 'transferencia'){
          return '<div class="historico-item historico-tipo-transferencia">' +
            '<div><span class="hist-tipo">Transferida</span> de ' + escapeHtml(h.de_nome) +
            ' para <strong>' + escapeHtml(h.para_nome) + '</strong>' +
            (h.feito_por ? ' por ' + escapeHtml(h.feito_por) : '') +
            ' <span class="hist-data">· ' + fmtDateBR(h.data) + '</span></div>' +
          '</div>';
        }
        return '';
      }).join('');
      historicoHtml += '</div>';
    }

    return '<div class="tarefa-item' + (t.concluida ? ' concluida' : '') + '" data-tarefa-id="' + t.id + '">' +
      '<div class="tarefa-check' + (t.concluida ? ' marcada' : '') + '" data-check-id="' + t.id + '">' + (t.concluida ? '✓' : '') + '</div>' +
      '<div class="tarefa-corpo">' +
        '<p class="tarefa-titulo">' + escapeHtml(t.titulo) + '</p>' +
        '<div class="tarefa-meta">' +
          '<span>' + t.categoria + '</span>' +
          (t.prioridade !== 'normal' ? '<span class="' + cls + '">' + t.prioridade + '</span>' : '') +
          '<span>' + fmtDateBR(t.data) + '</span>' +
          (t.checklist && t.checklist.length > 0 ? '<span>✓ ' + t.checklist.filter(function(c){return c.concluido;}).length + '/' + t.checklist.length + '</span>' : '') +
          (t.anexos && t.anexos.length > 0 ? '<span>📎 ' + t.anexos.length + '</span>' : '') +
        '</div>' +
        '<div class="tarefa-detalhe" id="det-' + t.id + '">' +
          (t.descricao ? '<p style="font-size:13px; margin:0 0 8px; color:var(--ink-soft);">' + escapeHtml(t.descricao) + '</p>' : '') +
          checklistHtml +
          anexosHtml +
          '<div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">' +
            '<button class="btn-ghost" style="font-size:12px; padding:5px 10px;" data-edit-id="' + t.id + '">✏️ Editar</button>' +
          '</div>' +
          (function(){
            if(!(papelAtual === 'admin' && equipeAtual && Object.keys(membrosDaEquipe).length > 1)) return '';
            var outros = Object.entries(membrosDaEquipe).filter(function(e){ return e[0] !== t.userId; });
            if(!outros.length) return '';
            return '<button class="btn-ghost" style="font-size:12px; padding:5px 10px;" data-abrir-transferir="' + t.id + '">↔ Transferir</button>' +
              '<div id="form-transferir-' + t.id + '" style="display:none;" class="form-transferencia">' +
                '<p class="tarefa-secao-label" style="margin-top:0;">Transferir para</p>' +
                '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">' +
                  '<select id="sel-transferir-' + t.id + '" style="flex:1;" class="campo-padrao">' +
                    outros.map(function(e){
                      return '<option value="' + e[0] + '">' + escapeHtml(e[1]) + '</option>';
                    }).join('') +
                  '</select>' +
                  '<button class="btn-primary" style="font-size:13px;" data-confirmar-transferir="' + t.id + '">Transferir</button>' +
                  '<button class="btn-ghost" style="font-size:13px;" data-cancelar-transferir="' + t.id + '">Cancelar</button>' +
                '</div>' +
              '</div>';
          })() +
          historicoHtml +
          '<div id="form-edit-tarefa-' + t.id + '" style="display:none; margin-top:10px;"></div>' +
        '</div>' +
      '</div>' +
      '<button class="tarefa-del" data-del-id="' + t.id + '" title="Excluir">✕</button>' +
    '</div>';
  }

  var tarefasHtml = tarefasDia.length
    ? tarefasDia.map(function(t){ return buildTarefaHtml(t); }).join('')
    : '<p class="anexo-vazio">Nenhuma tarefa para este dia.</p>';

  var corpo = itens.length
    ? itens.map(function(l){
        return '<div class="negociacao-row" data-leadid="' + l.id + '">' +
          '<span>' + (l.atividadeTipo ? '📌 ' + escapeHtml(l.atividadeTipo) + ' — ' : '') + escapeHtml(l.nome) + ' · ' + fmtMoney(l.valor) + '</span>' +
          '<div style="display:inline-flex; align-items:center; gap:8px;">' +
            '<span class="badge-stage" style="background:' + (STAGES.find(function(s){return s.id===l.stage;})||STAGES[0]).color + ';">' + (STAGES.find(function(s){return s.id===l.stage;})||STAGES[0]).label + '</span>' +
            (l.nextFollowUp ? '<button class="btn-concluir-followup" data-lead-id="' + l.id + '" title="Marcar como concluído">✓</button>' : '') +
          '</div>' +
        '</div>';
      }).join('')
    : '<p class="anexo-vazio">Nenhum follow-up para este dia.</p>';

  var box = document.getElementById('cal-dia-detalhe');
  var idsExpandidosAntes = Object.keys(tarefasExpandidas).filter(function(id){ return tarefasExpandidas[id]; });

  box.innerHTML =
    '<div class="cal-dia-detalhe-box">' +
      '<h3>' + titulo + '</h3>' +
      '<p class="cliente-section-title" style="margin-top:0;">Follow-ups</p>' + corpo +
      '<p class="cliente-section-title">Tarefas</p>' +
      '<div id="tarefas-lista-dia">' + tarefasHtml + '</div>' +
      '<div id="form-nova-tarefa-container"></div>' +
      '<button class="btn-ghost" id="btn-mostrar-form-tarefa" style="margin-top:8px; font-size:13px;">+ Nova tarefa</button>' +
    '</div>';

  idsExpandidosAntes.forEach(function(tid){
    var det = document.getElementById('det-' + tid);
    if(det) det.classList.add('aberto');
  });

  // Expandir/recolher ao clicar no item (mas não nos botões internos)
  box.querySelectorAll('.tarefa-item').forEach(function(item){
    item.addEventListener('click', function(e){
      if(e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select') || e.target.closest('label') || e.target.closest('[data-check-id]') || e.target.closest('[data-cl-check]')) return;
      var tid = item.getAttribute('data-tarefa-id');
      var det = document.getElementById('det-' + tid);
      if(!det) return;
      det.classList.toggle('aberto');
      tarefasExpandidas[tid] = det.classList.contains('aberto');
    });
  });

  // Check tarefa concluída
  box.querySelectorAll('[data-check-id]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-check-id');
      var tarefa = tarefasDia.find(function(t){ return t.id === tid; });
      if(!tarefa) return;
      tarefa.concluida = !tarefa.concluida;
      await atualizarTarefa(tarefa);
      renderDetalheDoDia(dataStr);
      renderCalendario();
      carregarNotificacoes();
    });
  });

  // Excluir tarefa
  box.querySelectorAll('[data-del-id]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var ok = await customConfirm('Essa ação não pode ser desfeita.', 'Excluir esta tarefa?');
      if(!ok) return;
      await excluirTarefa(btn.getAttribute('data-del-id'));
      renderDetalheDoDia(dataStr);
      renderCalendario();
    });
  });

  // Checklist — adicionar item
  box.querySelectorAll('[data-cl-add]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-tarefa-id');
      var input = document.getElementById('cl-input-' + tid);
      var val = input ? input.value.trim() : '';
      if(!val) return;
      var tarefa = tarefasDia.find(function(t){ return t.id === tid; });
      if(!tarefa) return;
      tarefa.checklist = tarefa.checklist || [];
      tarefa.checklist.push({ id: Date.now().toString(), texto: val, concluido: false });
      await atualizarTarefa(tarefa);
      renderDetalheDoDia(dataStr);
    });
  });

  // Checklist — marcar/desmarcar item
  box.querySelectorAll('[data-cl-check]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-tarefa-id');
      var idx = Number(btn.getAttribute('data-cl-idx'));
      var tarefa = tarefasDia.find(function(t){ return t.id === tid; });
      if(!tarefa || !tarefa.checklist[idx]) return;
      tarefa.checklist[idx].concluido = !tarefa.checklist[idx].concluido;
      await atualizarTarefa(tarefa);
      renderDetalheDoDia(dataStr);
    });
  });

  // Checklist — remover item
  box.querySelectorAll('[data-cl-del]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-tarefa-id');
      var idx = Number(btn.getAttribute('data-cl-idx'));
      var tarefa = tarefasDia.find(function(t){ return t.id === tid; });
      if(!tarefa) return;
      tarefa.checklist.splice(idx, 1);
      await atualizarTarefa(tarefa);
      renderDetalheDoDia(dataStr);
    });
  });

  // Anexos — abrir
  box.querySelectorAll('[data-anexo-abrir]').forEach(function(el){
    el.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = el.getAttribute('data-tarefa-id');
      var idx = Number(el.getAttribute('data-anx-idx'));
      var tarefa = tarefasDia.find(function(t){ return t.id === tid; });
      if(!tarefa || !tarefa.anexos[idx]) return;
      await abrirAnexoTarefa(tarefa.anexos[idx]);
    });
  });

  // Anexos — excluir
  box.querySelectorAll('[data-anexo-del]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-tarefa-id');
      var idx = Number(btn.getAttribute('data-anx-idx'));
      var tarefa = tarefasDia.find(function(t){ return t.id === tid; });
      if(!tarefa || !tarefa.anexos[idx]) return;
      var ok = await customConfirm('Essa ação não pode ser desfeita.', 'Excluir este arquivo?');
      if(!ok) return;
      await excluirAnexoTarefa(tarefa, tarefa.anexos[idx]);
      renderDetalheDoDia(dataStr);
    });
  });

  // Anexos — upload
  box.querySelectorAll('.tarefa-drop-area').forEach(function(dropArea){
    var tid = dropArea.getAttribute('data-tarefa-id');
    var input = dropArea.querySelector('.tarefa-file-input');
    var tarefa = tarefasDia.find(function(t){ return t.id === tid; });
    if(!tarefa) return;
    input.addEventListener('change', async function(e){
      e.stopPropagation();
      if(!input.files[0]) return;
      dropArea.textContent = 'Enviando...';
      await uploadAnexoTarefa(tarefa, input.files[0]);
      renderDetalheDoDia(dataStr);
    });
    setupDropArea(dropArea, async function(file){
      dropArea.textContent = 'Enviando...';
      await uploadAnexoTarefa(tarefa, file);
      renderDetalheDoDia(dataStr);
    });
  });

  // Editar tarefa
  box.querySelectorAll('[data-edit-id]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-edit-id');
      var tarefa = tarefasDia.find(function(t){ return t.id === tid; });
      if(!tarefa) return;
      var formDiv = document.getElementById('form-edit-tarefa-' + tid);
      if(formDiv.style.display !== 'none'){ formDiv.style.display = 'none'; return; }
      formDiv.style.display = 'block';
      formDiv.innerHTML =
        '<div class="field"><label>Título *</label><input type="text" id="edt-titulo-' + tid + '" value="' + escapeHtml(tarefa.titulo) + '"></div>' +
        '<div class="row2">' +
          '<div class="field"><label>Data</label><input type="date" id="edt-data-' + tid + '" value="' + tarefa.data + '"></div>' +
          '<div class="field"><label>Prioridade</label><select id="edt-prior-' + tid + '">' +
            '<option value="normal"' + (tarefa.prioridade==='normal'?' selected':'') + '>Normal</option>' +
            '<option value="alta"' + (tarefa.prioridade==='alta'?' selected':'') + '>Alta</option>' +
            '<option value="urgente"' + (tarefa.prioridade==='urgente'?' selected':'') + '>Urgente</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="field"><label>Categoria</label><select id="edt-cat-' + tid + '">' +
          '<option value="administrativo"' + (tarefa.categoria==='administrativo'?' selected':'') + '>Administrativo</option>' +
          '<option value="financeiro"' + (tarefa.categoria==='financeiro'?' selected':'') + '>Financeiro</option>' +
          '<option value="visita"' + (tarefa.categoria==='visita'?' selected':'') + '>Visita</option>' +
          '<option value="outro"' + (tarefa.categoria==='outro'?' selected':'') + '>Outro</option>' +
        '</select></div>' +
        '<div class="field"><label>Notas</label><textarea id="edt-desc-' + tid + '">' + escapeHtml(tarefa.descricao) + '</textarea></div>' +
        '<div style="display:flex; gap:8px;">' +
          '<button class="btn-primary" style="font-size:13px;" id="edt-salvar-' + tid + '">Salvar</button>' +
          '<button class="btn-ghost" style="font-size:13px;" id="edt-cancelar-' + tid + '">Cancelar</button>' +
        '</div>';

      document.getElementById('edt-cancelar-' + tid).addEventListener('click', function(){ formDiv.style.display = 'none'; });
      document.getElementById('edt-salvar-' + tid).addEventListener('click', async function(){
        var novoTitulo = document.getElementById('edt-titulo-' + tid).value.trim();
        if(!novoTitulo){ toast('O título não pode ser vazio.', 'erro'); return; }
        this.disabled = true; this.textContent = 'Salvando...';
        tarefa.titulo = novoTitulo;
        tarefa.data = document.getElementById('edt-data-' + tid).value || tarefa.data;
        tarefa.prioridade = document.getElementById('edt-prior-' + tid).value;
        tarefa.categoria = document.getElementById('edt-cat-' + tid).value;
        tarefa.descricao = document.getElementById('edt-desc-' + tid).value.trim();
        await atualizarTarefa(tarefa);
        toast('Tarefa atualizada!', 'sucesso');
        renderDetalheDoDia(dataStr);
        renderCalendario();
      });
    });
  });

  // Transferência de tarefas
  box.querySelectorAll('[data-abrir-transferir]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-abrir-transferir');
      var form = document.getElementById('form-transferir-' + tid);
      if(form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
  });

  box.querySelectorAll('[data-cancelar-transferir]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-cancelar-transferir');
      var form = document.getElementById('form-transferir-' + tid);
      if(form) form.style.display = 'none';
    });
  });

  box.querySelectorAll('[data-confirmar-transferir]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var tid = btn.getAttribute('data-confirmar-transferir');
      var sel = document.getElementById('sel-transferir-' + tid);
      if(!sel) return;
      var novoUserId = sel.value;
      var novoNome = membrosDaEquipe[novoUserId] || 'Desconhecido';
      var tarefa = tarefasDia.find(function(t){ return t.id === tid; });
      if(!tarefa) return;
      btn.disabled = true;
      btn.textContent = 'Transferindo...';
      await transferirTarefa(tarefa, novoUserId, novoNome);
      toast('Tarefa transferida para ' + novoNome + '!', 'sucesso');
      renderDetalheDoDia(dataStr);
      renderCalendario();
    });
  });

  // Follow-up listeners
  box.querySelectorAll('.negociacao-row').forEach(function(row){
    row.addEventListener('click', function(){ openModal(row.getAttribute('data-leadid')); });
  });
  box.querySelectorAll('.btn-concluir-followup').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var leadId = btn.getAttribute('data-lead-id');
      var leadAlvo = leads.find(function(l){ return l.id === leadId; });
      if(!leadAlvo) return;
      btn.disabled = true;
      await concluirFollowUp(leadAlvo);
      renderCalendario();
      renderDetalheDoDia(dataStr);
      carregarNotificacoes();
    });
  });

  // Nova tarefa
  document.getElementById('btn-mostrar-form-tarefa').addEventListener('click', function(){
    var container = document.getElementById('form-nova-tarefa-container');
    if(container.innerHTML !== ''){ container.innerHTML = ''; this.textContent = '+ Nova tarefa'; return; }
    this.textContent = '✕ Cancelar';
    container.innerHTML =
      '<div class="form-nova-tarefa">' +
        '<h4>Nova tarefa — ' + titulo + '</h4>' +
        '<div class="field"><label>Título *</label><input type="text" id="nova-tarefa-titulo" placeholder="Ex: Ligar para fornecedor..."></div>' +
        '<div class="row2">' +
          '<div class="field"><label>Data</label><input type="date" id="nova-tarefa-data" value="' + dataStr + '"></div>' +
          '<div class="field"><label>Prioridade</label><select id="nova-tarefa-prior">' +
            '<option value="normal">Normal</option>' +
            '<option value="alta">Alta</option>' +
            '<option value="urgente">Urgente</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="field"><label>Categoria</label><select id="nova-tarefa-cat">' +
          '<option value="administrativo">Administrativo</option>' +
          '<option value="financeiro">Financeiro</option>' +
          '<option value="visita">Visita</option>' +
          '<option value="outro">Outro</option>' +
        '</select></div>' +
        '<div class="field"><label>Notas (opcional)</label><textarea id="nova-tarefa-desc" placeholder="Detalhes..."></textarea></div>' +
        '<button class="btn-primary" id="btn-salvar-nova-tarefa">Salvar tarefa</button>' +
      '</div>';

    document.getElementById('btn-salvar-nova-tarefa').addEventListener('click', async function(){
      var t = document.getElementById('nova-tarefa-titulo').value.trim();
      if(!t){ toast('Informe um título para a tarefa.', 'erro'); return; }
      this.disabled = true; this.textContent = 'Salvando...';
      await criarTarefa({
        titulo: t,
        descricao: document.getElementById('nova-tarefa-desc').value.trim(),
        data: document.getElementById('nova-tarefa-data').value || dataStr,
        prioridade: document.getElementById('nova-tarefa-prior').value,
        categoria: document.getElementById('nova-tarefa-cat').value
      });
      toast('Tarefa criada!', 'sucesso');
      renderDetalheDoDia(dataStr);
      renderCalendario();
    });
  });
}

document.getElementById('cal-prev').addEventListener('click', function(){
  calendarioRef.setMonth(calendarioRef.getMonth() - 1);
  renderCalendario();
});
document.getElementById('cal-next').addEventListener('click', function(){
  calendarioRef.setMonth(calendarioRef.getMonth() + 1);
  renderCalendario();
});
document.getElementById('cal-hoje').addEventListener('click', function(){
  calendarioRef = new Date();
  diaSelecionado = todayStr();
  renderCalendario();
});

document.getElementById('metas-prev').addEventListener('click', function(){
  metasRef.setMonth(metasRef.getMonth() - 1);
  renderMetasView();
});
document.getElementById('metas-next').addEventListener('click', function(){
  metasRef.setMonth(metasRef.getMonth() + 1);
  renderMetasView();
});
document.getElementById('metas-hoje').addEventListener('click', function(){
  metasRef = new Date();
  renderMetasView();
});

document.getElementById('periodo-select').addEventListener('change', function(){
  periodoTipo = this.value;
  document.getElementById('periodo-custom').classList.toggle('hidden', periodoTipo !== 'personalizado');
  if(periodoTipo !== 'personalizado'){
    render();
    if(document.querySelector('.sidebar-item[data-tab="dash"]').classList.contains('active')) renderDashboard();
  }
});

function aplicarPeriodoPersonalizado(){
  periodoInicio = document.getElementById('periodo-inicio').value || null;
  periodoFim = document.getElementById('periodo-fim').value || null;
  if(periodoInicio && periodoFim){
    render();
    if(document.querySelector('.sidebar-item[data-tab="dash"]').classList.contains('active')) renderDashboard();
  }
}
document.getElementById('periodo-inicio').addEventListener('change', aplicarPeriodoPersonalizado);
document.getElementById('periodo-fim').addEventListener('change', aplicarPeriodoPersonalizado);

document.getElementById('btn-menu').addEventListener('click', abrirSidebar);
document.getElementById('btn-fechar-sidebar').addEventListener('click', fecharSidebar);
document.getElementById('sidebar-backdrop').addEventListener('click', fecharSidebar);

document.querySelectorAll('.sidebar-item').forEach(function(item){
  item.addEventListener('click', function(){
    var tab = item.getAttribute('data-tab');
    if(!tab) return;
    fecharSidebar();
    switchTab(tab);
  });
});

document.getElementById('busca-cliente').addEventListener('input', function(){
  buscaClienteTexto = this.value;
  renderClientesView();
});

document.getElementById('filtro-tag-cliente').addEventListener('change', function(){
  filtroTagClienteSelecionada = this.value;
  renderClientesView();
});

document.getElementById('filtro-vendedor').addEventListener('change', async function(){
  filtroVendedorId = this.value;

  // Recarregar todos os dados com o novo filtro
  await Promise.all([
    loadLeadsFromDb(),
    loadClientesFromDb()
  ]);

  // Re-renderizar a aba que está ativa no momento
  var tabAtiva = document.querySelector('.sidebar-item.active');
  var tabId = tabAtiva ? tabAtiva.getAttribute('data-tab') : 'funil';

  if(tabId === 'funil'){ render(); }
  else if(tabId === 'dash'){ render(); renderDashboard(); }
  else if(tabId === 'clientes'){ renderClientesView(); }
  else if(tabId === 'calendario'){ renderCalendario(); }
  else if(tabId === 'metas'){ renderMetasView(); }
  else if(tabId === 'tarefas'){ renderTarefasView(); }
  else { render(); }
});

document.getElementById('btn-exportar-dados').addEventListener('click', function(){
  fecharSidebar();

  // Criar overlay dedicado para exportação, sem mexer na aba ativa
  var overlayExport = document.getElementById('overlay-exportar');
  if(!overlayExport){
    overlayExport = document.createElement('div');
    overlayExport.id = 'overlay-exportar';
    overlayExport.className = 'overlay';
    overlayExport.innerHTML = '<div class="modal" id="modal-exportar" style="width:420px;"></div>';
    document.body.appendChild(overlayExport);
    overlayExport.addEventListener('click', function(e){
      if(e.target.id === 'overlay-exportar') overlayExport.classList.remove('open');
    });
  }

  var modal = document.getElementById('modal-exportar');

  modal.innerHTML =
    '<h2>Exportar dados</h2>' +
    '<p style="font-size:13px; color:var(--ink-soft); margin:0 0 18px;">Exporte seus negócios, clientes, tarefas e lançamentos de metas.</p>' +
    '<div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">' +
      '<button class="btn-primary" id="btn-exp-excel" style="display:flex; align-items:center; gap:10px; justify-content:center;">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' +
        'Baixar Excel (.xlsx) — 1 arquivo com 4 abas' +
      '</button>' +
      '<button class="btn-ghost" id="btn-exp-csv" style="display:flex; align-items:center; gap:10px; justify-content:center;">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        'Baixar CSV (4 arquivos separados)' +
      '</button>' +
    '</div>' +
    '<div style="text-align:right;">' +
      '<button class="btn-ghost" id="btn-fechar-export">Fechar</button>' +
    '</div>';

  overlayExport.classList.add('open');

  document.getElementById('btn-fechar-export').addEventListener('click', function(){
    overlayExport.classList.remove('open');
  });

  document.getElementById('btn-exp-excel').addEventListener('click', exportarExcel);
  document.getElementById('btn-exp-csv').addEventListener('click', exportarCSV);
});

document.getElementById('btn-onboarding').addEventListener('click', async function(){
  fecharSidebar();
  if(papelAtual === 'admin'){
    await verificarProgressoOnboarding();
    abrirOnboarding();
  } else {
    toast('O onboarding está disponível apenas para administradores.', 'info');
  }
});

document.getElementById('btn-notificacoes').addEventListener('click', function(e){
  e.stopPropagation();
  if(painelNotifAberto){ fecharNotifPainel(); } else { abrirNotifPainel(); }
});

function switchTab(tab){
  // Atualizar item ativo na sidebar
  document.querySelectorAll('.sidebar-item').forEach(function(item){
    item.classList.toggle('active', item.getAttribute('data-tab') === tab);
  });

  // Atualizar título da seção no toolbar
  var tituloEl = document.getElementById('titulo-secao-ativa');
  if(tituloEl) tituloEl.innerHTML = TITULOS_SECAO[tab] || tab;

  // Mostrar/ocultar seções
  document.getElementById('board').style.display = tab === 'funil' ? 'grid' : 'none';
  var headersRow = document.getElementById('board-headers');
  if(headersRow) headersRow.style.display = tab === 'funil' ? 'grid' : 'none';
  document.getElementById('dash').classList.toggle('open', tab === 'dash');
  document.getElementById('clientes-view').classList.toggle('open', tab === 'clientes');
  document.getElementById('calendario-view').classList.toggle('open', tab === 'calendario');
  document.getElementById('metas-view').classList.toggle('open', tab === 'metas');
  document.getElementById('tarefas-view').classList.toggle('open', tab === 'tarefas');
  document.getElementById('equipe-view').classList.toggle('open', tab === 'equipe');
  document.getElementById('notificacoes-view').classList.toggle('open', tab === 'notificacoes');

  // Filtros: mostrar só no Funil e Dashboard
  var filtersEl = document.querySelector('.filters');
  if(filtersEl) filtersEl.style.display = tab === 'funil' ? 'flex' : 'none';
  var periodoEl = document.querySelector('.periodo-filtro');
  if(periodoEl) periodoEl.style.display = (tab === 'funil' || tab === 'dash') ? 'flex' : 'none';
  var filtroVendEl = document.getElementById('filtro-vendedor');
  if(filtroVendEl){
    filtroVendEl.style.display = (papelAtual === 'admin' && tab !== 'equipe') ? '' : 'none';
  }

  // Renderizar a seção ativa
  if(tab === 'dash') renderDashboard();
  if(tab === 'clientes') renderClientesView();
  if(tab === 'calendario') renderCalendario();
  if(tab === 'metas') renderMetasView();
  if(tab === 'tarefas') renderTarefasView();
  if(tab === 'equipe') renderEquipeView();
  if(tab === 'notificacoes') renderNotificacoesView();
}

function showLogin(){
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showCriarEquipe(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');

  var tela = document.getElementById('criar-equipe-screen');
  if(!tela){
    tela = document.createElement('div');
    tela.id = 'criar-equipe-screen';
    tela.className = 'login-screen';
    document.body.appendChild(tela);
  }
  tela.classList.remove('hidden');
  tela.innerHTML =
    '<div class="login-box">' +
      '<div class="mark">Tr</div>' +
      '<h1>Bem-vindo ao Tractar</h1>' +
      '<p class="sub">Para começar, crie sua equipe. Você será o administrador.</p>' +
      '<div class="field"><label>Nome da equipe</label><input type="text" id="f-nome-equipe" placeholder="Ex: Equipe Comercial, Distribuidora XYZ..."></div>' +
      '<div class="field"><label>Seu nome</label><input type="text" id="f-nome-admin" placeholder="Seu nome completo"></div>' +
      '<button class="btn-primary" id="btn-criar-equipe" style="width:100%; margin-top:8px;">Criar equipe e entrar</button>' +
      '<button class="btn-ghost" id="btn-logout-criar-equipe" style="width:100%; margin-top:8px;">Sair</button>' +
    '</div>';

  document.getElementById('btn-logout-criar-equipe').addEventListener('click', async function(){
    await sb.auth.signOut();
    location.reload();
  });

  document.getElementById('btn-criar-equipe').addEventListener('click', async function(){
    var nomeEquipe = document.getElementById('f-nome-equipe').value.trim();
    var nomeAdmin = document.getElementById('f-nome-admin').value.trim();
    if(!nomeEquipe || !nomeAdmin){
      toast('Preencha o nome da equipe e o seu nome.', 'erro');
      return;
    }
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Criando...';

    var resEquipe = await sb.from('equipes').insert({ nome: nomeEquipe }).select().single();
    if(resEquipe.error){
      toast('Erro ao criar equipe: ' + resEquipe.error.message, 'erro');
      btn.disabled = false;
      btn.textContent = 'Criar equipe e entrar';
      return;
    }
    equipeAtual = resEquipe.data;

    var sessao = await sb.auth.getSession();
    var emailAdmin = sessao.data.session.user.email;

    var resMembro = await sb.from('membros_equipe').insert({
      user_id: currentUserId,
      equipe_id: equipeAtual.id,
      papel: 'admin',
      nome: nomeAdmin,
      email: emailAdmin
    });

    if(resMembro.error){
      toast('Erro ao configurar administrador: ' + resMembro.error.message, 'erro');
      btn.disabled = false;
      btn.textContent = 'Criar equipe e entrar';
      return;
    }

    papelAtual = 'admin';
    tela.classList.add('hidden');
    showApp();
    await loadLeadsFromDb();
    await loadClientesFromDb();
    await loadConfiguracoes();
    render();
  });
}

function showApp(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  var sidebarItemEquipe = document.getElementById('sidebar-item-equipe');
  if(sidebarItemEquipe){
    sidebarItemEquipe.style.display = papelAtual === 'admin' ? '' : 'none';
  }

  var selFiltroVendedor = document.getElementById('filtro-vendedor');
  if(selFiltroVendedor){
    if(papelAtual === 'admin'){
      selFiltroVendedor.style.display = '';
      atualizarFiltroVendedores();
      loadMembrosDaEquipe();
    } else {
      selFiltroVendedor.style.display = 'none';
    }
  }
}

function setLoginError(msg){
  var el = document.getElementById('login-error');
  if(!msg){ el.classList.remove('show'); el.textContent=''; return; }
  el.textContent = msg;
  el.classList.add('show');
}

var modoCadastro = false;

document.getElementById('link-cadastro').addEventListener('click', function(e){
  e.preventDefault();
  modoCadastro = !modoCadastro;
  document.getElementById('btn-login').textContent = modoCadastro ? 'Criar conta' : 'Entrar';
  e.target.textContent = modoCadastro ? 'Já tenho conta, fazer login' : 'Criar minha conta';
  setLoginError(null);
});

document.getElementById('btn-login').addEventListener('click', async function(){
  var emailOuUsername = document.getElementById('login-email').value.trim().toLowerCase();
  var email = emailOuUsername.includes('@') ? emailOuUsername : emailOuUsername + '@tractar.app';
  var senha = document.getElementById('login-senha').value;
  setLoginError(null);

  if(!email || !senha){
    setLoginError('Preencha e-mail e senha.');
    return;
  }

  var btn = document.getElementById('btn-login');
  btn.disabled = true;

  var result = modoCadastro
    ? await sb.auth.signUp({ email: email, password: senha })
    : await sb.auth.signInWithPassword({ email: email, password: senha });

  btn.disabled = false;

  if(result.error){
    setLoginError(result.error.message || 'Não foi possível entrar. Verifique seus dados.');
    return;
  }

  if(modoCadastro && result.data && !result.data.session){
    setLoginError('Conta criada! Verifique seu e-mail para confirmar antes de entrar.');
    return;
  }

  await iniciarApp();
});

var THEME_KEY = 'tractar-theme';

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('btn-theme').textContent = theme === 'dark' ? '☀️' : '🌙';
  try{ localStorage.setItem(THEME_KEY, theme); }catch(e){}
}

function initTheme(){
  var saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch(e){}
  var theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(theme);
}

document.getElementById('btn-theme').addEventListener('click', function(){
  fecharSidebar();
  var atual = document.documentElement.getAttribute('data-theme');
  applyTheme(atual === 'dark' ? 'light' : 'dark');
});

initTheme();

document.getElementById('btn-config').addEventListener('click', function(){
  fecharSidebar();
  abrirModalConfig();
});

function abrirModalConfig(){
  var etapasConfiguraveis = ['lead','contato','proposta','negociacao'];
  var modal = document.getElementById('modal-config');

  modal.innerHTML = '<h2>Configurações</h2>' +
    '<p class="cliente-section-title" style="margin-top:0;">Limites de tempo por etapa</p>' +
    '<p class="anexo-vazio">Defina, em dias, quando um negócio parado nessa etapa deve virar alerta (amarelo) ou crítico (vermelho).</p>' +
    etapasConfiguraveis.map(function(stageId){
      var st = STAGES.find(function(s){ return s.id === stageId; });
      var lim = limitesEtapa[stageId] || {alerta:7, critico:14};
      return '<div class="row2" style="align-items:end;">' +
        field(st.label + ' — Alerta (dias)', '<input type="number" min="1" id="cfg-' + stageId + '-alerta" value="' + lim.alerta + '">') +
        field(st.label + ' — Crítico (dias)', '<input type="number" min="1" id="cfg-' + stageId + '-critico" value="' + lim.critico + '">') +
      '</div>';
    }).join('') +
    '<div class="modal-actions">' +
      '<span></span>' +
      '<div class="right-actions">' +
        '<button class="btn-ghost" id="btn-cancelar-config">Cancelar</button>' +
        '<button class="btn-primary" id="btn-salvar-config">Salvar</button>' +
      '</div>' +
    '</div>';

  document.getElementById('overlay-config').classList.add('open');
  document.getElementById('btn-cancelar-config').onclick = function(){
    document.getElementById('overlay-config').classList.remove('open');
  };
  document.getElementById('btn-salvar-config').onclick = async function(){
    var novosLimites = {};
    etapasConfiguraveis.forEach(function(stageId){
      novosLimites[stageId] = {
        alerta: Number(document.getElementById('cfg-' + stageId + '-alerta').value) || 7,
        critico: Number(document.getElementById('cfg-' + stageId + '-critico').value) || 14
      };
    });
    await salvarConfiguracoes(novosLimites, metaMensal);
    document.getElementById('overlay-config').classList.remove('open');
    render();
    if(document.querySelector('.sidebar-item[data-tab="dash"]').classList.contains('active')) renderDashboard();
  };
}

document.getElementById('overlay-config').addEventListener('click', function(e){
  if(e.target.id === 'overlay-config') document.getElementById('overlay-config').classList.remove('open');
});

document.getElementById('btn-logout').addEventListener('click', async function(){
  fecharSidebar();
  await sb.auth.signOut();
  currentUserId = null;
  showLogin();
});

document.getElementById('btn-nova-tarefa-rapida').addEventListener('click', function(){
  var lista = document.getElementById('tarefas-lista-panorama');
  var formExistente = document.getElementById('form-nova-tarefa-panorama');
  if(formExistente){ formExistente.remove(); return; }

  var form = document.createElement('div');
  form.id = 'form-nova-tarefa-panorama';
  form.className = 'form-nova-tarefa-rapida';
  form.innerHTML =
    '<h4 style="margin:0 0 12px; font-size:14px;">Nova tarefa</h4>' +
    '<div class="row2">' +
      '<div class="field"><label>Título *</label><input type="text" id="pan-tarefa-titulo" placeholder="Ex: Ligar para fornecedor..."></div>' +
      '<div class="field"><label>Data</label><input type="date" id="pan-tarefa-data" value="' + todayStr() + '"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Prioridade</label><select id="pan-tarefa-prior"><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>' +
      '<div class="field"><label>Categoria</label><select id="pan-tarefa-cat"><option value="administrativo">Administrativo</option><option value="financeiro">Financeiro</option><option value="visita">Visita</option><option value="outro">Outro</option></select></div>' +
    '</div>' +
    '<div class="field"><label>Notas (opcional)</label><textarea id="pan-tarefa-desc" placeholder="Detalhes..."></textarea></div>' +
    '<div style="display:flex; gap:8px;">' +
      '<button class="btn-primary" id="btn-salvar-pan-tarefa">Salvar tarefa</button>' +
      '<button class="btn-ghost" id="btn-cancelar-pan-tarefa">Cancelar</button>' +
    '</div>';

  lista.insertAdjacentElement('beforebegin', form);

  document.getElementById('btn-cancelar-pan-tarefa').addEventListener('click', function(){ form.remove(); });
  document.getElementById('btn-salvar-pan-tarefa').addEventListener('click', async function(){
    var titulo = document.getElementById('pan-tarefa-titulo').value.trim();
    if(!titulo){ toast('Informe um título para a tarefa.', 'erro'); return; }
    this.disabled = true; this.textContent = 'Salvando...';
    await criarTarefa({
      titulo: titulo,
      descricao: document.getElementById('pan-tarefa-desc').value.trim(),
      data: document.getElementById('pan-tarefa-data').value || todayStr(),
      prioridade: document.getElementById('pan-tarefa-prior').value,
      categoria: document.getElementById('pan-tarefa-cat').value
    });
    toast('Tarefa criada!', 'sucesso');
    form.remove();
    renderTarefasView();
  });
});

document.getElementById('busca-tarefa').addEventListener('input', function(){
  buscaTarefaTexto = this.value;
  renderTarefasView();
});
document.getElementById('filtro-tarefa-status').addEventListener('change', function(){ renderTarefasView(); });
document.getElementById('filtro-tarefa-categoria').addEventListener('change', function(){ renderTarefasView(); });
document.getElementById('filtro-tarefa-prioridade').addEventListener('change', function(){ renderTarefasView(); });

async function iniciarApp(){
  var sessionRes = await sb.auth.getSession();
  var session = sessionRes.data.session;
  if(!session){
    showLogin();
    return;
  }
  currentUserId = session.user.id;

  var membro = await loadEquipe();

  if(!membro){
    showCriarEquipe();
    return;
  }

  showApp();
  await Promise.all([
    loadLeadsFromDb(),
    loadClientesFromDb(),
    loadConfiguracoes()
  ]);
  render();

  // Carregar notificações ao iniciar
  if(equipeAtual && Object.keys(membrosDaEquipe).length === 0 && papelAtual === 'admin'){
    await loadMembrosDaEquipe();
  }
  await carregarNotificacoes();

  // Atualizar notificações a cada 30 minutos
  setInterval(function(){ carregarNotificacoes(); }, 30 * 60 * 1000);

  if(papelAtual === 'admin'){
    await loadOnboarding();
    await verificarProgressoOnboarding();
    if(!onboardingState.dispensado){
      var todasConcluidas = ONBOARDING_ETAPAS.every(function(e){
        return onboardingState.etapasConcluidas.indexOf(e.id) !== -1;
      });
      if(!todasConcluidas) abrirOnboarding();
    }
  }
}

function abrirModalMinhaConta(){
  var modal = document.getElementById('modal-minha-conta');
  modal.innerHTML =
    '<h2>Minha conta</h2>' +
    '<p class="meta-dia-label" style="margin-bottom:14px;">Altere sua senha de acesso.</p>' +
    field('Nova senha', '<input type="password" id="mc-nova-senha" placeholder="Mínimo 6 caracteres">') +
    field('Confirmar nova senha', '<input type="password" id="mc-confirmar-senha" placeholder="Repita a senha">') +
    '<div class="modal-actions">' +
      '<span></span>' +
      '<div class="right-actions">' +
        '<button class="btn-ghost" id="mc-cancelar">Cancelar</button>' +
        '<button class="btn-primary" id="mc-salvar">Salvar senha</button>' +
      '</div>' +
    '</div>';

  document.getElementById('overlay-minha-conta').classList.add('open');

  document.getElementById('mc-cancelar').addEventListener('click', function(){
    document.getElementById('overlay-minha-conta').classList.remove('open');
  });

  document.getElementById('mc-salvar').addEventListener('click', async function(){
    var nova = document.getElementById('mc-nova-senha').value;
    var confirmar = document.getElementById('mc-confirmar-senha').value;
    if(nova.length < 6){
      toast('A senha deve ter pelo menos 6 caracteres.', 'erro');
      return;
    }
    if(nova !== confirmar){
      toast('As senhas não coincidem.', 'erro');
      return;
    }
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    var res = await sb.auth.updateUser({ password: nova });
    if(res.error){
      toast('Erro ao alterar senha: ' + res.error.message, 'erro');
      btn.disabled = false;
      btn.textContent = 'Salvar senha';
      return;
    }
    toast('Senha alterada com sucesso!', 'sucesso');
    document.getElementById('overlay-minha-conta').classList.remove('open');
  });
}

document.getElementById('btn-minha-conta').addEventListener('click', function(){
  fecharSidebar();
  abrirModalMinhaConta();
});

document.getElementById('overlay-minha-conta').addEventListener('click', function(e){
  if(e.target.id === 'overlay-minha-conta')
    document.getElementById('overlay-minha-conta').classList.remove('open');
});

iniciarApp();

if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/service-worker.js')
      .then(function(reg){
        console.log('SW registrado:', reg.scope);
        // Verificar atualizações imediatamente
        reg.update();
        // Verificar atualizações a cada 60 segundos enquanto o app está aberto
        setInterval(function(){ reg.update(); }, 60000);
      })
      .catch(function(err){ console.log('Erro SW:', err); });
  });
  // Quando uma nova versão do SW estiver pronta, recarregar automaticamente
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    window.location.reload();
  });
}
})();
