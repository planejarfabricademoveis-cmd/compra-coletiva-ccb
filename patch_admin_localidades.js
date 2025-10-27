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
    action,
    payload: payload || {},
    requester: currentUser?.user || '-',
    requesterName: currentUser?.nome || currentUser?.user || '-',
    reason: reason,
    createdAt: Date.now(),
    status: 'pending'
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
    // 1. Atualiza o status da solicitação
    await db.ref(`solicitacoes/${uid}`).update({ status: 'aprovado' });

    // 2. Define o usuário como admin
    await db.ref(`usuarios/${uid}`).update({ permissao: 'admin' });

    // 3. Concede permissões reais no banco
    await db.ref(`usuarios/${uid}/permissoes`).set({
      canEdit: true,
      canAdd: true,
      canDelete: true,
      canCloseCycle: true,
      canMarkDelivered: true
    });

    // 4. Exibe mensagem e recarrega a lista
    showToast('✅ Solicitação aprovada e permissões aplicadas!', 'info');
    await logEvent('sistema', 'Solicitação aprovada e permissões aplicadas', { uid });
    loadSolicitacoes();

  } catch(e){
    console.error(e);
    showToast('Erro ao aprovar solicitação', 'error');
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
  async function imprimirLocalidades(){
  const filtroSel = document.getElementById('filtroLocs')?.value || 'todas';
  const data = await fetchLocalidadesComUso();

  const filtrados = data.filter(l=>{
    if (filtroSel === 'todas') return true;
    if (filtroSel === 'abertas') return l.abertos > 0;
    if (filtroSel === 'entregues') return l.entregues > 0;
    return true;
  }).sort((a,b)=> a.numero - b.numero);

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
         // 🧩 Aplica o filtro do menu principal (Todas / Abertas / Entregues)
    const filtro = document.getElementById('filtroImpressao')?.value || 'todos';
    let pedidosFiltrados = pedidos;

    if (filtro === 'aberto') {
      pedidosFiltrados = pedidos.filter(p => !p.entregue);
    } else if (filtro === 'entregue') {
      pedidosFiltrados = pedidos.filter(p => p.entregue);
    }

    // substitui a lista original
    pedidos = pedidosFiltrados;

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

/* ===========================================================
   PAINEL DE SOLICITAÇÕES DE PERMISSÃO (Admin Master)
   =========================================================== */
function criarPainelPermissoes(){
  if (document.getElementById('painelPermissoes')) return;

  const html = `
    <section id="painelPermissoes" class="card" style="margin-top:20px;">
      <h2>🔐 Solicitações de Permissão</h2>
      <p class="muted">Somente o <b>Administrador Master</b> pode aprovar ou negar solicitações.</p>
      <div id="listaPermissoes" class="table-wrap" style="margin-top:10px;">Carregando...</div>
      <div style="text-align:center;margin-top:8px;">
        <button id="btnTogglePainel" class="btn-muted">👁️ Ocultar Painel</button>
      </div>
    </section>
  `;
 document.body.insertAdjacentHTML('beforeend', html);
carregarSolicitacoesPermissao();
iniciarContadorPermissoes();

const btn = document.getElementById('btnTogglePainel');
btn.addEventListener('click', ()=>{
  const painel = document.getElementById('painelPermissoes');
  if(!painel) return;
  if(painel.style.display === 'none'){
    painel.style.display = 'block';
    btn.textContent = '👁️ Ocultar Painel';
    carregarSolicitacoesPermissao();

    // ✅ Assim que o painel for aberto, remove o contador 🔴 (notificação)
    const badge = document.querySelector('#btnAbrirPermissoes .badge-alert');
    if (badge) badge.style.display = 'none';
  } else {
    painel.style.display = 'none';
    btn.textContent = '👁️ Mostrar Painel';
  }
});

}


async function carregarSolicitacoesPermissao(){
  const lista = document.getElementById('listaPermissoes');
  if (!lista) return;

  try {
    const snap = await db.ref('permRequests').orderByChild('createdAt').once('value');
    const data = snap.val() || {};
    const registros = Object.entries(data)
      .filter(([id, req]) => req.status === 'pending') // ❗ mostra só as pendentes
      .sort((a,b)=>b[1].createdAt - a[1].createdAt)
      .map(([id, req])=>{
        const statusColor = req.status === 'approved' ? '#16a34a' :
                            req.status === 'rejected' ? '#dc2626' : '#f59e0b';
        return `
          <tr>
            <td>${escapeHtml(req.requesterName || req.requester || '-')}</td>
            <td>${escapeHtml(req.action || '-')}</td>
            <td>${escapeHtml(req.reason || '(sem motivo informado)')}</td>
            <td style="color:${statusColor};font-weight:bold;">${req.status || 'pending'}</td>
            <td>
              ${req.status === 'pending'
                ? `<button class="btn-ok" onclick="aprovarPermissao('${id}')">✅ Aprovar</button>
                   <button class="btn-warn" onclick="('${id}')">❌ Negar</button>`
                : '-'}
            </td>
          </tr>
        `;
      }).join('');

    lista.innerHTML = `
      <table class="localidades-table" style="width:100%;">
        <thead>
          <tr><th>Usuário</th><th>Ação</th><th>Motivo</th><th>Status</th><th>Ações</th></tr>
        </thead>
        <tbody>${registros || '<tr><td colspan="5">Nenhuma solicitação pendente.</td></tr>'}</tbody>
      </table>
    `;
  } catch(e){
    console.error(e);
    lista.innerHTML = '<p style="color:red;">Erro ao carregar solicitações.</p>';
  }
}

/* ===========================================================
   MONITORAR SOLICITAÇÕES PENDENTES (Contador 🔴 no botão)
   =========================================================== */
function iniciarContadorPermissoes() {
  const btn = document.getElementById('btnAbrirPermissoes');
  if (!btn) return; // botão ainda não existe

  const badge = document.createElement('span');
  badge.id = 'contadorPermissoes';
  badge.style.cssText = `
    background: #dc2626;
    color: #fff;
    font-size: 12px;
    font-weight: bold;
    border-radius: 50%;
    padding: 2px 6px;
    margin-left: 6px;
    vertical-align: middle;
    display: none;
  `;
  btn.appendChild(badge);

  // Monitora o banco em tempo real (Firebase)
  db.ref('permRequests').on('value', snap => {
    const data = snap.val() || {};
    const pendentes = Object.values(data).filter(req => req.status === 'pending').length;

    if (pendentes > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = pendentes;
    } else {
      badge.style.display = 'none';
    }
  });
}



// ===========================================================
// ✅ Aprovar / ❌ Negar Solicitação + Enviar Notificação
// ===========================================================
async function aprovarPermissao(id){
  try {
    // Atualiza status
    await db.ref(`permRequests/${id}`).update({ status: 'approved', decidedAt: Date.now() });
     await logEvent('permRequest', 'Solicitação APROVADA pelo Administrador Master', { id });


    // Busca a solicitação original para notificar o autor
    const snap = await db.ref(`permRequests/${id}`).once('value');
    const req = snap.val();
    if (req && req.requester) {
      await db.ref(`usuarios/${req.requester}/notificacoes`).push({
        tipo: 'info',
        mensagem: `✅ Sua solicitação (${req.action || 'ação'}) foi aprovada pelo Administrador Master.`,
        createdAt: Date.now(),
        lida: false
      });
    }

    showToast('Solicitação aprovada!', 'info');
    carregarSolicitacoesPermissao();
  } catch(e){
    console.error(e);
    showToast('Erro ao aprovar.', 'error');
  }
}

async function negarPermissao(id){
  try {
    await db.ref(`permRequests/${id}`).update({ status: 'rejected', decidedAt: Date.now() });
     await logEvent('permRequest', 'Solicitação NEGADA pelo Administrador Master', { id });


    const snap = await db.ref(`permRequests/${id}`).once('value');
    const req = snap.val();
    if (req && req.requester) {
      await db.ref(`usuarios/${req.requester}/notificacoes`).push({
        tipo: 'warn',
        mensagem: `❌ Sua solicitação (${req.action || 'ação'}) foi negada pelo Administrador Master.`,
        createdAt: Date.now(),
        lida: false
      });
    }

    showToast('Solicitação negada!', 'warn');
    carregarSolicitacoesPermissao();
  } catch(e){
    console.error(e);
    showToast('Erro ao negar.', 'error');
  }
}

/* ===========================================================
   PAINEL DE PERMISSÕES (checkboxes) — Somente Master
   =========================================================== */

// Abre/fecha o painel
function abrirPermissoesAdmin(){
  if(!isMaster()){ showToast('Acesso restrito ao Administrador Master','error'); return; }
  const sec = document.getElementById('painelPermsAdmin');
  if(!sec){ showToast('Painel de permissões não encontrado','error'); return; }
  sec.classList.toggle('hidden');
  if(!sec.classList.contains('hidden')) loadUsuariosParaPermissoes();
}

// Carrega usuários e renderiza lista
async function loadUsuariosParaPermissoes(){
  const box = document.getElementById('listaUsuariosPerms');
  if(!box) return;
  box.innerHTML = 'Carregando...';

  try{
    const snap = await db.ref('usuarios').once('value');
    const obj = snap.val() || {};
    const busca = (document.getElementById('buscaUsuarioPerm')?.value || '').toLowerCase().trim();

    // Ordena por nome
    const pares = Object.entries(obj).sort((a,b)=>{
      const na=(a[1].nome||a[1].user||'').toLowerCase();
      const nb=(b[1].nome||b[1].user||'').toLowerCase();
      return na.localeCompare(nb);
    }).filter(([key,u])=>{
      if(!busca) return true;
      const txt = `${u.nome||''} ${u.user||''}`.toLowerCase();
      return txt.includes(busca);
    });

    if(!pares.length){
      box.innerHTML = '<p class="muted">Nenhum usuário encontrado.</p>';
      return;
    }

    const html = pares.map(([key,u])=>{
      const nome = escapeHtml(u.nome || '(sem nome)');
      const user = escapeHtml(u.user || key);
      const adminLevel = u.adminLevel || 'user';
      const isAdmin = !!u.isAdmin || adminLevel!=='user';
      const perms = u.permissoes || {};

      return `
        <div class="row-user" data-key="${key}">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <div>
              <b>${nome}</b> <span class="muted">@${user}</span>
              <span class="badge-role">${adminLevel.toUpperCase()}</span>
            </div>
            <div>
              <label class="pill"><input type="checkbox" class="chk-isAdmin" ${isAdmin?'checked':''}> É administrador</label>
              <label class="pill"><input type="checkbox" class="chk-isMaster" ${adminLevel==='master'?'checked':''}> Administrador Master</label>
            </div>
          </div>

          <div class="perms-grid-mini" style="margin-top:8px;">
            <label><input type="checkbox" class="perm-canAdd" ${perms.canAdd?'checked':''}> Adicionar</label>
            <label><input type="checkbox" class="perm-canEdit" ${perms.canEdit?'checked':''}> Editar</label>
            <label><input type="checkbox" class="perm-canDelete" ${perms.canDelete?'checked':''}> Excluir</label>
            <label><input type="checkbox" class="perm-canMarkDelivered" ${perms.canMarkDelivered?'checked':''}> Marcar/Desmarcar Entregue</label>
            <label><input type="checkbox" class="perm-canCloseCycle" ${perms.canCloseCycle?'checked':''}> Encerrar Ciclos</label>
          </div>

          <div class="row-actions">
            <button class="btn-ok" onclick="salvarPermissoesUsuario('${key}')">💾 Salvar</button>
          </div>
        </div>`;
    }).join('');

    box.innerHTML = html;

    // Atalho: Enter no campo de busca recarrega
    const inputBusca = document.getElementById('buscaUsuarioPerm');
    if(inputBusca && !inputBusca.__wired){
      inputBusca.__wired = true;
      inputBusca.addEventListener('keydown', (e)=>{
        if(e.key==='Enter') loadUsuariosParaPermissoes();
      });
    }

  }catch(e){
    console.error(e);
    box.innerHTML = '<p style="color:red;">Erro ao carregar usuários.</p>';
  }
}

// Salva permissões do usuário escolhido
window.salvarPermissoesUsuario = async function(key){
  if(!isMaster()){ showToast('Ação restrita ao Administrador Master','error'); return; }

  try{
    const row = document.querySelector(`.row-user[data-key="${key}"]`);
    if(!row){ showToast('Usuário não encontrado na lista','error'); return; }

    const isAdmin = row.querySelector('.chk-isAdmin').checked;
    const isMasterF = row.querySelector('.chk-isMaster').checked;

    // Se Master, ignora granular e grava perfil de master
    const perms = isMasterF ? { master: true } : {
      canAdd: row.querySelector('.perm-canAdd').checked,
      canEdit: row.querySelector('.perm-canEdit').checked,
      canDelete: row.querySelector('.perm-canDelete').checked,
      canMarkDelivered: row.querySelector('.perm-canMarkDelivered').checked,
      canCloseCycle: row.querySelector('.perm-canCloseCycle').checked
    };

    const updates = {
      isAdmin: isAdmin || isMasterF,
      adminLevel: isMasterF ? 'master' : (isAdmin ? 'admin' : 'user'),
      permissoes: perms
    };

    await db.ref(`usuarios/${key}`).update(updates);

    // Log
    try{
      await logEvent('permissoes','Permissões atualizadas (Master)', { userKey:key, ...updates });
    }catch(_){}

    showToast('Permissões salvas com sucesso!','info');
    // Atualiza a lista para refletir papel/etiqueta
    loadUsuariosParaPermissoes();

  }catch(e){
    console.error(e);
    showToast('Erro ao salvar permissões','error');
  }
};


/* ===========================================================
   🔔 Exibir notificações ao entrar (usuário comum e admin)
   =========================================================== */
async function verificarNotificacoesUsuario(){
  if (!currentUser || !currentUser.user) return;

  const snap = await db.ref(`usuarios/${currentUser.user}/notificacoes`).once('value');
  const notificacoes = snap.val() || {};

  for (const [key, n] of Object.entries(notificacoes)) {
    if (!n.lida) {
      showToast(n.mensagem, n.tipo || 'info');
      // marca como lida para não repetir
      await db.ref(`usuarios/${currentUser.user}/notificacoes/${key}/lida`).set(true);
    }
  }
}

// Executa automaticamente 3 segundos após login
setTimeout(verificarNotificacoesUsuario, 3000);


/* ===========================================================
   NOTIFICAÇÕES AUTOMÁTICAS DE PERMISSÕES (para todos os usuários)
   =========================================================== */
async function checarNotificacoesPermissoes() {
  if (!currentUser?.user) return;

  try {
    // Carrega todas as solicitações do usuário atual
    const snap = await db.ref('permRequests').orderByChild('requester').equalTo(currentUser.user).once('value');
    const data = snap.val() || {};

    let houveAviso = false;

    for (const [id, req] of Object.entries(data)) {
      if (req.status === 'approved' && !req.notified) {
        showToast(`✅ Sua solicitação "${req.action}" foi aprovada!`, 'info');
        await db.ref(`permRequests/${id}/notified`).set(true);
        houveAviso = true;
      } else if (req.status === 'rejected' && !req.notified) {
        showToast(`❌ Sua solicitação "${req.action}" foi negada. Motivo: ${req.reason || 'sem motivo informado'}`, 'warn');
        await db.ref(`permRequests/${id}/notified`).set(true);
        houveAviso = true;
      }
    }

    if (houveAviso) {
      console.log('📢 Notificação de permissão entregue ao usuário.');
    }
  } catch (e) {
    console.error('Erro ao verificar notificações de permissão:', e);
  }
}

// Roda a verificação automática a cada 15 segundos (enquanto logado)
setInterval(() => {
  if (currentUser?.user) checarNotificacoesPermissoes();
}, 15000);


/* ===========================================================
   CRIAÇÃO E EXIBIÇÃO DO PAINEL DE PERMISSÕES (SOMENTE LOGADO)
   =========================================================== */
setInterval(()=>{
  const painel = document.getElementById('painelPermissoes');
  if(!currentUser){ // 🔒 usuário deslogado
    if(painel) painel.style.display = 'none';
    return;
  }
  // apenas o Master pode ver
  if(currentUser?.user === 'fernando_filho87'){
    if(!painel) criarPainelPermissoes();
    else painel.style.display = 'block';
  } else {
    if(painel) painel.style.display = 'none';
  }
}, 1000);


/* ===========================================================
   BOTÃO DE ACESSO AO PAINEL DE PERMISSÕES
   =========================================================== */
function abrirPainelPermissoes(){
  // Garante que o painel foi criado
  if (!document.getElementById('painelPermissoes')) {
    criarPainelPermissoes();
  }

  // Rolagem suave até o painel
  const painel = document.getElementById('painelPermissoes');
  if (painel) {
    painel.scrollIntoView({ behavior: 'smooth' });
    painel.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
    setTimeout(()=> painel.style.boxShadow = '', 2000);
  } else {
    showToast('Painel de permissões não encontrado', 'error');
  }
}

/* ===========================================================
   EXIBIÇÃO CONDICIONAL — Painel de Permissões
   =========================================================== */

// Oculta o painel se o usuário não estiver logado
function atualizarVisibilidadePainel() {
  const painel = document.getElementById('painelPermissoes');
  if (!painel) return;
  if (!currentUser || !currentUser.user) {
    painel.style.display = 'none';
  } else {
    painel.style.display = 'block';
  }
}

// Verifica ao carregar e sempre que mudar o estado de autenticação
setInterval(atualizarVisibilidadePainel, 1500);

/* ===========================================================
   BOTÃO DE MOSTRAR / OCULTAR O PAINEL
   =========================================================== */
function adicionarBotaoTogglePainel() {
  // Cria o botão só se ainda não existir
  if (document.getElementById('btnTogglePainel')) return;

  const btn = document.createElement('button');
  btn.id = 'btnTogglePainel';
  btn.textContent = '👁️ Ocultar Painel';
  btn.className = 'btn-muted';
  btn.style.marginTop = '10px';

  btn.addEventListener('click', () => {
    const painel = document.getElementById('painelPermissoes');
    if (!painel) return;
    const visivel = painel.style.display !== 'none';
    painel.style.display = visivel ? 'none' : 'block';
    btn.textContent = visivel ? '👁️ Mostrar Painel' : '👁️ Ocultar Painel';
  });

  const painel = document.getElementById('painelPermissoes');
  if (painel) painel.insertAdjacentElement('beforebegin', btn);
}

// Espera o painel existir antes de criar o botão
setTimeout(adicionarBotaoTogglePainel, 2000);

/* ===========================================================
   ATUALIZA BADGE DE NOTIFICAÇÃO DE SOLICITAÇÕES
   =========================================================== */
async function atualizarBadgePermissoes() {
  const btn = document.getElementById('btnAbrirPermissoes');
  if (!btn) return;

  // Cria o badge se ainda não existir
  let badge = btn.querySelector('.badge-alert');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'badge-alert';
    btn.appendChild(badge);
  }

  try {
    // Busca solicitações pendentes
    const snap = await db.ref('permRequests').orderByChild('status').equalTo('pending').once('value');
    const totalPendentes = snap.exists() ? Object.keys(snap.val()).length : 0;

    // Atualiza badge
    if (totalPendentes > 0) {
      badge.textContent = totalPendentes;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    console.error('Erro ao atualizar badge de permissões:', e);
  }
}

// Atualiza a cada 15 segundos
setInterval(atualizarBadgePermissoes, 15000);

/* ===========================================================
   MONITORAR SOLICITAÇÕES PENDENTES (Contador 🔴 no botão)
   =========================================================== */
function iniciarContadorPermissoes() {
  const btn = document.getElementById('btnAbrirPermissoes');
  if (!btn) return; // botão ainda não existe

  // Cria o círculo vermelho (badge)
  const badge = document.createElement('span');
  badge.className = 'badge-alert';
  btn.appendChild(badge);

  // Monitora em tempo real as solicitações pendentes no banco
  db.ref('permRequests').on('value', snap => {
    const data = snap.val() || {};
    const pendentes = Object.values(data).filter(req => req.status === 'pending').length;

    if (pendentes > 0) {
      badge.textContent = pendentes;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  });
}

/* ===========================================================
   SISTEMA DE LOGS — Registro de Ações Importantes
   =========================================================== */

// Grava log no banco (Firebase)
async function logEvent(tipo, descricao, dados = {}) {
  try {
    const user = currentUser?.user || '(desconhecido)';
    const nome = currentUser?.nome || '(sem nome)';
    const agora = new Date().toLocaleString('pt-BR');
    const logData = {
      usuario: user,
      nome: nome,
      tipo,
      descricao,
      dados,
      timestamp: Date.now(),
      dataHora: agora
    };
    await db.ref('logs').push(logData);
    console.log('🪶 Log gravado:', logData);
  } catch (e) {
    console.error('Erro ao registrar log:', e);
  }
}

/* ===========================================================
   🔔 SISTEMA DE NOTIFICAÇÕES PERSISTENTES (Sininho)
   =========================================================== */
async function carregarNotificacoes() {
  if (!currentUser?.user) return;

  const lista = document.getElementById('listaNotificacoes');
  const badge = document.getElementById('badgeNotificacoes');
  if (!lista || !badge) return;

  try {
    const snap = await db.ref(`usuarios/${currentUser.user}/notificacoes`).once('value');
    const notificacoes = snap.val() || {};

    const naoLidas = Object.entries(notificacoes)
      .filter(([id, n]) => !n.lida)
      .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

    badge.textContent = naoLidas.length;
    badge.style.display = naoLidas.length > 0 ? 'inline-block' : 'none';

    const html = Object.entries(notificacoes)
      .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
      .map(([id, n]) => `
        <div class="notificacao-item" data-id="${id}" style="padding:8px;border-bottom:1px solid #eee;">
          <span style="font-size:13px;display:block;">${n.mensagem}</span>
          <small style="color:#666;">${new Date(n.createdAt).toLocaleString('pt-BR')}</small>
        </div>
      `).join('');

    lista.innerHTML = html || '<p class="muted" style="padding:8px;">Sem notificações.</p>';

  } catch (e) {
    console.error('Erro ao carregar notificações:', e);
  }
}

// Alterna visibilidade do painel ao clicar no sininho
document.addEventListener('click', (e) => {
  if (e.target.id === 'btnNotificacoes') {
    const lista = document.getElementById('listaNotificacoes');
    if (!lista) return;
    const visible = !lista.classList.contains('hidden');
    lista.classList.toggle('hidden', visible);
    if (!visible) {
      // Marcar todas como lidas ao abrir
      marcarNotificacoesLidas();
    }
  } else {
    // Clicar fora fecha o painel
    if (!e.target.closest('#notificacoesWrap')) {
      document.getElementById('listaNotificacoes')?.classList.add('hidden');
    }
  }
});

async function marcarNotificacoesLidas() {
  if (!currentUser?.user) return;
  const snap = await db.ref(`usuarios/${currentUser.user}/notificacoes`).once('value');
  const notificacoes = snap.val() || {};
  for (const [id, n] of Object.entries(notificacoes)) {
    if (!n.lida) {
      await db.ref(`usuarios/${currentUser.user}/notificacoes/${id}/lida`).set(true);
    }
  }
  carregarNotificacoes();
}

// Atualiza o sininho automaticamente a cada 10 segundos
setInterval(carregarNotificacoes, 10000);
setTimeout(carregarNotificacoes, 4000);

/* ===========================================================
   🔔 SININHO DE NOTIFICAÇÕES (persistentes)
   - Lê usuarios/{user}/notificacoes
   - Mostra lista, marca como lida ao clicar
   - Atualiza bolinha com não lidas
   =========================================================== */

function toggleListaNotifs(show) {
  const box = document.getElementById('listaNotificacoes');
  if (!box) return;
  const visivel = show ?? box.classList.contains('hidden');
  box.classList.toggle('hidden', !visivel);
}

async function carregarNotificacoesPersistentes() {
  if (!currentUser?.user) return;
  const wrap = document.getElementById('notificacoesWrap');
  const btn  = document.getElementById('btnNotificacoes');
  const badge= document.getElementById('badgeNotificacoes');
  const box  = document.getElementById('listaNotificacoes');
  if (!wrap || !btn || !badge || !box) return;

  // Lê notificações do usuário
  const snap = await db.ref(`usuarios/${currentUser.user}/notificacoes`).once('value');
  const notifsObj = snap.val() || {};
  const itens = Object.entries(notifsObj)
    .sort((a,b)=> (b[1]?.createdAt||0) - (a[1]?.createdAt||0));

  // Monta lista
  const linhas = itens.map(([key, n]) => {
    const cor = n.tipo === 'warn' ? '#b45309' : (n.tipo === 'error' ? '#dc2626' : '#1e3a8a');
    const lida = n.lida ? 'opacity:.55;' : '';
    const quando = n.createdAt ? new Date(n.createdAt).toLocaleString('pt-BR') : '';
    return `
      <div class="notif-item" data-key="${key}" style="border-bottom:1px solid #e5e7eb;padding:8px;cursor:pointer;${lida}">
        <div style="color:${cor};font-weight:600;margin-bottom:4px;">${n.tipo?.toUpperCase()||'INFO'}</div>
        <div style="white-space:pre-wrap">${escapeHtml(n.mensagem||'(sem mensagem)')}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">${quando}</div>
      </div>`;
  }).join('') || '<div style="padding:10px;color:#6b7280;">Sem notificações.</div>';

  box.innerHTML = linhas;

  // Badge = quantidade de NÃO lidas
  const naoLidas = itens.filter(([,n])=> !n.lida).length;
  if (naoLidas > 0) {
    badge.textContent = naoLidas;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }

  // Clique no sininho abre/fecha a lista
  if (!btn.__wired) {
    btn.__wired = true;
    btn.addEventListener('click', () => toggleListaNotifs());
    // Clique fora fecha
    document.addEventListener('click', (ev)=>{
      if (!wrap.contains(ev.target)) toggleListaNotifs(false);
    });
  }

  // Clique numa notificação = marcar como lida
  box.querySelectorAll('.notif-item').forEach(el=>{
    el.addEventListener('click', async ()=>{
      const key = el.getAttribute('data-key');
      await db.ref(`usuarios/${currentUser.user}/notificacoes/${key}/lida`).set(true);
      el.style.opacity = .55;
      // Atualiza badge rapidinho
      carregarNotificacoesPersistentes();
    });
  });
}

// Atualiza ao logar e a cada 20s
setInterval(() => {
  if (currentUser?.user) carregarNotificacoesPersistentes();
}, 20000);

// Disparo inicial (pequeno atraso pós-login)
setTimeout(()=> currentUser?.user && carregarNotificacoesPersistentes(), 3000);




























