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
        <p className="mb-10 text-sm text-muted-foreground">Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>

        <div className="space-y-8 text-foreground">

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1. Nosso Compromisso com a LGPD</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO está em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018). Este documento detalha as práticas, controles e responsabilidades adotadas pela plataforma para garantir a proteção dos dados pessoais tratados em nome dos nossos clientes (controladores) e dos titulares finais (consumidores cadastrados pelos lojistas).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. Papéis das Partes</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Controlador:</strong> a empresa cliente (lojista) que utiliza a PDVIO para registrar vendas, clientes, fornecedores e operações financeiras é a controladora dos dados pessoais que cadastra na plataforma.</li>
              <li><strong className="text-foreground">Operador:</strong> a PDVIO atua como operadora, tratando dados pessoais estritamente conforme as instruções do controlador e os termos de uso aceitos.</li>
              <li><strong className="text-foreground">Titulares:</strong> são os usuários da conta (donos, gerentes, caixas), os clientes cadastrados pela empresa e quaisquer outras pessoas físicas cujos dados sejam armazenados.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. Bases Legais de Tratamento</h2>
            <p className="text-muted-foreground leading-relaxed">Os dados pessoais tratados pela PDVIO têm como fundamento, conforme o art. 7º da LGPD:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Execução de contrato:</strong> para prestar os serviços contratados pelo lojista;</li>
              <li><strong className="text-foreground">Cumprimento de obrigação legal:</strong> emissão de documentos fiscais, retenção de registros contábeis e tributários;</li>
              <li><strong className="text-foreground">Legítimo interesse:</strong> prevenção a fraudes, segurança da plataforma e melhoria contínua dos serviços;</li>
              <li><strong className="text-foreground">Consentimento:</strong> quando expressamente solicitado, como em comunicações de marketing.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. Princípios Aplicados</h2>
            <p className="text-muted-foreground leading-relaxed">Todo tratamento na PDVIO observa os princípios do art. 6º da LGPD:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Finalidade, adequação e necessidade;</li>
              <li>Livre acesso e qualidade dos dados;</li>
              <li>Transparência e segurança;</li>
              <li>Prevenção, não discriminação e responsabilização.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. Medidas Técnicas de Segurança</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Criptografia de dados em trânsito (TLS 1.2+) e em repouso;</li>
              <li>Controle de acesso por papéis (Dono, Gerente, Caixa, Garçom, Cozinha) e RLS (Row Level Security) no banco de dados;</li>
              <li>Autenticação por email e senha com hash criptográfico, suporte a PIN/cartão para troca rápida de operador;</li>
              <li>Registro de auditoria (audit logs) para ações sensíveis, como cancelamentos, descontos e movimentações de caixa;</li>
              <li>Backups periódicos automatizados e plano de recuperação de desastres.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. Medidas Organizacionais</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Acordos de confidencialidade com colaboradores e prestadores de serviço;</li>
              <li>Treinamentos periódicos sobre proteção de dados e segurança da informação;</li>
              <li>Política interna de mesa limpa e tela bloqueada;</li>
              <li>Revisão periódica das permissões de acesso e segregação de funções.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. Direitos dos Titulares</h2>
            <p className="text-muted-foreground leading-relaxed">Os titulares podem, a qualquer momento, exercer os direitos previstos no art. 18 da LGPD:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Confirmação da existência de tratamento;</li>
              <li>Acesso aos dados;</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;</li>
              <li>Portabilidade dos dados a outro fornecedor;</li>
              <li>Eliminação dos dados tratados com base no consentimento;</li>
              <li>Informação sobre compartilhamentos realizados;</li>
              <li>Revogação do consentimento.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Solicitações devem ser enviadas pelo email: <span className="text-primary">privacidade@pdvio.com.br</span>. Responderemos em até 15 dias úteis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. Retenção e Descarte</h2>
            <p className="text-muted-foreground leading-relaxed">
              Os dados são mantidos pelo prazo necessário ao cumprimento das finalidades para as quais foram coletados, observados os prazos legais (por exemplo, 5 anos para registros fiscais). Após o encerramento da conta, os dados serão eliminados em até 90 dias, exceto quando a retenção for exigida por lei ou por interesse legítimo devidamente justificado.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. Sub-operadores</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO contrata sub-operadores (provedores de hospedagem, banco de dados, envio de email, processamento de pagamentos) que aderem a padrões equivalentes de segurança e privacidade. A relação é regida por contrato com cláusulas específicas de proteção de dados.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">10. Transferência Internacional</h2>
            <p className="text-muted-foreground leading-relaxed">
              Quando houver transferência internacional de dados, a PDVIO observa as hipóteses do art. 33 da LGPD, garantindo que o país de destino ofereça grau de proteção adequado ou que sejam adotadas garantias contratuais específicas.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">11. Incidentes de Segurança</h2>
            <p className="text-muted-foreground leading-relaxed">
              Em caso de incidente de segurança que possa acarretar risco ou dano relevante aos titulares, a PDVIO comunicará a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares afetados em prazo razoável, conforme o art. 48 da LGPD, informando a natureza do incidente, os dados envolvidos, as medidas adotadas e as recomendações aos titulares.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">12. Encarregado de Dados (DPO)</h2>
            <p className="text-muted-foreground leading-relaxed">
              A PDVIO designou um Encarregado pelo Tratamento de Dados Pessoais para atuar como canal de comunicação com titulares e com a ANPD.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Email:</strong> <span className="text-primary">dpo@pdvio.com.br</span></li>
              <li><strong className="text-foreground">Atendimento:</strong> de segunda a sexta, das 9h às 18h.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">13. Atualizações deste Documento</h2>
            <p className="text-muted-foreground leading-relaxed">
              Este documento pode ser atualizado periodicamente para refletir mudanças regulatórias, melhorias de processo ou novas funcionalidades da plataforma. Notificaremos sobre alterações relevantes por email ou aviso na plataforma.
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
