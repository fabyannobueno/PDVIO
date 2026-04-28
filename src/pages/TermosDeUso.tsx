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

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground">

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1. Aceitação dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ao acessar ou utilizar a plataforma PDVIO, você concorda com estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não utilize nossos serviços.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. Descrição do Serviço</h2>
            <p className="text-muted-foreground leading-relaxed">
              O PDVIO é uma plataforma de ponto de venda (PDV) online voltada para negócios brasileiros. Oferecemos funcionalidades como frente de caixa, gestão de estoque, comandas, controle financeiro, cadastro de clientes e relatórios gerenciais.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. Cadastro e Conta</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para utilizar o PDVIO, você deve criar uma conta informando dados verdadeiros e atualizados. Você é responsável pela confidencialidade de sua senha e por todas as atividades realizadas em sua conta. Notifique-nos imediatamente em caso de acesso não autorizado.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. Uso Permitido</h2>
            <p className="text-muted-foreground leading-relaxed">
              Você concorda em utilizar a plataforma exclusivamente para fins legais e comerciais legítimos. É proibido:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Utilizar a plataforma para atividades ilegais ou fraudulentas;</li>
              <li>Tentar acessar sistemas ou dados de outros usuários sem autorização;</li>
              <li>Realizar engenharia reversa, copiar ou distribuir o software;</li>
              <li>Sobrecarregar ou prejudicar o funcionamento da plataforma.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. Propriedade Intelectual</h2>
            <p className="text-muted-foreground leading-relaxed">
              Todos os direitos sobre a plataforma PDVIO, incluindo marca, design, código e conteúdo, pertencem exclusivamente aos seus desenvolvedores. O uso da plataforma não transfere nenhum direito de propriedade intelectual ao usuário.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. Dados e Privacidade</h2>
            <p className="text-muted-foreground leading-relaxed">
              O tratamento dos seus dados pessoais é regido pela nossa{" "}
              <Link to="/politica-de-privacidade" className="text-primary hover:underline">Política de Privacidade</Link>.
              Ao utilizar o PDVIO, você consente com o tratamento dos seus dados conforme descrito naquela política.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. Disponibilidade e Limitação de Responsabilidade</h2>
            <p className="text-muted-foreground leading-relaxed">
              Envidamos todos os esforços para manter a plataforma disponível 24 horas por dia, 7 dias por semana. No entanto, não garantimos disponibilidade ininterrupta e não nos responsabilizamos por perdas decorrentes de indisponibilidade temporária do serviço, falhas de terceiros ou eventos fora do nosso controle.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. Rescisão</h2>
            <p className="text-muted-foreground leading-relaxed">
              Reservamos o direito de suspender ou encerrar sua conta a qualquer momento em caso de violação destes termos. Você pode encerrar sua conta a qualquer momento entrando em contato conosco.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. Alterações nos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Podemos atualizar estes Termos de Uso periodicamente. Notificaremos os usuários sobre alterações relevantes. O uso contínuo da plataforma após as alterações constitui aceite dos novos termos.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">10. Lei Aplicável</h2>
            <p className="text-muted-foreground leading-relaxed">
              Estes Termos de Uso são regidos pela legislação brasileira. Fica eleito o foro da comarca de São Paulo/SP para dirimir quaisquer controvérsias decorrentes deste instrumento.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PDVIO. Todos os direitos reservados. ·{" "}
        <Link to="/politica-de-privacidade" className="hover:text-foreground transition-colors">Política de Privacidade</Link>
      </footer>
    </div>
  );
}
