import { cn } from "@/lib/utils";
import logoDark from "@/assets/logo-dark.png";
import logoLight from "@/assets/logo-light.png";
import logoIcon from "@/assets/logo-icon.png";

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  if (!showText) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <img src={logoIcon} alt="PDVIO" className="h-10 w-full max-w-[52px] object-contain" />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", className)}>
      <img src={logoLight} alt="PDVIO" className="block dark:hidden h-9" />
      <img src={logoDark} alt="PDVIO" className="hidden dark:block h-9" />
    </div>
  );
}
