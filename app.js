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
var limitesEtapa = {
  lead: {alerta:7, critico:14},
  contato: {alerta:7, critico:14},
  proposta: {alerta:5, critico:10},
  negociacao: {alerta:7, critico:14}
};
var metaMensal = 0;

function uid(){ return 'l' + Date.now() + Math.floor(Math.random()*10000); }

function todayStr(){
  var d = new Date();
  return d.toISOString().slice(0,10);
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
    nome: lead.nome,
    contato: lead.contato || null,
    canal: lead.canal,
    interesse: lead.interesse || null,
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
  var res = await sb.from('leads').select('*').order('created_at', {ascending:true});
  if(res.error){
    console.error('Erro ao carregar leads', res.error);
    leads = [];
    return;
  }
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
  alert('Não foi possível sincronizar com o servidor agora. Verifique sua internet — a alteração pode não ter sido salva.');
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
    tags: Array.isArray(row.tags) ? row.tags : []
  };
}

function clienteToDb(cliente){
  return {
    user_id: currentUserId,
    nome: cliente.nome,
    contato: cliente.contato || null,
    canal: cliente.canal || null,
    notas: cliente.notas || null,
    criado: cliente.criado || todayStr(),
    cnpj: cliente.cnpj || null,
    tags: cliente.tags || []
  };
}

async function buscarDadosCnpj(cnpj){
  var digitos = String(cnpj || '').replace(/\D/g, '');
  if(digitos.length !== 14){
    alert('CNPJ inválido. Deve ter 14 números.');
    return null;
  }
  try{
    var res = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + digitos);
    if(!res.ok){
      alert('CNPJ não encontrado na Receita Federal.');
      return null;
    }
    var dados = await res.json();
    return {
      nome: dados.nome_fantasia || dados.razao_social || '',
      contato: dados.ddd_telefone_1 ? dados.ddd_telefone_1.replace(/\D/g,'') : ''
    };
  }catch(e){
    console.error('Erro ao consultar CNPJ', e);
    alert('Não foi possível consultar o CNPJ agora. Verifique sua internet.');
    return null;
  }
}

async function loadClientesFromDb(){
  var res = await sb.from('clientes').select('*').order('nome', {ascending:true});
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
  var res = await sb.from('interacoes').select('*').eq('cliente_id', clienteId).order('data', {ascending:false});
  if(res.error){ console.error('Erro ao carregar interações', res.error); return []; }
  return res.data.map(interacaoFromDb);
}

async function criarInteracaoNoDb(interacao){
  var res = await sb.from('interacoes').insert({
    user_id: currentUserId,
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

// ---------- Configurações (limites de tempo por etapa) ----------

async function loadConfiguracoes(){
  var res = await sb.from('configuracoes').select('*').eq('user_id', currentUserId).maybeSingle();
  if(res.error){ console.error('Erro ao carregar configurações', res.error); return; }
  if(res.data && res.data.limites_etapa){
    limitesEtapa = res.data.limites_etapa;
    metaMensal = Number(res.data.meta_mensal) || 0;
  } else {
    // primeiro acesso: cria a linha de configuração com os valores padrão
    await sb.from('configuracoes').insert({ user_id: currentUserId, limites_etapa: limitesEtapa, meta_mensal: metaMensal });
  }
}

async function salvarConfiguracoes(novosLimites, novaMeta){
  limitesEtapa = novosLimites;
  metaMensal = novaMeta;
  var res = await sb.from('configuracoes').upsert({ user_id: currentUserId, limites_etapa: novosLimites, meta_mensal: novaMeta });
  if(res.error){ console.error('Erro ao salvar configurações', res.error); showSyncError(); }
}

async function uploadAnexo(lead, file){
  if(file.size > 10 * 1024 * 1024){
    alert('Arquivo muito grande. O limite é 10MB por arquivo.');
    return null;
  }
  var caminho = currentUserId + '/' + lead.id + '/' + Date.now() + '_' + file.name.replace(/[^\w.\-]/g, '_');
  var res = await sb.storage.from('anexos').upload(caminho, file);
  if(res.error){
    console.error('Erro ao enviar anexo', res.error);
    alert('Não foi possível enviar o arquivo. Tente novamente.');
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
    alert('Não foi possível abrir o arquivo agora.');
    return;
  }
  window.open(res.data.signedUrl, '_blank');
}

function fmtTamanho(bytes){
  if(!bytes) return '';
  if(bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

function fmtMoney(v){
  v = Number(v) || 0;
  return 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits:0, maximumFractionDigits:0});
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
  var ativos = leads.filter(function(l){ return l.stage !== 'fechado'; });
  var totalAberto = ativos.reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);
  var hoje = leads.filter(function(l){ return l.nextFollowUp && diffDays(l.nextFollowUp) === 0; }).length;
  var atrasados = leads.filter(function(l){ return l.nextFollowUp && diffDays(l.nextFollowUp) < 0 && l.stage !== 'fechado'; }).length;

  var html = '';
  html += statHtml('Em aberto', fmtMoney(totalAberto), '');
  html += statHtml('Follow-up hoje', hoje, hoje>0 ? 'warn' : '');
  html += statHtml('Atrasados', atrasados, atrasados>0 ? 'danger' : '');
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
  var data = lead.criado;
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
    board.innerHTML = '<div class="empty-state">Nenhum negócio cadastrado ainda. Clique em <strong>"+ Novo negócio"</strong> para começar.</div>';
    return;
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
          alert(erro + '\n\nAbra o card e complete essa informação antes de mover.');
          render();
          return;
        }
        render();
        atualizarLeadNoDb(lead);
      }
    });

    var stageLeads = visible.filter(function(l){ return l.stage === stage.id; });
    var stageTotal = stageLeads.reduce(function(s,l){ return s + (Number(l.valor)||0); }, 0);

    var head = document.createElement('div');
    head.className = 'col-head';
    head.innerHTML = '<span class="title">' + stage.label + '</span><span class="count">' + stageLeads.length + '</span>';
    col.appendChild(head);

    var total = document.createElement('div');
    total.className = 'col-total';
    total.textContent = fmtMoney(stageTotal);
    col.appendChild(total);

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
}

function buildCard(lead, stageColor){
  var card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.style.setProperty('--card-accent', stageColor);

  var canalLabel = CANAIS[lead.canal] || lead.canal;
  var waLink = buildWaLink(lead);
  var waButtonHtml = waLink
    ? '<a class="wa-btn" href="' + waLink + '" target="_blank" rel="noopener" title="Abrir conversa no WhatsApp">' +
        '<svg viewBox="0 0 24 24"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.2-.7.9-.9 1.1-.2.2-.3.2-.6.1-.9-.4-1.8-1-2.6-1.8-.7-.7-1.4-1.6-1.8-2.5-.1-.3 0-.4.1-.6.2-.2.8-.7 1-1 .1-.2.1-.4 0-.6-.1-.2-.6-1.5-.8-1.9-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.1 0 1.2.9 2.4 1 2.6.1.1 1.6 2.5 4 3.6 2 .9 2.4.8 2.8.7.4-.1 1.6-.6 1.8-1.2.2-.6.2-1.1.2-1.2 0-.1-.1-.2-.3-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.7 1.5 5.3L2 22l4.8-1.5C8.3 21.5 10.1 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.7 0-3.3-.5-4.7-1.3l-.3-.2-3 .9.9-2.9-.2-.3C3.9 14.9 3.4 13.5 3.4 12c0-4.7 3.9-8.6 8.6-8.6s8.6 3.9 8.6 8.6-3.9 8.6-8.6 8.6z"/></svg>' +
        'WhatsApp</a>'
    : '<span style="font-size:11px; color:var(--ink-faint);">sem número válido</span>';

  var tempoEtapa = tempoEtapaBadge(lead);
  var atividade = atividadeBadge(lead);

  var followUpGroupHtml = '<div style="display:inline-flex; align-items:center; gap:5px;">' + followUpBadge(lead);
  if(lead.nextFollowUp){
    followUpGroupHtml += '<button class="btn-concluir-followup" title="Concluir follow-up">✓</button>';
  }
  followUpGroupHtml += '</div>';

  card.innerHTML =
    '<p class="name">' + escapeHtml(lead.nome) + '</p>' +
    '<p class="meta">' + escapeHtml(canalLabel) + '<span class="dot"></span><span class="value">' + fmtMoney(lead.valor) + '</span></p>' +
    (tempoEtapa || atividade ? '<p class="card-extra">' + tempoEtapa + atividade + '</p>' : '') +
    '<div class="card-bottom">' + followUpGroupHtml + waButtonHtml + '</div>';

  card.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click', function(e){ e.stopPropagation(); });
  });

  card.querySelectorAll('.btn-concluir-followup').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      await concluirFollowUp(lead);
      render();
    });
  });

  card.addEventListener('dragstart', function(e){
    e.dataTransfer.setData('text/plain', lead.id);
    card.classList.add('dragging');
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
    ? {id: uid(), nome:'', contato:'', canal:'whatsapp', interesse:'', valor:'', stage:'lead', nextFollowUp: todayStr(), notas:'', criado: todayStr(), clienteId:null, motivoPerda:''}
    : leads.find(function(l){ return l.id === id; });

  if(!lead) return;

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

  var modal = document.getElementById('modal');
  var waLinkModal = !isNew ? buildWaLink(lead) : null;
  modal.innerHTML =
    '<h2>' + (isNew ? 'Novo negócio' : 'Editar negócio') + '</h2>' +
    (waLinkModal ? '<a class="wa-btn" style="margin-bottom:14px;" href="' + waLinkModal + '" target="_blank" rel="noopener">Abrir conversa no WhatsApp ↗</a>' : '') +
    (isNew ? field('Cliente', '<select id="f-cliente-existente">' + clienteOptions + '</select>') : '') +
    (isNew ? '<div id="novo-cliente-especifico-fields">' +
      field('CNPJ (opcional)', '<div style="display:flex; gap:8px;"><input id="f-cnpj" type="text" placeholder="00.000.000/0000-00" style="flex:1;"><button type="button" class="btn-ghost" id="btn-buscar-cnpj" style="white-space:nowrap;">Buscar</button></div>') +
      field('Tags', '<div class="tags-input-container"><div class="tags-chips" id="f-tags-chips"></div><input type="text" id="f-tags-input" placeholder="Digite uma tag e aperte Enter" style="width:100%;"></div>') +
    '</div>' : '') +
    field('Nome / empresa', '<input id="f-nome" type="text" value="' + escapeHtml(lead.nome) + '" placeholder="Ex: Construtora Vale Forte">') +
    field('Telefone / contato', '<input id="f-contato" type="text" value="' + escapeHtml(lead.contato) + '" placeholder="(32) 9 9999-9999">') +
    '<div class="row2">' +
      field('Canal', '<select id="f-canal">' + canalOptions + '</select>') +
      field('Etapa do funil', '<select id="f-stage">' + stageOptions + '</select>') +
    '</div>' +
    '<div id="motivo-perda-area">' + (lead.stage === 'perdido' ? field('Motivo da perda', '<textarea id="f-motivo-perda" placeholder="Por que o negócio não avançou?">' + escapeHtml(lead.motivoPerda) + '</textarea>') : '') + '</div>' +
    '<div class="row2">' +
      field('Valor estimado (R$)', '<input id="f-valor" type="number" min="0" value="' + (lead.valor || '') + '">') +
      field('Próximo follow-up', '<input id="f-followup" type="date" value="' + (lead.nextFollowUp || '') + '">') +
    '</div>' +
    '<div class="row2">' +
      field('Tipo de atividade', '<select id="f-atividade-tipo">' +
        '<option value="">Nenhuma</option>' +
        '<option value="Ligar"' + (lead.atividadeTipo==='Ligar'?' selected':'') + '>Ligar</option>' +
        '<option value="Enviar proposta"' + (lead.atividadeTipo==='Enviar proposta'?' selected':'') + '>Enviar proposta</option>' +
        '<option value="Reunião"' + (lead.atividadeTipo==='Reunião'?' selected':'') + '>Reunião</option>' +
        '<option value="Visita"' + (lead.atividadeTipo==='Visita'?' selected':'') + '>Visita</option>' +
        '<option value="Outro"' + (lead.atividadeTipo==='Outro'?' selected':'') + '>Outro</option>' +
      '</select>') +
      field('Descrição da atividade', '<input id="f-atividade-desc" type="text" value="' + escapeHtml(lead.atividadeDesc) + '" placeholder="Ex: Ligar confirmando prazo">') +
    '</div>' +
    field('Notas', '<textarea id="f-notas" placeholder="Detalhes da conversa, objeções, combinados...">' + escapeHtml(lead.notas) + '</textarea>') +
    (isNew
      ? '<p class="anexo-vazio">Salve o negócio primeiro para poder anexar arquivos.</p>'
      : field('Anexos', '<div id="anexos-area"></div>')
    ) +
    '<div class="modal-actions">' +
      (isNew ? '<span></span>' : '<button class="btn-danger" id="f-del">Excluir</button>') +
      '<div class="right-actions">' +
        '<button class="btn-ghost" id="f-cancel">Cancelar</button>' +
        '<button class="btn-primary" id="f-save">Salvar</button>' +
      '</div>' +
    '</div>';

  var modalNewClientTags = [];
  function renderModalNewClientTags() {
    var chipsContainer = document.getElementById('f-tags-chips');
    if (!chipsContainer) return;
    chipsContainer.innerHTML = modalNewClientTags.map(function(tag, idx) {
      return '<span class="tag-chip">' + escapeHtml(tag) + '<span class="tag-chip-remove" data-idx="' + idx + '">✕</span></span>';
    }).join('');
    chipsContainer.querySelectorAll('.tag-chip-remove').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var idx = Number(btn.getAttribute('data-idx'));
        modalNewClientTags.splice(idx, 1);
        renderModalNewClientTags();
      };
    });
  }

  if(!isNew){
    renderAnexosArea(lead);
  }

  document.getElementById('overlay').classList.add('open');

  document.getElementById('f-cancel').onclick = closeModal;

  document.getElementById('f-stage').addEventListener('change', function(){
    var area = document.getElementById('motivo-perda-area');
    if(this.value === 'perdido'){
      area.innerHTML = field('Motivo da perda', '<textarea id="f-motivo-perda" placeholder="Por que o negócio não avançou?">' + escapeHtml(lead.motivoPerda || '') + '</textarea>');
    } else {
      area.innerHTML = '';
    }
  });

  if(isNew){
    document.getElementById('f-cliente-existente').addEventListener('change', function(){
      var cid = this.value;
      var specificFields = document.getElementById('novo-cliente-especifico-fields');
      if(!cid){
        if (specificFields) specificFields.classList.remove('hidden');
        return;
      }
      if (specificFields) specificFields.classList.add('hidden');
      var c = clientes.find(function(x){ return x.id === cid; });
      if(!c) return;
      document.getElementById('f-nome').value = c.nome;
      document.getElementById('f-contato').value = c.contato || '';
      document.getElementById('f-canal').value = c.canal || 'whatsapp';
    });

    document.getElementById('btn-buscar-cnpj').addEventListener('click', async function(){
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Buscando...';
      var dados = await buscarDadosCnpj(document.getElementById('f-cnpj').value);
      btn.disabled = false;
      btn.textContent = 'Buscar';
      if(dados){
        if(dados.nome) document.getElementById('f-nome').value = dados.nome;
        if(dados.contato) document.getElementById('f-contato').value = dados.contato;
      }
    });

    var tagsInput = document.getElementById('f-tags-input');
    if(tagsInput){
      tagsInput.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){
          e.preventDefault();
          var val = tagsInput.value.trim();
          if(val && modalNewClientTags.indexOf(val) === -1){
            modalNewClientTags.push(val);
            tagsInput.value = '';
            renderModalNewClientTags();
          }
        }
      });
    }
  }

  if(!isNew){
    document.getElementById('f-del').onclick = function(){
      if(confirm('Excluir este negócio do funil? (o cadastro do cliente não será excluído)')){
        leads = leads.filter(function(l){ return l.id !== lead.id; });
        render();
        closeModal();
        excluirLeadNoDb(lead.id);
      }
    };
  }

  document.getElementById('f-save').onclick = async function(){
    var nome = document.getElementById('f-nome').value.trim();
    lead.nome = nome || 'Sem nome';
    lead.contato = document.getElementById('f-contato').value.trim();
    lead.canal = document.getElementById('f-canal').value;
    lead.valor = Number(document.getElementById('f-valor').value) || 0;
    setStage(lead, document.getElementById('f-stage').value);
    lead.nextFollowUp = document.getElementById('f-followup').value || null;
    lead.notas = document.getElementById('f-notas').value.trim();
    lead.atividadeTipo = document.getElementById('f-atividade-tipo').value;
    lead.atividadeDesc = document.getElementById('f-atividade-desc').value.trim();
    var motivoEl = document.getElementById('f-motivo-perda');
    lead.motivoPerda = motivoEl ? motivoEl.value.trim() : (lead.stage === 'perdido' ? lead.motivoPerda : '');

    var erroValidacao = validarCamposObrigatorios(lead);
    if(erroValidacao){
      alert(erroValidacao);
      return;
    }

    var saveBtn = document.getElementById('f-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    if(isNew){
      var clienteSelecionado = document.getElementById('f-cliente-existente').value;
      if(clienteSelecionado){
        lead.clienteId = clienteSelecionado;
      } else {
        var cnpjInput = document.getElementById('f-cnpj');
        var novoCliente = await criarClienteNoDb({
          nome: lead.nome,
          contato: lead.contato,
          canal: lead.canal,
          criado: todayStr(),
          cnpj: cnpjInput ? cnpjInput.value.replace(/\D/g,'') : '',
          tags: modalNewClientTags
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

    render();
    closeModal();
  };
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
    '<label class="anexo-upload-label">📎 Adicionar arquivo (PDF, imagem, etc. — até 10MB)' +
      '<input type="file" id="f-anexo-input" style="display:none;">' +
    '</label>';

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
      if(!confirm('Excluir o arquivo "' + anexo.nome + '"?')) return;
      btn.disabled = true;
      await excluirAnexo(lead, anexo);
      renderAnexosArea(lead);
    });
  });

  var input = document.getElementById('f-anexo-input');
  input.addEventListener('change', async function(){
    var file = input.files[0];
    if(!file) return;
    var label = input.closest('.anexo-upload-label');
    label.textContent = 'Enviando...';
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

    var tagsHtml = '';
    if (Array.isArray(c.tags) && c.tags.length > 0) {
      tagsHtml = '<div class="cliente-tags-list" style="display:inline-flex; gap:4px; margin-left:8px; flex-wrap:wrap;">' + c.tags.map(function(tag) {
        return '<span class="tag-chip-pill">' + escapeHtml(tag) + '</span>';
      }).join('') + '</div>';
    }

    return '<div class="cliente-card" data-id="' + c.id + '">' +
      '<p class="codigo">' + codigoFmt + '</p>' +
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
      if(!confirm('Excluir este registro de interação?')) return;
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
      alert('Este cliente tem ' + negs.length + ' negócio(s) vinculado(s). Exclua ou desvincule os negócios antes de excluir o cliente.');
      return;
    }
    if(!confirm('Excluir definitivamente este cliente e todo o histórico de interações?')) return;
    await excluirClienteNoDb(clienteId);
    clientes = clientes.filter(function(c){ return c.id !== clienteId; });
    closeClienteModal();
    renderClientesView();
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
var diaSelecionado = null;

var MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
var DIAS_SEMANA_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function leadsNoDia(dataStr){
  return leads.filter(function(l){ return l.nextFollowUp === dataStr && l.stage !== 'fechado' && l.stage !== 'perdido'; });
}

function renderCalendario(){
  var ano = calendarioRef.getFullYear();
  var mes = calendarioRef.getMonth();

  document.getElementById('cal-titulo').textContent = MESES_PT[mes] + ' de ' + ano;

  var primeiroDia = new Date(ano, mes, 1);
  var ultimoDia = new Date(ano, mes + 1, 0);
  var diaSemanaInicio = primeiroDia.getDay();
  var totalDiasMes = ultimoDia.getDate();

  var hojeStr = todayStr();

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

    var itensHtml = itens.slice(0, 3).map(function(l){
      var atrasado = dataStr < hojeStr;
      var texto = (l.atividadeTipo ? l.atividadeTipo + ': ' : '') + l.nome;
      return '<span class="cal-pill' + (atrasado ? ' atrasado' : '') + '">' + escapeHtml(texto) + '</span>';
    }).join('');
    if(itens.length > 3){
      itensHtml += '<span class="cal-pill mais">+' + (itens.length - 3) + '</span>';
    }

    return '<div class="' + classes + '" data-data="' + dataStr + '">' +
      '<div class="num">' + cel.data.getDate() + '</div>' +
      '<div class="itens">' + itensHtml + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('cal-grid').innerHTML = html;

  document.querySelectorAll('.cal-day').forEach(function(el){
    el.addEventListener('click', function(){
      diaSelecionado = el.getAttribute('data-data');
      renderCalendario();
      renderDetalheDoDia(diaSelecionado);
    });
  });

  if(diaSelecionado){
    renderDetalheDoDia(diaSelecionado);
  } else {
    document.getElementById('cal-dia-detalhe').innerHTML = '';
  }
}

function renderDetalheDoDia(dataStr){
  var itens = leadsNoDia(dataStr);
  var d = new Date(dataStr + 'T00:00:00');
  var titulo = d.getDate() + ' de ' + MESES_PT[d.getMonth()] + ' de ' + d.getFullYear();

  var corpo = itens.length
    ? itens.map(function(l){
        return '<div class="negociacao-row" data-leadid="' + l.id + '">' +
          '<span>' + (l.atividadeTipo ? '📌 ' + escapeHtml(l.atividadeTipo) + ' — ' : '') + escapeHtml(l.nome) + ' · ' + fmtMoney(l.valor) + '</span>' +
          '<div style="display:inline-flex; align-items:center; gap:8px;">' +
            '<span class="badge-stage" style="background:' + (STAGES.find(function(s){return s.id===l.stage;})||STAGES[0]).color + ';">' + (STAGES.find(function(s){return s.id===l.stage;})||STAGES[0]).label + '</span>' +
            (l.nextFollowUp ? '<button class="btn-concluir-followup" title="Concluir follow-up">✓</button>' : '') +
          '</div>' +
        '</div>';
      }).join('')
    : '<p class="anexo-vazio">Nenhum follow-up ou atividade agendada para este dia.</p>';

  var box = document.getElementById('cal-dia-detalhe');
  box.innerHTML = '<div class="cal-dia-detalhe-box"><h3>' + titulo + '</h3>' + corpo + '</div>';

  box.querySelectorAll('.negociacao-row').forEach(function(row){
    row.addEventListener('click', function(){
      openModal(row.getAttribute('data-leadid'));
    });
  });

  box.querySelectorAll('.btn-concluir-followup').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var leadId = btn.closest('.negociacao-row').getAttribute('data-leadid');
      var lead = leads.find(function(x){ return x.id === leadId; });
      if(lead){
        await concluirFollowUp(lead);
        renderCalendario();
      }
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

document.getElementById('periodo-select').addEventListener('change', function(){
  periodoTipo = this.value;
  document.getElementById('periodo-custom').classList.toggle('hidden', periodoTipo !== 'personalizado');
  if(periodoTipo !== 'personalizado'){
    render();
    if(document.getElementById('tab-dash').classList.contains('active')) renderDashboard();
  }
});

function aplicarPeriodoPersonalizado(){
  periodoInicio = document.getElementById('periodo-inicio').value || null;
  periodoFim = document.getElementById('periodo-fim').value || null;
  if(periodoInicio && periodoFim){
    render();
    if(document.getElementById('tab-dash').classList.contains('active')) renderDashboard();
  }
}
document.getElementById('periodo-inicio').addEventListener('change', aplicarPeriodoPersonalizado);
document.getElementById('periodo-fim').addEventListener('change', aplicarPeriodoPersonalizado);

document.getElementById('tab-funil').addEventListener('click', function(){ switchTab('funil'); });
document.getElementById('tab-dash').addEventListener('click', function(){ switchTab('dash'); });
document.getElementById('tab-clientes').addEventListener('click', function(){ switchTab('clientes'); });
document.getElementById('tab-calendario').addEventListener('click', function(){ switchTab('calendario'); });

document.getElementById('busca-cliente').addEventListener('input', function(){
  buscaClienteTexto = this.value;
  renderClientesView();
});

document.getElementById('filtro-tag-cliente').addEventListener('change', function(){
  filtroTagClienteSelecionada = this.value;
  renderClientesView();
});

function switchTab(tab){
  document.getElementById('tab-funil').classList.toggle('active', tab === 'funil');
  document.getElementById('tab-dash').classList.toggle('active', tab === 'dash');
  document.getElementById('tab-clientes').classList.toggle('active', tab === 'clientes');
  document.getElementById('tab-calendario').classList.toggle('active', tab === 'calendario');
  document.getElementById('board').style.display = tab === 'funil' ? 'grid' : 'none';
  document.getElementById('dash').classList.toggle('open', tab === 'dash');
  document.getElementById('clientes-view').classList.toggle('open', tab === 'clientes');
  document.getElementById('calendario-view').classList.toggle('open', tab === 'calendario');
  document.querySelector('.filters').style.display = tab === 'funil' ? 'flex' : 'none';
  if(tab === 'dash') renderDashboard();
  if(tab === 'clientes') renderClientesView();
  if(tab === 'calendario') renderCalendario();
}

function showLogin(){
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
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
  var email = document.getElementById('login-email').value.trim();
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
  var atual = document.documentElement.getAttribute('data-theme');
  applyTheme(atual === 'dark' ? 'light' : 'dark');
});

initTheme();

document.getElementById('btn-config').addEventListener('click', abrirModalConfig);

function abrirModalConfig(){
  var etapasConfiguraveis = ['lead','contato','proposta','negociacao'];
  var modal = document.getElementById('modal-config');

  modal.innerHTML = '<h2>Configurações</h2>' +
    '<p class="cliente-section-title" style="margin-top:0;">Meta de vendas</p>' +
    field('Meta mensal (R$)', '<input type="number" min="0" step="100" id="cfg-meta-mensal" value="' + metaMensal + '" placeholder="Ex: 30000">') +
    '<p class="cliente-section-title">Limites de tempo por etapa</p>' +
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
    var novaMeta = Number(document.getElementById('cfg-meta-mensal').value) || 0;
    await salvarConfiguracoes(novosLimites, novaMeta);
    document.getElementById('overlay-config').classList.remove('open');
    render();
    if(document.getElementById('tab-dash').classList.contains('active')) renderDashboard();
  };
}

document.getElementById('overlay-config').addEventListener('click', function(e){
  if(e.target.id === 'overlay-config') document.getElementById('overlay-config').classList.remove('open');
});

document.getElementById('btn-logout').addEventListener('click', async function(){
  await sb.auth.signOut();
  currentUserId = null;
  showLogin();
});

async function iniciarApp(){
  var sessionRes = await sb.auth.getSession();
  var session = sessionRes.data.session;
  if(!session){
    showLogin();
    return;
  }
  currentUserId = session.user.id;
  showApp();
  await loadLeadsFromDb();
  await loadClientesFromDb();
  await loadConfiguracoes();
  render();
}

iniciarApp();
})();
