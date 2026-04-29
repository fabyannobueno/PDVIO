import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  Loader2,
  Clock,
  Map,
  Boxes,
  Tag,
  Smartphone,
  Brain,
  Receipt,
  Heart,
  Sparkles,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";

type Status = "done" | "in_progress" | "planned";

interface RoadmapItem {
  title: string;
  description: string;
  status: Status;
  section: string;
  sectionIcon: typeof Map;
  priority?: "high" | "medium" | "low";
}

interface RoadmapSection {
  id: string;
  title: string;
  icon: typeof Map;
  priority?: "high" | "medium" | "low";
  items: { title: string; description: string; status: Status }[];
}

const SECTIONS: RoadmapSection[] = [
  {
    id: "core",
    title: "Núcleo do sistema",
    icon: Sparkles,
    items: [
      { title: "Formas de pagamento configuráveis", description: "Em Configurações > Pagamentos o dono escolhe quais formas (Dinheiro, Crédito, Débito, PIX, Ticket, Misto) ficam ativas. PDV e Comandas só exibem e aceitam as formas habilitadas, com atualização em tempo real em todas as abas/dispositivos abertos.", status: "done" },
      { title: "Confirmação de PIX antes de finalizar", description: "Ao finalizar uma venda no PDV ou fechar uma comanda em PIX, abre uma janela com o QR Code e o copia-e-cola. O cliente paga, mostra o comprovante e o operador confere e confirma manualmente o recebimento (PIX estático gratuito) antes da venda ser efetivada.", status: "done" },
      { title: "Autenticação e cadastro", description: "Login, cadastro, recuperação e múltiplas empresas por usuário.", status: "done" },
      { title: "Dashboard", description: "Visão geral de vendas, ticket médio e principais indicadores.", status: "done" },
      { title: "PDV", description: "Frente de caixa com pagamentos, descontos, leitor de código de barras e impressão.", status: "done" },
      { title: "Caixa", description: "Abertura e fechamento de caixa, sangria, suprimento e conferência.", status: "done" },
      { title: "Produtos", description: "Catálogo com categorias, preços, código de barras e estoque básico.", status: "done" },
      { title: "Clientes", description: "Cadastro de clientes vinculados à empresa.", status: "done" },
      { title: "Comandas", description: "Comandas para mesas e atendimento, com itens e status.", status: "done" },
      { title: "KDS (Cozinha)", description: "Tela de pedidos para a cozinha, com fila e marcação de pronto.", status: "done" },
      { title: "Vendas", description: "Histórico de vendas com filtros, devoluções e cancelamentos.", status: "done" },
      { title: "Financeiro", description: "Visão consolidada de receitas e despesas.", status: "done" },
      { title: "Relatórios", description: "Relatórios de vendas, pagamentos e desempenho.", status: "done" },
      { title: "Auditoria", description: "Log de ações sensíveis: cancelamentos, descontos, caixa.", status: "done" },
      { title: "Modo operador (PIN/cartão)", description: "Bloqueio do terminal e troca rápida de operador por crachá ou PIN.", status: "done" },
      { title: "Permissões por cargo", description: "Controle de acesso para Dono, Gerente, Caixa, Garçom e Cozinha.", status: "done" },
      { title: "Impressão térmica", description: "ESC/POS via USB, Serial e Bluetooth com fallback de impressão do navegador.", status: "done" },
      { title: "Tema claro/escuro e mobile", description: "Layout responsivo e suporte a dark mode.", status: "done" },
      { title: "Central de suporte", description: "FAQ, formulário de contato e chamados (tickets) com troca de mensagens.", status: "done" },
      { title: "FAQ por categoria", description: "Perguntas frequentes organizadas em seções (Primeiros passos, PDV, Caixa, Comandas, Produtos, etc.) com mais de 50 perguntas.", status: "done" },
      { title: "Paginação em chamados", description: "Lista de chamados com 8 por página e navegação Anterior/Próxima.", status: "done" },
      { title: "Avatar no chamado", description: "Mensagens do suporte exibem o avatar redondo do PDVIO ao lado do balão.", status: "done" },
      { title: "Foto de perfil do usuário", description: "Upload de avatar em Configurações com redimensionamento automático para 500x500 e armazenamento em base64. Aparece no topo de todas as páginas.", status: "done" },
      { title: "Proteção de imagens", description: "Bloqueio do clique direito e do toque longo sobre imagens em todo o app, prevenindo download casual.", status: "done" },
      { title: "Pagamento Misto no PDV", description: "Combine vários métodos (Dinheiro, PIX, Cartão, Ticket) em uma única venda. O valor do pagamento anterior é preenchido automaticamente e o botão de adicionar só libera quando há saldo a quitar.", status: "done" },
      { title: "Misto no Dashboard e Vendas", description: "Vendas mistas exibidas com ícone de carteira e rótulo 'Misto' próprio no histórico e no painel.", status: "done" },
      { title: "Quebra do Misto em Financeiro e Relatórios", description: "Vendas com pagamento misto são divididas entre os métodos reais (Dinheiro, PIX, Crédito, etc.) na análise por forma de pagamento.", status: "done" },
      { title: "Atalhos de teclado no PDV e Comanda", description: "F2 busca, F4 leitor, F8 forma de pagamento, F9 valor recebido, F10 navegação por setas, F12 finalizar, ? abre a ajuda. Funciona no PDV e no fechamento de comanda.", status: "done" },
      { title: "Venda rápida (sem mouse)", description: "Buscar e pressionar Enter adiciona o primeiro produto encontrado direto ao carrinho — ideal para operadores experientes.", status: "done" },
      { title: "Navegação por setas no PDV", description: "Pressione F10 para ativar a navegação por teclado entre os produtos da grade. Use ← ↑ → ↓ para mover e Enter para adicionar ao carrinho. F10 novamente desativa.", status: "done" },
      { title: "Confirmação de limpeza do carrinho", description: "Ao apertar Esc com itens no carrinho, abre uma janela pedindo confirmação. Enter (ou Y/S) confirma e limpa, Esc (ou N) cancela — sem precisar do mouse.", status: "done" },
      { title: "Atalhos na janela de impressão de cupom", description: "Após finalizar a venda, a pergunta 'Imprimir cupom?' aceita Enter (ou Y/S) para imprimir e Esc (ou N) para pular.", status: "done" },
      { title: "Produtos preparados na cozinha", description: "Novo campo no cadastro de produto: 'Preparado na cozinha (Comandas/Delivery)'. Apenas produtos marcados aparecem no seletor de Comandas e na tela de KDS para preparo, separando bebidas/itens prontos dos pratos que precisam ir pra cozinha.", status: "done" },
      { title: "Adicionais e observações na Comanda", description: "Produtos preparados abrem uma janela para escolher adicionais (com preço) e digitar observações (ex: SEM CEBOLA). Os itens viram linhas separadas e aparecem com '+ adicionais' e 'Obs:' tanto na comanda aberta quanto no consumo da comanda fechada.", status: "done" },
      { title: "Adicionais e observações no PDV", description: "Ao adicionar um produto preparado no PDV (clique, busca + Enter ou leitor de código), abre a mesma janela de preparo com adicionais e observação. O preço unitário soma os adicionais, cada item personalizado vira uma linha própria no carrinho e o cupom impresso mostra os adicionais e a observação abaixo do nome.", status: "done" },
      { title: "Caixa por operador", description: "Cada operador (ativado pelo crachá/PIN) abre o próprio caixa, independente do dono. PDV, Comandas e estornos enxergam apenas a sessão do operador ativo. O cabeçalho do caixa mostra o nome do operador e gerentes/donos veem um painel com todos os caixas abertos no momento.", status: "done" },
      { title: "Aba inicial em Login/Cadastro", description: "A página de autenticação aceita ?tab=login ou ?tab=register na URL e mantém a aba sincronizada — facilita links diretos para o cadastro a partir da landing page.", status: "done" },
      { title: "Bloqueio de preenchimento automático no operador", description: "A tela de bloqueio do operador e as janelas de autorização gerencial (Caixa e Vendas) bloqueiam o autopreenchimento do navegador e gerenciadores de senha, evitando que credenciais do dono apareçam nos campos do operador.", status: "done" },
      { title: "Comanda vinculada ao caixa", description: "Vendas fechadas a partir de comandas agora ficam ligadas à sessão de caixa ativa, aparecendo corretamente no fechamento e nos relatórios por caixa.", status: "done" },
      { title: "Reserva de estoque em tempo real (PDV e Comanda)", description: "Quando um operador adiciona um produto ao carrinho do PDV ou a uma comanda aberta, o estoque já fica reservado para os outros caixas e comandas. Os demais terminais mostram em tempo real a quantidade disponível restante (ou marcam como 'Reservado') e bloqueiam a inclusão acima do disponível. Se o carrinho for limpo ou a comanda cancelada, o estoque volta a ficar livre. A checagem final no banco continua valendo na finalização da venda.", status: "done" },
      { title: "Reserva instantânea no PDV (sem atraso)", description: "Removido o atraso de 200ms na sincronização do carrinho do PDV: assim que o operador adiciona, altera ou remove um item, a reserva é gravada na hora e os outros terminais (PDV e Comandas) já enxergam a queda do estoque disponível em tempo real, sem qualquer espera.", status: "done" },
      { title: "Busca automática após scanner mobile", description: "Ao ler um código de barras pela câmera do celular no cadastro de produto, a busca completa dos dados é disparada automaticamente — sem precisar focar o campo de código de barras e pressionar Enter. O formulário é preenchido sozinho com nome, descrição e categoria quando encontrados.", status: "done" },
      { title: "NCM nos produtos", description: "Novo campo NCM (Nomenclatura Comum do Mercosul) no cadastro de produtos, com busca ao vivo por código ou descrição (ex.: '2202' ou 'refrigerante') e seleção da lista oficial. Base pronta para emissão fiscal futura (NF-e/NFC-e).", status: "done" },
      { title: "Contas bancárias da empresa", description: "Nova aba 'Banco' em Configurações para cadastrar a conta bancária da empresa. Inclui busca oficial de bancos por código ou nome, titular (PJ/PF) com nome e documento, tipo de conta (corrente, poupança, pagamento, salário), agência + dígito, conta + dígito e chave PIX com seleção do tipo (CPF, CNPJ, e-mail, telefone ou aleatória) e formatação automática conforme o tipo. Base pronta para uso futuro em contas a pagar/receber e repasses.", status: "done" },
      { title: "Expiração automática de reservas (60 min)", description: "Itens deixados no carrinho do PDV ou em comanda aberta sem virar venda em 60 minutos são liberados automaticamente, devolvendo o estoque para os outros caixas em tempo real — evita 'travar' produtos por carrinhos esquecidos.", status: "done" },
      { title: "Favicon e ícones do PWA atualizados", description: "Novo ícone do PDVIO em todas as superfícies: aba do navegador, resultado do Google, atalho na tela inicial do celular (Android e iOS) e tela inicial do desktop. Incluído versionamento de cache para forçar a atualização em quem já tinha o ícone antigo salvo.", status: "done" },
      { title: "Catálogo de impressoras térmicas", description: "Nova lista pronta de marcas e modelos (Bematech, Elgin, Epson, Daruma, Sweda, Tanca, Diebold/Star, Control iD, Knup e modelos genéricos 58/80 mm). Ao escolher o modelo, a largura do papel e o número de colunas são preenchidos automaticamente — evita cupom cortando produtos por configuração errada.", status: "done" },
      { title: "Ajuste fino de colunas no cupom", description: "Configurações da impressora agora aceitam definir colunas por linha (24 a 48), independente da largura do papel. Útil para impressoras chinesas/genéricas cuja densidade de cabeça não bate com o padrão (58 mm = 32, 80 mm = 48).", status: "done" },
      { title: "Scanner de câmera mais rápido e nítido", description: "O leitor de código de barras por câmera foi otimizado: lê apenas os 8 formatos de varejo (EAN-13/8, UPC-A/E, CODE-128/39, ITF e QR), pede vídeo em Full HD (1920×1080) à câmera traseira, foca de perto automaticamente (modo macro com zoom 2× quando suportado), libera botão da lanterna, vibra ao reconhecer o código e permite tocar na imagem para focar em um ponto específico.", status: "done" },
      { title: "Permissão da câmera reaproveitada", description: "Ao fechar o leitor por câmera, o stream da câmera fica em cache por até 2 minutos. Reabrir é instantâneo, sem novo prompt de permissão e sem 'iniciando câmera...'. A câmera é desligada de verdade quando a aba é trocada/fechada ou após o tempo ocioso, economizando bateria.", status: "done" },
      { title: "Modal de cadastro de produto travada no mobile", description: "A janela de cadastro de produto fixa em 90% da altura no celular, sem chacoalhar pra esquerda/direita ao deslizar e com rolagem vertical contida — fim do 'jiggling' horizontal em telas pequenas.", status: "done" },
      { title: "Estoque sem valor pré-preenchido", description: "Os campos de Estoque e Estoque mínimo no cadastro de produto começam vazios (placeholder em cinza). O usuário digita o valor real; deixar em branco continua salvando como 0 para quem quer.", status: "done" },
      { title: "Categorias com busca instantânea", description: "O campo Categoria virou uma caixa com busca embutida (~70 categorias prontas: Mercearia, Hortifruti, Frutas, Legumes, Verduras, Açougue, Padaria, Frios, Laticínios, Bebidas, Limpeza, Higiene, Farmácia, Pet Shop, Eletrônicos, Vestuário e mais). A busca ignora acentos e maiúsculas, e a lista rola normalmente com o mouse mesmo dentro da janela de cadastro.", status: "done" },
      { title: "Categoria sugerida pelo nome", description: "Ao digitar o nome do produto, a categoria é sugerida automaticamente quando ainda não foi escolhida. Reconhece centenas de termos brasileiros: 'X-BURGER' → Lanches, 'PIZZA CALABRESA' → Pizzaria, 'COCA-COLA' → Bebidas, 'CERVEJA' → Bebidas Alcoólicas, 'BANANA' → Frutas, 'TOMATE' → Legumes, 'ALFACE' → Verduras, 'PRESUNTO' → Frios, 'IOGURTE' → Laticínios, 'FRANGO' → Açougue, 'SALMÃO' → Peixaria, 'SHAMPOO' → Higiene Pessoal, e por aí vai. Não sobrescreve escolha manual.", status: "done" },
      { title: "Etiqueta de pesagem em 3 tamanhos", description: "Página da Balança agora imprime etiquetas em três formatos prontos: 40×40 mm (compacta — Filizola, Toledo, Elgin, Argox), 60×40 mm (padrão de varejo — mais usada) e 60×80 mm (alta — Prix Toledo / Filizola). Fontes, padding, altura do código de barras e largura das barras são ajustados automaticamente para cada formato e o @page do CSS já sai com o tamanho exato em mm. A escolha fica salva nas configurações de balança da empresa, então persiste entre máquinas e sessões.", status: "done" },
      { title: "Layout de etiqueta padrão Filizola/Toledo", description: "Etiqueta refeita no padrão das balanças brasileiras: nome do produto em maiúsculo grande à esquerda com sufixo 'kg', duas colunas com Data Pesagem / Tara(T) à esquerda e Peso(L) / R$ / kg à direita, código de barras EAN-13 no canto inferior esquerdo e a faixa preta TOTAL R$ com o valor enorme à direita. A pré-visualização na tela espelha exatamente o que será impresso.", status: "done" },
      { title: "Validade configurável na etiqueta", description: "Novo campo 'Validade (dias)' na página da Balança. O operador digita quantos dias o produto dura e o sistema calcula a data de validade automaticamente a partir do dia de hoje, imprimindo a linha 'Validade:' na etiqueta. Deixar 0/em branco omite a linha.", status: "done" },
      { title: "Tara automática na etiqueta de pesagem", description: "Quando o operador define a tara via botão da balança, o valor aparece automaticamente na etiqueta com o sufixo (T), no padrão de balança. Sem tara, o campo sai zerado igual ao exemplo Filizola.", status: "done" },
      { title: "Faixa preta TOTAL R$ impressa de verdade", description: "A faixa preta atrás do TOTAL R$ agora sai impressa em todos os navegadores. Aplicado print-color-adjust: exact e o truque de box-shadow inset, garantindo o contraste branco/preto no rótulo mesmo em impressoras térmicas que normalmente removem fundos coloridos para 'economizar tinta'.", status: "done" },
      { title: "Código de barras da etiqueta mais largo", description: "Espessura das barras e largura do bloco do EAN-13 aumentadas em todos os tamanhos de etiqueta (40×40, 60×40 e 60×80 mm), melhorando a leitura por scanners no caixa — especialmente em impressoras térmicas com cabeças de 203 dpi e em distâncias maiores no PDV.", status: "done" },
    ],
  },
  {
    id: "operational",
    title: "Operacional",
    icon: Boxes,
    priority: "high",
    items: [
      { title: "Estoque / Inventário", description: "Entrada de mercadoria, ajustes manuais, histórico de movimentação, alerta de estoque mínimo e contagem cíclica.", status: "done" },
      { title: "Bloqueio de venda sem estoque", description: "PDV e Comandas impedem adicionar mais do que existe em estoque (clique manual, leitor USB e scanner por câmera). A finalização da venda e o fechamento da comanda fazem uma checagem final no banco antes de gravar — se faltar estoque, a venda não é concluída.", status: "done" },
      { title: "Estoque em tempo real no PDV e Comandas", description: "As telas de venda atualizam o estoque automaticamente quando há vendas em outros caixas, fechamento de comandas ou ajustes manuais — sem precisar recarregar a página.", status: "done" },
      { title: "Fornecedores", description: "Cadastro de fornecedores vinculado às entradas de estoque e a contas a pagar.", status: "done" },
      { title: "Contas a pagar / receber", description: "Vencimentos, parcelamentos, status (pago/atrasado/aberto) e fluxo de caixa projetado.", status: "done" },
      { title: "Categoria e descrição em Contas", description: "Listas prontas (aluguel, energia, fornecedor, vendas, etc.) com opção 'Outra (personalizada)' para casos fora do padrão.", status: "done" },
      { title: "Máscara de moeda em Contas", description: "Campo de valor com formatação automática em Real (R$) — digita só números e o sistema formata.", status: "done" },
      { title: "Bloqueio de data passada em Contas", description: "Novas contas só aceitam vencimento a partir de hoje (horário de Brasília).", status: "done" },
      { title: "Visão mobile em Contas", description: "Tela de Contas com cards otimizados para celular e paginação de 8 por página.", status: "done" },
      { title: "Rolagem ao topo na paginação", description: "Ao clicar em Anterior/Próxima ou número de página em qualquer tela (Vendas, Clientes, Fornecedores, Produtos, Estoque, Suporte, etc.), a lista volta automaticamente para o topo.", status: "done" },
      { title: "Validação de CPF/CNPJ no cadastro", description: "Algoritmo dos dígitos verificadores valida o documento em tempo real, sem depender de internet.", status: "done" },
      { title: "Auto-preenchimento por CNPJ", description: "Ao digitar um CNPJ válido no onboarding ou em fornecedores, busca automaticamente na Receita Federal e preenche razão social, nome fantasia, endereço, atividade, telefone e e-mail.", status: "done" },
      { title: "Bloqueio de CNPJ inativo", description: "Onboarding e cadastro de fornecedor só permitem salvar se o CNPJ estiver com situação ATIVA na Receita Federal.", status: "done" },
      { title: "PWA e favicon corrigidos", description: "Ícones, manifest e service worker ajustados para que o app seja instalável e a aba do navegador exiba o ícone correto em qualquer hospedagem.", status: "done" },
      { title: "Status do suporte em tempo real", description: "A página de Suporte mostra um indicador 'aberto' ou 'fora do horário' baseado no relógio (segunda a sexta, 09h às 18h em Brasília) e nos feriados nacionais — se o dia for feriado, o aviso já indica o motivo.", status: "done" },
      { title: "Cotação do dólar e do euro no Dashboard", description: "Cards no Dashboard com a cotação atualizada de USD e EUR e a variação do dia, úteis para precificar produtos importados.", status: "done" },
      { title: "Previsão do tempo no Dashboard", description: "Card no Dashboard com a temperatura, condição (sol, chuva, etc.), umidade, vento e chance de chuva da cidade cadastrada na empresa — clima afeta o movimento da loja.", status: "done" },
    ],
  },
  {
    id: "crediario",
    title: "Crediário (fiado)",
    icon: Receipt,
    priority: "high",
    items: [
      { title: "Crediário por cliente", description: "Nova forma de pagamento 'Crediário' (fiado) no PDV e no fechamento de comanda. A venda é gravada como pendente no nome do cliente, com data de referência, valor original e vencimento, sem entrar como recebido no caixa do dia.", status: "done" },
      { title: "Página dedicada de Crediário", description: "Tela 'Crediário' no menu com a lista de clientes que têm saldo em aberto, total devido, último lançamento e situação (em dia / vencido). Permite abrir o extrato completo de cada cliente com todos os lançamentos, recebimentos e baixas.", status: "done" },
      { title: "Recebimento parcial e total", description: "É possível baixar o saldo do cliente registrando um recebimento (Dinheiro, PIX, Cartão, etc.). Pagamentos parciais são permitidos e o sistema recalcula o saldo restante automaticamente. O recebimento entra como receita no caixa do dia e no Financeiro.", status: "done" },
      { title: "Multa e juros configuráveis", description: "Em Configurações o dono define o percentual de multa por atraso e se incide por dia ou por mês. Lançamentos vencidos são marcados como 'is_late_fee' e a multa entra como linha separada no extrato do cliente, podendo ser cobrada junto no recebimento.", status: "done" },
      { title: "Limite de crediário por cliente", description: "Cada cliente tem um limite de crédito configurável no cadastro. O PDV/Comanda bloqueia novas vendas no crediário quando o saldo aberto + a venda atual ultrapassam o limite.", status: "done" },
      { title: "Crediário no Dashboard e Relatórios", description: "Cards no Dashboard mostram o total a receber em crediário e quanto está vencido. A aba Vendas e o Financeiro tratam o crediário como pendência (não receita) até o efetivo recebimento, e os Relatórios separam vendas no crediário, recebimentos e multas.", status: "done" },
      { title: "Permissões e auditoria do crediário", description: "Apenas papéis com permissão (Dono e Gerente por padrão) podem liberar venda no crediário, dar baixa ou ajustar saldo. Todas as ações ficam registradas na Auditoria com operador, data e valor.", status: "done" },
      { title: "Crediário visível no PDV", description: "Ao selecionar o cliente no PDV, aparece um selo logo abaixo do nome com Limite, Em aberto e Disponível em tempo real. Se o cliente já estourou o limite, o selo fica vermelho avisando antes de tentar finalizar.", status: "done" },
      { title: "Atalho F7 para escolher cliente no PDV", description: "Pressione F7 para abrir o seletor de cliente sem usar o mouse. Use ↑ ↓ para navegar entre os resultados, Enter para confirmar e Esc para fechar. A lista mostra o limite de crediário ao lado de cada nome.", status: "done" },
    ],
  },
  {
    id: "growth",
    title: "Vendas e crescimento",
    icon: Tag,
    items: [
      { title: "Promoções e cupons", description: "Promoções automáticas por categoria (% off) e \"leve N pague M\" por produto, com vigência opcional. Cupons por código (% ou R$) com compra mínima, limite de usos e validade — aplicados direto no PDV. Salvo em sales.coupon_id / promotion_discount para relatórios.", status: "done" },
      { title: "Programa de fidelidade", description: "Pontos por compra, resgate e cashback simples.", status: "in_progress" },
      { title: "Delivery / pedidos online", description: "Cardápio público para o cliente e integração com WhatsApp para receber pedidos.", status: "planned" },
      { title: "Mesa / comanda com QR Code", description: "Cliente escaneia o QR, vê a comanda e faz o pedido pelo celular.", status: "planned" },
    ],
  },
  {
    id: "intel",
    title: "Inteligência",
    icon: Brain,
    items: [
      { title: "Dashboard com comparativos", description: "Receita vs. mês anterior, produto que mais cresceu/caiu e horário de pico.", status: "planned" },
      { title: "Previsão de vendas", description: "Sugestão de compra baseada no histórico de vendas.", status: "planned" },
      { title: "Relatório de margem/lucro", description: "Cálculo de margem por produto (depende do campo de custo no produto).", status: "planned" },
    ],
  },
  {
    id: "fiscal",
    title: "Fiscal (Brasil)",
    icon: Receipt,
    items: [
      { title: "Emissão de NFC-e / NF-e", description: "Integração com SEFAZ via APIs como Focus NFe ou PlugNotas.", status: "planned" },
      { title: "Sintegra / SPED", description: "Exportação de arquivos fiscais.", status: "planned" },
    ],
  },
  {
    id: "customer",
    title: "Cliente final",
    icon: Heart,
    items: [
      { title: "Histórico do cliente", description: "Compras anteriores e ticket médio individual.", status: "planned" },
      { title: "Aniversariantes do mês", description: "Lista de aniversariantes para ações de marketing.", status: "planned" },
    ],
  },
  {
    id: "mobile",
    title: "Mobile / PWA",
    icon: Smartphone,
    items: [
      { title: "App instalável (PWA)", description: "Instalação direta do navegador no celular ou desktop, com ícone na tela inicial.", status: "done" },
      { title: "PDV offline", description: "Vender mesmo sem internet e sincronizar quando voltar a conexão.", status: "planned" },
    ],
  },
];

const COLUMNS: {
  status: Status;
  label: string;
  icon: typeof CheckCircle2;
  accent: string;
  ring: string;
  badgeBg: string;
  cardHover: string;
  iconWrap: string;
  spin?: boolean;
}[] = [
  {
    status: "planned",
    label: "Planejado",
    icon: Clock,
    accent: "text-muted-foreground",
    ring: "from-muted-foreground/40 to-muted-foreground/10",
    badgeBg: "bg-muted text-muted-foreground",
    cardHover: "hover:border-muted-foreground/30",
    iconWrap: "bg-muted text-muted-foreground",
  },
  {
    status: "in_progress",
    label: "Em desenvolvimento",
    icon: Loader2,
    accent: "text-primary",
    ring: "from-primary to-primary/30",
    badgeBg: "bg-primary/15 text-primary",
    cardHover: "hover:border-primary/50",
    iconWrap: "bg-primary/15 text-primary",
    spin: true,
  },
  {
    status: "done",
    label: "Concluído",
    icon: CheckCircle2,
    accent: "text-success",
    ring: "from-success to-success/30",
    badgeBg: "bg-success/15 text-success",
    cardHover: "hover:border-success/50",
    iconWrap: "bg-success/15 text-success",
  },
];

const PRIORITY_LABEL: Record<NonNullable<RoadmapSection["priority"]>, string> = {
  high: "Alta prioridade",
  medium: "Média prioridade",
  low: "Baixa prioridade",
};

export default function Roadmap() {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string>("all");

  const allItems: RoadmapItem[] = useMemo(
    () =>
      SECTIONS.flatMap((s) =>
        s.items.map((it) => ({
          ...it,
          section: s.title,
          sectionIcon: s.icon,
          priority: s.priority,
        })),
      ),
    [],
  );

  const counts = useMemo(() => {
    return {
      total: allItems.length,
      done: allItems.filter((i) => i.status === "done").length,
      in_progress: allItems.filter((i) => i.status === "in_progress").length,
      planned: allItems.filter((i) => i.status === "planned").length,
    };
  }, [allItems]);

  const progressPct = Math.round((counts.done / counts.total) * 100);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allItems.filter((it) => {
      if (activeSection !== "all" && it.section !== sectionTitleById(activeSection)) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q) ||
        it.section.toLowerCase().includes(q)
      );
    });
  }, [allItems, search, activeSection]);

  return (
    <div className="space-y-5 p-4 sm:p-6 md:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Map className="h-4 w-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Roadmap</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Acompanhe o que está planejado, em andamento e o que já foi entregue.
          </p>
        </div>

        {/* Progress + counts */}
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">Progresso geral</span>
            <span className="font-mono text-muted-foreground">
              {counts.done}/{counts.total} ({progressPct}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-success to-primary transition-all"
              style={{ width: `${progressPct}%` }}
              data-testid="progress-roadmap"
            />
          </div>
          <div className="flex items-center justify-between gap-3 pt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              {counts.planned} planejados
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {counts.in_progress} em dev
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {counts.done} concluídos
            </span>
          </div>
        </div>
      </div>

      {/* Search + section filter */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar funcionalidade..."
            className="pl-9 pr-9"
            data-testid="input-roadmap-search"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              data-testid="button-roadmap-clear-search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <ScrollArea className="w-full lg:flex-1">
          <div className="flex items-center gap-1.5 pb-2">
            <Button
              size="sm"
              variant={activeSection === "all" ? "default" : "outline"}
              className="h-8 shrink-0 rounded-full text-xs"
              onClick={() => setActiveSection("all")}
              data-testid="filter-section-all"
            >
              Todas as áreas
            </Button>
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              return (
                <Button
                  key={s.id}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="h-8 shrink-0 gap-1.5 rounded-full text-xs"
                  onClick={() => setActiveSection(s.id)}
                  data-testid={`filter-section-${s.id}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {s.title}
                  {s.priority === "high" && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
                  )}
                </Button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" className="h-2" />
        </ScrollArea>
      </div>

      {/* Kanban board */}
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = filteredItems.filter((i) => i.status === col.status);
          const Icon = col.icon;
          return (
            <div
              key={col.status}
              className="flex min-h-[300px] flex-col rounded-2xl border border-border/60 bg-muted/30"
              data-testid={`column-${col.status}`}
            >
              {/* Column header */}
              <div className="relative overflow-hidden rounded-t-2xl border-b border-border/60 bg-card p-3">
                <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${col.ring}`} />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${col.iconWrap}`}>
                      <Icon className={`h-3.5 w-3.5 ${col.spin ? "animate-spin" : ""}`} />
                    </div>
                    <span className="text-sm font-semibold">{col.label}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`h-6 min-w-[1.75rem] justify-center rounded-full border-transparent px-2 font-mono text-[11px] ${col.badgeBg}`}
                  >
                    {items.length}
                  </Badge>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-2.5 p-2.5">
                {items.length === 0 ? (
                  <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 p-6 text-center">
                    <Icon className={`h-6 w-6 opacity-30 ${col.spin ? "animate-spin" : ""}`} />
                    <p className="text-xs text-muted-foreground">Nada por aqui</p>
                  </div>
                ) : (
                  items.map((item, idx) => {
                    const SecIcon = item.sectionIcon;
                    return (
                      <Card
                        key={`${col.status}-${idx}-${item.title}`}
                        className={`group cursor-default border border-border/60 bg-card transition-all ${col.cardHover} hover:shadow-sm`}
                        data-testid={`card-roadmap-${col.status}-${idx}`}
                      >
                        <CardContent className="space-y-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-[13px] font-semibold leading-snug">
                              {item.title}
                            </h3>
                            <Icon
                              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${col.accent} ${col.spin ? "animate-spin" : ""}`}
                            />
                          </div>
                          <p className="line-clamp-3 text-[11.5px] leading-relaxed text-muted-foreground">
                            {item.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <SecIcon className="h-3 w-3" />
                              {item.section}
                            </span>
                            {item.priority && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                {PRIORITY_LABEL[item.priority]}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function sectionTitleById(id: string): string {
  return SECTIONS.find((s) => s.id === id)?.title ?? "";
}
