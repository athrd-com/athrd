import { BenefitsSection } from "@/components/home/BenefitsSection";
import { CtaSection } from "@/components/home/CtaSection";
import { HeroSection } from "@/components/home/HeroSection";
import { TerminalPreview } from "@/components/home/TerminalPreview";
import { WorkflowSection } from "@/components/home/WorkflowSection";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "https://www.athrd.com/",
  },
};

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <TerminalPreview />
      <BenefitsSection />
      <WorkflowSection />
      <CtaSection />
    </>
  );
}
