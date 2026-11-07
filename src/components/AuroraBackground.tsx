import Aurora from "@/components/Aurora";

export default function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 opacity-50" aria-hidden="true">
      <Aurora
        colorStops={["#101b73", "#273bff", "#7c3aed", "#1748ff", "#101b73"]}
        amplitude={1.1}
        blend={0.5}
        height={0.3}
        speed={0.75}
        glow={0.72}
        brightness={1.05}
        layers={1}
      />
    </div>
  );
}
