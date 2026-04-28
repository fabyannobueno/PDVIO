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
              A PDVIO valoriza a privacidade dos seus usuários. Esta Política de Privacidade descreve como coletamos, utilizamos, armazenamos e protegemos suas informações pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. Dados que Coletamos</h2>
            <p className="text-muted-foreground leading-relaxed">Coletamos as seguintes categorias de dados:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Dados de cadastro:</strong> nome, endereço de email e senha (armazenada de forma criptografada);</li>
              <li><strong className="text-foreground">Dados da empresa:</strong> nome fantasia, CNPJ/CPF, endereço e informações de contato;</li>
              <li><strong className="text-foreground">Dados de uso:</strong> informações sobre como você utiliza a plataforma, incluindo produtos cadastrados, vendas realizadas e relatórios gerados;</li>
              <li><strong className="text-foreground">Dados técnicos:</strong> endereço IP, tipo de navegador, sistema operacional e logs de acesso.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. Como Utilizamos seus Dados</h2>
            <p className="text-muted-foreground leading-relaxed">Utilizamos seus dados para:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Fornecer, operar e melhorar os serviços da plataforma;</li>
              <li>Autenticar seu acesso e garantir a segurança da conta;</li>
              <li>Enviar comunicações sobre atualizações, novidades e suporte;</li>
              <li>Cumprir obrigações legais e regulatórias;</li>
              <li>Analisar o uso da plataforma para aprimorar a experiência do usuário.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. Compartilhamento de Dados</h2>
            <p className="text-muted-foreground leading-relaxed">
              Não vendemos nem alugamos seus dados pessoais a terceiros. Podemos compartilhá-los apenas com:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Provedores de serviço que nos auxiliam na operação da plataforma (como hospedagem e banco de dados), mediante contratos de confidencialidade;</li>
              <li>Autoridades governamentais, quando exigido por lei ou ordem judicial.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. Armazenamento e Segurança</h2>
            <p className="text-muted-foreground leading-relaxed">
              Seus dados são armazenados em servidores seguros com criptografia em trânsito (TLS) e em repouso. Adotamos medidas técnicas e organizacionais adequadas para proteger suas informações contra acesso não autorizado, perda ou destruição.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. Seus Direitos (LGPD)</h2>
            <p className="text-muted-foreground leading-relaxed">Conforme a LGPD, você tem direito a:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Confirmar a existência de tratamento dos seus dados;</li>
              <li>Acessar seus dados pessoais;</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
              <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários;</li>
              <li>Solicitar a portabilidade dos dados;</li>
              <li>Revogar o consentimento a qualquer momento.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Para exercer seus direitos, entre em contato conosco pelo email: <span className="text-primary">privacidade@pdvio.com.br</span>
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Utilizamos cookies essenciais para manter sua sessão ativa e garantir o funcionamento correto da plataforma. Não utilizamos cookies de rastreamento ou publicidade de terceiros.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. Retenção de Dados</h2>
            <p className="text-muted-foreground leading-relaxed">
              Mantemos seus dados pelo tempo necessário para a prestação dos serviços e para o cumprimento de obrigações legais. Após o encerramento da conta, os dados serão eliminados em até 90 dias, salvo quando a retenção for exigida por lei.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. Alterações nesta Política</h2>
            <p className="text-muted-foreground leading-relaxed">
              Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos os usuários sobre alterações relevantes por email ou mediante aviso na plataforma. Recomendamos que você revise esta política regularmente.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PDVIO. Todos os direitos reservados. ·{" "}
        <Link to="/termos-de-uso" className="hover:text-foreground transition-colors">Termos de Uso</Link>
      </footer>
    </div>
  );
}
