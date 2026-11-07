import { Blocks } from "loading-dev";

type PageLoadingProps = {
  label: string;
  className?: string;
};

export default function PageLoading({ label, className = "" }: PageLoadingProps) {
  return (
    <div
      className={`flex items-center justify-center py-20 ${className}`.trim()}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <Blocks color="#4b5563" size={36} />
    </div>
  );
}
