import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Lgpd() {
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

        <h1 className="mb-2 text-3xl font-bold">Compliance LGPD</h1>
        <p className="mb-2 text-sm text-muted-foreground">Programa de privacidade e proteção de dados pessoais</p>
        <p className="mb-10 text-sm text-muted-foreground">Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>

        <div className="space-y-8 text-foreground">

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1. Visão Geral</h2>
            <p className="text-muted-foreground leading-relaxed">
              Este documento descreve o programa de conformidade da <strong className="text-foreground">PDVIO</strong> com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — "LGPD"), o Marco Civil da Internet (Lei nº 12.965/2014) e as melhores práticas internacionais de segurança da informação. Tem como público-alvo: clientes contratantes, titulares de dados, departamentos jurídicos, autoridades reguladoras e potenciais parceiros que precisem realizar avaliação de fornecedor (vendor assessment).
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Para o tratamento detalhado de dados sob a perspectiva do titular, consulte também a <Link to="/politica-de-privacidade" className="text-primary hover:underline">Política de Privacidade</Link>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. Papéis e Responsabilidades</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Cliente (Controlador):</strong> a empresa contratante define as finalidades e a forma como trata os dados de seus consumidores, fornecedores, colaboradores e terceiros cadastrados na Plataforma. É a responsável legal por obter as bases legais adequadas para esse tratamento.</li>
              <li><strong className="text-foreground">PDVIO (Operadora):</strong> processa os dados estritamente conforme as instruções do Controlador e os Termos de Uso, sem desviar-se das finalidades contratadas.</li>
              <li><strong className="text-foreground">PDVIO (Controladora):</strong> em relação aos dados de cadastro dos próprios usuários da Plataforma (donos, gerentes, caixas, garçons, cozinha) e a dados técnicos de uso e segurança.</li>
              <li><strong className="text-foreground">Titulares:</strong> usuários da conta, operadores cadastrados, clientes finais, fornecedores e quaisquer pessoas naturais cujos dados sejam armazenados.</li>
              <li><strong className="text-foreground">Encarregado (DPO):</strong> ponto focal de comunicação com titulares e com a ANPD.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. Bases Legais</h2>
            <p className="text-muted-foreground leading-relaxed">As atividades de tratamento são fundamentadas, conforme o caso, nas hipóteses do art. 7º da LGPD:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Execução de contrato</strong> (art. 7º, V): prestação dos serviços contratados;</li>
              <li><strong className="text-foreground">Cumprimento de obrigação legal</strong> (art. 7º, II): retenção fiscal, contábil e de logs de acesso;</li>
              <li><strong className="text-foreground">Legítimo interesse</strong> (art. 7º, IX): segurança, prevenção a fraudes, melhoria da Plataforma e métricas agregadas;</li>
              <li><strong className="text-foreground">Consentimento</strong> (art. 7º, I): comunicações de marketing, funcionalidades opcionais e tratamento de dados sensíveis quando aplicável;</li>
              <li><strong className="text-foreground">Exercício regular de direitos</strong> (art. 7º, VI): em processos judiciais, administrativos ou arbitrais;</li>
              <li><strong className="text-foreground">Proteção do crédito</strong> (art. 7º, X): para a operação de crediário, quando aplicável.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. Princípios Aplicados (art. 6º)</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Finalidade:</strong> tratamento para propósitos legítimos, específicos, explícitos e informados ao titular;</li>
              <li><strong className="text-foreground">Adequação:</strong> compatibilidade do tratamento com as finalidades informadas;</li>
              <li><strong className="text-foreground">Necessidade:</strong> limitação ao mínimo necessário (data minimization);</li>
              <li><strong className="text-foreground">Livre acesso:</strong> consulta gratuita e facilitada sobre o tratamento;</li>
              <li><strong className="text-foreground">Qualidade dos dados:</strong> exatidão, clareza e atualização;</li>
              <li><strong className="text-foreground">Transparência:</strong> informações claras, precisas e acessíveis;</li>
              <li><strong className="text-foreground">Segurança:</strong> medidas técnicas e administrativas;</li>
              <li><strong className="text-foreground">Prevenção:</strong> adoção de medidas para prevenir danos;</li>
              <li><strong className="text-foreground">Não discriminação:</strong> impossibilidade de tratamento para fins discriminatórios ilícitos ou abusivos;</li>
              <li><strong className="text-foreground">Responsabilização e prestação de contas (accountability):</strong> demonstração da adoção de medidas eficazes capazes de comprovar a observância da LGPD.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. Categorias de Dados Tratados</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Identificação:</strong> nome, e-mail, telefone, CPF/CNPJ;</li>
              <li><strong className="text-foreground">Acesso e autenticação:</strong> hash de senha (bcrypt), hash de PIN, código de crachá;</li>
              <li><strong className="text-foreground">Empresariais:</strong> razão social, endereço, configurações operacionais, dados bancários para configuração interna;</li>
              <li><strong className="text-foreground">Operacionais:</strong> produtos, vendas, comandas, estoque, contas a pagar/receber, lançamentos de crediário, devoluções e cancelamentos;</li>
              <li><strong className="text-foreground">Técnicos:</strong> endereço IP, user-agent, logs de acesso, identificadores de sessão e cookies essenciais;</li>
              <li><strong className="text-foreground">Auditoria:</strong> registros detalhados de ações sensíveis (cancelamentos, descontos, movimentações de caixa, troca de operador);</li>
              <li><strong className="text-foreground">Suporte:</strong> conteúdo de chamados, mensagens trocadas com IA e atendentes humanos.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO não realiza tratamento intencional de <strong className="text-foreground">dados pessoais sensíveis</strong> ou de <strong className="text-foreground">crianças e adolescentes</strong>. Caso o Controlador insira tais dados em campos livres, assume integralmente a responsabilidade pelo tratamento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. Medidas Técnicas de Segurança</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Criptografia de dados em trânsito (TLS 1.2+) e em repouso para dados sensíveis;</li>
              <li>Hash criptográfico (bcrypt) para senhas de usuários e PINs de operadores;</li>
              <li><em>Row Level Security</em> (RLS) no banco de dados, garantindo isolamento estrito entre empresas;</li>
              <li>Funções <em>SECURITY DEFINER</em> com escopo restrito e <code className="text-foreground">search_path</code> fixo, evitando escalonamento de privilégios;</li>
              <li>Autenticação multifator suportada via provedor de identidade;</li>
              <li>Controle de acesso baseado em papéis (RBAC): Dono, Gerente, Caixa, Garçom, Cozinha;</li>
              <li>Trilhas de auditoria detalhadas, com identificação do usuário, do operador autorizador, IP, data/hora e metadados da operação;</li>
              <li>Backups automatizados, política de retenção de cópias e plano de recuperação de desastres (DRP);</li>
              <li>Monitoramento contínuo, alertas de anomalias e atualizações regulares de segurança;</li>
              <li>Política de senhas mínima e expiração de sessões inativas;</li>
              <li>Segregação de ambientes (desenvolvimento, homologação, produção).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. Medidas Organizacionais</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Acordos de confidencialidade (NDA) com colaboradores e prestadores de serviço;</li>
              <li>Programa contínuo de capacitação em proteção de dados e segurança da informação;</li>
              <li>Política interna de mesa limpa, tela bloqueada e classificação da informação;</li>
              <li>Revisão periódica de permissões, segregação de funções e princípio do menor privilégio;</li>
              <li>Procedimentos formalizados para resposta a incidentes, atendimento a titulares e gestão de fornecedores;</li>
              <li>Comitê interno de privacidade e segurança da informação para análise de riscos e novas funcionalidades.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. Sub-operadores</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO contrata sub-operadores selecionados por critérios de segurança, reputação e conformidade regulatória. Cada sub-operador trata os dados estritamente nas finalidades pactuadas, sob contrato com cláusulas específicas de proteção de dados (DPA). As principais categorias de sub-operadores são:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Provedor de banco de dados, autenticação e <em>realtime</em>;</li>
              <li>Provedor de envio de e-mails transacionais;</li>
              <li>Provedor de inteligência artificial (apenas para o chat assistido — PDV.IA);</li>
              <li>Serviços de consulta de produtos por código de barras (apenas o código é enviado);</li>
              <li>Provedor de hospedagem do front-end e CDN.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              A relação atualizada de sub-operadores pode ser solicitada ao DPO, mediante demonstração de interesse legítimo.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. Transferência Internacional</h2>
            <p className="text-muted-foreground leading-relaxed">
              Quando dados forem transferidos para fora do Brasil, observam-se as hipóteses do art. 33 da LGPD, com avaliação prévia do nível de proteção do país de destino e celebração de cláusulas-padrão contratuais ou outras garantias adequadas, conforme orientação da ANPD.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">10. Direitos dos Titulares</h2>
            <p className="text-muted-foreground leading-relaxed">São assegurados ao titular, na forma do art. 18 da LGPD:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Confirmação da existência de tratamento;</li>
              <li>Acesso aos dados;</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou em desconformidade;</li>
              <li>Portabilidade a outro fornecedor;</li>
              <li>Eliminação dos dados tratados com base em consentimento;</li>
              <li>Informação sobre os agentes com quem os dados foram compartilhados;</li>
              <li>Informação sobre a possibilidade de não fornecer consentimento e suas consequências;</li>
              <li>Revogação do consentimento;</li>
              <li>Revisão de decisões automatizadas, quando aplicável;</li>
              <li>Petição contra a PDVIO perante a ANPD.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Solicitações devem ser encaminhadas para <span className="text-primary">privacidade@pdvio.com.br</span>. O prazo padrão de resposta é de 15 (quinze) dias úteis, prorrogável mediante justificativa, conforme art. 19 da LGPD. Para titulares cujos dados foram cadastrados pelo Cliente (Controlador), a PDVIO redirecionará a solicitação ao Controlador, prestando-lhe o suporte necessário.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">11. Retenção e Descarte</h2>
            <p className="text-muted-foreground leading-relaxed">A retenção observa o princípio da necessidade e os prazos legais aplicáveis:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Registros fiscais e contábeis: pelo prazo da legislação tributária (em regra, 5 anos);</li>
              <li>Logs de acesso a aplicações: 6 meses (Marco Civil), com guarda estendida em situações de incidente ou requisição legal;</li>
              <li>Dados de cadastro e operacionais: durante a vigência da conta;</li>
              <li>Após o encerramento da conta: eliminação em até 90 (noventa) dias, salvo retenção legal, exercício regular de direitos ou pendência de litígio;</li>
              <li>Backups: rotacionados conforme política interna, com expurgo automático ao fim do ciclo.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">12. Gestão de Incidentes de Segurança</h2>
            <p className="text-muted-foreground leading-relaxed">A PDVIO mantém procedimento formal de resposta a incidentes, contemplando:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Detecção, contenção, erradicação e recuperação;</li>
              <li>Análise de causa-raiz e plano de ação corretivo;</li>
              <li>Comunicação à ANPD e aos titulares afetados em prazo razoável (art. 48 da LGPD), descrevendo natureza, dados envolvidos, riscos, medidas adotadas e recomendações;</li>
              <li>Registro do incidente em base interna para fins de melhoria contínua e auditoria.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">13. Avaliação de Impacto (RIPD)</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para atividades de tratamento que envolvam alto risco aos titulares — por exemplo, novas funcionalidades que processem dados em escala ou utilizem decisões automatizadas — a PDVIO elabora Relatório de Impacto à Proteção de Dados Pessoais (RIPD), conforme o art. 38 da LGPD. O documento é mantido para apresentação à ANPD quando solicitado.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">14. Inteligência Artificial e Decisões Automatizadas</h2>
            <p className="text-muted-foreground leading-relaxed">
              A Plataforma utiliza inteligência artificial no canal de suporte (PDV.IA) para responder a dúvidas frequentes, com possibilidade de escalonamento para atendimento humano a qualquer momento. Não realizamos decisões automatizadas que produzam efeitos jurídicos sobre o titular ou que o afetem de forma significativa, nos termos do art. 20 da LGPD.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">15. Encarregado pelo Tratamento de Dados (DPO)</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO designou Encarregado pelo Tratamento de Dados Pessoais para atuar como canal de comunicação com titulares e com a ANPD, conforme o art. 41 da LGPD.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">E-mail:</strong> <span className="text-primary">dpo@pdvio.com.br</span></li>
              <li><strong className="text-foreground">Solicitações de privacidade:</strong> <span className="text-primary">privacidade@pdvio.com.br</span></li>
              <li><strong className="text-foreground">Atendimento:</strong> de segunda a sexta-feira, das 9h às 18h.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">16. Avaliação de Fornecedor (Vendor Assessment)</h2>
            <p className="text-muted-foreground leading-relaxed">
              Empresas que avaliam a PDVIO como fornecedora de software podem solicitar ao DPO documentação adicional, sob acordo de confidencialidade, incluindo:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Mapeamento de tratamento (ROPA);</li>
              <li>Modelo de DPA (Data Processing Agreement);</li>
              <li>Política de gestão de incidentes;</li>
              <li>Política de continuidade de negócio e DRP;</li>
              <li>Lista atualizada de sub-operadores e jurisdições.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">17. Atualizações</h2>
            <p className="text-muted-foreground leading-relaxed">
              Este documento será revisado, no mínimo, anualmente, ou sempre que houver alteração regulatória, mudança material em sub-operadores ou no escopo da Plataforma. Versões anteriores podem ser solicitadas ao DPO.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PDVIO. Todos os direitos reservados. ·{" "}
        <Link to="/politica-de-privacidade" className="hover:text-foreground transition-colors">Política de Privacidade</Link> ·{" "}
        <Link to="/termos-de-uso" className="hover:text-foreground transition-colors">Termos de Uso</Link>
      </footer>
    </div>
  );
}
