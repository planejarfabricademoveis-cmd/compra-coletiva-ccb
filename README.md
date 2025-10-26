# 🏷️ CCB - Compra Coletiva

Sistema desenvolvido para **facilitar o processo de compras coletivas** dentro da congregação, unificando os pedidos e ajudando o setor de compras a **identificar as melhores oportunidades de aquisição** de produtos.

---

## 🎯 Objetivo do Sistema

O **CCB - Compra Coletiva** tem como finalidade principal **coletar, organizar e consolidar os pedidos da irmandade**, permitindo:
- A **centralização dos pedidos** por localidade.
- A **redução de retrabalho** e erros manuais.
- O **apoio direto ao setor de compras**, fornecendo relatórios e números de localidades organizados por ciclo.
- A **melhoria no controle logístico** de entregas e recebimentos.

Com isso, a ferramenta contribui para uma **gestão mais eficiente, transparente e solidária**, respeitando os princípios da irmandade e ajudando na boa administração dos recursos.

---

## ⚙️ Principais Funcionalidades

- 📦 **Cadastro de produtos**  
  Adição, edição e exclusão de itens disponíveis para compra coletiva.

- 👥 **Cadastro de usuários**  
  Com controle de níveis administrativos e permissões.

- 🧾 **Sistema de permissões**  
  - Apenas o **Administrador Master** pode autorizar exclusões, encerramentos de ciclo ou alterações críticas.  
  - Administradores comuns podem visualizar e imprimir, mas precisam de aprovação para executar ações sensíveis.

- 📨 **Fluxo de solicitações de permissão**  
  Quando um administrador comum tenta realizar uma ação restrita, o sistema solicita um motivo e envia o pedido ao **Administrador Master**, que pode **aprovar ou negar**.

- 🗺️ **Localidades com numeração automática**  
  Cada localidade cadastrada recebe um **número próprio**, usado nos relatórios e impressões.

- 🖨️ **Relatórios inteligentes**  
  - Impressão de localidades ordenadas por número.  
  - Relatórios de pedidos por status (abertos, entregues, etc.).  
  - Exibição do número da localidade no topo de cada impressão (3 cm de altura).

- 🔒 **Painel do Administrador Master**  
  Com acesso às solicitações de permissão, controle de usuários e registros de eventos.

---

## 🔑 Login Padrão (Administrador Master)

| Campo | Valor |
|-------|-------|
| **Usuário** | `fernando_filho87` |
| **Senha** | `1502` |

O Administrador Master é o único com acesso completo e intransferível.  
Nenhum outro usuário pode se promover a master, e o sistema valida isso automaticamente.

---

## 👤 Níveis de Acesso

| Nível | Descrição | Permissões |
|-------|------------|-------------|
| **Master** | Controle total do sistema | Pode criar, editar, excluir, aprovar, encerrar ciclos e autorizar ações. |
| **Administrador comum** | Usuário com permissões limitadas | Pode visualizar e imprimir, e solicitar autorização para ações restritas. |
| **Usuário comum** | Apenas envia pedidos | Não possui permissões administrativas. |

---

## 🧭 Estrutura de Telas

- **Fazer Pedido** → Envio e listagem dos pedidos por usuário.  
- **Relatórios (Admin)** → Visualização geral e por localidade, com filtros.  
- **Produtos (Admin)** → Cadastro e manutenção de itens disponíveis.  
- **Usuários (Admin)** → Controle de contas e permissões.  
- **Histórico (Admin)** → Registro de ações administrativas.  
- **Meu Estoque** → Visualização dos produtos solicitados.

---

## 🧱 Estrutura Técnica

- **Frontend:** HTML, CSS e JavaScript puros  
- **Banco de Dados:** Firebase Realtime Database  
- **Impressão:** Geração dinâmica de HTML + CSS para relatórios  
- **Hospedagem:** Pode ser executado localmente (arquivo `index.html`) ou hospedado no Firebase Hosting ou GitHub Pages.

---

## 🧩 Configuração Inicial

1. **Baixe o projeto** e abra o arquivo `index.html` em um navegador moderno (Google Chrome recomendado).  
2. **Conecte o Firebase**:
   - Edite o arquivo `firebase-app.js` (ou similar).
   - Insira as credenciais do seu projeto Firebase (apiKey, authDomain, databaseURL, etc.).
3. **Entre com o login master:**
   - Usuário: `fernando_filho87`
   - Senha: `1502`
4. **Cadastre novas localidades e administradores** conforme necessário.

---

## 🔍 Segurança

- Apenas o **Administrador Master (`fernando_filho87`)** possui privilégios para:
  - Aprovar solicitações.
  - Alterar permissões.
  - Criar ou excluir administradores.
  - Encerrar ciclos.

Mesmo que outro usuário altere seu nível manualmente no banco, o sistema **reconhece apenas o master original** como autoridade.

---

## 📄 Licença e Uso

Este sistema foi desenvolvido para **uso interno da congregação**, com fins **organizacionais e colaborativos**, **sem fins comerciais**.

---

## ✨ Desenvolvido por

**Fernando Filho**  
Sistema CCB – Compra Coletiva  
📍 *Para serviço e auxílio à irmandade.*
