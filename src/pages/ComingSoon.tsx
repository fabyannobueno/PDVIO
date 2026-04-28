import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";

export default function ComingSoon({ title, description }: { title: string; description: string }) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-3xl p-6 md:p-8 animate-fade-in">
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 p-16 text-center">
          <div className="rounded-full bg-gradient-primary p-3 shadow-glow">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="max-w-md text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            Em desenvolvimento
          </div>
          <Button variant="outline" onClick={() => navigate("/")} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}