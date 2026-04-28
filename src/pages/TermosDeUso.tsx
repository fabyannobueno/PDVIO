import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function TermosDeUso() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Logo />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          to="/auth"
          className="mb-8 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          data-testid="link-back-auth"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <h1 className="mb-2 text-3xl font-bold">Termos de Uso</h1>
        <p className="mb-10 text-sm text-muted-foreground">Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>

        <div className="space-y-8 text-foreground">

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1. Aceitação e Objeto</h2>
            <p className="text-muted-foreground leading-relaxed">
              Estes Termos de Uso ("Termos") regulam a relação contratual entre a <strong className="text-foreground">PDVIO</strong> ("Plataforma", "nós") e o usuário ou empresa que contrata, acessa ou utiliza os serviços disponibilizados ("Cliente", "você"). Ao se cadastrar, acessar ou utilizar qualquer funcionalidade da Plataforma, o Cliente declara ter lido, compreendido e aceito integralmente estes Termos, bem como a <Link to="/politica-de-privacidade" className="text-primary hover:underline">Política de Privacidade</Link> e o documento de <Link to="/lgpd" className="text-primary hover:underline">Compliance LGPD</Link>.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Caso o Cliente não concorde com qualquer disposição destes Termos, deverá interromper imediatamente o uso da Plataforma.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. Descrição da Plataforma</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO é uma plataforma SaaS (Software as a Service) de gestão comercial e ponto de venda (PDV) destinada a empresas brasileiras dos segmentos de varejo, alimentação, distribuição e prestação de serviços. A Plataforma opera em modelo multiusuário e multiempresa, oferecendo, entre outras, as seguintes funcionalidades:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Frente de caixa (PDV) com suporte a múltiplas formas de pagamento (Dinheiro, PIX, Crédito, Débito, Ticket e Pagamento Misto);</li>
              <li>Gestão de caixa com abertura, fechamento, sangria e suprimento;</li>
              <li>Comandas para mesas e atendimento, com integração ao módulo de cozinha (KDS);</li>
              <li>Catálogo de produtos com controle de estoque, código de barras, NCM e adicionais;</li>
              <li>Cadastro de clientes, fornecedores e operações de crediário (fiado) com cálculo de juros e mora;</li>
              <li>Contas a pagar e a receber, parcelamento e visão financeira consolidada;</li>
              <li>Relatórios gerenciais, dashboards e logs de auditoria;</li>
              <li>Permissões por cargo (Dono, Gerente, Caixa, Garçom, Cozinha) e troca rápida de operador por PIN ou cartão;</li>
              <li>Impressão de cupons em impressoras térmicas via Web USB, Web Serial e Web Bluetooth (ESC/POS);</li>
              <li>Conexão com balanças (integração com balanças comerciais para leitura automática de peso);</li>
              <li>Emissão de etiquetas de produto com preço e código de barras para precificação e identificação no PDV;</li>
              <li>Suporte ao cliente com chat assistido por inteligência artificial e atendimento humano;</li>
              <li>Aplicativo instalável (PWA) com ícone na tela inicial em dispositivos móveis e desktop.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Novas funcionalidades poderão ser adicionadas, modificadas ou removidas a critério da PDVIO, com ou sem aviso prévio, desde que não comprometam de forma essencial os serviços contratados.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. Cadastro, Conta e Vínculo Empresa-Usuário</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para utilizar a Plataforma, o Cliente deverá criar uma conta fornecendo informações verdadeiras, completas e atualizadas, incluindo nome completo, e-mail válido, senha e dados da empresa (razão social, CNPJ ou CPF, ramo de atividade e contato).
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Cada usuário poderá administrar uma ou mais empresas, e cada empresa poderá ter múltiplos usuários, vinculados sob diferentes cargos;</li>
              <li>O Cliente é integralmente responsável pelas informações inseridas, pelo sigilo das credenciais e por todas as operações realizadas em sua conta ou em contas de operadores que cadastrar;</li>
              <li>É vedado o compartilhamento de credenciais; cada operador deve possuir login próprio ou crachá individual com PIN;</li>
              <li>Usuários menores de 18 anos não estão autorizados a contratar a Plataforma de forma autônoma.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. Licença de Uso</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO concede ao Cliente uma licença limitada, pessoal, intransferível, revogável e não exclusiva para acessar e utilizar a Plataforma exclusivamente para fins comerciais legítimos, durante a vigência da contratação e em conformidade com estes Termos.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. Uso Permitido e Condutas Vedadas</h2>
            <p className="text-muted-foreground leading-relaxed">
              O Cliente compromete-se a utilizar a Plataforma de forma ética e legal. É expressamente vedado:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Empregar a Plataforma em atividades ilícitas, fraudulentas, lavagem de dinheiro, sonegação fiscal ou financiamento ao terrorismo;</li>
              <li>Inserir informações falsas, dados de terceiros sem autorização ou conteúdo que viole direitos de terceiros;</li>
              <li>Tentar acessar, copiar, modificar, descompilar, fazer engenharia reversa ou criar obras derivadas do código, banco de dados ou interfaces da Plataforma;</li>
              <li>Realizar ataques, varreduras, testes de carga ou intrusão sem autorização expressa;</li>
              <li>Utilizar bots, scrapers ou scripts para extrair dados em massa fora dos métodos oficiais;</li>
              <li>Sobrecarregar de forma intencional os recursos da Plataforma, dos sub-operadores ou da rede;</li>
              <li>Comercializar, sublicenciar ou ceder a terceiros o acesso à conta;</li>
              <li>Inserir conteúdo difamatório, discriminatório, obsceno, violento ou que viole a legislação vigente.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. Conteúdo e Dados do Cliente</h2>
            <p className="text-muted-foreground leading-relaxed">
              Todos os dados inseridos pelo Cliente (produtos, clientes, vendas, contas, configurações, logos, fotos de avatar e demais informações) são de sua titularidade e responsabilidade. A PDVIO atua como mera operadora dos dados, processando-os exclusivamente para a prestação dos serviços contratados, conforme detalhado na Política de Privacidade e no documento de Compliance LGPD.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              O Cliente declara possuir consentimento e base legal apropriados para tratar os dados pessoais de seus consumidores, colaboradores e fornecedores cadastrados na Plataforma, isentando a PDVIO de qualquer responsabilidade decorrente do uso indevido dessas informações.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. Pagamentos, Vigência e Renovação</h2>
            <p className="text-muted-foreground leading-relaxed">
              As condições comerciais (planos, preços, prazos, formas de pagamento e ciclos de cobrança) serão informadas no momento da contratação ou em comunicação específica. A falta de pagamento poderá resultar na suspensão ou no encerramento do acesso à Plataforma, observado o prazo razoável para regularização.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Reajustes de preço serão comunicados com no mínimo 30 (trinta) dias de antecedência, facultando ao Cliente a rescisão sem ônus caso não concorde com os novos valores.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. Propriedade Intelectual</h2>
            <p className="text-muted-foreground leading-relaxed">
              Todos os direitos de propriedade intelectual sobre a Plataforma — incluindo, mas não se limitando a, código-fonte, banco de dados, marca, logotipo, layout, interfaces, documentação, materiais de marketing e conteúdo de suporte — são de titularidade exclusiva da PDVIO ou de seus licenciadores e são protegidos pela legislação brasileira e por tratados internacionais.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Nenhuma disposição destes Termos transfere, cede ou licencia ao Cliente qualquer direito sobre tais ativos, exceto a licença limitada descrita na Cláusula 4.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. Disponibilidade, SLA e Manutenção</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO empreenderá esforços comercialmente razoáveis para manter a Plataforma disponível 24 horas por dia, 7 dias por semana, com nível mensal de disponibilidade alvo de 99,5% (noventa e nove vírgula cinco por cento), excluídos os períodos de manutenção programada e eventos de força maior.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Manutenções programadas serão preferencialmente realizadas em horário de baixa utilização e comunicadas pelos canais oficiais. Indisponibilidades emergenciais poderão ocorrer sem aviso prévio para sanar incidentes críticos de segurança ou estabilidade.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">10. Limitação de Responsabilidade</h2>
            <p className="text-muted-foreground leading-relaxed">
              Na máxima extensão permitida pela legislação aplicável, a responsabilidade da PDVIO restringe-se a danos diretos, comprovados e diretamente relacionados ao serviço, limitada ao valor efetivamente pago pelo Cliente nos 12 (doze) meses anteriores ao evento. A PDVIO não responde por:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Lucros cessantes, danos indiretos, perda de oportunidade ou de receita;</li>
              <li>Falhas de internet, energia elétrica, equipamentos do Cliente, periféricos (impressoras, leitores de código de barras), navegadores ou sistemas operacionais;</li>
              <li>Indisponibilidade de serviços de terceiros (provedores de hospedagem, e-mail, IA, gateways de pagamento, instituições financeiras);</li>
              <li>Decisões comerciais, fiscais ou contábeis tomadas pelo Cliente com base nos dados da Plataforma;</li>
              <li>Uso indevido da conta por colaboradores, ex-colaboradores ou terceiros decorrentes de falha do Cliente em proteger suas credenciais.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">11. Suspensão e Rescisão</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO poderá suspender ou encerrar o acesso à Plataforma, total ou parcialmente, mediante aviso prévio quando possível, nas seguintes hipóteses: (i) inadimplência; (ii) violação destes Termos; (iii) determinação judicial ou de autoridade competente; (iv) suspeita fundamentada de fraude, uso indevido ou risco à segurança da Plataforma ou de outros usuários.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              O Cliente poderá rescindir o contrato a qualquer momento, mediante solicitação pelos canais oficiais. Após o encerramento, observar-se-ão os prazos de retenção e exclusão descritos na Política de Privacidade e no documento de Compliance LGPD.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">12. Suporte</h2>
            <p className="text-muted-foreground leading-relaxed">
              A Plataforma oferece central de suporte com base de conhecimento (FAQ), abertura de chamados (tickets) e atendimento assistido por inteligência artificial (PDV.IA), com possibilidade de escalonamento para atendimento humano. Os prazos de resposta variam conforme a categoria, prioridade e plano contratado.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">13. Comunicações Eletrônicas</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ao se cadastrar, o Cliente concorda em receber comunicações eletrônicas (e-mails transacionais, notificações no aplicativo, mensagens no chat de suporte) relacionadas à operação da Plataforma. Comunicações de marketing dependem de consentimento adicional e poderão ser canceladas a qualquer momento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">14. Alterações dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Estes Termos poderão ser atualizados periodicamente. Alterações materiais serão comunicadas por e-mail ou aviso na Plataforma com antecedência mínima de 15 (quinze) dias. O uso continuado após a vigência das alterações implica aceitação. Caso o Cliente não concorde, poderá rescindir o contrato sem ônus dentro do prazo de aviso.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">15. Disposições Gerais</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>A nulidade ou invalidade de qualquer cláusula não prejudicará as demais, que permanecerão em pleno vigor;</li>
              <li>A tolerância de qualquer das partes quanto ao descumprimento de obrigações não constitui novação ou renúncia;</li>
              <li>O Cliente não poderá ceder ou transferir direitos e obrigações decorrentes destes Termos sem autorização prévia e expressa da PDVIO;</li>
              <li>Estes Termos constituem o acordo integral entre as partes acerca do objeto, prevalecendo sobre quaisquer entendimentos anteriores.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">16. Lei Aplicável e Foro</h2>
            <p className="text-muted-foreground leading-relaxed">
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de São Paulo/SP, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir controvérsias decorrentes deste instrumento, ressalvada a competência absoluta do foro do domicílio do consumidor, quando aplicável.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">17. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Dúvidas sobre estes Termos podem ser encaminhadas para: <span className="text-primary">contato@pdvio.com.br</span>.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PDVIO. Todos os direitos reservados. ·{" "}
        <Link to="/politica-de-privacidade" className="hover:text-foreground transition-colors">Política de Privacidade</Link> ·{" "}
        <Link to="/lgpd" className="hover:text-foreground transition-colors">Compliance LGPD</Link>
      </footer>
    </div>
  );
}
