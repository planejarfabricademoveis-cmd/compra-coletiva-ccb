/* ===========================================================
   PATCH JS — Permissões, Solicitações, Localidades & Impressão
   Entrega:
   - Cadastro de administradores com permissões (checkboxes)
   - Fluxo de solicitação/approvação pelo Master
   - Numeração automática de localidades + listagem/impressão
   - Número da localidade no topo das impressões (~3cm)
   - Filtros de listagem de localidades (todas/abertas/entregues)
   =========================================================== */

console.log("[PATCH] Permissões & Localidades carregado");

/* ==== Helpers e Constantes ==== */
const ACTIONS = {
  EDIT: 'edit',
  ADD: 'add',
  DELETE: 'delete',
  CLOSE_CYCLE: 'closeCycle',
  MARK_DELIVERED: 'markDelivered',
  UNMARK_DELIVERED: 'unmarkDelivered',
  PRINT: 'print',
  VIEW: 'view'
};

function isMaster() {
  // Master se: currentUser.isAdmin && (adminLevel==='master') OU usuário master fixo
  return !!currentUser?.isAdmin && (currentUser.adminLevel === 'master' || currentUser.user === 'fernando_filho87');
}

async function getPermsFor(userOrName){
  // Lê permissões do banco (usuarios) para o usuário indicado (string user) ou currentUser
  const uname = typeof userOrName === 'string' ? userOrName : (currentUser?.user || '');
  if(!uname) return {};
  const snap = await db.ref('usuarios').orderByChild('user').equalTo(uname).once('value');
  if(!snap.exists()) return {};
  const key = Object.keys(snap.val())[0];
  const u = snap.val()[key] || {};
  return u.permissoes || {};
}

async function can(action){
  if(isMaster()) return true; // Master pode tudo
  const perms = await getPermsFor(currentUser?.user);
  // Visualizar/imprimir: liberado para todos admins
  if(action === ACTIONS.VIEW || action === ACTIONS.PRINT) return true;
  // Outras dependem dos checkboxes
  const map = {
    [ACTIONS.EDIT]:       'canEdit',
    [ACTIONS.ADD]:        'canAdd',
    [ACTIONS.DELETE]:     'canDelete',
    [ACTIONS.CLOSE_CYCLE]:'canCloseCycle',
    [ACTIONS.MARK_DELIVERED]  : 'canMarkDelivered',
    [ACTIONS.UNMARK_DELIVERED]: 'canMarkDelivered'
  };
  const flag = map[action];
  return !!perms[flag];
}

function openReasonModal(action){
  return new Promise(resolve=>{
    const html = `
      <div>
        <p>Esta ação é restrita. Explique o motivo da solicitação:</p>
        <textarea id="reasonText" style="width:100%;min-height:96px;"></textarea>
        <div style="text-align:center;margin-top:10px;">
          <button id="btnEnviarReason">Enviar</button>
          <button class="btn-muted" id="btnCancelReason">Cancelar</button>
        </div>
      </div>`;
    abrirModal('Solicitação de permissão', html);
    setTimeout(()=>{
      document.getElementById('btnEnviarReason').onclick = ()=>{
        const motivo = document.getElementById('reasonText').value.trim();
        fecharModal(); resolve(motivo || '');
      };
      document.getElementById('btnCancelReason').onclick = ()=>{
        fecharModal(); resolve('');
      };
    },50);
  });
}

async function requestPermission(action, payload){
  const reason = await openReasonModal(action);
  if(!reason){ showToast('Solicitação cancelada','warn'); return null; }
  const reqRef = await db.ref('permRequests').push({
    action, payload: payload||{}, requester: currentUser?.user||'-',
    createdAt: Date.now(), status: 'pending'
  });
  showToast('Solicitação enviada ao Administrador Master.','info');
  return reqRef.key;
}

/* ==== Localidades ==== */
async function getLocalidadeNumero(nome){
  const key = (nome||'').toLowerCase().trim().replace(/\s+/g,'_');
  if(!key) return null;
  const snap = await db.ref('localidades/'+key).once('value');
  if(snap.exists()) return snap.val().numero;

  const list = (await db.ref('localidades').once('value')).val() || {};
  const usados = Object.values(list).map(l=>l.numero);
  let next = 1; while(usados.includes(next)) next++;
  await db.ref('localidades/'+key).set({ nome, numero: next });
  return next;
}

/* ==== UI – Seções Extras (Solicitações e Localidades) ==== */
function ensureExtraSections(){
  if(!document.getElementById('solicitacoesPermissao')){
    const html = `
      <section id="solicitacoesPermissao" class="card hidden" style="display:none;">
        <h2>Solicitações de Permissão</h2>
        <p class="muted">Somente o <b>Administrador Master</b> pode autorizar.</p>
        <div id="listaSolicitacoes" class="table-wrap"></div>
      </section>
      <section id="localidadesAdmin" class="card hidden" style="display:none;">
        <h2>Localidades (Admin)</h2>
        <div class="menu">
          <input id="locNome" placeholder="Nome da localidade"/>
          <button id="btnSalvarLocalidade">Salvar/Atualizar</button>
          <button class="btn-muted" id="btnListarLocalidades">Listar</button>
          <button class="btn-muted" id="btnImprimirLocalidades">Imprimir</button>
        </div>
        <div class="menu">
          <label class="chip">Filtro:
            <select id="filtroLocs">
              <option value="todas">Todas</option>
              <option value="abertas">Com pedidos em aberto</option>
              <option value="entregues">Com pedidos entregues</option>
            </select>
          </label>
        </div>
        <div id="listaLocalidades" class="table-wrap"></div>
      </section>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }
    // Aguarda o painel de relatórios aparecer antes de inserir os botões
  const iv = setInterval(() => {
    const relatorioAdmin = document.getElementById('relatorioAdmin');
    if (relatorioAdmin && !document.getElementById('btnAbrirSolicitacoes')) {
      clearInterval(iv);

      const menu = document.createElement('div');
      menu.className = 'menu';
      menu.innerHTML = `
        <button id="btnAbrirSolicitacoes" class="btn-warn">🔐 Solicitações de Permissão</button>
        <button id="btnAbrirLocalidades" class="btn-ok">🗺️ Localidades (Admin)</button>`;

      relatorioAdmin.prepend(menu);
    }
  }, 300);

}
ensureExtraSections();

document.addEventListener('click', (e)=>{
  if(e.target?.id === 'btnAbrirSolicitacoes'){
    document.getElementById('solicitacoesPermissao').style.display = 'block';
    document.getElementById('localidadesAdmin').style.display = 'none';
    loadSolicitacoes();
  }
  if(e.target?.id === 'btnAbrirLocalidades'){
    document.getElementById('solicitacoesPermissao').style.display = 'none';
    document.getElementById('localidadesAdmin').style.display = 'block';
    renderLocalidades();
  }
  if(e.target?.id === 'btnSalvarLocalidade'){
    const nome = document.getElementById('locNome').value.trim();
    if(!nome){ showToast('Informe o nome da localidade','warn'); return; }
    getLocalidadeNumero(nome).then(num=>{
      showToast(`Localidade "${nome}" registrada com nº ${num}`,'info');
      renderLocalidades();
    });
  }
  if(e.target?.id === 'btnListarLocalidades'){ renderLocalidades(); }
  if(e.target?.id === 'btnImprimirLocalidades'){ imprimirLocalidades(); }
});

/* ==== Destaque visual da aba ativa (Permissões / Localidades) ==== */
document.addEventListener('click', (e)=>{
  if(e.target?.id === 'btnAbrirSolicitacoes' || e.target?.id === 'btnAbrirLocalidades'){
    const b1 = document.getElementById('btnAbrirSolicitacoes');
    const b2 = document.getElementById('btnAbrirLocalidades');
    if(b1 && b2){
      b1.classList.remove('ativo');
      b2.classList.remove('ativo');
      e.target.classList.add('ativo');
    }
  }
});

/* ==== Solicitações de Permissão ==== */
async function loadSolicitacoes(){
  try {
    const snap = await db.ref('solicitacoes').once('value');
    const data = snap.val() || {};

    const lista = Object.entries(data).map(([uid, s]) => ({
      uid,
      nome: s.nome || 'Sem nome',
      email: s.email || '',
      cargo: s.cargo || '',
      localidade: s.localidade || '',
      status: s.status || 'pendente',
      data: s.data || ''
    }));

    const linhas = lista.map(s => `
      <tr>
        <td>${escapeHtml(s.nome)}</td>
        <td>${escapeHtml(s.localidade)}</td>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.cargo)}</td>
        <td>${escapeHtml(s.status)}</td>
        <td>${escapeHtml(s.data)}</td>
        <td>
          ${s.status === 'pendente' ? `
            <button class="btn-ok" onclick="aprovarSolicitacao('${s.uid}')">✅ Aprovar</button>
            <button class="btn-warn" onclick="negarSolicitacao('${s.uid}')">❌ Negar</button>
          ` : '-'}
        </td>
      </tr>`).join('');

    const html = `
      <table class="localidades-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Localidade</th>
            <th>Email</th>
            <th>Cargo</th>
            <th>Status</th>
            <th>Data</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>${linhas || '<tr><td colspan="7">Nenhuma solicitação encontrada.</td></tr>'}</tbody>
      </table>`;

    document.getElementById('listaSolicitacoes').innerHTML = html;

  } catch (e) {
    console.error(e);
    showToast('Erro ao carregar solicitações', 'error');
  }
}

/* ==== Aprovar / Negar Solicitações ==== */
async function aprovarSolicitacao(uid){
  try {
    await db.ref(`solicitacoes/${uid}`).update({ status: 'aprovado' });
    await db.ref(`usuarios/${uid}`).update({ permissao: 'admin' });
    showToast('Solicitação aprovada e permissão concedida!', 'info');
    loadSolicitacoes();
  } catch(e){
    console.error(e);
    showToast('Erro ao aprovar solicitação', 'error');
  }
}

async function negarSolicitacao(uid){
  try {
    await db.ref(`solicitacoes/${uid}`).update({ status: 'negado' });
    showToast('Solicitação negada com sucesso.', 'warn');
    loadSolicitacoes();
  } catch(e){
    console.error(e);
    showToast('Erro ao negar solicitação', 'error');
  }
}


/* ==== Listagem & Impressão de Localidades (com filtros) ==== */
async function fetchLocalidadesComUso(){
  const locSnap = await db.ref('localidades').once('value');
  const locsObj = locSnap.val() || {};
  const all = Object.keys(locsObj).map(k=>({ key:k, ...locsObj[k] }));

  const pedSnap = await db.ref('pedidos').once('value');
  const ped = Object.values(pedSnap.val() || {});
  const map = {}; // {nomeLoc: {abertos:n, entregues:n}}
  ped.forEach(p=>{
    const nome = p.createdByLocalidade || '';
    if(!nome) return;
    map[nome] = map[nome] || {abertos:0, entregues:0};
    if(p.entregue) map[nome].entregues++; else map[nome].abertos++;
  });

  return all.map(l=>{
    const usage = map[l.nome] || {abertos:0, entregues:0};
    return { ...l, ...usage };
  });
}

async function renderLocalidades(){
  const filtro = document.getElementById('filtroLocs')?.value || 'todas';
  const data = await fetchLocalidadesComUso();

  const filtered = data.filter(l=>{
    if(filtro==='todas') return true;
    if(filtro==='abertas')   return l.abertos > 0;
    if(filtro==='entregues') return l.entregues > 0;
    return true;
  }).sort((a,b)=> a.numero - b.numero);

  const html =
    `<table class="localidades-table">
      <thead><tr>
        <th># (nº)</th><th>Localidade</th><th>Abertos</th><th>Entregues</th>
      </tr></thead>
      <tbody>
        ${filtered.map(l=>`
          <tr><td>${l.numero}</td><td>${l.nome}</td><td>${l.abertos}</td><td>${l.entregues}</td></tr>
        `).join('') || '<tr><td colspan="4">Sem localidades</td></tr>'}
      </tbody>
    </table>`;
  document.getElementById('listaLocalidades').innerHTML = html;

  const sel = document.getElementById('filtroLocs');
  if(sel && !sel.__wired){
    sel.__wired = true;
    sel.addEventListener('change', renderLocalidades);
  }
}

async function imprimirLocalidades(){
  const data = await fetchLocalidadesComUso();
  const rows = data.sort((a,b)=> a.numero - b.numero).map((l,i)=>`
    <tr>
      <td style="border:1px solid #ddd;padding:6px;">${i+1}</td>
      <td style="border:1px solid #ddd;padding:6px;">${l.numero}</td>
      <td style="border:1px solid #ddd;padding:6px;">${l.nome}</td>
      <td style="border:1px solid #ddd;padding:6px;">${l.abertos}</td>
      <td style="border:1px solid #ddd;padding:6px;">${l.entregues}</td>
    </tr>`).join('');

  const html = `
    <div class="localidade-badge-print" style="margin-bottom:6mm;">
      <div class="num">LOC</div>
    </div>
    <div class="print-header">
      <div><h3 style="margin:0;">Localidades Cadastradas</h3>
      <div class="print-meta">Gerado em ${fmtDateTime(Date.now())}</div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#0056b3;color:#fff;">
          <th>#</th><th>Nº</th><th>Localidade</th><th>Abertos</th><th>Entregues</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5">Sem dados</td></tr>'}</tbody>
    </table>`;
  printHtml(html, 'Localidades');
}

/* ==== Número da localidade nos relatórios impressos ==== */
// Hook nas funções existentes, quando disponíveis
(function hookPrints(){
  const iv = setInterval(async ()=>{
    if(typeof imprimirRelatorioUsuario === 'function' && typeof imprimirRelatorioAdmin === 'function'){
      clearInterval(iv);

      const originalUser = imprimirRelatorioUsuario;
      window.imprimirRelatorioUsuario = async function(){
        // Antes de imprimir, injeta o badge da localidade do usuário atual
        let num = null;
        if(currentUser?.localidade){
          num = await getLocalidadeNumero(currentUser.localidade);
        }
        const tpl = document.querySelector('#tpl-impressao-usuario')?.content?.firstElementChild;
        if(tpl && num!=null){
          const badge = document.createElement('div');
          badge.className = 'localidade-badge-print';
          badge.innerHTML = `<div class="num">${num}</div>`;
          tpl.prepend(badge);
        }
        return originalUser.apply(this, arguments);
      };

      const originalAdmin = imprimirRelatorioAdmin;
      window.imprimirRelatorioAdmin = async function(){
        // Se for imprimir “geral”, não há uma única localidade; não injeta.
        return originalAdmin.apply(this, arguments);
      };

      const originalPorLocal = imprimirRelatorioPorLocalidade;
      if(typeof originalPorLocal === 'function'){
        window.imprimirRelatorioPorLocalidade = async function(){
          // intercepta seleção e injeta badge daquela localidade
          // vamos deixar o fluxo original criar o HTML e imprimir; usamos open/print pipeline
          // (neste projeto, geramos HTML final no próprio handler; então vamos
          // duplicar a lógica aqui seria invasivo; mantemos como está)
          return originalPorLocal.apply(this, arguments);
        };
      }
    }
  }, 300);
})();

/* ==== Painel do Master: Solicitações ==== */
async function loadSolicitacoes(){
  const box = document.getElementById('listaSolicitacoes');
  if(!box) return;
  const snap = await db.ref('permRequests').orderByChild('createdAt').once('value');
  const obj = snap.val() || {};
  const rows = Object.keys(obj).sort((a,b)=> obj[b].createdAt - obj[a].createdAt)
    .map(key=>{
      const r = obj[key];
      const st = r.status;
      const cls = st==='pending' ? 'status-pending' : (st==='approved' ? 'status-approved' : 'status-rejected');
      return `
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin:8px 0;background:#fff;">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <div><b>Ação:</b> ${r.action}</div>
            <div><span class="${cls}">${st.toUpperCase()}</span></div>
          </div>
          <div class="muted" style="margin:6px 0;"><b>Solicitante:</b> ${r.requester || '-'}</div>
          <div style="white-space:pre-wrap;border:1px dashed #e5e7eb;padding:8px;border-radius:8px;background:#fafafa;"><b>Motivo:</b> ${escapeHtml(r.payload?.reason||r.reason||'-')}</div>
          <div class="muted" style="font-size:12px;margin-top:6px;">${fmtDateTime(r.createdAt||Date.now())}</div>
          ${isMaster() && st==='pending' ? `
            <div style="text-align:right;margin-top:8px;">
              <button class="btn-ok" onclick="approveRequest('${key}')">Aprovar</button>
              <button class="btn-danger" onclick="rejectRequest('${key}')">Negar</button>
            </div>` : ``}
        </div>`;
    }).join('');
  box.innerHTML = rows || '<p class="muted">Nenhuma solicitação.</p>';
}

window.approveRequest = async function(key){
  if(!isMaster()) return;
  const ref = db.ref('permRequests/'+key);
  const snap = await ref.once('value'); const r = snap.val();
  if(!r) return;

  await ref.update({ status: 'approved', decidedAt: Date.now(), decidedBy: currentUser?.user||'-' });

  // Execução automática de algumas ações comuns
  try{
    await executeApprovedAction(r);
  }catch(e){ console.warn('Falha ao executar ação aprovada:', e); }
  showToast('Solicitação aprovada','info');
  loadSolicitacoes();
};

window.rejectRequest = async function(key){
  if(!isMaster()) return;
  await db.ref('permRequests/'+key).update({ status: 'rejected', decidedAt: Date.now(), decidedBy: currentUser?.user||'-' });
  showToast('Solicitação negada','warn');
  loadSolicitacoes();
};

async function executeApprovedAction(req){
  const { action, payload } = req || {};
  if(action === 'DELETE_PEDIDO' && payload?.pedidoKey){
    await db.ref('pedidos/'+payload.pedidoKey).remove();
    await logEvent('pedido','Pedido excluído (aprovado pelo master)',{pedidoKey:payload.pedidoKey});
  }
  if(action === 'MARK_ENTREGUE' && payload?.pedidoKey){
    await db.ref('pedidos/'+payload.pedidoKey).update({ entregue:true, deliveredAt: Date.now() });
    await logEvent('pedido','Pedido marcado entregue (aprovado)',{pedidoKey:payload.pedidoKey});
  }
  if(action === 'UNMARK_ENTREGUE' && payload?.pedidoKey){
    await db.ref('pedidos/'+payload.pedidoKey).update({ entregue:false, deliveredAt: null });
    await logEvent('pedido','Pedido desmarcado entregue (aprovado)',{pedidoKey:payload.pedidoKey});
  }
  if(action === 'CLOSE_CYCLE'){
    const agora = Date.now();
    await db.ref('config').update({ lastCycleEnd: agora, cycleStart: agora });
    await logEvent('sistema','Ciclo encerrado (aprovado)',{});
  }
}

/* ==== Enforcements (wrappers em ações sensíveis) ==== */
(function enforceSensitiveActions(){
  const iv = setInterval(()=>{
    if(typeof window.deletePedido === 'function' && typeof window.toggleEntregue === 'function'){
      clearInterval(iv);

      // wrap deletePedido
      const _del = window.deletePedido;
      window.deletePedido = async function(key, opts){
        const allowed = await can(ACTIONS.DELETE);
        if(allowed) return _del.apply(this, arguments);

        const reqKey = await requestPermission('DELETE_PEDIDO', { pedidoKey:key, reason: '' });
        return; // aguarda aprovação no painel
      };

      // wrap toggleEntregue
      const _toggle = window.toggleEntregue;
      window.toggleEntregue = async function(key, toState){
        const act = toState ? ACTIONS.MARK_DELIVERED : ACTIONS.UNMARK_DELIVERED;
        const allowed = await can(act);
        if(allowed) return _toggle.apply(this, arguments);

        await requestPermission(toState ? 'MARK_ENTREGUE' : 'UNMARK_ENTREGUE', { pedidoKey:key, reason:'' });
        return;
      };

      // Encerrar ciclo (há um listener no HTML; reforçamos)
      const btn = document.getElementById('btnEncerrarCiclo');
      if(btn && !btn.__wrapped){
        btn.__wrapped = true;
        const handler = async (e)=>{
          e.preventDefault();
          if(await can(ACTIONS.CLOSE_CYCLE)){
            // chama o listener padrão (o HTML já atualiza config)
            // re-disparamos o click original “real” usando uma flag
            btn.__bypass = true; btn.click(); btn.__bypass = false;
            return;
          }
          await requestPermission('CLOSE_CYCLE', { reason:'' });
        };
        btn.addEventListener('click', (ev)=>{
          if(btn.__bypass) return; // execução real
          handler(ev);
        }, true);
      }
    }
  }, 300);
})();

/* ==== Cadastro/edição de usuários — campos de administrador e permissões ==== */
(function injectAdminPermsUI(){
  const iv = setInterval(()=>{
    const host = document.getElementById('adminUsuarios');
    const anchor = document.getElementById('btnAdminAddUser');
    if(host && anchor && !document.getElementById('permsBlock')){
      clearInterval(iv);

      const html = `
        <h3 style="margin-top:8px;">Permissões do Administrador</h3>
        <div id="permsBlock">
          <div class="role-row">
            <label class="pill"><input type="checkbox" id="adminIsAdmin" style="width:auto;"> É administrador</label>
            <label class="pill"><input type="checkbox" id="adminIsMaster" style="width:auto;"> Administrador Master</label>
          </div>
          <div class="perms-grid">
            <label><input type="checkbox" id="permView" checked disabled> Visualizar (sempre permitido)</label>
            <label><input type="checkbox" id="permPrint" checked disabled> Imprimir (sempre permitido)</label>
            <label><input type="checkbox" id="permAdd"> Adicionar</label>
            <label><input type="checkbox" id="permEdit"> Editar</label>
            <label><input type="checkbox" id="permDelete"> Excluir</label>
            <label><input type="checkbox" id="permMarkDelivered"> Marcar/Desmarcar Entregue</label>
            <label><input type="checkbox" id="permCloseCycle"> Encerrar Ciclos</label>
          </div>
          <p class="muted" style="margin:6px 0 0;">Dica: se marcar “Master”, não é necessário marcar os demais — o Master já pode tudo.</p>
        </div>`;
      anchor.insertAdjacentHTML('beforebegin', html);

      // Patch do handler de criação
      const _create = window.adminAddUser;
      window.adminAddUser = async function(){
        // coleta flags antes de criar
        const isAdmin   = document.getElementById('adminIsAdmin').checked;
        const isMasterF = document.getElementById('adminIsMaster').checked;
        // chama criação para gravar o usuário “básico”
        await _create.apply(this, arguments);

        // localiza o registro recém-criado pelo user informando em #adminNovoUser
        const uname = document.getElementById('adminNovoUser').value.trim(); // após _create, normalmente limpou; então guardemos antes:
      };

      // intercepta realmente antes de limpar inputs: refazemos o addUser “híbrido”
      const btn = document.getElementById('btnAdminAddUser');
      if(btn && !btn.__wired){
        btn.__wired = true;
        btn.removeEventListener('click', window.adminAddUser); // remove default
        btn.addEventListener('click', async ()=>{
          if(!currentUser?.isAdmin){ showToast('Acesso negado','error'); return; }

          // campos existentes
          const nome  = document.getElementById('adminNovoNome').value.trim();
          const user  = document.getElementById('adminNovoUser').value.trim();
          const pass  = document.getElementById('adminNovoPass').value.trim();
          const local = document.getElementById('adminNovoLocalidade').value.trim();
          const ministerio = document.getElementById('adminNovoMinisterio').value || '';
          const provisorio = document.getElementById('adminProvisorio').value === 'true';

          if(!nome || !user || !pass){ showToast('Preencha: nome, usuário, senha','error'); return; }

          // numeração automática da localidade
          let numeroLocalidade = null;
          if(local) numeroLocalidade = await getLocalidadeNumero(local);

          // flags de admin/permissões
          const isAdmin   = document.getElementById('adminIsAdmin').checked;
          const isMasterF = document.getElementById('adminIsMaster').checked;

          const perms = {
            canAdd:          document.getElementById('permAdd').checked,
            canEdit:         document.getElementById('permEdit').checked,
            canDelete:       document.getElementById('permDelete').checked,
            canMarkDelivered:document.getElementById('permMarkDelivered').checked,
            canCloseCycle:   document.getElementById('permCloseCycle').checked
          };

          // gravação (replicando lógica do projeto base com extras)
          // evita duplicidade
          const snap = await db.ref('usuarios').orderByChild('user').equalTo(user).once('value');
          if(snap.exists()){ showToast('Usuário já existe','error'); return; }

          const uid = Date.now().toString(36)+Math.random().toString(36).slice(2,8);
          await db.ref('usuarios').push({
            nome, user, pass, localidade: local, ministerio,
            genero:'auto', uid, createdAt: Date.now(), provisorio,
            isAdmin, adminLevel: isMasterF ? 'master' : (isAdmin ? 'admin' : 'user'),
            permissoes: isMasterF ? {master:true} : perms,
            numeroLocalidade: numeroLocalidade
          });

          // limpar UI
          ['adminNovoNome','adminNovoUser','adminNovoPass','adminNovoLocalidade'].forEach(id=> document.getElementById(id).value='');
          document.getElementById('adminProvisorio').value='true';
          document.getElementById('adminIsAdmin').checked = false;
          document.getElementById('adminIsMaster').checked = false;
          ['permAdd','permEdit','permDelete','permMarkDelivered','permCloseCycle'].forEach(id=> document.getElementById(id).checked=false);

          await renderAdminUsuarios?.();
          showToast('Usuário criado com permissões','info');
          await logEvent?.('perfil','Usuário criado (admin c/ permissões)',{user});
        });
      }
    }
  }, 300);
})();

/* ==== Atualiza numeração de localidade quando editar usuário ==== */
(function hookEditUser(){
  const iv = setInterval(()=>{
    if(typeof window.adminEditUser === 'function'){
      clearInterval(iv);
      const _edit = window.adminEditUser;
      window.adminEditUser = async function(key){
        // Rodamos o original (que pergunta prompts)
        await _edit.apply(this, arguments);
        try{
          // Após edição, garanta número da localidade
          const snap = await db.ref('usuarios/'+key).once('value');
          const u = snap.val(); if(!u) return;
          if(u.localidade){
            const num = await getLocalidadeNumero(u.localidade);
            await db.ref('usuarios/'+key).update({ numeroLocalidade: num });
          }
        }catch(e){}
      };
    }
  }, 300);
})();

// ==============================
// RELATÓRIO GERAL COM FILTROS
// ==============================

async function previewRelGeral() {
  try {
    const snap = await db.ref('pedidos').once('value');
    const pedidos = Object.values(snap.val() || {});
    if (!pedidos.length) {
      showToast('Nenhum pedido encontrado.', 'warn');
      return;
    }

    const localidades = [...new Set(pedidos.map(p => p.createdByLocalidade || '-'))].sort();

    let filtroHTML = `
      <div class="menu" style="margin-bottom:10px;">
        <label>Localidade:
          <select id="filtroLocalidade">
            <option value="todas">Todas</option>
            ${localidades.map(l => `<option value="${l}">${l}</option>`).join('')}
          </select>
        </label>
        <label style="margin-left:12px;">Status:
          <select id="filtroStatus">
            <option value="todos">Todos</option>
            <option value="entregues">Entregues</option>
            <option value="pendentes">Pendentes</option>
          </select>
        </label>
        <button id="btnAplicarFiltros" class="btn-ok" style="margin-left:12px;">Aplicar</button>
      </div>
      <div id="tabelaRelGeral"></div>
    `;

    abrirModal('📊 Relatório Geral de Pedidos', filtroHTML);
    renderTabelaRelGeral(pedidos);

    setTimeout(() => {
      document.getElementById('btnAplicarFiltros').onclick = () => {
        const loc = document.getElementById('filtroLocalidade').value;
        const st = document.getElementById('filtroStatus').value;
        let filtrado = pedidos;

        if (loc !== 'todas') filtrado = filtrado.filter(p => (p.createdByLocalidade || '-') === loc);
        if (st === 'entregues') filtrado = filtrado.filter(p => p.entregue);
        if (st === 'pendentes') filtrado = filtrado.filter(p => !p.entregue);

        renderTabelaRelGeral(filtrado);
      };
    }, 200);

  } catch (err) {
    console.error(err);
    showToast('Erro ao gerar relatório.', 'error');
  }
}

function renderTabelaRelGeral(pedidos) {
  const rows = pedidos.map((p, i) => `
    <tr>
      <td style="border:1px solid #ddd;padding:6px;">${i + 1}</td>
      <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(p.createdByLocalidade || '-')}</td>
      <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(p.nome || '-')}</td>
      <td style="border:1px solid #ddd;padding:6px;">${p.quantidade || 0}</td>
      <td style="border:1px solid #ddd;padding:6px;">${p.entregue ? '✅' : '❌'}</td>
    </tr>`).join('');

  const html = `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#0056b3;color:#fff;">
          <th>#</th><th>Localidade</th><th>Produto</th><th>Qtd</th><th>Entregue</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5">Sem resultados</td></tr>'}</tbody>
    </table>`;
  document.getElementById('tabelaRelGeral').innerHTML = html;
}

window.previewRelGeral = previewRelGeral;
window.imprimirRelatorioAdmin = imprimirRelatorioAdmin;

// ==============================
// LISTAGEM DE PRODUTOS (ADMIN)
// ==============================
async function renderProdutosAdmin() {
  try {
    const snap = await db.ref('produtos').once('value');
    const produtos = snap.val() || {};

    const tbody = Object.keys(produtos).map((key, i) => {
      const p = produtos[key];
      return `
        <tr>
          <td style="border:1px solid #ddd;padding:6px;">${i + 1}</td>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(p.nome || '-')}</td>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(p.unidade || '-')}</td>
          <td style="border:1px solid #ddd;padding:6px;">
            <button class="btn-ok" onclick="editarProdutoAdmin('${key}')">Editar</button>
            <button class="btn-warn" onclick="excluirProdutoAdmin('${key}')">Excluir</button>
          </td>
        </tr>`;
    }).join('');

    const html = `
      <table style="width:100%;border-collapse:collapse;margin-top:10px;">
        <thead>
          <tr style="background:#0056b3;color:#fff;">
            <th>#</th><th>Produto</th><th>Unidade</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>${tbody || '<tr><td colspan="4">Nenhum produto encontrado.</td></tr>'}</tbody>
      </table>`;

    const container = document.querySelector('#tabelaProdutos');
    if (container) container.innerHTML = html;
  } catch (e) {
    console.error(e);
    showToast('Erro ao carregar produtos', 'error');
  }
}

window.editarProdutoAdmin = async function(key) {
  const snap = await db.ref('produtos/' + key).once('value');
  const p = snap.val();
  if (!p) return;
  const novoNome = prompt('Novo nome:', p.nome);
  const novaUnid = prompt('Nova unidade:', p.unidade);
  if (novoNome) await db.ref('produtos/' + key).update({ nome: novoNome, unidade: novaUnid });
  showToast('Produto atualizado', 'info');
  renderProdutosAdmin();
};

window.excluirProdutoAdmin = async function(key) {
  if (!confirm('Excluir este produto?')) return;
  await db.ref('produtos/' + key).remove();
  showToast('Produto excluído', 'warn');
  renderProdutosAdmin();
};

// Executa automaticamente ao abrir o painel de produtos
document.addEventListener('DOMContentLoaded', renderProdutosAdmin);

// Chama a listagem de produtos quando o painel de produtos é aberto
document.addEventListener('click', (e) => {
  if (e.target?.id === 'adminProdutosBtn') {
    renderProdutosAdmin();
  }
});





