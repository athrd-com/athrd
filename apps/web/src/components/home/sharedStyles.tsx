import type { HTMLAttributes, ReactNode } from "react";

type HomeSectionProps = {
  className?: string;
  children: ReactNode;
};

type HomePanelProps = {
  className?: string;
  children: ReactNode;
};

type HomeCommandRowProps = {
  className?: string;
  children: ReactNode;
};

type HomeCommandPromptProps = {
  className?: string;
};

export function HomeSection({ className = "", children }: HomeSectionProps) {
  return (
    <section className={`w-full max-w-6xl mx-auto px-6 ${className}`}>
      {children}
    </section>
  );
}

export function HomePanel({
  className = "",
  children,
  ...props
}: HomePanelProps & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`relative overflow-hidden border border-white/10 bg-[#090a11] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function HomeCommandRow({
  className = "",
  children,
  ...props
}: HomeCommandRowProps & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono flex items-center gap-2 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function HomeCommandPrompt({ className = "" }: HomeCommandPromptProps) {
  return <span className={`text-cyan-300 ${className}`}>&gt;</span>;
}
