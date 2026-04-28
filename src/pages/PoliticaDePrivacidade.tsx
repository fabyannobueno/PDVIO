import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function PoliticaDePrivacidade() {
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

        <h1 className="mb-2 text-3xl font-bold">Política de Privacidade</h1>
        <p className="mb-10 text-sm text-muted-foreground">Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>

        <div className="space-y-8 text-foreground">

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1. Introdução</h2>
            <p className="text-muted-foreground leading-relaxed">
              A <strong className="text-foreground">PDVIO</strong> respeita a privacidade de seus usuários e está comprometida com a transparência no tratamento de dados pessoais. Esta Política de Privacidade ("Política") descreve, de forma clara e objetiva, quais dados coletamos, com quais finalidades, com base em quais hipóteses legais, com quem os compartilhamos e quais são os direitos dos titulares.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Esta Política aplica-se a toda a Plataforma PDVIO, incluindo o site, o aplicativo web, o aplicativo instalável (PWA), os e-mails transacionais e os canais de suporte. Está em conformidade com a Lei Geral de Proteção de Dados — Lei nº 13.709/2018 ("LGPD"), o Marco Civil da Internet (Lei nº 12.965/2014) e o Código de Defesa do Consumidor (Lei nº 8.078/1990). Para detalhes técnicos sobre conformidade, consulte o documento de <Link to="/lgpd" className="text-primary hover:underline">Compliance LGPD</Link>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. Definições</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Titular:</strong> pessoa natural a quem se referem os dados pessoais;</li>
              <li><strong className="text-foreground">Controlador:</strong> quem decide sobre o tratamento dos dados;</li>
              <li><strong className="text-foreground">Operador:</strong> quem realiza o tratamento em nome do Controlador;</li>
              <li><strong className="text-foreground">Tratamento:</strong> qualquer operação com dados (coleta, armazenamento, uso, compartilhamento, eliminação etc.);</li>
              <li><strong className="text-foreground">Dado pessoal:</strong> informação relacionada a pessoa natural identificada ou identificável.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. Quem é o Controlador</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO atua em duas posições distintas:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Como Controladora:</strong> em relação aos dados dos próprios usuários da Plataforma (donos, gerentes, caixas, garçons e cozinha) e aos dados de navegação técnica;</li>
              <li><strong className="text-foreground">Como Operadora:</strong> em relação aos dados que o Cliente (a empresa contratante) insere na Plataforma sobre seus próprios consumidores, fornecedores e terceiros — nessas situações, o Cliente é o Controlador desses dados.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. Dados que Coletamos</h2>

            <p className="text-muted-foreground leading-relaxed font-medium text-foreground">4.1. Dados de cadastro e perfil</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Nome completo, e-mail, senha (armazenada com hash criptográfico), telefone;</li>
              <li>Foto de perfil (avatar), quando enviada pelo usuário;</li>
              <li>PIN e código de crachá (badge), quando o usuário for cadastrado como operador.</li>
            </ul>

            <p className="text-muted-foreground leading-relaxed font-medium text-foreground">4.2. Dados da empresa</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Razão social, nome fantasia, CNPJ ou CPF, endereço, telefone, e-mail, ramo de atividade;</li>
              <li>Logotipo da empresa;</li>
              <li>Dados bancários e chave PIX (quando o Cliente opta por cadastrá-los para configuração de pagamentos);</li>
              <li>Configurações operacionais (formas de pagamento aceitas, configurações de impressora, taxa de juros do crediário, etc.).</li>
            </ul>

            <p className="text-muted-foreground leading-relaxed font-medium text-foreground">4.3. Dados operacionais inseridos pelo Cliente</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Cadastro de produtos (nome, preço, custo, estoque, NCM, código de barras, fotos);</li>
              <li>Cadastro de clientes finais (nome, CPF/CNPJ, telefone, e-mail, endereço, limite de crédito);</li>
              <li>Cadastro de fornecedores (razão social, contato, condições);</li>
              <li>Vendas, comandas, devoluções, cancelamentos e pagamentos;</li>
              <li>Movimentações de estoque, contas a pagar e a receber, lançamentos de crediário.</li>
            </ul>

            <p className="text-muted-foreground leading-relaxed font-medium text-foreground">4.4. Dados de uso e técnicos</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Endereço IP, tipo de dispositivo, sistema operacional, navegador, idioma, fuso horário;</li>
              <li>Logs de acesso, eventos de auditoria (cancelamentos, descontos, aberturas e fechamentos de caixa);</li>
              <li>Identificadores de sessão e cookies essenciais;</li>
              <li>Informações sobre periféricos utilizados (impressora térmica, leitor de código de barras), restritas ao necessário para conexão.</li>
            </ul>

            <p className="text-muted-foreground leading-relaxed font-medium text-foreground">4.5. Dados de suporte</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Conteúdo das mensagens trocadas no chat de suporte (com IA e atendentes humanos);</li>
              <li>Categoria, prioridade, status e histórico dos chamados abertos.</li>
            </ul>

            <p className="text-muted-foreground leading-relaxed">
              Não tratamos intencionalmente dados pessoais sensíveis (origem racial, convicção religiosa, opinião política, saúde, vida sexual, dado genético ou biométrico). Caso o Cliente insira tais informações em campos livres, ele assume a integral responsabilidade por essa coleta.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. Bases Legais e Finalidades</h2>
            <p className="text-muted-foreground leading-relaxed">O tratamento ocorre com fundamento nas hipóteses do art. 7º da LGPD, conforme a finalidade:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Execução de contrato:</strong> autenticar, dar acesso, processar vendas, gerar relatórios e prestar suporte;</li>
              <li><strong className="text-foreground">Cumprimento de obrigação legal:</strong> retenção de registros de acesso (Marco Civil), guarda fiscal e contábil;</li>
              <li><strong className="text-foreground">Legítimo interesse:</strong> segurança, prevenção a fraudes, métricas agregadas e melhoria contínua;</li>
              <li><strong className="text-foreground">Consentimento:</strong> envio de comunicações de marketing e uso de funcionalidades opcionais;</li>
              <li><strong className="text-foreground">Exercício regular de direitos:</strong> em processos administrativos, judiciais ou arbitrais.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. Compartilhamento de Dados</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO <strong className="text-foreground">não vende e não aluga</strong> dados pessoais. Compartilhamentos ocorrem somente com sub-operadores e parceiros estritamente necessários, mediante contrato com cláusulas de proteção de dados:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Provedor de banco de dados e autenticação:</strong> hospedagem da base de dados, gestão de identidade, sessões e <em>Row Level Security</em>;</li>
              <li><strong className="text-foreground">Provedor de e-mail transacional:</strong> envio de e-mails de confirmação, recuperação de senha e notificações;</li>
              <li><strong className="text-foreground">Provedores de inteligência artificial:</strong> processamento de mensagens enviadas ao chat de suporte assistido por IA (PDV.IA), com mascaramento de informações sensíveis sempre que possível;</li>
              <li><strong className="text-foreground">Serviços de consulta de produto por código de barras:</strong> apenas o código de barras é enviado, sem dados pessoais;</li>
              <li><strong className="text-foreground">Autoridades públicas:</strong> mediante requisição legal, ordem judicial ou para defesa de direitos.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO não compartilha dados com plataformas de publicidade ou redes sociais para fins de marketing comportamental.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. Transferência Internacional</h2>
            <p className="text-muted-foreground leading-relaxed">
              Alguns sub-operadores podem armazenar ou processar dados em servidores localizados fora do Brasil. Nesses casos, a PDVIO observa as hipóteses do art. 33 da LGPD, garantindo que o destinatário ofereça grau de proteção compatível com a legislação brasileira ou que sejam adotadas garantias contratuais específicas (como cláusulas-padrão).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. Armazenamento e Segurança</h2>
            <p className="text-muted-foreground leading-relaxed">
              Adotamos medidas técnicas e administrativas adequadas para proteger os dados pessoais, incluindo:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Criptografia em trânsito (TLS 1.2+) e em repouso para dados sensíveis;</li>
              <li>Hash criptográfico (bcrypt) para senhas e PINs de operadores;</li>
              <li>Controle de acesso baseado em papéis (Dono, Gerente, Caixa, Garçom, Cozinha) e <em>Row Level Security</em> no banco de dados, garantindo isolamento entre empresas;</li>
              <li>Registro detalhado de auditoria para ações sensíveis (cancelamentos, descontos, sangrias, suprimentos);</li>
              <li>Backups automatizados e plano de recuperação de desastres;</li>
              <li>Monitoramento contínuo, atualizações de segurança e revisão periódica de permissões.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Apesar de empregarmos as melhores práticas, nenhum sistema é 100% imune a falhas. O Cliente também é corresponsável pela segurança de suas credenciais e do ambiente em que utiliza a Plataforma.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. Cookies e Armazenamento Local</h2>
            <p className="text-muted-foreground leading-relaxed">
              Utilizamos exclusivamente cookies e armazenamento local (localStorage / IndexedDB) <strong className="text-foreground">essenciais</strong> ao funcionamento da Plataforma, tais como:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Manter o usuário autenticado durante a sessão;</li>
              <li>Lembrar preferências de tema (claro/escuro), idioma e configurações de impressora;</li>
              <li>Armazenar carrinho temporário do PDV e estado da interface.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Não utilizamos cookies de rastreamento publicitário, fingerprinting ou ferramentas de perfilamento de terceiros.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">10. Direitos dos Titulares</h2>
            <p className="text-muted-foreground leading-relaxed">Nos termos do art. 18 da LGPD, o titular pode, a qualquer momento, exercer os seguintes direitos:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Confirmação da existência de tratamento;</li>
              <li>Acesso aos dados;</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;</li>
              <li>Portabilidade a outro fornecedor;</li>
              <li>Eliminação dos dados tratados com base em consentimento;</li>
              <li>Informação sobre os agentes com quem foram compartilhados;</li>
              <li>Informação sobre a possibilidade de não fornecer consentimento e as consequências da recusa;</li>
              <li>Revogação do consentimento;</li>
              <li>Oposição a tratamento realizado em desconformidade com a LGPD.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Para exercer qualquer direito, escreva para <span className="text-primary">privacidade@pdvio.com.br</span>. Responderemos em até 15 (quinze) dias úteis. Se o titular for cliente final cadastrado por uma empresa que utiliza a PDVIO, o pedido deve ser dirigido primeiro à empresa controladora; a PDVIO atuará em apoio ao Controlador.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">11. Retenção e Eliminação</h2>
            <p className="text-muted-foreground leading-relaxed">
              Os dados são mantidos apenas pelo tempo necessário às finalidades, observados os prazos legais:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Registros fiscais e financeiros: pelo prazo exigido pela legislação tributária (geralmente 5 anos);</li>
              <li>Logs de acesso: pelo prazo do Marco Civil (mínimo de 6 meses);</li>
              <li>Dados de cadastro e operacionais: enquanto a conta estiver ativa;</li>
              <li>Após o encerramento da conta: eliminação em até 90 (noventa) dias, salvo retenção legal ou exercício regular de direitos.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">12. Crianças e Adolescentes</h2>
            <p className="text-muted-foreground leading-relaxed">
              A Plataforma não se destina a menores de 18 anos. Não coletamos intencionalmente dados de crianças ou adolescentes. Caso identifiquemos tal coleta, eliminaremos os dados imediatamente.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">13. Incidentes de Segurança</h2>
            <p className="text-muted-foreground leading-relaxed">
              Em caso de incidente que possa acarretar risco ou dano relevante aos titulares, comunicaremos a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares afetados em prazo razoável, conforme o art. 48 da LGPD, descrevendo a natureza do incidente, os dados envolvidos, as medidas adotadas e as recomendações.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">14. Encarregado de Dados (DPO)</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO designou um Encarregado pelo Tratamento de Dados Pessoais para receber comunicações dos titulares e da ANPD.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">E-mail do DPO:</strong> <span className="text-primary">dpo@pdvio.com.br</span></li>
              <li><strong className="text-foreground">Atendimento:</strong> de segunda a sexta-feira, das 9h às 18h.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">15. Atualizações desta Política</h2>
            <p className="text-muted-foreground leading-relaxed">
              Esta Política poderá ser atualizada para refletir mudanças regulatórias ou na Plataforma. Alterações materiais serão comunicadas por e-mail ou aviso na Plataforma com antecedência mínima de 15 (quinze) dias. Recomendamos a revisão periódica deste documento.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PDVIO. Todos os direitos reservados. ·{" "}
        <Link to="/termos-de-uso" className="hover:text-foreground transition-colors">Termos de Uso</Link> ·{" "}
        <Link to="/lgpd" className="hover:text-foreground transition-colors">Compliance LGPD</Link>
      </footer>
    </div>
  );
}
